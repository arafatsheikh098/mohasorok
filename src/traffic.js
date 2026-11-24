import * as THREE from 'three';
import { ROAD } from './config.js';
import { buildBus, BUS_TYPES, setBusLights } from './busModel.js';
import { buildTruck, buildCar, buildMicrobus, buildCNG, setVehicleLights } from './trafficModels.js';
import { OPERATORS } from './operators.js';
import { rng } from './textures.js';
import { TOLL } from './world/facilities.js';
import { obbOverlap } from './collide.js';

const LANES = { fwd: [-(ROAD.median + ROAD.lane * 1.5), -(ROAD.median + ROAD.lane * 0.5)] }; // [slow, fast]
const KINDS = [
  { kind: 'bus', w: 0.34, v: [21, 26], fast: 0.75, a: 1.0 },
  { kind: 'truck', w: 0.24, v: [12.5, 16.5], fast: 0.1, a: 0.6 },
  { kind: 'cng', w: 0.14, v: [9.5, 12], fast: 0.0, a: 1.2 },
  { kind: 'car', w: 0.18, v: [20, 26], fast: 0.65, a: 1.8 },
  { kind: 'micro', w: 0.10, v: [19, 23], fast: 0.5, a: 1.5 },
];

export class Traffic {
  constructor(route, scene, count, playerOpId, audio, gates = []) {
    this.gates = gates;
    this.route = route;
    this.scene = scene;
    this.audio = audio;
    this.list = [];
    this.r = rng(4242);
    const r = this.r;
    const ops = OPERATORS;
    const types = Object.keys(BUS_TYPES);
    for (let i = 0; i < count; i++) {
      let x = r(), K = KINDS[0];
      for (const k of KINDS) { if (x < k.w) { K = k; break; } x -= k.w; }
      const wrap = new THREE.Group();
      let model, len, wid, wheels, wheelR, isBus = false;
      if (K.kind === 'bus') {
        const t = types[Math.floor(r() * types.length)];
        const op = ops[Math.floor(r() * ops.length)];
        const b = buildBus(t, op, { texScale: 0.5, seed: 50 + i });
        b.root.position.z = -b.spec.center;
        wrap.add(b.root);
        model = b; len = b.spec.L; wid = b.spec.W; wheels = b.wheels.all; wheelR = b.spec.wheelR; isBus = true;
      } else {
        const builder = { truck: buildTruck, car: buildCar, micro: buildMicrobus, cng: buildCNG }[K.kind];
        model = builder(100 + i);
        wrap.add(model.root);
        len = model.len; wid = model.wid; wheels = model.wheels; wheelR = model.wheelR;
      }
      scene.add(wrap);
      this.list.push({ K, wrap, model, isBus, len, wid, wheels, wheelR, s: 0, d: 0, targetD: 0, dir: 1, v: 0, v0: 0, acc: 0, cool: 0, honk: 5 + r() * 20, spin: 0 });
    }
    void playerOpId;
  }

  // lane centre d for a vehicle: forward lanes are negative d, oncoming positive
  laneD(dir, fast) { const d = LANES.fwd[fast ? 1 : 0]; return dir > 0 ? d : -d; }

  spawn(v, playerS, initial) {
    const r = this.r;
    v.dir = r() < 0.58 ? 1 : -1;
    const fast = r() < v.K.fast;
    v.d = v.targetD = this.laneD(v.dir, fast);
    v.v0 = v.K.v[0] + r() * (v.K.v[1] - v.K.v[0]);
    v.v = v.v0 * (0.8 + r() * 0.2);
    for (let tries = 0; tries < 12; tries++) {
      let s;
      if (initial) s = playerS + (r() < 0.25 ? -(80 + r() * 700) : 60 + r() * 1500);
      else if (v.dir > 0) s = r() < 0.8 ? playerS + 1150 + r() * 450 : playerS - 700 - r() * 250;
      else s = playerS + 1200 + r() * 500;
      s = THREE.MathUtils.clamp(s, 20, this.route.length - 20);
      if (Math.abs(s - playerS) < 40) continue;
      if (this.list.every((o) => o === v || o.dir !== v.dir || Math.abs(o.d - v.d) > 2 || Math.abs(o.s - s) > 30)) { v.s = s; break; }
      v.s = s;
    }
    v.cool = 2;
    v.tollPaid = false; v.tollWait = 0; v.yieldT = 0;
    v.prevS = v.s;   // so a respawn never counts as passing a camera
  }

  init(playerS) { for (const v of this.list) this.spawn(v, playerS, true); }

  update(dt, player, night) {
    const route = this.route;
    const ps = player.s, pd = player.d;
    const crashes = [];
    for (const v of this.list) {
      // recycle
      const rel = (v.s - ps);
      if (rel > 1800 || rel < -1100 || v.s <= 5 || v.s >= route.length - 5) this.spawn(v, ps, false);

      // find leader in lane (other AI or the player)
      let gap = 1e9, lv = 0;
      const ahead = (o, olen, ospeed) => {
        const ds = (o - v.s) * v.dir;
        if (ds <= 0) return;
        const g = ds - (v.len + olen) / 2;
        if (g < gap) { gap = g; lv = ospeed; }
      };
      for (const o of this.list) {
        if (o === v || o.dir !== v.dir) continue;
        if (Math.abs(o.d - v.d) < 2.6 || Math.abs(o.targetD - v.d) < 1.0) ahead(o.s, o.len, o.v);
      }
      if (Math.abs(pd - v.d) < 2.7) ahead(ps, player.len, (player.vs ?? player.v) * v.dir);

      // toll plaza: stop at the barrier, pay, then go
      const tollDist = (route.tollS - v.s) * v.dir;
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
      // let the player in when they signal into our lane
      v.yieldT = Math.max(0, v.yieldT - dt);
      if (v.dir > 0 && (player.indL || player.indR) && player.side < 0) {
        const tgt = this.laneD(1, player.indR);
        const behind = player.s - v.s;
        if (Math.abs(v.d - tgt) < 1.8 && behind > 0 && behind < 70) v.yieldT = 3;
      }
      const v0 = v.yieldT > 0 ? Math.min(v.v0, Math.max(4, (player.vs ?? player.v) * 0.85)) : v.v0;

      // IDM car following
      const a = v.K.a, b = 3;
      const sStar = 5 + v.v * 1.3 + (v.v * (v.v - lv)) / (2 * Math.sqrt(a * b));
      let acc = a * (1 - (v.v / v0) ** 4) - (gap < 1e8 ? a * (Math.max(0, sStar) / Math.max(0.5, gap)) ** 2 : 0);
      acc = THREE.MathUtils.clamp(acc, -9, a);
      v.v = Math.max(0, v.v + acc * dt);
      v.acc = acc;

      // lane changes
      v.cool -= dt;
      const inFast = Math.abs(v.targetD) < ROAD.median + ROAD.lane;
      if (v.cool <= 0) {
        let want = null;
        if (!inFast && gap < 70 && lv < v.v0 - 2) want = this.laneD(v.dir, true);
        else if (inFast && v.K.fast < 0.6 && gap > 120 && this.r() < 0.02) want = this.laneD(v.dir, false);
        if (want !== null && this.laneFree(v, want, player)) { v.fromD = v.targetD; v.targetD = want; v.cool = 4 + this.r() * 4; }
      }
      if (Math.abs(v.targetD - v.d) > 0.4 && player.box && Math.abs(player.d - v.targetD) < 2.7 &&
          Math.abs(player.s - v.s) < (v.len + player.len) / 2 + 6 && v.fromD !== undefined) {
        v.targetD = v.fromD; v.cool = 3;   // driver sees the bus in the mirror and backs off
      }
      let tD = v.targetD;
      if (Math.abs(v.s - route.tollS) < 45) tD = Math.sign(tD) * (Math.abs(tD) < ROAD.median + ROAD.lane ? TOLL.laneFast : TOLL.laneSlow);
      const dd = tD - v.d;
      const lat = THREE.MathUtils.clamp(dd, -1.6 * dt, 1.6 * dt);
      v.d += lat;
      v.prevS = v.s;
      v.s += v.v * v.dir * dt;

      // place the model
      const p = route.pointAt(v.s, v.d, v.wrap.position);
      p.y = route.roadHeight(v.s);
      v.wrap.rotation.y = route.yawAt(v.s) + (v.dir < 0 ? Math.PI : 0) - Math.atan2(lat / Math.max(dt, 1e-3), Math.max(v.v, 2)) * v.dir * 0.8;
      v.spin += (v.v / v.wheelR) * dt;
      for (const w of v.wheels) w.rotation.x = v.spin;
      const braking = acc < -1.2;
      if (v.isBus) setBusLights(v.model, { head: night, brake: braking, night });
      else setVehicleLights(v.model, night, braking);

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

  nearestGate(v) {
    let best = null, bd = 1e9;
    for (const g of this.gates) {
      if (g.dir !== v.dir) continue;
      const dd = Math.abs(g.d - v.d);
      if (dd < bd) { bd = dd; best = g; }
    }
    return best;
  }

  laneFree(v, d, player) {
    for (const o of this.list) {
      if (o === v || o.dir !== v.dir) continue;
      if (Math.abs(o.d - d) > 2.5 && Math.abs(o.targetD - d) > 2.5) continue;
      const rel = (o.s - v.s) * v.dir;
      if (rel > -30 && rel < 40) return false;
    }
    if (Math.abs(player.d - d) < 2.8) {
      const rel = (player.s - v.s) * v.dir;
      if (rel > -35 && rel < 45) return false;
    }
    return true;
  }

  // AI ahead of the player that is very close: used for the "horn makes them move" BD behaviour
  nudge(player) {
    for (const v of this.list) {
      if (v.dir !== 1) continue;
      const rel = v.s - player.s;
      if (rel > 0 && rel < 50 && Math.abs(v.d - player.d) < 2.5) {
        const other = Math.abs(v.targetD) < ROAD.median + ROAD.lane ? this.laneD(1, false) : this.laneD(1, true);
        if (this.laneFree(v, other, { s: -1e9, d: 1e9 })) { v.targetD = other; v.cool = 5; }
      }
    }
  }
}
