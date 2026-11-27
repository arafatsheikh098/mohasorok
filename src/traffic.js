import * as THREE from 'three';
import { ROAD, PLAZA } from './config.js';
import { buildBus, BUS_TYPES, setBusLights, setBusRouteBoard } from './busModel.js';
import { buildTruck, buildCar, buildMicrobus, buildCNG, setVehicleLights } from './trafficModels.js';
import { OPERATORS } from './operators.js';
import { rng } from './textures.js';
import { TOLL } from './world/facilities.js';
import { obbOverlap } from './collide.js';
import { addLampGlow, updateLampGlow, facingCamera } from './aiLights.js';

// lane centres come from the lane profile at the vehicle's s (route.prof: divided 4-lane or undivided 2-lane)
// agg: how pushy the drivers of this kind are (buses and cars push hardest on the N1)
// lat: top sideways speed in a lane change (m/s); a bus takes ~4–5 s to cross a lane
const KINDS = [
  { kind: 'bus', w: 0.34, v: [21, 26], fast: 0.75, a: 1.0, agg: [0.45, 1], lat: 1.0 },
  { kind: 'truck', w: 0.24, v: [12.5, 16.5], fast: 0.1, a: 0.6, agg: [0.05, 0.4], lat: 0.75 },
  { kind: 'cng', w: 0.14, v: [9.5, 12], fast: 0.0, a: 1.2, agg: [0.2, 0.6], lat: 1.0 },
  { kind: 'car', w: 0.18, v: [20, 26], fast: 0.65, a: 1.8, agg: [0.2, 0.9], lat: 1.4 },
  { kind: 'micro', w: 0.10, v: [19, 23], fast: 0.5, a: 1.5, agg: [0.4, 0.95], lat: 1.3 },
];
const TOLL_NO_CHANGE = 320;   // m either side of the toll plaza: no overtaking
const FLASH = [0.16, 0.32, 0.5];   // passing flash: on – off – on (s)

// ---- congestion ----
// Shared with src/world/police.js: lane closures at police checkpoints and the time of day.
//   closures: { dir, s0 (taper starts), sc (lane fully closed), s1 (end) } — the FAST lane of that direction.
export const roadState = { closures: [], hour: 12 };
// how busy the N1 is at this hour (0 = empty night road, 1 = rush hour)
export function rushLevel(h) {
  const g = (c, w) => Math.exp(-(((h - c) ** 2) / (2 * w * w)));
  const night = h < 5.5 || h > 23 ? 0.18 : 0;
  return THREE.MathUtils.clamp(0.22 + 0.85 * Math.max(g(9, 1.4), g(18.5, 1.7)) - night, 0, 1);
}
// jam zones: Kanchpur–Signboard (Dhaka exit), the big towns on the way, and the toll plaza queues (busy all day)
export function jamZones(route) {
  if (route._jams) return route._jams;
  const z = [];
  // Kanchpur (the Dhaka exit) and every big city the trip passes through (not the two ends: the bus starts and
  // stops in their terminals)
  const kp = route.places.find((p) => p.en === 'Kanchpur');
  if (kp) z.push({ id: 'kanchpur', bn: 'কাঁচপুর', en: 'Kanchpur', s0: Math.max(140, kp.s - 380), s1: kp.s + 260, base: 0 });
  for (const p of route.places) {
    if (p.kind !== 'city' || p.s < 900 || p.s > route.length - 900) continue;
    const en = p.en.split(' (')[0];
    z.push({ id: en.toLowerCase(), bn: p.bn.split(' (')[0], en, s0: p.s - 450, s1: p.s + 360, base: 0 });
  }
  for (const t of route.tolls) z.push({ id: `toll${Math.round(t.s)}`, bn: 'টোল প্লাজা', en: 'the toll plaza', s0: t.s - 480, s1: t.s + 480, base: 0.45, toll: true });
  route._jams = z;
  return z;
}
// 0..1 congestion of a zone now, faded in over the first/last 90 m of the zone
export function jamLevel(zone, s, hour) {
  const edge = Math.min(s - zone.s0, zone.s1 - s);
  if (edge <= 0) return 0;
  const lvl = Math.max(zone.base, rushLevel(hour));
  return lvl * Math.min(1, edge / 90);
}

export class Traffic {
  constructor(route, scene, count, playerOpId, audio, gates = []) {
    this.gates = gates;
    this.route = route;
    this.scene = scene;
    this.audio = audio;
    this.camera = null;
    this.list = [];
    this.r = rng(4242);
    const r = this.r;
    const ops = OPERATORS;
    const types = Object.keys(BUS_TYPES);
    for (let i = 0; i < count; i++) {
      let x = r(), K = KINDS[0];
      for (const k of KINDS) { if (x < k.w) { K = k; break; } x -= k.w; }
      const wrap = new THREE.Group();
      let model, len, wid, wheels, wheelR, isBus = false, glow;
      if (K.kind === 'bus') {
        const t = types[Math.floor(r() * types.length)];
        const op = ops[Math.floor(r() * ops.length)];
        const b = buildBus(t, op, { texScale: 0.5, seed: 50 + i });
        b.root.position.z = -b.spec.center;
        wrap.add(b.root);
        model = b; len = b.spec.L; wid = b.spec.W; wheels = b.wheels.all; wheelR = b.spec.wheelR; isBus = true;
        const s = b.spec, ak = s.cockpit === 'ak';
        glow = addLampGlow(wrap, { front: s.front - s.center, rear: s.rear - s.center, headX: s.lampX - 0.3, headY: s.floor + (ak ? 0.62 : 0.86), indX: s.W / 2 - 0.05, indY: s.floor + (ak ? 0.68 : 0.62) });
      } else {
        const builder = { truck: buildTruck, car: buildCar, micro: buildMicrobus, cng: buildCNG }[K.kind];
        model = builder(100 + i);
        wrap.add(model.root);
        len = model.len; wid = model.wid; wheels = model.wheels; wheelR = model.wheelR;
        glow = addLampGlow(wrap, { front: len / 2, rear: -len / 2, headX: K.kind === 'cng' ? 0 : wid / 2 - 0.25, headY: model.lampY, indX: wid / 2 - 0.1, indY: model.lampY - 0.05 });
      }
      scene.add(wrap);
      this.list.push({
        K, wrap, model, isBus, glow, len, wid, wheels, wheelR, s: 0, d: 0, targetD: 0, dir: 1, v: 0, v0: 0, acc: 0, lv: 0, cool: 0,
        honk: 5 + r() * 20, spin: 0, blinkT: r(), blinkP: 0.68 + r() * 0.16,
      });
    }
    void playerOpId;
  }

  // a new trip corridor (call init() afterwards to place the vehicles on it)
  setRoute(route, gates) {
    this.route = route;
    this.gates = gates;
    this.places = null;
    for (const v of this.list) { v.rest = null; v.restSeen = null; v.booth = null; v.plan = null; v.turn = null; v.merge = null; v.exit = null; }
  }

  // ------------------------------------------------------------ bus services (fixed routes)
  // A bus on the road runs one of the real-ish services that use this road in its direction (its own operator's
  // if it has one here); its placard shows the route. Without one it is a local bus between the nearest towns.
  _assignService(v) {
    v.svc = null;
    if (!v.isBus) return;
    const R = this.route, g = R.segAt(v.s), rev = v.dir > 0 ? g.rev : !g.rev;
    const list = this.svc?.byRoad.get(`${g.road}:${rev ? 1 : 0}`) || [];
    const mine = list.filter((x) => x.op === v.model.op?.id);
    const pool = mine.length ? mine : this.r() < 0.5 ? list : [];
    v.svc = pool.length ? pool[Math.floor(this.r() * pool.length)] : null;
    if (v.svc) { setBusRouteBoard(v.model, { bn: v.svc.bn, en: v.svc.en }); return; }
    // local: the towns behind and ahead
    const towns = R.places.filter((p) => p.term && p.node);
    const ahead = v.dir > 0 ? towns.find((p) => p.s > v.s + 300) : [...towns].reverse().find((p) => p.s < v.s - 300);
    const back = v.dir > 0 ? [...towns].reverse().find((p) => p.s < v.s - 300) : towns.find((p) => p.s > v.s + 300);
    const nm = (p, k) => p[k].split(' (')[0];
    setBusRouteBoard(v.model, ahead && back && ahead !== back ? { bn: `${nm(back, 'bn')} ⇄ ${nm(ahead, 'bn')}`, en: `${nm(back, 'en')} – ${nm(ahead, 'en')}` } : null);
  }
  // does the bus's route leave the corridor at the next junction ahead? -> { j, b, right }
  _exitPlan(v) {
    if (!v.svc) return null;
    if (v.exit) return v.exit;
    const R = this.route;
    const j = v.dir > 0 ? R.junctions.find((x) => x.s > v.s + 20 && x.s < v.s + 450) : [...R.junctions].reverse().find((x) => x.s < v.s - 20 && x.s > v.s - 450);
    if (!j || v.exitSeen === j) return null;
    v.exitSeen = j;
    const cur = R.segs[v.dir > 0 ? j.k - 1 : j.k]?.road, next = R.segs[v.dir > 0 ? j.k : j.k - 1]?.road;
    const e = v.svc.idx.get(cur);
    if (!e || e.i >= v.svc.path.length - 1) return null;
    const nx = v.svc.path[e.i + 1];
    if (nx.road === next) return null;
    const b = j.branches.find((x) => x.road === nx.road);
    if (!b || !b.pts?.length) return null;
    // which way: is the branch to the right of the driving direction?
    const [tx, tz] = R.tangentAt(j.s), hx = tx * v.dir, hz = tz * v.dir;
    const k = Math.min(6, b.pts.length - 1), dx = b.pts[k][0] - j.x, dz = b.pts[k][1] - j.z;
    v.exit = { j, b, right: dx * -hz + dz * hx > 0 };
    return v.exit;
  }
  _startTurn(v, ex) {
    if (v.rest?.slot) v.rest.slot.v = null;
    v.rest = null; v.plan = null;
    v.turn = { j: ex.j, b: ex.b, ts: 0, s0: v.s, d0: v.d, dir: v.dir, laneD: ex.b.stub.prof(40).laneCenters[0], right: ex.right };
    v.exit = null;
  }
  // a bus joining from a side road at a junction 300–1300 m ahead of the player, out of sight down the side road
  _spawnMerge(v, ps) {
    const R = this.route, r = this.r;
    const js = R.junctions.filter((j) => j.branches.length && Math.abs(j.s - ps) > 280 && Math.abs(j.s - ps) < 1300);
    if (!js.length) return false;
    const j = js[Math.floor(r() * js.length)];
    const b = j.branches[Math.floor(r() * j.branches.length)];
    if (!b.stub || b.len < 200) return false;
    if (this.list.some((o) => o.merge?.b === b)) return false;
    v.merge = { j, b, ts: Math.min(b.len - 40, 320), dir: r() < 0.5 ? 1 : -1, inD: -b.stub.prof(40).laneCenters[0] };
    v.dir = v.merge.dir;
    v.d = v.targetD = v.fromD = this.laneD(v.dir, false, j.s);
    v.s = 1e7; v.prevS = v.s;
    v.v = 7 + r() * 3; v.v0 = v.K.v[0] + r() * (v.K.v[1] - v.K.v[0]);
    v.agg = v.K.agg[0] + r() * (v.K.agg[1] - v.K.agg[0]);
    if (v.rest?.slot) v.rest.slot.v = null;
    v.rest = null; v.plan = null; v.svc = null; v.turn = null; v.exit = null; v.exitSeen = null; v.broken = false; v.shoulder = false;
    v.cool = 3; v.lv = 0; v.sig = 0; v.flashT = -1; v.tollPaid = false; v.tollWait = 0; v.yieldT = 0; v.booth = null;
    // its placard: a service on that side road heading for the highway
    const list = this.svc?.byRoad.get(`${b.road}:${b.rev ? 0 : 1}`) || [];
    const svc = list[Math.floor(r() * list.length)];
    setBusRouteBoard(v.model, svc ? { bn: svc.bn, en: svc.en } : null);
    return true;
  }
  // the side-road part of a turn or a merge: placed in world space, blending between the side road and the
  // corridor over the junction
  _sideDrive(v, dt, player, dim, crashes) {
    const R = this.route, sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const A = this._tA || (this._tA = new THREE.Vector3()), B = this._tB || (this._tB = new THREE.Vector3());
    let x, z, y, done = false;
    if (v.turn) {
      const T = v.turn;
      const vT = T.ts < 35 ? 6.5 : v.v0;
      v.v = Math.max(0, v.v + THREE.MathUtils.clamp((vT - v.v) * 0.8, -3, 1.2) * dt);
      T.ts += v.v * dt;
      const w = sm(T.ts / 48);
      R.pointAt(T.s0 + T.dir * (T.ts + 4), T.d0, A);
      T.b.stub.pointAt(T.ts, T.laneD, B);
      x = A.x + (B.x - A.x) * w; z = A.z + (B.z - A.z) * w;
      y = R.roadHeight(T.s0 + T.dir * (T.ts + 4)) * (1 - w) + T.b.stub.roadHeight(T.ts) * w;
      v.prevS = v.s;
      v.s = w < 0.5 ? T.s0 + T.dir * (T.ts + 4) : 1e7;      // still in the corridor's lanes for the first half
      v.sig = T.ts < 30 ? (T.right ? 1 : -1) : 0;
      const far = Math.hypot(x - player.phys.pos.x, z - player.phys.pos.z);
      if (T.ts > Math.min(T.b.len - 30, 520) || (T.ts > 120 && far > 700)) done = true;
    } else {
      const M = v.merge, j = M.j, gate = j.R + 14;
      // wait at the mouth of the side road for a gap in the lane it turns into
      let vT = 9;
      if (M.ts < gate + 60) {
        const lane = this.laneD(M.dir, false, j.s);
        const clear = this.list.every((o) => o === v || o.turn || o.merge || o.dir !== M.dir || Math.abs(o.d - lane) > 2.6 ||
          (j.s - o.s) * M.dir > 90 || (o.s - j.s) * M.dir > 30) &&
          !(player.box && Math.abs(player.s - j.s) < 70 && (player.side < 0) === (M.dir > 0));
        if (!clear && M.ts <= gate + 2) vT = 0;
        else if (M.ts > gate) vT = Math.min(9, 2 + (M.ts - gate) * 0.2);
        else vT = 6;
      }
      v.v = Math.max(0, v.v + THREE.MathUtils.clamp((vT - v.v) * 0.9, -4, 1.4) * dt);
      M.ts = Math.max(0, M.ts - v.v * dt);
      const w = M.ts < gate ? sm(1 - M.ts / gate) : 0;
      const cs = j.s + M.dir * (gate - Math.min(M.ts, gate)) * 0.5;
      M.b.stub.pointAt(M.ts, M.inD, A);
      R.pointAt(cs, this.laneD(M.dir, false, cs), B);
      x = A.x + (B.x - A.x) * w; z = A.z + (B.z - A.z) * w;
      y = M.b.stub.roadHeight(M.ts) * (1 - w) + R.roadHeight(cs) * w;
      v.prevS = v.s;
      v.s = w > 0.5 ? cs : 1e7;
      v.sig = M.ts < gate + 40 ? 1 : 0;
      if (M.ts <= 0) {
        // on the highway: from here it is an ordinary vehicle
        v.merge = null;
        v.s = cs; v.prevS = cs; v.dir = M.dir; v.d = v.targetD = v.fromD = this.laneD(M.dir, false, cs);
        this._assignService(v);
        v.cool = 3; v.sig = 0;
      }
      const far = Math.hypot(x - player.phys.pos.x, z - player.phys.pos.z);
      if (far > 2200) done = true;
    }
    const ox = v.wrap.position.x, oz = v.wrap.position.z;
    v.wrap.position.set(x, y, z);
    if (Math.hypot(x - ox, z - oz) > 0.01) v.wrap.rotation.y = Math.atan2(x - ox, z - oz);
    v.spin += (v.v / v.wheelR) * dt;
    for (const w of v.wheels) w.rotation.x = v.spin;
    v.blinkT += dt;
    const blinkOn = v.sig !== 0 && (v.blinkT % v.blinkP) < v.blinkP * 0.5;
    const beam = dim ? 1 : 0;
    if (v.isBus) setBusLights(v.model, { head: beam > 0, high: false, brake: v.v < 3, indL: blinkOn && v.sig < 0, indR: blinkOn && v.sig > 0, night: dim });
    else setVehicleLights(v.model, { head: beam > 0, high: false, brake: v.v < 3, indL: blinkOn && v.sig < 0, indR: blinkOn && v.sig > 0 });
    if (this.camera) {
      const fc = facingCamera(v.wrap, this.camera);
      updateLampGlow(v.glow, { beam, night: dim, indL: blinkOn && v.sig < 0, indR: blinkOn && v.sig > 0, facing: fc.facing, dist: fc.dist });
    }
    // the player can still hit it
    if (player.box && Math.hypot(x - player.box.x, z - player.box.z) < (v.len + player.len) / 2 + 3) {
      const box = { x, z, yaw: v.wrap.rotation.y, hw: v.wid / 2 - 0.04, hl: v.len / 2 - 0.06 };
      const n = obbOverlap(player.box, box);
      if (n) crashes.push({ v, n, box, side: true });
    }
    if (done) { v.turn = null; v.merge = null; this.spawn(v, player.s, false); }
  }

  // the corridor changed after fromS (the bus turned): vehicles on the old road beyond it go somewhere else
  rebase(fromS, playerS) {
    for (const v of this.list) {
      if (v.s < fromS - 30 && !v.rest) continue;
      if (v.rest?.slot) v.rest.slot.v = null;
      v.rest = null; v.restSeen = null; v.booth = null; v.plan = null;
      this.spawn(v, playerS, false);
    }
  }

  // lane centre d for a vehicle: forward lanes are negative d, oncoming positive
  // lane centre d for a vehicle at s (default: the vehicle being updated). On a 2-lane road the "fast" lane is
  // the oncoming one: overtaking means pulling out into it.
  laneD(dir, fast, s = this._cv?.s ?? 0) { const d = this.route.prof(s).laneCenters[fast ? 1 : 0]; return dir > 0 ? d : -d; }
  isFast(d, v = this._cv) {
    const P = this.route.prof(v?.s ?? 0);
    if (P.two) return v ? Math.sign(d) !== Math.sign(this.laneD(v.dir, false, v.s)) : false;
    return Math.abs(d) < P.median + P.lane;
  }
  // 2-lane road: is the oncoming lane clear far enough ahead to overtake? (closing speed × time to pass)
  oncomingClear(v, player) {
    if (!this.route.prof(v.s).two) return true;
    const need = 120 + (v.v + 22) * (6 + (1 - (v.agg ?? 0.5)) * 4);
    const lane = this.laneD(v.dir, true, v.s);
    for (const o of this.list) {
      if (o === v || o.dir === v.dir || o.turn || o.merge) continue;
      const ds = (o.s - v.s) * v.dir;
      if (ds > -10 && ds < need && Math.abs(o.d - lane) < 3) return false;
    }
    const pds = (player.s - v.s) * v.dir;
    if (player.box && pds > -10 && pds < need && Math.abs(player.d - lane) < 3.2 && (player.side < 0) !== (v.dir > 0)) return false;
    return true;
  }

  spawn(v, playerS, initial) {
    const r = this.r;
    // now and then a bus comes out of a side road (or a terminal) at a junction ahead and joins the highway
    if (!initial && v.isBus && r() < 0.3 && this._spawnMerge(v, playerS)) return;
    v.dir = r() < 0.58 ? 1 : -1;
    const fast = r() < v.K.fast;
    v.d = v.targetD = v.fromD = this.laneD(v.dir, fast);
    v.v0 = v.K.v[0] + r() * (v.K.v[1] - v.K.v[0]);
    v.v = v.v0 * (0.8 + r() * 0.2);
    v.agg = v.K.agg[0] + r() * (v.K.agg[1] - v.K.agg[0]);
    // some BD bus and truck drivers never dip their lights for anyone
    v.noDip = (v.isBus || v.K.kind === 'truck') && r() < 0.18;
    if (v.broken) { v.broken = false; this.brokenOut = false; }
    v.shoulder = false;
    // at busy hours, pack vehicles into a jam zone near the player (out of sight: far ahead / behind)
    if (this._jamSpawn(v, playerS, initial)) return this._afterSpawn(v);
    for (let tries = 0; tries < 12; tries++) {
      let s;
      if (initial) s = playerS + (r() < 0.25 ? -(80 + r() * 700) : 60 + r() * 1500);
      else if (v.dir > 0) s = r() < 0.8 ? playerS + 1150 + r() * 450 : playerS - 700 - r() * 250;
      else s = playerS + 1200 + r() * 500;
      s = THREE.MathUtils.clamp(s, 20, this.route.length - 20);
      if (Math.abs(s - playerS) < 40 || this.route.ferryAt(s)) continue;
      if (this.list.every((o) => o === v || o.dir !== v.dir || Math.abs(o.d - v.d) > 2 || Math.abs(o.s - s) > 30)) { v.s = s; break; }
      v.s = s;
    }
    // the lanes where it ended up (a 2-lane road has one each way: start in your own)
    v.d = v.targetD = v.fromD = this.laneD(v.dir, fast && !this.route.prof(v.s).two, v.s);
    this._afterSpawn(v);
  }

  _jamSpawn(v, ps, initial) {
    const r = this.r, hour = roadState.hour;
    for (const z of jamZones(this.route)) {
      const mid = (z.s0 + z.s1) / 2, lvl = Math.max(z.base, rushLevel(hour));
      if (lvl < 0.3 || z.s1 < ps - 1100 || z.s0 > ps + 1750) continue;
      if (r() > 0.6 * lvl) continue;
      // where in the zone we may pop a vehicle in without the player seeing it
      const ranges = initial ? [[z.s0, z.s1]] : [[Math.max(z.s0, ps + 900), Math.min(z.s1, ps + 1750)], [Math.max(z.s0, ps - 1050), Math.min(z.s1, ps - 650)]];
      const ok = ranges.filter(([a, b]) => b - a > 20);
      if (!ok.length) continue;
      const [a, b] = ok[Math.floor(r() * ok.length)];
      for (let tries = 0; tries < 8; tries++) {
        const s = a + r() * (b - a);
        if (initial && Math.abs(s - ps) < 30) continue;
        if (!this.list.every((o) => o === v || o.dir !== v.dir || Math.abs(o.d - v.d) > 2 || Math.abs(o.s - s) > (o.len + v.len) / 2 + 5)) continue;
        v.s = s;
        v.v = 1 + r() * 4;
        // the odd truck has broken down in the slow lane, half on the shoulder, hazards blinking
        if (v.K.kind === 'truck' && !this.brokenOut && !z.toll && r() < 0.35 && Math.abs(s - mid) < (z.s1 - z.s0) * 0.3) {
          v.broken = true; this.brokenOut = true;
          const P = this.route.prof(s);
          v.d = v.targetD = v.fromD = Math.sign(this.laneD(v.dir, false, s)) * (P.edge - P.lane / 2 + 1.1);
          v.v = 0;
        }
        void mid;
        return true;
      }
    }
    return false;
  }

  _afterSpawn(v) {
    const r = this.r;
    v.turn = null; v.merge = null; v.exit = null; v.exitSeen = null;
    this._assignService(v);
    v.cool = 2 + r() * 3;
    v.lv = 0;
    v.plan = null;        // pending lane change: { to, t, sig } — indicator on, waiting for a gap
    v.sig = 0;            // indicator: -1 left, +1 right (relative to the vehicle)
    v.keepT = 0;          // time the left lane has been clear while sitting in the fast lane
    v.flashT = -1; v.flashCool = 0; v.stuckT = 0;
    v.tollPaid = false; v.tollWait = 0; v.yieldT = 0; v.booth = null;
    if (v.rest) { v.rest.slot.v = null; v.rest = null; }   // a recycled bus gives its rest-stop bay back
    v.restSeen = null;
    v.prevS = v.s;   // so a respawn never counts as passing a camera
  }

  init(playerS) { for (const v of this.list) this.spawn(v, playerS, true); }

  // nearest vehicle ahead and behind v in lane d (AI or player). Gaps are bumper to bumper.
  gaps(v, d, player) {
    const g = { ahead: 1e9, aheadV: 0, aheadP: false, aheadO: null, behind: 1e9, behindV: 0 };
    const look = (s, len, sp, isP, o = null) => {
      const ds = (s - v.s) * v.dir, gap = Math.abs(ds) - (v.len + len) / 2;
      if (ds > 0) { if (gap < g.ahead) { g.ahead = gap; g.aheadV = sp; g.aheadP = isP; g.aheadO = o; } }
      else if (gap < g.behind) { g.behind = gap; g.behindV = sp; }
    };
    const two = this.route.prof(v.s).two;
    for (const o of this.list) {
      if (o === v || o.turn || o.merge) continue;
      if (o.dir !== v.dir) {
        // 2-lane road: something coming the other way in this lane is a (very fast closing) obstacle
        if (two && Math.abs(o.d - d) < 2.4 && (o.s - v.s) * v.dir > 0) look(o.s, o.len, -o.v, false, o);
        continue;
      }
      if (Math.abs(o.d - d) < 2.4 || Math.abs(o.targetD - d) < 1.0) look(o.s, o.len, o.v, false, o);
    }
    if (player.box && Math.abs(player.d - d) < 2.6) look(player.s, player.len, (player.vs ?? player.v) * v.dir, true);
    return g;
  }

  // is there room to move into lane d now? (time gaps grow with the speed difference)
  roomIn(v, d, player, slack = 1) {
    const g = this.gaps(v, d, player);
    const front = (8 + Math.max(0, v.v - g.aheadV) * 2.2) * slack;
    const rear = (9 + Math.max(0, g.behindV - v.v) * 3.2 + (g.behindV > 3 ? 4 : 0)) * slack;
    return g.ahead > front && g.behind > rear;
  }

  // switch the indicator on and wait for a gap (sig = how long to signal before moving)
  plan(v, to, sig) {
    v.plan = { to, t: 0, sig, wait: 0 };
    v.sig = (to - v.d) * v.dir > 0 ? 1 : -1;
  }

  flash(v) {
    if (v.flashCool > 0) return;
    v.flashT = 0;
    v.flashCool = 5 + (1 - v.agg) * 8 + this.r() * 4;
  }

  update(dt, player, night, dim = night) {
    const route = this.route;
    const ps = player.s, pd = player.d;
    const crashes = [];
    this.t = (this.t || 0) + dt;
    for (const v of this.list) {
      this._cv = v;
      // turning off into a side road / coming in from one: driven along the side road, not the corridor
      if (v.turn || v.merge) { this._sideDrive(v, dt, player, dim, crashes); continue; }
      // recycle
      const rel = (v.s - ps);
      if (rel > 1800 || rel < -1100 || v.s <= 5 || v.s >= route.length - 5) this.spawn(v, ps, false);
      if (v.merge) continue;

      // leader: in our lane, or in the lane we are moving into
      const own = this.gaps(v, v.d, player);
      let gap = own.ahead, lv = own.aheadV;
      if (Math.abs(v.targetD - v.d) > 0.6) {
        const tg = this.gaps(v, v.targetD, player);
        if (tg.ahead < gap) { gap = tg.ahead; lv = tg.aheadV; }
      }

      // ferry ghat ahead: the road ends at the pontoon, so vehicles queue up there for the ferry
      for (const f of route.ferries) {
        const end = (v.dir > 0 ? f.s0 + 30 : f.s1 - 30), toEnd = (end - v.s) * v.dir;
        if (toEnd > -5 && toEnd < 220) { const fg = toEnd - v.len / 2; if (fg < gap) { gap = Math.max(0.1, fg); lv = 0; } }
      }
      // toll plaza: stop at the barrier, pay, then go
      const T = route.tollNear(v.s);
      const tollDist = T ? (T.s - v.s) * v.dir : -1e9;
      if (!v.tollPaid && tollDist > -TOLL.gateOff && tollDist < 160) {
        const gateGap = tollDist + TOLL.gateOff - v.len / 2 - 1.5;
        if (gateGap < gap) { gap = Math.max(0.1, gateGap); lv = 0; }
        if (gateGap < 7.5 && v.v < 0.7) {
          v.tollWait += dt;
          if (v.tollWait > 1.6) {
            v.tollPaid = true;
            const gt = this.nearestGate(v);
            if (gt) gt.openT = 3.5;
          }
        }
      }
      if (tollDist < -30) v.tollPaid = false;
      // pick a booth as the road starts to fan out; after the islands, merge back into the lanes
      if (v.booth === null && tollDist > 25 && tollDist < PLAZA.reach + 60) v.booth = this.pickBooth(v);
      if (v.booth !== null && tollDist < -(PLAZA.islandLen / 2 + v.len / 2)) v.booth = null;
      const nearToll = route.tollDist(v.s) < TOLL_NO_CHANGE;
      // the odd bus pulls into a rest-stop lot, parks in a bay for a while, then pulls out again
      const rest = this._restPlan(v, player);
      const resting = !!rest && rest.phase !== 'approach';

      // let the player in when they signal into our lane
      v.yieldT = Math.max(0, v.yieldT - dt);
      if (v.dir > 0 && (player.indL || player.indR) && player.side < 0) {
        const tgt = this.laneD(1, player.indR, player.s);
        const behind = player.s - v.s;
        if (Math.abs(v.d - tgt) < 1.8 && behind > 0 && behind < 70) v.yieldT = 3;
      }
      const inFast = this.isFast(v.targetD);
      const overtaking = inFast && Math.abs(v.targetD - v.d) < 1;
      // pushy drivers wind it up a little while passing
      let v0 = v.v0 + (overtaking ? v.agg * 1.5 : 0);
      if (v.yieldT > 0) v0 = Math.min(v0, Math.max(4, (player.vs ?? player.v) * 0.85));
      // junctions (চৌরাস্তা) are crossed carefully: everyone slows to ~35 km/h across the pad
      for (const j of route.junctions) {
        const to = (j.s - v.s) * v.dir;
        if (to > -j.R - 10 && to < j.R + 90) { v0 = Math.min(v0, 9.5 + Math.max(0, to - j.R) * 0.12); break; }
      }
      // a bus whose route leaves ours at the next junction: get in lane, signal, slow down and turn off
      const ex = this._exitPlan(v);
      if (ex) {
        const to = (ex.j.s - v.s) * v.dir;
        if (to < 170) v0 = Math.min(v0, 5.5 + Math.max(0, to - 10) * 0.07);
        const lane = this.laneD(v.dir, ex.right);
        if (to < 260 && !v.plan && Math.abs(v.targetD - lane) > 0.5 && !v.rest) this.plan(v, lane, 0.8);
        if (to < 12) { this._startTurn(v, ex); continue; }
      }
      if (rest?.phase === 'approach') {
        const slowD = this.laneD(v.dir, false), toLot = rest.ahead;
        v0 = Math.min(v0, 7 + Math.max(0, toLot) * 0.06);          // slow down for the turn in
        if (this.isFast(v.targetD) && !v.plan) this.plan(v, slowD, 1.2);
        if (toLot <= 0) {
          if (Math.abs(v.d - slowD) < 0.6) this._restEnter(v);
          else { rest.slot.v = null; v.rest = null; }                // never got into the slow lane: skip it
        }
      }

      // police checkpoint: the fast lane is coned off — merge left before it, crawl past the police
      let closed = null;
      for (const c of roadState.closures) {
        if (c.dir !== v.dir) continue;
        const toStart = (c.s0 - v.s) * v.dir, toEnd = (c.s1 - v.s) * v.dir;
        if (toStart < 220 && toEnd > 0) { closed = c; break; }
      }
      if (closed) {
        const toCone = (closed.sc - v.s) * v.dir;
        if (toCone < 120 && toCone > -60) v0 = Math.min(v0, 9 + v.agg * 2);        // ~35 km/h past the officers
        if (this.isFast(v.d) || this.isFast(v.targetD)) {
          const slowD = this.laneD(v.dir, false);
          if (!v.plan || v.plan.to !== slowD) { if (Math.abs(v.targetD - slowD) > 0.5) this.plan(v, slowD, 0.7); }
          if (this.isFast(v.d)) {
            const coneGap = toCone - v.len / 2 - 2;     // still in the closed lane: stop before the cones
            if (coneGap < gap) { gap = Math.max(0.1, coneGap); lv = 0; }
          }
        }
      }

      // jams: stop-and-go waves running back through the queue at walking pace
      let jam = 0;
      for (const z of jamZones(route)) {
        if (v.s <= z.s0 || v.s >= z.s1) continue;
        jam = jamLevel(z, v.s, roadState.hour);
        if (z.toll && route.tollDist(v.s) < PLAZA.reach + 20) jam = Math.min(jam, 0.3);   // the booths do their own queueing
        break;
      }
      if (jam > 0.05) {
        const wave = 0.5 + 0.5 * Math.sin(this.t * 0.14 + v.s * 0.028 * v.dir);
        v0 = Math.min(v0, Math.max(0.8, THREE.MathUtils.lerp(v0, 1.2 + 8 * wave, jam)));
      }
      // CNG autos thread through the queue on the shoulder, without bothering to signal
      if (v.K.kind === 'cng') {
        const shD = Math.sign(this.laneD(v.dir, false)) * (route.halfAt(v.s) - v.wid / 2 - 0.95);
        if (jam > 0.3 && !v.shoulder && gap < 18 && v.v < 5 && v.cool <= 0 && this.roomIn(v, shD, player, 0.5)) {
          v.shoulder = true; v.fromD = v.targetD; v.targetD = shD; v.cool = 3;
        } else if (v.shoulder && (jam < 0.15 || (gap < 6 && v.v < 0.5 && v.cool <= 0))) {
          const slowD = this.laneD(v.dir, false);
          if (this.roomIn(v, slowD, player, 0.5)) { v.shoulder = false; v.fromD = v.targetD; v.targetD = slowD; v.cool = 4; }
        }
        if (v.shoulder) v0 = Math.max(v0, 6);
      }
      if (v.broken) { v0 = 0; v.v = 0; }

      // IDM car following
      const a = v.K.a, b = 3;
      const sStar = 5 + v.v * 1.3 + (v.v * (v.v - lv)) / (2 * Math.sqrt(a * b));
      let acc;
      if (v.rest && v.rest.phase !== 'approach') acc = this._restDrive(v, dt, player);
      else {
        acc = a * (1 - (v.v / v0) ** 4) - (gap < 1e8 ? a * (Math.max(0, sStar) / Math.max(0.5, gap)) ** 2 : 0);
        acc = THREE.MathUtils.clamp(acc, -9, a);
        v.v = v.broken ? 0 : Math.max(0, v.v + acc * dt);
      }
      v.acc = acc;

      // ---- lane decisions ----
      v.cool -= dt;
      v.flashCool -= dt;
      const changing = Math.abs(v.targetD - v.d) > 0.35;
      const slowAhead = gap < 45 + v.v * 1.4 && lv < v.v0 - 1.5;
      if (resting) v.plan = null;
      else if (v.plan) {
        // indicator is on: move over once we have signalled long enough and the gap is there
        const p = v.plan;
        p.t += dt;
        if (nearToll) { v.plan = null; v.sig = 0; }
        else if (p.t >= p.sig && this.roomIn(v, p.to, player)) {
          v.fromD = v.targetD; v.targetD = p.to; v.plan = null;
          v.cool = 3 + this.r() * 3;
        } else if (p.t > p.sig + 7) { v.plan = null; v.sig = 0; v.cool = 2; }   // never got a gap: give up
      } else if (!changing && v.cool <= 0 && !nearToll && !v.broken && !v.shoulder && !closed && !rest) {
        const fastD = this.laneD(v.dir, true), slowD = this.laneD(v.dir, false);
        if (!inFast) {
          // stuck behind something slower: signal right and pull out to overtake
          // (even a CNG or a truck pulls out when it is stuck behind something that has stopped dead)
          if (slowAhead && (v.K.fast > 0 || (own.aheadO?.broken && gap < 25)) && this.roomIn(v, fastD, player, 1.2) && this.oncomingClear(v, player)) {
            this.plan(v, fastD, 2.3 - v.agg * 1.4);
            if ((v.agg > 0.55 || dim) && gap < 40) this.flash(v);    // "I'm coming past"
          }
        } else {
          // keep left: go back once the slow lane is clear for a good stretch ahead
          const sl = this.gaps(v, slowD, player);
          const clear = sl.behind > 12 + Math.max(0, sl.behindV - v.v) * 3 &&
            (sl.ahead > 40 + v.v * 1.6 || (sl.ahead > 25 && sl.aheadV >= v.v - 0.5));
          v.keepT = clear ? v.keepT + dt : 0;
          // someone faster sitting on our tail: get out of the way sooner
          const pushed = own.behind < 25 && own.behindV > v.v + 1;
          // (on a 2-lane road the "fast" lane is the oncoming one: get back in as soon as there is room)
          const linger = this.route.prof(v.s).two ? 0.2 : pushed ? 0.6 : 1.2 + v.agg * 5 + (v.isBus ? 1.5 : 0);
          if (v.keepT > linger) { this.plan(v, slowD, 1.6 - v.agg * 0.8); v.keepT = 0; }
        }
      }
      // 2-lane road, out in the oncoming lane and something is coming: abort and duck back in now
      if (inFast && this.route.prof(v.s).two) {
        const lane = v.targetD;
        const danger = this.list.some((o) => o !== v && o.dir !== v.dir && !o.turn && !o.merge && Math.abs(o.d - lane) < 3 &&
          (o.s - v.s) * v.dir > 0 && (o.s - v.s) * v.dir < (v.v + o.v) * 3.5 + 25) ||
          (player.box && (player.s - v.s) * v.dir > 0 && (player.s - v.s) * v.dir < (v.v + Math.abs(player.v)) * 3.5 + 25 &&
            Math.abs(player.d - lane) < 3 && (player.side < 0) !== (v.dir > 0));
        if (danger) { v.plan = null; v.fromD = v.targetD; v.targetD = this.laneD(v.dir, false); v.cool = 2.5; if (v.v > 12) this.flash(v); }
      }
      // in the fast lane behind a slowcoach (often the player): flash the high beam and lean on the horn
      if (inFast && !changing && gap < 32 && lv < v.v0 - 2.5 && v.v > 6) {
        v.stuckT += dt;
        if (v.stuckT > 2.5 - v.agg * 1.5) {
          this.flash(v);
          if (own.aheadP && v.flashT === 0 && Math.hypot(v.s - ps, v.d - pd) < 120) this.audio?.honk(v.K.kind, Math.hypot(v.s - ps, v.d - pd));
          v.stuckT = 0;
        }
      } else v.stuckT = 0;

      // abort the lane change if the player's bus is already there (seen in the mirror)
      if (changing && v.fromD !== undefined && player.box && Math.abs(player.d - v.targetD) < 2.7 &&
          Math.abs(player.s - v.s) < (v.len + player.len) / 2 + 6 && Math.abs(v.d - v.fromD) < 2) {
        v.targetD = v.fromD; v.cool = 3;
      }
      // indicator: on while waiting for the gap and during the move, off once settled in the lane
      if (v.exit && (v.exit.j.s - v.s) * v.dir < 170 && !v.plan) v.sig = v.exit.right ? 1 : -1;
      else if (rest?.phase === 'approach' && rest.ahead < 90 && !v.plan) v.sig = Math.sign((rest.slot.d - v.d) * v.dir);
      else if (!v.plan && !v.rest) {
        const dd = (v.targetD - v.d) * v.dir;
        v.sig = Math.abs(dd) > 0.3 ? Math.sign(dd) : 0;
      }

      // ---- sideways motion: eases in and out like a real lane change ----
      if (!v.rest || v.rest.phase === 'approach') {     // (in the rest-stop lot _restDrive steers instead)
      let tD = v.booth !== null ? -v.dir * PLAZA.laneC(v.booth) : v.targetD;
      // never steer off the apron while it narrows again
      const room = route.halfAt(v.s + v.dir * 10) - v.wid / 2 - 0.9;
      tD = THREE.MathUtils.clamp(tD, -room, room);
      // slow manoeuvring across the wide apron: allow a sharper sideways move
      const latMax = v.K.lat * (route.plazaW(v.s) > 0 ? 1.8 : 1);
      const want = THREE.MathUtils.clamp((tD - v.d) * 0.9, -latMax, latMax);
      const latAcc = (route.plazaW(v.s) > 0 ? 1.2 : 0.7) * dt;
      v.lv += THREE.MathUtils.clamp(want - v.lv, -latAcc, latAcc);
      if (Math.abs(tD - v.d) < 0.02 && Math.abs(v.lv) < 0.05) { v.d = tD; v.lv = 0; }
      v.d += v.lv * dt;
      const edge = route.halfAt(v.s) - v.wid / 2 - 0.3;      // the apron narrows after the booths: stay on it
      if (Math.abs(v.d) > edge) { v.d = Math.sign(v.d) * edge; v.lv = 0; }
      }
      v.prevS = v.s;
      v.s += v.v * v.dir * dt;

      // place the model
      route.pointAt(v.s, v.d, v.wrap.position);
      v.wrap.position.y = route.roadHeight(v.s);
      v.wrap.rotation.y = route.yawAt(v.s) + (v.dir < 0 ? Math.PI : 0) - Math.atan2(v.lv, Math.max(v.v, 2)) * v.dir * 0.8;
      v.spin += (v.v / v.wheelR) * dt;
      for (const w of v.wheels) w.rotation.x = v.spin;

      // ---- lights ----
      const braking = acc < -1.2;
      v.blinkT += dt;
      const hazard = v.broken;
      const blinkOn = (v.sig !== 0 || hazard) && (v.blinkT % v.blinkP) < v.blinkP * 0.5;
      if (v.sig === 0 && !hazard) v.blinkT = v.blinkP * 0.02;   // next signal starts with a flash, like a real relay
      const indL = blinkOn && (v.sig < 0 || hazard), indR = blinkOn && (v.sig > 0 || hazard);
      let beam = dim ? 1 : 0;
      if (dim && (v.noDip || this.roadClear(v, player))) beam = 2;
      if (v.flashT >= 0) {
        v.flashT += dt;
        const t = v.flashT;
        if (t < FLASH[0] || (t > FLASH[1] && t < FLASH[2])) beam = 2;
        else if (!dim) beam = 0;
        if (t >= FLASH[2]) v.flashT = -1;
      }
      if (v.isBus) setBusLights(v.model, { head: beam > 0, high: beam === 2, brake: braking, indL, indR, night: dim });
      else setVehicleLights(v.model, { head: beam > 0, high: beam === 2, brake: braking, indL, indR });
      if (this.camera) {
        const fc = facingCamera(v.wrap, this.camera);
        updateLampGlow(v.glow, { beam, night: dim, indL, indR, facing: fc.facing, dist: fc.dist });
      }

      // honking (it's Bangladesh)
      v.honk -= dt;
      const dist = Math.hypot(v.s - ps, v.d - pd);
      if (v.honk <= 0) {
        if (dist < 160) this.audio?.honk(v.K.kind, dist);
        v.honk = (v.K.kind === 'bus' || v.K.kind === 'truck' ? 6 : 14) + this.r() * 18;
        if (gap < 30 && lv < v.v - 1) v.honk *= 0.3;
      }

      // collision with the player: exact oriented boxes (no more phantom hits while overtaking)
      if (player.box && Math.abs(v.s - ps) < (v.len + player.len) / 2 + 3) {
        const box = { x: v.wrap.position.x, z: v.wrap.position.z, yaw: v.wrap.rotation.y, hw: v.wid / 2 - 0.04, hl: v.len / 2 - 0.06 };
        const n = obbOverlap(player.box, box);
        if (n) crashes.push({ v, n, box });
      }
    }
    return crashes;
  }

  // ------------------------------------------------------------ rest stops & fuel stations
  // A few buses pull into a rest-stop lot and park in a bay for a while; a few buses and trucks pull in at a
  // fuel station and stand at a pump. Then they pull out into the slow lane again.
  // Rest-stop bays: the middle four of the painted 15 m bays (room to pull in and out).
  // Fuel station: the two lanes between the pump islands and canopy pillars, one vehicle at each.
  _slots(r) {
    if (!r.slots) {
      r.slots = r.kind === 'fuel'
        ? [12.5, 17.5].map((o) => ({ s: r.sc, d: r.side * (r.dIn + o), v: null }))
        : r.kind === 'counter' ? [{ s: r.sc, d: r.side * (this.route.prof(r.sc).edge + 1.25), v: null }]
          : [-22.5, -7.5, 7.5, 22.5].map((o) => ({ s: r.sc + o, d: r.side * (r.dIn + 18.25), v: null }));
    }
    return r.slots;
  }
  _stopPlaces() {
    if (!this.places) {
      for (const r of this.route.rests) r.kind = 'rest';
      for (const st of this.route.stations) st.kind = 'fuel';
      // bus counters: buses on a service that calls at that town pull onto the shoulder lay-by
      const counters = (this.counters || []).map((c) => ({ kind: 'counter', c, zilla: c.place?.zilla, sc: c.s, s0: c.s - 22, s1: c.s + 22, side: c.side }));
      this.places = [...this.route.rests, ...this.route.stations, ...counters];
    }
    return this.places;
  }
  // decide (once per place) whether this vehicle stops there; returns its stop state or null
  _restPlan(v, player) {
    if (v.rest) {
      if (v.rest.phase === 'approach') v.rest.ahead = ((v.dir > 0 ? v.rest.r.s0 : v.rest.r.s1) - v.s) * v.dir;
      return v.rest;
    }
    if (v.broken || !(v.isBus || v.K.kind === 'truck')) return null;
    const side = Math.sign(this.laneD(v.dir, false));
    for (const r of this._stopPlaces()) {
      if (r.side !== side || v.restSeen === r) continue;
      const ahead = ((v.dir > 0 ? r.s0 : r.s1) - v.s) * v.dir;
      if (ahead < 140 || ahead > 450) continue;
      v.restSeen = r;
      const chance = r.kind === 'counter' ? (!v.svc ? 0 : v.svc.stops.has(r.zilla) ? 0.85 : r.c.role === 'pickup' ? 0.5 : 0)
        : r.kind === 'rest' ? (v.isBus ? 0.45 : 0) : (v.isBus ? 0.25 : 0.3);
      if (this.r() > chance) continue;                // most drive on by
      // a free bay / pump the player is not standing in
      const free = this._slots(r).filter((sl) => !sl.v && !(Math.abs(player.s - sl.s) < 16 && Math.sign(player.d) === r.side && Math.abs(Math.abs(player.d) - Math.abs(sl.d)) < 4));
      if (!free.length) continue;
      const slot = free[Math.floor(this.r() * free.length)];
      slot.v = v;
      v.rest = { r, slot, phase: 'approach', ahead };
      return v.rest;
    }
    return null;
  }
  _restEnter(v) {
    const R = v.rest, fuel = R.r.kind === 'fuel';
    // at a fuel station finish the sideways move before the canopy pillars
    Object.assign(R, { phase: 'enter', s0: v.s, d0: v.d, d1: R.slot.d, s1: R.slot.s, uA: 0, uB: fuel ? 0.66 : 1 });
    v.plan = null;
    v.targetD = v.fromD = R.slot.d;     // so traffic in the slow lane stops treating it as being in their lane
  }
  // drive along a smooth S from (s0, d0) to (s1, d1); returns the acceleration (for the brake lights)
  _restDrive(v, dt, player) {
    const R = v.rest, smooth = (x) => x * x * (3 - 2 * x);
    if (R.phase === 'park') {
      v.v = 0; v.lv = 0; v.sig = 0;
      R.t -= dt;
      if (R.t <= 0) {
        const slowD = this.laneD(v.dir, false);
        // pull out only with room in the slow lane at the exit
        const exitS = (v.dir > 0 ? R.r.s1 : R.r.s0);
        const probe = { ...v, s: exitS - v.dir * 10, d: slowD };
        if (this.roomIn(probe, slowD, player, 1.6)) {
          // at a fuel station drive straight on past the pillars before steering back to the road
          Object.assign(R, { phase: 'leave', s0: v.s, d0: v.d, s1: exitS + v.dir * 8, d1: slowD, uA: R.r.kind === 'fuel' ? 0.3 : 0, uB: 1 });
        } else R.t = 1.5;
      }
      return 0;
    }
    const len = Math.abs(R.s1 - R.s0), left = (R.s1 - v.s) * v.dir;
    // speed: ease up to ~7 m/s, brake gently to a stop at the bay; pull out at ~4 m/s and speed up towards the road
    const vT = R.phase === 'enter' ? Math.min(7.5, Math.sqrt(2 * 1.1 * Math.max(0, left)) + 0.3) : 4 + 6 * Math.min(1, 1 - left / len);
    const acc = THREE.MathUtils.clamp((vT - v.v) * 1.5, -3, 1.4);
    v.v = Math.max(0, v.v + acc * dt);
    const dOld = v.d;
    const u = THREE.MathUtils.clamp(((1 - left / len) - R.uA) / (R.uB - R.uA), 0, 1);
    v.d = R.d0 + (R.d1 - R.d0) * smooth(u);
    v.lv = (v.d - dOld) / Math.max(dt, 1e-3);
    v.sig = Math.abs(R.d1 - v.d) > 0.4 ? Math.sign((R.d1 - v.d) * v.dir) : 0;
    if (left <= 0.25) {
      if (R.phase === 'enter') {
        v.v = 0; v.lv = 0; R.phase = 'park';
        // fill up 15–35 s · meal break 35–80 s · passengers on and off at a counter 6–14 s
        R.t = R.r.kind === 'fuel' ? 15 + this.r() * 20 : R.r.kind === 'counter' ? 6 + this.r() * 8 : 35 + this.r() * 45;
      } else {
        // back on the highway
        R.slot.v = null; v.rest = null;
        v.d = v.targetD = v.fromD = R.d1; v.lv = 0; v.sig = 0; v.cool = 3;
      }
    }
    return acc;
  }

  // high beam is fine: nothing coming the other way within ~250 m and nobody close ahead
  roadClear(v, player) {
    for (const o of this.list) {
      if (o === v) continue;
      const ds = (o.s - v.s) * v.dir;
      if (o.dir !== v.dir ? ds > 0 && ds < 260 : ds > 0 && ds < 110) return false;
    }
    const pds = (player.s - v.s) * v.dir;
    const pSame = (player.side < 0) === (v.dir > 0);
    if (player.box && (pSame ? pds > 0 && pds < 110 : pds > 0 && pds < 260)) return false;
    return true;
  }

  // the booth with the shortest queue, not too far across from where we are
  pickBooth(v) {
    const n = PLAZA.booths, q = new Array(n).fill(0);
    for (const o of this.list) if (o !== v && o.dir === v.dir && o.booth !== null && !o.tollPaid) q[o.booth]++;
    const slowKind = v.K.kind === 'truck' || v.K.kind === 'cng';
    let best = 0, bc = 1e9;
    for (let i = 0; i < n; i++) {
      const cross = Math.abs(PLAZA.laneC(i) - Math.abs(v.d));
      const c = q[i] * 16 + cross * 0.7 + (slowKind ? (n - 1 - i) * 2 : 0) + this.r() * 4;
      if (c < bc) { bc = c; best = i; }
    }
    return best;
  }

  nearestGate(v) {
    let best = null, bd = 1e9;
    for (const g of this.gates) {
      if (g.dir !== v.dir) continue;
      const dd = Math.abs(g.d - v.d);
      if (dd < bd) { bd = dd; best = g; }
    }
    return best;
  }

  // AI ahead of the player that is very close: used for the "horn makes them move" BD behaviour.
  // They put the indicator on and move over as soon as there is room.
  nudge(player) {
    for (const v of this.list) {
      if (v.dir !== 1 || v.plan) continue;
      const rel = v.s - player.s;
      if (rel > 0 && rel < 50 && Math.abs(v.d - player.d) < 2.5) {
        const other = this.laneD(1, !this.isFast(v.targetD));
        if (this.roomIn(v, other, { s: -1e9, d: 1e9 }, 0.8)) { this.plan(v, other, 0.6); v.cool = 5; }
      }
    }
  }
}
