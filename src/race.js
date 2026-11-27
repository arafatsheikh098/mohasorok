// Race with friends: one room code, the same start terminal and destination, everyone's bus on everyone's road.
//
// The room lives on a small relay server (race-server/, a free Cloudflare Worker). Each game sends its own
// bus 5 times a second; the other buses are drawn as "ghosts" (they pass through you and your traffic),
// shown about a third of a second in the past so they can be smoothed between updates.
import * as THREE from 'three';
import { buildBus, setBusLights } from './busModel.js';
import { OPERATORS } from './operators.js';

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
// the server: set VITE_RACE_SERVER (e.g. in .env.production) to the deployed worker; the dev build uses the
// local one (race-server: npm run dev) on the same machine or Wi-Fi
export const RACE_SERVER = import.meta.env?.VITE_RACE_SERVER || (PRIVATE_HOST.test(location.hostname) ? `ws://${location.hostname}:8787` : '');

export const RACE_COLORS = ['#ff8a1c', '#4fc3f7', '#3ddc84', '#ff5c8a', '#ffd54f', '#b388ff', '#80cbc4', '#ff7043'];
const SEND_HZ = 5;
const DELAY = 320;          // ms the ghosts are drawn behind real time (a bit more than one update)
const STALE = 6000;         // no update for this long: the ghost is hidden
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I

export const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const myId = () => {
  let id = sessionStorage.getItem('mohasorok.raceId');
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mohasorok.raceId', id); }
  return id;
};
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// flags packed in one number
const F = { head: 1, high: 2, fog: 4, brake: 8, indL: 16, indR: 32, reverse: 64 };

export class Race {
  constructor(scene) {
    this.scene = scene;
    this.ws = null;
    this.code = null;
    this.you = myId();
    this.host = null;
    this.players = [];
    this.room = null;
    this.results = {};
    this.ghosts = new Map();
    this.handlers = {};
    this.offset = 0;              // server clock − local clock (ms)
    this.bestRtt = Infinity;
    this.sendT = 0;
    this.blinkT = 0;
    this.retry = 0;
    this.wantOpen = false;
  }
  get available() { return !!RACE_SERVER; }
  get inRoom() { return !!this.code && this.wantOpen; }
  // in the room's lobby: the server has answered (until then the menu still shows Create / Join)
  get joined() { return this.inRoom && !!this.room; }
  get isHost() { return this.host === this.you; }
  get connected() { return this.ws?.readyState === 1; }
  // the race is on and this game is in it
  get racing() { return this.room?.phase === 'race' && this.room.grid?.includes(this.you) && !this.results[this.you]; }
  get inRace() { return (this.room?.phase === 'race' || this.room?.phase === 'done') && this.room.grid?.includes(this.you); }
  serverNow() { return Date.now() + this.offset; }
  // ms until the green light (negative once the race is running)
  countdown() { return this.room?.startAt ? this.room.startAt - this.serverNow() : Infinity; }
  raceTime() { return Math.max(0, -this.countdown()) / 1000; }
  slot(id = this.you) { return Math.max(0, this.room?.grid?.indexOf(id) ?? 0); }
  color(id) {
    const k = this.room?.grid?.includes(id) ? this.room.grid.indexOf(id) : this.players.findIndex((p) => p.id === id);
    return RACE_COLORS[Math.max(0, k) % RACE_COLORS.length];
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }

  // join a room (create = a brand-new code). `me` = { name, op, opName, type }
  connect(code, create, me) {
    this.leave(true);
    this.code = code.toUpperCase();
    this.me = me;
    this.create = create;
    this.wantOpen = true;
    this.retry = 0;
    this._open();
  }
  _open() {
    const url = `${RACE_SERVER.replace(/\/$/, '')}/room/${this.code}?id=${this.you}${this.create ? '&create=1' : ''}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.emit('error', 'Could not reach the race server'); this.wantOpen = false; return; }
    this.ws = ws;
    // a connection that hangs (no network, a blocked address): give up on this try after 8 s
    const slow = setTimeout(() => { if (ws.readyState === 0) ws.close(); }, 8000);
    ws.onopen = () => {
      clearTimeout(slow);
      this.retry = 0;
      if (!this.room) this.emit('status', 'Connected — joining the race…');
      this.send({ t: 'hello', ...this.me });
      this.bestRtt = Infinity;
      for (let k = 0; k < 5; k++) setTimeout(() => this.send({ t: 'ping', c: Date.now() }), k * 250);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 8000);
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this._msg(m); };
    ws.onclose = (e) => {
      clearTimeout(slow);
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if ([4001, 4002, 4003].includes(e.code)) { this.wantOpen = false; this.code = null; this.emit('change'); return; }
      if (!this.wantOpen) return;
      this.retry++;
      // never got in: say so after a few tries instead of waiting quietly
      if (!this.room) {
        if (this.retry >= 3) {
          this.wantOpen = false; this.code = null;
          this.emit('error', `Can't reach the race server (${e.code || 'no answer'}). Check the internet connection and try again.`);
          this.emit('change');
          return;
        }
        this.emit('status', `Still trying to reach the race server… (try ${this.retry + 1} of 3)`);
        setTimeout(() => { if (this.wantOpen && !this.ws) this._open(); }, 1200);
        return;
      }
      // dropped: try again (the room keeps our place)
      this.create = false;
      this.emit('status', this.retry > 2 ? 'Connection lost — reconnecting…' : 'Reconnecting…');
      if (this.retry > 12) { this.wantOpen = false; this.code = null; this.emit('error', 'Lost the connection to the race server'); this.emit('change'); return; }
      setTimeout(() => { if (this.wantOpen && !this.ws) this._open(); }, Math.min(8000, 500 * 2 ** this.retry));
    };
  }
  leave(quiet) {
    this.wantOpen = false;
    clearInterval(this.pingTimer);
    if (this.ws) { const ws = this.ws; this.ws = null; try { ws.close(1000); } catch { /* closed */ } }
    this.code = null; this.room = null; this.players = []; this.results = {}; this.host = null;
    for (const g of this.ghosts.values()) g.dispose();
    this.ghosts.clear();
    if (!quiet) this.emit('change');
  }
  send(m) { if (this.connected) this.ws.send(JSON.stringify(m)); }
  hello(me) { this.me = me; this.send({ t: 'hello', ...me }); }
  setTrip(trip) { if (this.isHost) this.send({ t: 'trip', trip: { from: trip.from, to: trip.to } }); }
  ready(v) { this.send({ t: 'ready', v }); }
  start() { if (this.isHost) this.send({ t: 'start' }); }
  lobby() { if (this.isHost) this.send({ t: 'lobby' }); }
  finish(st) { this.send({ t: 'finish', time: this.raceTime(), fines: st.fines, crashes: st.crashes, rating: st.rating }); }

  _msg(m) {
    switch (m.t) {
      case 'p': this._pos(m); break;
      case 'pong': {
        const now = Date.now(), rtt = now - m.c;
        // the sample with the shortest round trip gives the best clock estimate
        if (rtt <= this.bestRtt * 1.5 || rtt < 120) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.s - (m.c + rtt / 2); }
        break;
      }
      case 'welcome':
        this.offset = m.now - Date.now();
        this.room = m.room; this.results = m.room.results || {};
        this.create = false;
        this.emit('change'); this.emit('room', m.room);
        break;
      case 'players':
        this.players = m.players; this.host = m.host;
        for (const [id, g] of this.ghosts) if (!m.players.some((p) => p.id === id)) { g.dispose(); this.ghosts.delete(id); }
        for (const p of m.players) if (p.id !== this.you) this._ghost(p);
        this.emit('change');
        break;
      case 'room':
        this.room = m.room; this.results = m.room.results || {};
        this.emit('change'); this.emit('room', m.room);
        break;
      case 'start':
        this.room = m.room; this.results = {};
        this.emit('change'); this.emit('start', m.room);
        break;
      case 'results':
        this.results = m.results;
        if (this.room) this.room.phase = m.phase;
        this.emit('change'); this.emit('results', m.results);
        break;
      case 'left': { const g = this.ghosts.get(m.id); if (g) { g.dispose(); this.ghosts.delete(m.id); } break; }
      case 'error': this.emit('error', m.msg, m.code); break;
      default:
    }
  }
  _ghost(p) {
    let g = this.ghosts.get(p.id);
    if (g && (g.op !== p.op || g.type !== p.type)) { g.dispose(); g = null; }
    if (!g) { g = new Ghost(this.scene, p); this.ghosts.set(p.id, g); }
    g.setName(p.name, this.color(p.id));
  }
  _pos(m) {
    const g = this.ghosts.get(m.id);
    if (!g) return;
    g.snaps.push(m);
    if (g.snaps.length > 30) g.snaps.shift();
    g.km = m.km;
    g.seen = this.serverNow();
  }

  // every frame: send our bus (while racing), move the ghosts
  update(dt, { bus, phys, flags, remainKm, night, camera, send }) {
    this.blinkT += dt;
    if (this.code && send && this.connected) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SEND_HZ;
        const r = bus.root, pv = bus.pivot.rotation;
        let f = 0;
        for (const k in F) if (flags[k]) f |= F[k];
        this.send({ t: 'p', ts: Math.round(this.serverNow()), x: r2(r.position.x), y: r2(r.position.y), z: r2(r.position.z),
          ry: r3(r.rotation.y), rx: r3(r.rotation.x), rz: r3(r.rotation.z), bp: r3(pv.x), br: r3(pv.z), st: r3(phys.steer), v: r2(phys.v), f, km: Math.round(remainKm * 10) / 10 });
      }
    }
    const rt = this.serverNow() - DELAY, blink = (this.blinkT % 0.8) < 0.4;
    const racingPhase = this.room?.phase === 'race' || this.room?.phase === 'done';
    for (const [id, g] of this.ghosts) {
      g.show = racingPhase && this.room.grid?.includes(id) && this.serverNow() - (g.seen || 0) < STALE;
      g.update(dt, rt, { night, blink, camera, color: this.color(id) });
    }
  }
  // the others, for the minimap and the big map
  friends() {
    const out = [];
    for (const [id, g] of this.ghosts) if (g.show && g.bus) out.push({ id, x: g.bus.root.position.x, z: g.bus.root.position.z, yaw: g.bus.root.rotation.y, name: g.name, color: this.color(id) });
    return out;
  }
  // the standings: finished in time order, then by distance still to go
  standings(myKm) {
    const grid = this.room?.grid || [];
    const rows = grid.map((id) => {
      const p = this.players.find((x) => x.id === id), res = this.results[id];
      const km = id === this.you ? myKm : this.ghosts.get(id)?.km;
      return { id, name: p?.name || res?.name || '—', op: p?.opName || p?.op || res?.op || '', gone: !p, res, km: km ?? null, me: id === this.you, color: this.color(id) };
    });
    rows.sort((a, b) => (a.res && b.res ? a.res.time - b.res.time : a.res ? -1 : b.res ? 1 : a.gone !== b.gone ? (a.gone ? 1 : -1) : (a.km ?? 1e9) - (b.km ?? 1e9)));
    return rows;
  }
}

// another player's bus
class Ghost {
  constructor(scene, p) {
    this.scene = scene;
    this.op = p.op; this.type = p.type;
    this.snaps = [];
    this.spin = 0;
    this.show = false;
    const op = OPERATORS.find((o) => o.id === p.op && !o.custom) || OPERATORS.find((o) => o.en === p.opName && !o.custom) || OPERATORS[0];
    try {
      this.bus = buildBus(p.type || 'ak1j', op, { texScale: 0.5, seed: 300 + Math.floor(Math.random() * 99) });
    } catch {
      this.bus = buildBus('ak1j', OPERATORS[0], { texScale: 0.5, seed: 301 });
    }
    this.bus.root.visible = false;
    scene.add(this.bus.root);
    // name tag over the roof (stays the same size on screen)
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512; this.tagCanvas.height = 112;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, transparent: true, sizeAttenuation: false }));
    this.tag.scale.set(0.21, 0.046, 1);
    this.tag.renderOrder = 999;
    this.tag.visible = false;
    scene.add(this.tag);
  }
  setName(name, color) {
    if (name === this.name && color === this.tagColor) return;
    this.name = name; this.tagColor = color;
    const c = this.tagCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '800 54px "Helvetica Neue", Arial, "Noto Sans Bengali", sans-serif';
    const w = Math.min(c.width - 8, g.measureText(name).width + 70);
    const x0 = (c.width - w) / 2;
    g.fillStyle = 'rgba(10,14,18,0.8)';
    g.beginPath(); g.roundRect(x0, 14, w, 80, 40); g.fill();
    g.lineWidth = 6; g.strokeStyle = color; g.stroke();
    g.fillStyle = color; g.beginPath(); g.arc(x0 + 38, 54, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(name, x0 + 60, 56, w - 74);
    this.tagTex.needsUpdate = true;
  }
  // the bus as it was at time rt (between the two updates around it, or carried on a little past the last)
  sample(rt) {
    const S = this.snaps;
    if (!S.length) return null;
    let a = S[0], b = null;
    for (let k = S.length - 1; k >= 0; k--) if (S[k].ts <= rt) { a = S[k]; b = S[k + 1] || null; break; }
    if (rt < S[0].ts) return { ...S[0] };
    if (!b) {
      // no newer update yet: keep it moving along its heading for up to 0.6 s
      const ex = Math.min(0.6, (rt - a.ts) / 1000);
      return { ...a, x: a.x + Math.sin(a.ry) * a.v * ex, z: a.z + Math.cos(a.ry) * a.v * ex };
    }
    const t = (rt - a.ts) / Math.max(1, b.ts - a.ts);
    const L = (k) => a[k] + (b[k] - a[k]) * t;
    return { ...b, x: L('x'), y: L('y'), z: L('z'), ry: lerpAngle(a.ry, b.ry, t), rx: L('rx'), rz: L('rz'), bp: L('bp'), br: L('br'), st: L('st'), v: L('v') };
  }
  update(dt, rt, { night, blink, camera, color }) {
    const s = this.show ? this.sample(rt) : null;
    const bus = this.bus;
    if (!s) { bus.root.visible = false; this.tag.visible = false; return; }
    const dist = camera ? camera.position.distanceTo(bus.root.position) : 0;
    bus.root.visible = dist < 3200;
    bus.root.position.set(s.x, s.y, s.z);
    bus.root.rotation.set(s.rx, s.ry, s.rz, 'YXZ');
    bus.pivot.rotation.set(s.bp, 0, s.br);
    this.spin += (s.v * dt) / (bus.spec.wheelR || 0.5);
    for (const w of bus.wheels.front) w.rotation.y = s.st;
    for (const w of bus.wheels.all) w.rotation.x = this.spin;
    setBusLights(bus, { head: !!(s.f & F.head), high: !!(s.f & F.high), fog: !!(s.f & F.fog), brake: !!(s.f & F.brake), indL: !!(s.f & F.indL) && blink, indR: !!(s.f & F.indR) && blink, reverse: !!(s.f & F.reverse), night });
    // the tag: over the roof, hidden when very far (the map still shows them)
    this.tag.visible = dist < 1800 && dist > 4;
    this.tag.position.set(s.x + Math.sin(s.ry) * (bus.spec.center || 0), s.y + (bus.spec.H || 3.4) + 1.3, s.z + Math.cos(s.ry) * (bus.spec.center || 0));
    if (color !== this.tagColor) this.setName(this.name, color);
  }
  dispose() {
    // (the bus's geometries and materials can be shared with other buses: only the tag is this ghost's own)
    this.scene.remove(this.bus.root, this.tag);
    this.tagTex.dispose();
    this.tag.material.dispose();
  }
}
