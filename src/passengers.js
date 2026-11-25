// Passengers: long-route coach service. People board at the origin terminal and a few city counters
// (BUS_STOPS pickup), and get down only at the drop points after Cumilla and at the destination terminal,
// through the front-left door (G). Fares by distance, stop requests, missed stops, counters that fill up again.
import * as THREE from 'three';
import { ROAD, BUS_STOPS, FARE_PER_KM, AC_FARE_FACTOR, MIN_FARE, REAL_ROUTE_KM, COUNTER_REFILL, SPEED_LIMIT } from './config.js';
import { setBusDoor } from './busModel.js';
import { makeCanvas, canvasTexture, concreteTexture, BN_FONT, EN_FONT } from './textures.js';
import { ribbon } from './world/road.js';
import { voice } from './voice.js';

const $ = (id) => document.getElementById(id);
const MAX_FIG = 260;
const WALK = 1.45;              // m/s
const ZONE = 22;                // half-length of a counter's lay-by (m of road)
const ANNOUNCE = 450;           // m before a requested stop the passengers ring the bell
const SHIRTS = [0xf2f2ee, 0x3d6fb6, 0xc23b3b, 0x2f7d4a, 0xe0b43a, 0x7a4a9e, 0x23303c, 0xd98c4a, 0x9fc4de];
const LOWER = [0x2b5aa0, 0x3c8a5a, 0x5b3a2e, 0x1f2633, 0x8a2f5c, 0xc94f7c, 0xe0a030, 0x4d4d55];   // lungi, pants, sari
const SKIN = [0x8d5a3b, 0x6e4329, 0xa36a45, 0x5c3a23];
// passenger mood (0–100): what the people aboard think of the ride
const MOOD = {
  start: 80,
  jolt: 4, hardJolt: 8,          // sharp cornering (|latAcc| > 3.4 / 5 m/s²) or hard braking (lonAcc < -5.5 / -7.5)
  crash: 15,                     // each crash (player.crashes goes up)
  speeding: 1.5,                 // per second above SPEED_LIMIT + 10 km/h
  tired: 0.3,                    // per second once 3 game-hours pass without a rest-stop break
  wait: 0.6, waitAfter: 45,      // per second once the bus has stood still 45 s outside a stop/rest/terminal
  heat: 0.15,                    // per second in a non-AC bus, 11:00–16:00, crawling below 15 km/h
  smooth: 0.35,                  // per second of calm driving at 30 km/h … the limit
  rest: 20,                      // a rest-stop break
};
// tip per passenger at drop-off: nothing below mood 65, up to 10 % of the fare at 100
export const tipFor = (fare, mood) => Math.round((fare * 0.1 * Math.max(0, Math.min(1, (mood - 65) / 35))) / 10) * 10;

function panel(w, h, bg, draw) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  draw(x, w, h);
  return canvasTexture(c, { repeat: false });
}

function hatchTexture() {
  const [c, x] = makeCanvas(128, 128);
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = '#f2c31b'; x.lineWidth = 14;
  for (let k = -128; k < 256; k += 48) { x.beginPath(); x.moveTo(k, 128); x.lineTo(k + 128, 0); x.stroke(); }
  x.lineWidth = 10; x.strokeRect(0, -10, 128, 148);      // side borders (u = 0 / 1)
  return canvasTexture(c);
}

export class Passengers {
  constructor({ route, scene, chunks, hud, player }) {
    this.route = route; this.scene = scene; this.hud = hud; this.player = player;
    this.r = Math.random;
    this.counters = [];
    this.figs = [];
    this.free = [];
    this.aboard = [];
    this.stop = null;          // the stop being served while the door is open
    this.door = false;
    this.cool = 0; this.uiT = 0; this.promptKey = '';
    this.ends = [
      { kind: 'end', end: 0, s: 0, side: 1, bn: 'ঢাকা (সায়েদাবাদ)', en: 'Dhaka (Sayedabad)' },
      { kind: 'end', end: 1, s: route.length, side: -1, bn: 'চট্টগ্রাম (এ.কে. খান)', en: 'Chattogram (A.K. Khan)' },
    ];
    this.stats = { aboard: 0, capacity: 36, fares: 0, tips: 0, mood: MOOD.start, carried: 0, boarded: 0, missed: 0 };
    this.mood = MOOD.start;
    this._buildFigures(scene);
    this._buildCounters(scene, chunks);
    hud.addMarkers?.(this.counters.map((c) => ({ p: route.pointAt(c.s, c.side * (ROAD.half + 3)), icon: '🚏', col: '#2ecc71' })));
    if (import.meta.env?.DEV) window.__pax = this;
  }

  // ------------------------------------------------------------ world
  _clearAt(s) {
    const R = this.route;
    if (s < 250 || s > R.length - 250) return false;
    if (R.bridgeAt(s) || R.bridgeAt(s - 60) || R.bridgeAt(s + 60)) return false;
    if (Math.abs(s - R.tollS) < 260) return false;
    if (R.uturns.some((u) => s > u.s0 - 45 && s < u.s1 + 45)) return false;
    if (R.stations.some((st) => s > st.s0 - 60 && s < st.s1 + 60)) return false;
    if (R.rests.some((r) => s > r.s0 - 60 && s < r.s1 + 60)) return false;
    if ((R.terminals || []).some((t) => s > t.s0 - 80 && s < t.s1 + 80)) return false;
    // footbridges stand near town centres and every 4.2 km
    for (const p of R.places) if (p.town >= 300 && Math.abs(s - (p.s + 40)) < 35) return false;
    for (let f = 3000; f < R.length - 500; f += 4200) if (Math.abs(s - f) < 35) return false;
    return true;
  }

  _buildCounters(scene, chunks) {
    const R = this.route;
    const mats = {
      conc: new THREE.MeshStandardMaterial({ map: concreteTexture(10, '#b3b0a8'), roughness: 0.9 }),
      post: new THREE.MeshStandardMaterial({ color: 0x5f6a70, metalness: 0.5, roughness: 0.5 }),
      tin: new THREE.MeshStandardMaterial({ color: 0x2f7d4a, metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide }),
      booth: new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x24343d, roughness: 0.1, metalness: 0.4 }),
      bench: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 }),
      hatch: new THREE.MeshStandardMaterial({ map: hatchTexture(), transparent: true, alphaTest: 0.3, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }),
    };
    const offs = [0, 40, -40, 100, -100, 160, -160, 230, -230, 300, -300];
    // each direction has its own counters on its own carriageway: pickups near the start city, drops after Cumilla
    for (const [dirKey, side] of [['ctg', -1], ['dhk', 1]]) {
      const dir = side < 0 ? 1 : -1;
      for (const role of ['pickup', 'drop']) {
        for (const def of BUS_STOPS[dirKey]?.[role] || []) {
          const place = def.place ? R.places.find((p) => p.en === def.place) : null;
          if (def.place && !place) continue;
          const s0 = place ? place.s : (def.km / REAL_ROUTE_KM) * R.length;
          let s = null;
          for (const o of offs) { const c = s0 + o * dir; if (this._clearAt(c) && !this.counters.some((x) => Math.abs(x.s - c) < 70)) { s = c; break; } }
          if (s === null) { console.warn(`[passengers] no room for the ${def.place || def.en} counter`); continue; }
          const bn = (place ? place.bn : def.bn).split(' (')[0], en = (place ? place.en : def.en).split(' (')[0];
          const c = { kind: 'counter', role, place, bn, en, side, dir, s, waiting: [], announced: false, spots: [], refillT: 0 };
          this._buildCounterMesh(c, mats, scene, chunks);
          this.counters.push(c);
        }
      }
    }
    this.counters.sort((a, b) => a.s - b.s);
  }

  _buildCounterMesh(c, mats, scene, chunks) {
    const R = this.route, sd = c.side, h = R.roadHeight(c.s);
    const grp = new THREE.Group();
    // painted lay-by on the shoulder: yellow hatching
    const cols = sd < 0
      ? [{ d: -ROAD.half + 0.05, y: (s, hh) => hh + 0.02, u: 0 }, { d: -ROAD.edge - 0.05, y: (s, hh) => hh + 0.02, u: 1 }]
      : [{ d: ROAD.edge + 0.05, y: (s, hh) => hh + 0.02, u: 0 }, { d: ROAD.half - 0.05, y: (s, hh) => hh + 0.02, u: 1 }];
    grp.add(new THREE.Mesh(ribbon(R, c.s - ZONE, c.s + ZONE, 2, cols, 3.2), mats.hatch));

    const dc = sd * (ROAD.half + 2.7);
    const local = new THREE.Group();
    const p = R.pointAt(c.s, dc);
    local.position.set(p.x, 0, p.z);
    local.rotation.y = R.yawAt(c.s);
    const X = (d) => -(d - dc);           // local x for a road offset d (local +x = -d)
    // concrete platform from the field up to just above the road
    const top = h + 0.18;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(5, top, 18), mats.conc);
    plat.position.y = top / 2; plat.receiveShadow = true; plat.castShadow = true;
    local.add(plat);
    // shed: 4 posts and a sloping tin roof, set back from the road
    const shedD = sd * (ROAD.half + 3.6);
    for (const z of [-3.4, 3.4]) for (const dd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.12), mats.post);
      post.position.set(X(shedD + dd * 1.1), top + 1.35, z);
      local.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 7.6), mats.tin);
    roof.position.set(X(shedD), top + 2.75, 0);
    roof.rotation.z = 0.08 * (X(shedD) > 0 ? -1 : 1);
    roof.castShadow = true;
    local.add(roof);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 4), mats.bench);
    bench.position.set(X(shedD + sd * 0.9), top + 0.22, 0.5);
    local.add(bench);
    // ticket booth at one end
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 2.2), mats.booth);
    booth.position.set(X(shedD), top + 1.2, -6.2);
    booth.castShadow = true;
    local.add(booth);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), mats.glass);
    win.position.set(X(shedD) + (X(shedD) > 0 ? -1.01 : 1.01), top + 1.5, -6.2);
    win.rotation.y = X(shedD) > 0 ? -Math.PI / 2 : Math.PI / 2;
    local.add(win);
    // sign board under the roof edge, facing the road
    const tex = panel(1024, 256, '#1b5e20', (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 92px ${BN_FONT}`; x.fillText(`${c.bn} বাস কাউন্টার`, w / 2, hh * 0.38);
      x.fillStyle = '#ffd54f'; x.font = `bold 52px ${EN_FONT}`;
      x.fillText(`${c.en.toUpperCase()} ${c.role === 'drop' ? 'DROP-OFF POINT' : 'BUS COUNTER'}`, w / 2, hh * 0.78);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: tex }));
    const roadFace = X(shedD) + (X(shedD) > 0 ? -1.62 : 1.62);
    sign.position.set(roadFace, top + 2.25, 0);
    sign.rotation.y = X(shedD) > 0 ? -Math.PI / 2 : Math.PI / 2;
    local.add(sign);
    local.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp.add(local);
    scene.add(grp);
    chunks.register(grp, c.s, 40);
    // standing spots for waiting passengers (on the platform, near the road edge)
    for (let i = 0; i < 10; i++) {
      const s = c.s - 5 + (i % 5) * 2.4 + (this.r() - 0.5) * 0.6;
      const d = sd * (ROAD.half + 1.0 + Math.floor(i / 5) * 1.1 + this.r() * 0.3);
      const q = R.pointAt(s, d);
      c.spots.push({ x: q.x, z: q.z, y: top, yaw: R.yawAt(s) + (sd < 0 ? Math.PI / 2 : -Math.PI / 2) });
    }
  }

  _buildFigures(scene) {
    const lowerG = new THREE.CylinderGeometry(0.17, 0.23, 0.86, 7).translate(0, 0.43, 0);
    const torsoG = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 7).translate(0, 1.17, 0);
    const headG = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.62, 0);
    const mk = (g) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAX_FIG);
      m.frustumCulled = false; m.castShadow = true;
      scene.add(m);
      return m;
    };
    this.meshes = [mk(lowerG), mk(torsoG), mk(headG)];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color();
    for (let i = 0; i < MAX_FIG; i++) {
      for (const m of this.meshes) m.setMatrixAt(i, zero);
      this.meshes[0].setColorAt(i, col.setHex(LOWER[i % LOWER.length]));
      this.meshes[1].setColorAt(i, col.setHex(SHIRTS[(i * 7) % SHIRTS.length]));
      this.meshes[2].setColorAt(i, col.setHex(SKIN[(i * 3) % SKIN.length]));
      this.free.push(MAX_FIG - 1 - i);
    }
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1);
    this.dirty = false;
  }

  _fig(x, y, z, yaw) {
    if (!this.free.length) return null;
    const f = { i: this.free.pop(), x, y, z, yaw, tx: x, tz: z, ty: y, onArrive: null, delay: 0 };
    this.figs.push(f);
    this._place(f);
    return f;
  }
  _drop(f) {
    if (!f) return;
    const k = this.figs.indexOf(f);
    if (k >= 0) this.figs.splice(k, 1);
    this._m.makeScale(0, 0, 0);
    for (const m of this.meshes) m.setMatrixAt(f.i, this._m);
    this.free.push(f.i);
    this.dirty = true;
  }
  _place(f) {
    this._q.setFromEuler(this._e.set(0, f.yaw, 0));
    this._m.compose(this._v.set(f.x, f.y, f.z), this._q, this._one);
    for (const m of this.meshes) m.setMatrixAt(f.i, this._m);
    this.dirty = true;
  }

  // ------------------------------------------------------------ trip
  capacity() { return (this.player.bus?.spec.seatRows || 9) * 4; }
  _fare(fromS, toS) {
    const km = Math.abs(this.route.realKm(toS) - this.route.realKm(fromS));
    const rate = FARE_PER_KM * (this.player.bus?.spec.ac ? AC_FARE_FACTOR : 1);
    return Math.max(MIN_FARE, Math.round((km * rate) / 10) * 10);
  }
  // drop points after `s` for traffic on `side`, in driving order, ending with the terminal
  _later(side, s) {
    const dir = side < 0 ? 1 : -1;
    const list = this.counters.filter((c) => c.side === side && c.role === 'drop' && (c.s - s) * dir > 1).sort((a, b) => (a.s - b.s) * dir);
    return [...list, this.ends[side < 0 ? 1 : 0]];
  }
  _pickDest(side, s) {
    const list = this._later(side, s);
    if (list.length === 1 || this.r() < 0.55) return list[list.length - 1];      // most ride to the end
    return list[Math.floor(this.r() * (list.length - 1))];
  }
  _newPax(side, s) {
    const dest = this._pickDest(side, s);
    return { dest, fare: this._fare(s, dest.s), fromS: s, fig: null };
  }
  _refillDelay() { return COUNTER_REFILL[0] + this.r() * (COUNTER_REFILL[1] - COUNTER_REFILL[0]); }
  // a passenger at a pickup counter: standing at a free spot, or (walkIn) arriving from behind the shed
  _addWaiting(c, walkIn) {
    const pax = this._newPax(c.side, c.s);
    const taken = new Set(c.waiting.map((x) => x.spot));
    const sp = c.spots.find((x) => !taken.has(x)) || c.spots[Math.floor(this.r() * c.spots.length)];
    pax.spot = sp;
    if (walkIn) {
      const q = this.route.pointAt(c.s + (this.r() - 0.5) * 10, c.side * (ROAD.half + 9));
      pax.fig = this._fig(q.x, sp.y, q.z, 0);
      if (pax.fig) { pax.fig.tx = sp.x; pax.fig.tz = sp.z; pax.fig.ty = sp.y; }
    } else pax.fig = this._fig(sp.x, sp.y, sp.z, sp.yaw + (this.r() - 0.5) * 0.8);
    c.waiting.push(pax);
  }
  // new people keep turning up at the pickup counters, so a counter served earlier is not empty for ever
  _refill(dt) {
    for (const c of this.counters) {
      if (c.role !== 'pickup' || (this.stop && this.stop.here === c)) continue;
      c.refillT -= dt;
      if (c.refillT > 0) continue;
      c.refillT = this._refillDelay();
      if (c.waiting.length < 9) this._addWaiting(c, true);
    }
  }
  // the trip can finish: nobody aboard and the door shut
  allOff() { return !this.aboard.length && !this.door && !this.stop && (this.doorT || 0) < 0.02; }

  reset(dirKey = 'ctg') {
    for (const f of [...this.figs]) this._drop(f);
    this.toCtg = dirKey !== 'dhk';
    this.originEnd = this.toCtg ? 0 : 1;
    this.tripSide = this.toCtg ? -1 : 1;
    this.aboard = [];
    this.stop = null; this.door = false; this.cool = 0; this.leaveWarn = 0; this.promptKey = '';
    this.finished = false; this.doorT = 0;
    setBusDoor(this.player.bus, 0);
    Object.assign(this.stats, { aboard: 0, capacity: this.capacity(), fares: 0, tips: 0, mood: MOOD.start, carried: 0, boarded: 0, missed: 0 });
    this.mood = MOOD.start;
    this.mt = { joltCool: 0, sayCool: 0, happyCool: 60, stillT: 0, crashes: this.player.crashes || 0, breaks: this.player.breaks || 0 };
    this.player.pax = this.stats;
    // people waiting at the pickup counters (drop points only see people getting down)
    for (const c of this.counters) {
      c.waiting = []; c.announced = false; c.refillT = this._refillDelay();
      if (c.role !== 'pickup') continue;
      const n = 4 + Math.floor(this.r() * 6);
      for (let k = 0; k < n; k++) this._addWaiting(c, false);
    }
    // the origin terminal crowd (they appear beside the door when it opens)
    const orig = this.ends[this.originEnd];
    this.originCrowd = [];
    const n = Math.round(this.capacity() * (0.55 + this.r() * 0.3));
    for (let k = 0; k < n; k++) this.originCrowd.push(this._newPax(this.tripSide, orig.s));
    this._ui(true);
  }

  // terminal the bus is standing in (end 0 = Dhaka, 1 = Chattogram), using agent-built terminals when present
  _terminal(end) {
    const R = this.route, p = this.player;
    const terms = R.terminals || [];
    if (terms.some((t) => t.end === end)) {
      const t = p.inTerminal ?? R.terminalAt?.(p.s, p.d) ?? null;
      return t && t.end === end ? t : null;
    }
    const near = end === 0 ? p.s < 150 : p.s > R.length - 150;
    return near ? this.ends[end] : null;
  }

  _counterAt() {
    const p = this.player;
    for (const c of this.counters) {
      if (c.side !== p.side || Math.sign(p.d) !== c.side) continue;
      if (Math.abs(p.s - c.s) < ZONE && Math.abs(p.d) > ROAD.median + ROAD.lane) return c;
    }
    return null;
  }

  // world position of the front-left door, and the bus axes
  _doorPos() {
    const ph = this.player.phys, sp = this.player.bus.spec;
    const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw);
    const lx = fz, lz = -fx;                       // left of the bus
    const a = sp.front - 0.78, b = sp.W / 2 + 0.35;
    return { x: ph.pos.x + fx * a + lx * b, z: ph.pos.z + fz * a + lz * b, fx, fz, lx, lz, y: this.route.roadHeight(this.player.s) };
  }

  _openDoor() {
    const p = this.player;
    this.door = true;
    $('ind-door')?.classList.add('on');
    const counter = this._counterAt();
    const orig = this._terminal(this.originEnd), dest = this._terminal(1 - this.originEnd);
    const destName = this.ends[1 - this.originEnd].bn.split(' (')[0];
    let here = null, off = [], on = [];
    if (counter) {
      here = counter;
      off = this.aboard.filter((x) => x.dest === counter);
      on = counter.waiting.slice();
    } else if (dest) {
      here = this.ends[1 - this.originEnd];
      off = this.aboard.slice();
    } else if (orig) {
      here = this.ends[this.originEnd];
      on = this.originCrowd.slice();
    }
    if (!here) { this.hud.toast('🚪 Door open — nobody waiting here. Stop at a 🚏 bus counter.', '', 2600); this.stop = null; return; }
    // seats after the people getting down
    const room = this.capacity() - (this.aboard.length - off.length);
    if (on.length > room) on = on.slice(0, Math.max(0, room));
    this.stop = { here, off: off.slice(), on: on.slice(), t: 1.0, walkers: 0, fares: 0, nOn: on.length, nOff: off.length, doneT: -1, terminal: here.kind === 'end' };
    if (here === this.ends[1 - this.originEnd]) voice.say('helper.arrive', { place: here.bn.split(' (')[0] });
    else if (on.length || here.kind === 'end') voice.say('helper.call', { place: destName });
    if (!off.length && !on.length) this.hud.toast(`🚪 <span class="bn">${here.bn.split(' (')[0]}</span> — nobody for this stop${room <= 0 ? ' (bus full)' : ''}`, '', 2600);
    void p;
  }

  _closeDoor(cancel) {
    this.door = false;
    $('ind-door')?.classList.remove('on');
    const st = this.stop;
    this.stop = null;
    if (!st) return;
    // people still walking to the door go back to the counter
    for (const f of [...this.figs]) {
      if (f.boarding) {
        const pax = f.boarding;
        f.boarding = null;
        if (pax.spot) { f.tx = pax.spot.x; f.tz = pax.spot.z; f.ty = pax.spot.y; f.onArrive = null; }
        else { this._drop(f); pax.fig = null; }
      }
    }
    void cancel;
  }

  // ------------------------------------------------------------ per frame
  update(dt, input) {
    const p = this.player;
    if (!p.bus) return;
    this.cool -= dt; this.leaveWarn -= dt;
    const still = Math.abs(p.phys.v) < 0.5;
    if (input.hit('KeyG')) {
      if (this.door) this._closeDoor(true);
      else if (!still) this.hud.toast('🚪 Stop the bus before opening the door', 'bad', 2200);
      else this._openDoor();
    }
    // driving off with the door open
    if (this.door && Math.abs(p.phys.v) > 1.6) {
      const busy = this.stop && (this.stop.on.length || this.stop.off.length || this.figs.some((f) => f.boarding));
      this._closeDoor(true);
      if (this.leaveWarn <= 0) {
        this.leaveWarn = 6;
        p.rating = Math.max(1, p.rating - (busy ? 0.5 : 0.2));
        this.hud.toast(`<span class="bn">দরজা খোলা!</span> — You drove off with the door open${busy ? ' while people were getting on' : ''}`, 'bad', 3200);
      }
    }
    // the door leaves swing open / shut over ~0.7 s
    const want = this.door ? 1 : 0;
    this.doorT = (this.doorT || 0) + Math.max(-dt * 1.4, Math.min(dt * 1.4, want - (this.doorT || 0)));
    setBusDoor(p.bus, this.doorT);
    if (this.stop) this._serve(dt);
    this._mood(dt);
    this._refill(dt);
    this._walk(dt);
    this._requests();
    this._prompt(still);
    this.uiT -= dt;
    if (this.uiT <= 0) { this.uiT = 0.25; this._ui(); }
    if (this.dirty) { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; this.dirty = false; }
  }

  _serve(dt) {
    const st = this.stop, dp = this._doorPos();
    st.t -= dt;
    if (st.t > 0) return;
    if (st.off.length) {
      // one passenger steps down every 0.7 s and walks off the road
      const pax = st.off.shift();
      const ai = this.aboard.indexOf(pax);
      if (ai >= 0) this.aboard.splice(ai, 1);
      this.stats.carried++;
      const tip = tipFor(pax.fare, this.mood);
      if (tip) { this.stats.tips += tip; st.tips = (st.tips || 0) + tip; }
      const f = this._fig(dp.x, dp.y, dp.z, Math.atan2(dp.lx, dp.lz));
      if (f) {
        const tgt = st.here.kind === 'counter' ? st.here.spots[Math.floor(this.r() * st.here.spots.length)] : null;
        f.tx = tgt ? tgt.x + (this.r() - 0.5) * 3 : dp.x + dp.lx * 7 + dp.fx * (this.r() - 0.5) * 6;
        f.tz = tgt ? tgt.z + (this.r() - 0.5) * 3 : dp.z + dp.lz * 7 + dp.fz * (this.r() - 0.5) * 6;
        f.ty = tgt ? tgt.y : dp.y;
        f.onArrive = () => this._drop(f);
      }
      if (!st.off.length) voice.say(st.tips ? 'pax.tip' : 'pax.thanks');
      st.t = 0.7;
      return;
    }
    if (st.on.length) {
      if (this.aboard.length + this.figs.filter((f) => f.boarding).length >= this.capacity()) { st.on.length = 0; return; }
      const pax = st.on.shift();
      if (!pax.fig) {
        // terminal crowd: they come from beside the bus
        const x = dp.x + dp.lx * (4 + this.r() * 4) + dp.fx * (this.r() - 0.6) * 8, z = dp.z + dp.lz * (4 + this.r() * 4) + dp.fz * (this.r() - 0.6) * 8;
        pax.fig = this._fig(x, dp.y, z, 0);
      }
      const f = pax.fig;
      if (f) {
        f.boarding = pax;
        f.tx = dp.x; f.tz = dp.z; f.ty = dp.y;
        f.onArrive = () => this._board(pax, f);
      } else this._board(pax, null);
      st.t = 0.8;
      return;
    }
    // everyone is done: helper bangs the side, door closes by itself
    if (this.figs.some((f) => f.boarding)) return;
    if (st.doneT < 0) {
      st.doneT = 1.3;
      const msg = [];
      if (st.nOff) msg.push(`${st.nOff} got down${st.tips ? ` · tips ৳ ${st.tips.toLocaleString('en-IN')}` : ''}`);
      if (st.nOn) msg.push(`${st.nOn} boarded · fares ৳ ${st.fares.toLocaleString('en-IN')}`);
      if (msg.length) this.hud.toast(`🚌 <span class="bn">${st.here.bn.split(' (')[0]}</span> — ${msg.join(' · ')}`, 'good', 3200);
      if (st.nOn) voice.say('helper.board_done');
    }
    st.doneT -= dt;
    if (st.doneT <= 0) this._closeDoor(false);
  }

  _board(pax, f) {
    const st = this.stop;
    if (f) { f.boarding = null; this._drop(f); }
    pax.fig = null; pax.spot = null;
    const from = st?.here;
    const list = from?.kind === 'counter' ? from.waiting : this.originCrowd;
    const wi = list.indexOf(pax);
    if (wi >= 0) list.splice(wi, 1);
    this.aboard.push(pax);
    this.stats.fares += pax.fare; this.stats.boarded++;
    if (st) st.fares += pax.fare;
    // the stop they are going to has not been announced yet
    if (pax.dest.kind === 'counter') pax.dest.announced = false;
  }

  _walk(dt) {
    const step = WALK * dt;
    for (const f of [...this.figs]) {
      const dx = f.tx - f.x, dz = f.tz - f.z, L = Math.hypot(dx, dz);
      if (L < 0.05) {
        if (f.onArrive) { const cb = f.onArrive; f.onArrive = null; cb(); }
        continue;
      }
      // if the bus moved away, people walking to the door follow the door
      if (f.boarding) { const dp = this._doorPos(); f.tx = dp.x; f.tz = dp.z; }
      const k = Math.min(1, step / L);
      f.x += dx * k; f.z += dz * k; f.y += (f.ty - f.y) * Math.min(1, dt * 3);
      f.yaw = Math.atan2(dx, dz);
      this._place(f);
    }
  }

  // passengers ring the bell before their stop; drive past and they complain
  _requests() {
    const p = this.player, dir = p.side < 0 ? 1 : -1;
    for (const c of this.counters) {
      if (c.side !== p.side) continue;
      const mine = this.aboard.filter((x) => x.dest === c);
      if (!mine.length) continue;
      const ahead = (c.s - p.s) * dir;
      if (!c.announced && ahead > 0 && ahead < ANNOUNCE) {
        c.announced = true;
        voice.say('pax.stop_request', { place: c.bn });
        setTimeout(() => voice.say('helper.next_stop', { place: c.bn }), 2600);
        this.hud.toast(`🔔 <span class="bn">ভাই, ${c.bn} নামবো!</span> — ${mine.length} passenger${mine.length > 1 ? 's' : ''} getting down at ${c.en}. Stop at the counter.`, '', 4200);
      }
      if (ahead < -(ZONE + 15) && !(this.stop && this.stop.here === c)) {
        // missed: they get down at the next stop instead, unhappy
        const next = this._later(c.side, c.s)[0];
        for (const x of mine) x.dest = next;
        if (next.kind === 'counter') next.announced = false;
        this.stats.missed += mine.length;
        p.rating = Math.max(1, p.rating - 0.5);
        voice.say('pax.missed', { place: c.bn });
        this.hud.toast(`<span class="bn">ও ভাই, ${c.bn} তো চলে গেল!</span> — You drove past ${c.en}: ${mine.length} passenger${mine.length > 1 ? 's' : ''} must get down at ${next.en.split(' (')[0]}`, 'bad', 4200);
      }
    }
  }

  _prompt(still) {
    const el = $('paxprompt');
    if (!el) return;
    let html = '';
    if (this.stop) {
      const st = this.stop, walking = this.figs.filter((f) => f.boarding).length;
      const left = st.on.length + walking, down = st.off.length;
      html = left || down ? `🚪 ${down ? `${down} getting down` : ''}${down && left ? ' · ' : ''}${left ? `${left} boarding` : ''} — wait for the helper <small>(G closes the door)</small>` : '';
    } else if (!this.door) {
      const c = this._counterAt();
      const orig = !c && this._terminal(this.originEnd), dest = !c && this._terminal(1 - this.originEnd);
      if (c) {
        const off = this.aboard.filter((x) => x.dest === c).length, on = c.waiting.length;
        if (off || on) html = `🚏 <b class="bn">${c.bn}</b> counter — ${on ? `${on} waiting` : ''}${on && off ? ' · ' : ''}${off ? `${off} getting down` : ''} · ${still ? 'press <kbd>G</kbd> to open the door' : 'stop here'}`;
      } else if (orig && this.originCrowd.length && this.aboard.length < this.capacity()) {
        html = `🚌 <b class="bn">${(orig.bn || this.ends[this.originEnd].bn).split(' (')[0]}</b> — ${this.originCrowd.length} passengers waiting · ${still ? 'press <kbd>G</kbd> to open the door and board them' : 'stop to board'}`;
      } else if (dest && this.aboard.length) {
        html = `🏁 ${still ? 'Press <kbd>G</kbd> to let everyone off' : 'Stop to let everyone off'} (${this.aboard.length} aboard)`;
      }
    }
    if (html !== this.promptKey) {
      this.promptKey = html;
      el.innerHTML = html;
      el.style.display = html ? 'block' : 'none';
    }
  }

  _nextStop() {
    const p = this.player, dir = p.side < 0 ? 1 : -1;
    let best = null, bd = 1e9;
    for (const x of this.aboard) {
      const ahead = (x.dest.s - p.s) * dir;
      if (ahead > -ZONE && ahead < bd) { bd = ahead; best = x.dest; }
    }
    return best ? { stop: best, n: this.aboard.filter((x) => x.dest === best).length, km: Math.abs(this.route.realKm(best.s) - this.route.realKm(p.s)) } : null;
  }

  // ------------------------------------------------------------ mood
  // What the passengers aboard think of the ride. Rough driving, crashes, speeding, long stretches without a
  // break, standing around and heat lower it; calm driving and rest stops raise it. It sets the tips at drop-off,
  // and unhappy passengers complain (this replaces the old toast-only comfort complaints).
  _mood(dt) {
    const p = this.player, ph = p.phys, m = this.mt;
    if (!m) return;
    const kmh = Math.abs(ph.v) * 3.6, n = this.aboard.length;
    m.joltCool -= dt; m.sayCool -= dt; m.happyCool -= dt;
    let d = 0;
    const lat = Math.abs(ph.latAcc || 0), lon = ph.lonAcc || 0;
    if (n && m.joltCool <= 0 && (lat > 3.4 || lon < -5.5) && kmh > 8) {
      const hard = lat > 5 || lon < -7.5;
      d -= hard ? MOOD.hardJolt : MOOD.jolt;
      m.joltCool = 1.5;
      p.rating = Math.max(1, p.rating - (hard ? 0.15 : 0.08));
      if (m.sayCool <= 0) { voice.say(lon < -5.5 ? 'pax.slow' : 'pax.uncomfortable'); m.sayCool = 7; }
      this.hud.toast(`<span class="bn">${['আস্তে চালান!', 'ড্রাইভার ভাই, সাবধানে!', 'পেটের ভাত উল্টে যাবে!'][Math.floor(this.r() * 3)]}</span> — ${lon < -5.5 ? 'hard braking' : 'sharp turn'}, passengers unhappy`, 'bad', 2400);
    }
    if ((p.crashes || 0) > m.crashes) { d -= MOOD.crash * ((p.crashes || 0) - m.crashes); m.crashes = p.crashes || 0; }
    if ((p.breaks || 0) > m.breaks) { d += MOOD.rest; m.breaks = p.breaks || 0; if (n) setTimeout(() => voice.say('pax.happy'), 3500); }
    if (kmh > SPEED_LIMIT + 10) d -= MOOD.speeding * dt;
    if ((p.sinceBreak || 0) > 180 && !(p.resting > 0)) d -= MOOD.tired * dt;
    // standing still where nothing is happening
    const busy = this.stop || this.door || p.resting > 0 || p.refuelling || p.inTerminal || this._counterAt() || this.route.restAt?.(p.s, p.d);
    m.stillT = kmh < 2 && !busy ? m.stillT + dt : 0;
    if (m.stillT > MOOD.waitAfter) {
      d -= MOOD.wait * dt;
      if (n && m.sayCool <= 0) { voice.say('pax.long_wait'); m.sayCool = 40; }
    }
    // heat in a non-AC bus in the afternoon, when there is no breeze
    const hour = (((p.clockMin || 0) / 60) % 24 + 24) % 24;
    if (!p.bus.spec.ac && hour > 11 && hour < 16 && kmh < 15 && n) {
      d -= MOOD.heat * dt;
      if (m.sayCool <= 0 && this.r() < dt * 0.05) { voice.say('pax.hot'); m.sayCool = 60; }
    }
    // calm, steady driving wins them back
    if (kmh > 30 && kmh <= SPEED_LIMIT + 5 && lat < 2 && lon > -3) d += MOOD.smooth * dt;
    if (!n) d = (MOOD.start - this.mood) * 0.05 * dt;     // nobody aboard: the next passengers start fresh
    this.mood = Math.max(0, Math.min(100, this.mood + d));
    this.stats.mood = Math.round(this.mood);
    if (n && this.mood > 88 && m.happyCool <= 0 && kmh > 30) { m.happyCool = 150 + this.r() * 90; voice.say('pax.happy'); }
    if (n && this.mood < 35 && m.sayCool <= 0) { m.sayCool = 25; voice.say('pax.uncomfortable'); p.rating = Math.max(1, p.rating - 0.05); }
  }

  _moodUI() {
    let el = $('trip-mood');
    if (!el) {
      const trip = $('trip');
      if (!trip) return;
      const row = document.createElement('div');
      row.className = 'r';
      row.innerHTML = 'Mood <b id="trip-mood"></b>';
      const after = $('trip-rating')?.parentElement;
      if (after && after.parentElement === trip) after.after(row); else trip.appendChild(row);
      el = $('trip-mood');
    }
    const v = this.stats.mood, face = v >= 80 ? '😊' : v >= 60 ? '🙂' : v >= 40 ? '😐' : v >= 20 ? '😟' : '😡';
    const col = v >= 65 ? '#7CFC9A' : v >= 40 ? '#ffd54f' : '#ff5252';
    const txt = `${face} ${v}%${this.stats.tips ? ` · tips ৳ ${this.stats.tips.toLocaleString('en-IN')}` : ''}`;
    if (el.textContent !== txt) { el.textContent = txt; el.style.color = col; }
  }

  _ui() {
    this._moodUI();
    const s = this.stats;
    s.aboard = this.aboard.length; s.capacity = this.capacity();
    const seats = $('trip-seats'), fares = $('trip-fares'), next = $('trip-stop');
    if (seats) seats.textContent = `${s.aboard} / ${s.capacity}`;
    if (fares) fares.textContent = `৳ ${s.fares.toLocaleString('en-IN')}`;
    if (next) {
      const n = this._nextStop();
      next.innerHTML = n ? `<span class="bn">${n.stop.bn.split(' (')[0]}</span> · ${n.n} · ${n.km.toFixed(0)} km` : '—';
    }
  }

  // arrival screen: whoever is still aboard gets down at the terminal
  finishTrip() {
    if (this.finished) return;
    this.finished = true;
    if (this.aboard.length) {
      this.stats.carried += this.aboard.length;
      for (const x of this.aboard) this.stats.tips += tipFor(x.fare, this.mood);
      this.aboard = [];
      voice.say('helper.arrive', { place: this.ends[1 - this.originEnd].bn.split(' (')[0] });
    }
    this._closeDoor(false);
    this._ui();
  }
}
