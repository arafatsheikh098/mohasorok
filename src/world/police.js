// Highway police checkpoints (হাইওয়ে পুলিশ চেকপোস্ট) on both carriageways, and the "traffic jam ahead" warnings.
//
// At a checkpoint the fast lane is coned off (AI traffic merges left: roadState.closures in traffic.js), a police
// pickup with a light bar is parked on the shoulder and officers in reflective vests stand by the road.
// Sometimes an officer waves the bus over: slow down, pull onto the left shoulder past the cones, stop, show the
// papers (F, or just wait) and drive on. Ignoring the signal, or speeding through the cones, costs a fine.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { makeCanvas, canvasTexture, BN_FONT, EN_FONT } from '../textures.js';
import { roadState, jamZones, jamLevel, rushLevel } from '../traffic.js';
import { voice } from '../voice.js';

const $ = (id) => document.getElementById(id);
// layout along the direction of travel (u, metres; 0 = where the fast lane is fully closed)
const TAPER_IN = -70, CLOSED_END = 45, TAPER_OUT = 75;
const PULL = [8, 42];               // pull-over box on the shoulder
const WAVE_P = 0.45;                // chance an officer waves the bus over
const FINE_IGNORE = 5000, FINE_SPEED = 2000, FINE_CONES = 500;
const CHECK_LIMIT = 40;             // km/h through the cones

function panel(w, h, bg, draw) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  draw(x, w, h);
  return canvasTexture(c, { repeat: false });
}

export class Police {
  constructor({ route, scene, chunks, obstacles, counters = [], hud, player }) {
    this.route = route; this.hud = hud; this.player = player;
    this.r = Math.random;
    this.cps = [];
    this.closures = [];
    this.anim = [];               // officers waving, light bars
    this.t = 0;
    this._mats();
    const placed = [];
    // where the checkpoints go: route.policeSpots, from the roads' data (src/data/bd_network.js)
    for (const sp of route.policeSpots) {
      const s = this._find(sp.s, counters, placed);
      if (s === null) { console.warn(`[police] no room for the ${sp.en} checkpoint`); continue; }
      placed.push(s);
      for (const side of [-1, 1]) {
        const cp = { s, side, dir: side < 0 ? 1 : -1, en: sp.en, cones: [], state: 'idle', officers: [] };
        this._build(cp, scene, chunks, obstacles);
        this.cps.push(cp);
        this.closures.push({ dir: cp.dir, s0: s + cp.dir * TAPER_IN, sc: s, s1: s + cp.dir * TAPER_OUT });
      }
    }
    roadState.closures = this.closures;
    this.jamWarned = {};
    this._promptEl();
    if (import.meta.env?.DEV || /[?&]debug/.test(location.search)) window.__police = this;   // debug hook
  }

  // ------------------------------------------------------------ placement
  _clear(s, counters, placed) {
    const R = this.route, m = 130;
    if (s < 400 || s > R.length - 400) return false;
    if (R.bridgeAt(s) || R.bridgeAt(s - 220) || R.bridgeAt(s + 220)) return false;       // ramps too
    if (R.tollDist(s) < 500) return false;
    if (R.uturns.some((u) => s > u.s0 - m && s < u.s1 + m)) return false;
    if (R.stations.some((x) => s > x.s0 - m && s < x.s1 + m)) return false;
    if (R.rests.some((x) => s > x.s0 - m && s < x.s1 + m)) return false;
    if ((R.terminals || []).some((x) => s > x.s0 - 300 && s < x.s1 + 300)) return false;
    if (counters.some((c) => Math.abs(c.s - s) < 160)) return false;
    if (jamZones(R).some((z) => s > z.s0 - 100 && s < z.s1 + 100)) return false;
    for (const f of R.footbridges) if (Math.abs(s - f) < 120) return false;     // footbridges
    if (placed.some((x) => Math.abs(x - s) < 1500)) return false;
    return true;
  }
  _find(s0, counters, placed) {
    for (let k = 0; k < 120; k++) {
      const s = s0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40;
      if (this._clear(s, counters, placed)) return s;
    }
    return null;
  }

  // ------------------------------------------------------------ models
  _mats() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    this.M = {
      cone: std(0xff5a1a, { roughness: 0.55 }), coneBand: std(0xf4f4f0, { roughness: 0.4, emissive: 0x333333 }),
      coneBase: std(0x1a1a1a), navy: std(0x1d2a44), trouser: std(0x22252c), skin: std(0x8d5a3b), vest: std(0xc6ff2e, { emissive: 0x3a4a00, roughness: 0.5 }),
      white: std(0xf1f2f0, { roughness: 0.45, metalness: 0.1 }), blue: std(0x1546a8, { roughness: 0.5 }), dark: std(0x16181b),
      glass: std(0x1b2a33, { roughness: 0.1, metalness: 0.5 }), tire: std(0x141414, { roughness: 0.95 }),
      red: std(0x400000, { emissive: 0xff1a1a, emissiveIntensity: 0 }), lblue: std(0x001040, { emissive: 0x2a6bff, emissiveIntensity: 0 }),
      baton: std(0xff3b1a, { emissive: 0xff2a00, emissiveIntensity: 0.8 }), pole: std(0x9a9a9a, { metalness: 0.7, roughness: 0.4 }),
      bar: std(0xd32f2f), barW: std(0xf2f2ee),
    };
    this.G = {
      cone: new THREE.ConeGeometry(0.2, 0.72, 12).translate(0, 0.36, 0),
      band: new THREE.CylinderGeometry(0.125, 0.15, 0.12, 12, 1, true).translate(0, 0.42, 0),
      coneBase: new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0),
    };
    const pickupTex = panel(1024, 128, '#f1f2f0', (x, w, h) => {
      x.fillStyle = '#1546a8'; x.fillRect(0, h * 0.12, w, h * 0.76);
      x.fillStyle = '#fff'; x.font = `bold 66px ${BN_FONT}`; x.fillText('হাইওয়ে পুলিশ', w * 0.3, h / 2 + 3);
      x.font = `bold 48px ${EN_FONT}`; x.fillText('HIGHWAY POLICE', w * 0.74, h / 2 + 2);
    });
    this.M.pickupSide = new THREE.MeshStandardMaterial({ map: pickupTex, roughness: 0.5 });
    this.signTex = panel(1024, 640, '#0d47a1', (x, w, h) => {
      x.strokeStyle = '#fff'; x.lineWidth = 16; x.strokeRect(14, 14, w - 28, h - 28);
      x.fillStyle = '#fff'; x.font = `bold 96px ${BN_FONT}`; x.fillText('হাইওয়ে পুলিশ চেকপোস্ট', w / 2, 140);
      x.fillStyle = '#ffd54f'; x.font = `bold 84px ${BN_FONT}`; x.fillText('গতি কমান', w / 2, 280);
      x.fillStyle = '#fff'; x.font = `bold 58px ${EN_FONT}`; x.fillText('HIGHWAY POLICE CHECKPOST', w / 2, 410);
      x.fillText('SLOW DOWN · 300 m', w / 2, 500);
    });
    this.limitTex = panel(256, 256, '#ffffff', (x, w, h) => {
      x.fillStyle = '#d32f2f'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 34, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#111'; x.font = `bold 110px ${EN_FONT}`; x.fillText(String(CHECK_LIMIT), w / 2, h / 2 + 6);
    });
  }

  _cone(grp, x, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.G.cone, this.M.cone), new THREE.Mesh(this.G.band, this.M.coneBand), new THREE.Mesh(this.G.coneBase, this.M.coneBase));
    g.position.set(x, 0, z);
    g.children[0].castShadow = true;
    grp.add(g);
    return g;
  }

  _officer(waving) {
    const M = this.M, g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    for (const sx of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.075, 0.08, 0.86, 7), M.trouser, sx, 0.43, 0);
    add(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8), M.navy, 0, 1.17, 0);
    add(new THREE.CylinderGeometry(0.215, 0.185, 0.46, 8), M.vest, 0, 1.2, 0);
    add(new THREE.SphereGeometry(0.12, 10, 8), M.skin, 0, 1.62, 0);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10), M.navy, 0, 1.74, 0);
    add(new THREE.BoxGeometry(0.16, 0.02, 0.12), M.dark, 0, 1.71, 0.1);                 // cap peak
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), M.navy, -0.24, 1.15, 0);       // left arm, hanging
    // right arm on a shoulder pivot, holding a lit baton
    const arm = new THREE.Group();
    arm.position.set(0.24, 1.4, 0);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), M.navy);
    a.position.y = -0.26; arm.add(a);
    const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), M.baton);
    baton.position.y = -0.7; arm.add(baton);
    g.add(arm);
    g.userData.arm = arm;
    g.userData.waving = waving;
    return g;
  }

  _pickup() {
    const M = this.M, g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(1.86, 0.55, 5.2), M.white, 0, 0.75, 0);                    // body
    const side = [M.pickupSide, M.pickupSide, M.white, M.white, M.white, M.white];
    add(new THREE.BoxGeometry(1.87, 0.42, 5.0), side, 0, 0.82, 0);                         // blue band with the lettering
    add(new THREE.BoxGeometry(1.8, 0.78, 1.9), M.white, 0, 1.4, 1.0);                      // cab
    add(new THREE.BoxGeometry(1.7, 0.5, 0.05), M.glass, 0, 1.5, 1.96);                     // windscreen
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.42, 1.4), M.glass, sx * 0.91, 1.5, 1.0);
    add(new THREE.BoxGeometry(1.8, 0.62, 2.6), M.white, 0, 1.32, -1.25);                   // canopy over the bed
    add(new THREE.BoxGeometry(1.2, 0.12, 0.34), M.dark, 0, 1.86, 1.0);                     // light bar
    const red = add(new THREE.BoxGeometry(0.5, 0.13, 0.3), M.red, -0.32, 1.93, 1.0);
    const blue = add(new THREE.BoxGeometry(0.5, 0.13, 0.3), M.lblue, 0.32, 1.93, 1.0);
    for (const z of [1.6, -1.6]) for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14).rotateZ(Math.PI / 2), M.tire);
      w.position.set(sx * 0.84, 0.38, z); g.add(w);
    }
    this.anim.push({ bar: true, red, blue, ph: this.r() * 2 });
    return g;
  }

  _sign(grp, route, s, d, faceDir, tex, w, h, lift = 2.0) {
    const g = new THREE.Group();
    const p = route.pointAt(s, d);
    g.position.set(p.x, route.roadHeight(s), p.z);
    g.rotation.y = route.yawAt(s) + (faceDir > 0 ? Math.PI : 0);     // panel faces the oncoming driver
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    pnl.position.y = lift + h / 2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), this.M.pole);
    back.position.set(0, pnl.position.y, -0.04);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, lift + h + 0.4, 8), this.M.pole);
    leg.position.set(0, (lift + h) / 2 - 0.2, -0.08);
    g.add(pnl, back, leg);
    grp.add(g);
  }

  _build(cp, scene, chunks, obstacles) {
    const R = this.route, { side: sd, dir } = cp;
    const grp = new THREE.Group();
    const at = (u, d, obj, yawOff = 0) => {
      const s = cp.s + dir * u, p = R.pointAt(s, d);
      obj.position.set(p.x, R.roadHeight(s), p.z);
      obj.rotation.y = R.yawAt(s) + (dir < 0 ? Math.PI : 0) + yawOff;      // local +z = direction of travel
      grp.add(obj);
      return obj;
    };
    // cones: diagonal taper across the fast lane, along the lane line, then back to the median
    const med = ROAD.median + 0.35, line = ROAD.median + ROAD.lane - 0.15;
    const cone = (u, ad) => { const c = this._cone(grp, 0, 0); at(u, sd * ad, c); cp.cones.push({ g: c, u, d: sd * ad, hit: false, base: c.position.clone() }); };
    for (let u = TAPER_IN; u < 0; u += 5) cone(u, med + (line - med) * ((u - TAPER_IN) / -TAPER_IN));
    for (let u = 0; u <= CLOSED_END; u += 6) cone(u, line);
    for (let u = CLOSED_END + 5; u <= TAPER_OUT; u += 5) cone(u, line - (line - med) * ((u - CLOSED_END) / (TAPER_OUT - CLOSED_END)));
    // a red-white barricade inside the closed lane, facing the traffic
    const bar = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.06), k % 2 ? this.M.barW : this.M.bar);
      seg.position.set((k - 2.5) * 0.5, 0.95, 0); bar.add(seg);
    }
    for (const x of [-1.3, 1.3]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.5), this.M.dark); lg.position.set(x, 0.5, 0); bar.add(lg); }
    at(-4, sd * (ROAD.median + ROAD.lane * 0.5), bar);
    // police pickup on the shoulder, after the pull-over box
    const shD = sd * (ROAD.edge + 1.05);
    at(PULL[1] + 7, shD, this._pickup());
    const pu = cp.s + dir * (PULL[1] + 7);
    obstacles?.push({ s0: pu - 2.7, s1: pu + 2.7, d0: Math.min(shD - 0.95, shD + 0.95), d1: Math.max(shD - 0.95, shD + 0.95) });
    // officers: one at the edge line waving the traffic, one by the pickup
    const o1 = this._officer(true), o2 = this._officer(false);
    at(4, sd * (ROAD.edge + 0.35), o1, Math.PI);    // facing the oncoming traffic
    at(PULL[1] + 2, sd * (ROAD.half - 0.2), o2, Math.PI);
    cp.officers.push(o1, o2);
    this.anim.push({ officer: o1, cp });
    // signs before the checkpoint, on the left edge, facing the traffic
    const edge = sd * (ROAD.half + 1.6);
    this._sign(grp, R, cp.s + dir * -320, edge, dir, this.signTex, 3.6, 2.25);
    this._sign(grp, R, cp.s + dir * -150, edge, dir, this.limitTex, 1.1, 1.1, 1.6);
    grp.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(grp);
    chunks?.register(grp, cp.s, 420);
  }

  // ------------------------------------------------------------ per trip / per frame
  reset() {
    for (const cp of this.cps) {
      cp.state = 'idle'; cp.decided = false; cp.wave = false; cp.warned = false; cp.checkT = 0; cp.fined = false; cp.coneFined = false;
      for (const c of cp.cones) { c.hit = false; c.g.position.copy(c.base); c.g.rotation.x = 0; c.g.rotation.z = 0; }
    }
    this.jamWarned = {};
    this._prompt('');
  }

  _promptEl() {
    if (this.el) return;
    this.el = document.getElementById('police-prompt');
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'police-prompt';
    Object.assign(this.el.style, {
      position: 'absolute', left: '50%', top: '96px', transform: 'translateX(-50%)', maxWidth: 'min(620px, 90vw)',
      background: 'rgba(13,40,110,.9)', border: '1px solid rgba(255,255,255,.25)', borderLeft: '5px solid #ff3b1a',
      borderRadius: '9px', padding: '8px 14px', color: '#fff', font: '600 15px/1.35 system-ui, sans-serif',
      display: 'none', zIndex: 6, pointerEvents: 'none', textAlign: 'center',
    });
    (document.getElementById('hud') || document.body).appendChild(this.el);
  }
  _prompt(html) {
    if (!this.el || html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.el.innerHTML = html;
    this.el.style.display = html ? 'block' : 'none';
  }

  _fine(amount, msg) {
    const p = this.player;
    p.fines += amount;
    p.rating = Math.max(1, p.rating - (amount >= FINE_IGNORE ? 1 : amount >= FINE_SPEED ? 0.3 : 0.15));
    voice.say('police.fine');
    this.hud.toast(`👮 <span class="bn">হাইওয়ে পুলিশ</span> — ${msg}<br><b>Fine ৳ ${amount.toLocaleString('en-IN')}</b>`, 'bad', 4800);
  }

  update(dt, input, hour = roadState.hour) {
    const p = this.player;
    if (!p.bus) return;
    this.t += dt;
    roadState.hour = hour;
    this._animate(dt);
    const kmh = Math.abs(p.phys.v) * 3.6, still = Math.abs(p.phys.v) < 0.5;
    let prompt = '';
    for (const cp of this.cps) {
      if (cp.side !== p.side) continue;
      const u = (p.s - cp.s) * cp.dir;
      if (Math.abs(u) > 900) { if (cp.state !== 'idle') { cp.state = 'idle'; cp.decided = false; cp.warned = false; cp.fined = false; cp.coneFined = false; } continue; }
      if (!cp.decided && u > -900 && u < -480) { cp.decided = true; cp.wave = this.r() < WAVE_P; }
      if (!cp.warned && u > -480 && u < -200) {
        cp.warned = true;
        voice.say('helper.police');
        this.hud.toast(`👮 <span class="bn">সামনে হাইওয়ে পুলিশ চেকপোস্ট</span><br><small>Police checkpoint ahead — fast lane closed, ${CHECK_LIMIT} km/h through the cones</small>`, '', 4200);
      }
      // cones: soft, but the police notice
      this._cones(cp, u);
      if (cp.state === 'idle' && cp.wave && u > -170 && u < PULL[0]) {
        cp.state = 'waving';
        voice.say('police.stop');
        this.hud.toast('👮 <span class="bn">থামেন! সাইডে রাখেন!</span> — The officer is waving you over: pull onto the left shoulder past the cones and stop', 'bad', 4500);
      }
      if (cp.state === 'waving') {
        const onShoulder = Math.abs(p.d) > ROAD.edge - 1.3 && Math.abs(p.d) < ROAD.half + 1.5;
        if (still && onShoulder && u > PULL[0] - 6 && u < PULL[1] + 4) { cp.state = 'check'; cp.checkT = 0; cp.handed = false; }
        else if (u > PULL[1] + 25) {
          cp.state = 'done';
          this._fine(FINE_IGNORE, 'You ignored the police signal to stop');
        } else prompt = `👮 <b>Pull over</b> on the left shoulder by the officer and stop${kmh > 5 ? ` · ${Math.round(kmh)} km/h` : ''}`;
      }
      if (cp.state === 'check') {
        if (!still) {
          cp.state = 'waving';     // drove off mid-check: back to "pull over" (and a fine if they keep going)
        } else {
          cp.checkT += dt;
          if (!cp.handed && input?.hit('KeyF')) { cp.handed = true; cp.checkT = Math.max(cp.checkT, 0); cp.handT = cp.checkT; }
          const doneAt = cp.handed ? cp.handT + 2.6 : 7.5;
          prompt = cp.handed ? '👮 <span class="bn">কাগজপত্র দেখছে…</span> Checking the papers…'
            : '👮 <span class="bn">কাগজপত্র দেখান</span> — press <kbd>F</kbd> to hand over the bus papers';
          if (cp.checkT >= doneAt) {
            cp.state = 'done';
            if (!cp.handed) p.rating = Math.max(1, p.rating - 0.1);      // kept the officer waiting
            voice.say('police.ok');
            this.hud.toast('👮 <span class="bn">ঠিক আছে, যান!</span> — Papers OK. Drive on carefully.', 'good', 3200);
          }
        }
      }
      // not waved over: just keep it slow through the cones
      if ((cp.state === 'idle' || cp.state === 'done') && !cp.fined && !cp.wave && u > TAPER_IN && u < CLOSED_END && kmh > CHECK_LIMIT + 8) {
        cp.fined = true;
        this._fine(FINE_SPEED, `${Math.round(kmh)} km/h through the checkpoint (limit ${CHECK_LIMIT})`);
      }
      if (cp.state === 'idle' && u > TAPER_OUT) cp.state = 'done';
    }
    this._prompt(prompt);
    this._jams(p);
  }

  // knock over cones the bus touches
  _cones(cp, u) {
    if (u < TAPER_IN - 15 || u > TAPER_OUT + 15) return;
    const p = this.player, ph = p.phys, sp = p.bus.spec;
    const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw);
    const cx = ph.pos.x + fx * sp.center, cz = ph.pos.z + fz * sp.center;
    let hits = 0;
    for (const c of cp.cones) {
      if (c.hit) continue;
      const dx = c.g.position.x - cx, dz = c.g.position.z - cz;
      const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      if (Math.abs(along) < sp.L / 2 + 0.2 && Math.abs(across) < sp.W / 2 + 0.2) {
        c.hit = true; hits++;
        const push = Math.max(1.5, Math.abs(ph.v) * 0.35);
        c.g.position.x += fx * push + (this.r() - 0.5); c.g.position.z += fz * push + (this.r() - 0.5);
        c.g.rotation.z = (this.r() < 0.5 ? -1 : 1) * 1.45; c.g.rotation.y += this.r() * 3;
        c.g.position.y += 0.18;
      }
    }
    if (hits && !cp.coneFined) {
      cp.coneFined = true;
      this._fine(FINE_CONES, 'You knocked over the checkpoint cones');
    }
  }

  _animate(dt) {
    void dt;
    const p = this.player;
    for (const a of this.anim) {
      if (a.bar) {
        const ph = (this.t * 2.6 + a.ph) % 1;
        a.red.material.emissiveIntensity = ph < 0.25 || (ph > 0.5 && ph < 0.6) ? 2.2 : 0.1;
        a.blue.material.emissiveIntensity = (ph > 0.25 && ph < 0.4) || ph > 0.75 ? 2.2 : 0.1;
      } else if (a.officer) {
        // wave the baton at the bus when it is being pulled over, otherwise a slow "keep moving" sweep
        const near = a.cp.side === p.side && Math.abs((p.s - a.cp.s) * a.cp.dir) < 260;
        const pull = a.cp.state === 'waving';
        const arm = a.officer.userData.arm;
        if (pull) { arm.rotation.z = 2.2 + Math.sin(this.t * 6) * 0.6; arm.rotation.x = 0; }
        else if (near) { arm.rotation.z = 1.2 + Math.sin(this.t * 2.2) * 0.5; arm.rotation.x = 0; }
        else { arm.rotation.z = 0.2; }
      }
    }
  }

  // ------------------------------------------------------------ jam warnings
  _jams(p) {
    const dir = p.side < 0 ? 1 : -1;
    for (const z of jamZones(this.route)) {
      const entry = dir > 0 ? z.s0 : z.s1;
      const ahead = (entry - p.s) * dir;
      const key = `${z.id}${p.side}`;
      if (ahead < -((z.s1 - z.s0) + 200) || ahead > 1500) { this.jamWarned[key] = false; continue; }
      const lvl = Math.max(z.base, rushLevel(roadState.hour));
      if (!this.jamWarned[key] && ahead > 120 && ahead < 650 && lvl > 0.45) {
        this.jamWarned[key] = true;
        voice.say('helper.jam');
        const what = z.toll ? 'queue at the toll plaza' : `traffic jam at ${z.en}`;
        this.hud.toast(`🚦 <span class="bn">সামনে জ্যাম</span> — ${what}. Slow down, keep your distance.`, '', 4000);
      }
      void jamLevel;
    }
  }
}
