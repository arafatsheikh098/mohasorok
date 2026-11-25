import * as THREE from 'three';
import { ROAD, PLAZA } from './config.js';
import { buildBus, BUS_TYPES, setBusLights } from './busModel.js';
import { buildTruck, buildCar, buildMicrobus, buildCNG, setVehicleLights } from './trafficModels.js';
import { OPERATORS } from './operators.js';
import { rng } from './textures.js';
import { TOLL } from './world/facilities.js';
import { obbOverlap } from './collide.js';
import { addLampGlow, updateLampGlow, facingCamera } from './aiLights.js';

const LANES = { fwd: [-(ROAD.median + ROAD.lane * 1.5), -(ROAD.median + ROAD.lane * 0.5)] }; // [slow, fast]
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

  // lane centre d for a vehicle: forward lanes are negative d, oncoming positive
  laneD(dir, fast) { const d = LANES.fwd[fast ? 1 : 0]; return dir > 0 ? d : -d; }
  isFast(d) { return Math.abs(d) < ROAD.median + ROAD.lane; }

  spawn(v, playerS, initial) {
    const r = this.r;
    v.dir = r() < 0.58 ? 1 : -1;
    const fast = r() < v.K.fast;
    v.d = v.targetD = v.fromD = this.laneD(v.dir, fast);
    v.v0 = v.K.v[0] + r() * (v.K.v[1] - v.K.v[0]);
    v.v = v.v0 * (0.8 + r() * 0.2);
    v.agg = v.K.agg[0] + r() * (v.K.agg[1] - v.K.agg[0]);
    // some BD bus and truck drivers never dip their lights for anyone
    v.noDip = (v.isBus || v.K.kind === 'truck') && r() < 0.18;
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
    v.cool = 2 + r() * 3;
    v.lv = 0;
    v.plan = null;        // pending lane change: { to, t, sig } — indicator on, waiting for a gap
    v.sig = 0;            // indicator: -1 left, +1 right (relative to the vehicle)
    v.keepT = 0;          // time the left lane has been clear while sitting in the fast lane
    v.flashT = -1; v.flashCool = 0; v.stuckT = 0;
    v.tollPaid = false; v.tollWait = 0; v.yieldT = 0; v.booth = null;
    v.prevS = v.s;   // so a respawn never counts as passing a camera
  }

  init(playerS) { for (const v of this.list) this.spawn(v, playerS, true); }

  // nearest vehicle ahead and behind v in lane d (AI or player). Gaps are bumper to bumper.
  gaps(v, d, player) {
    const g = { ahead: 1e9, aheadV: 0, aheadP: false, behind: 1e9, behindV: 0 };
    const look = (s, len, sp, isP) => {
      const ds = (s - v.s) * v.dir, gap = Math.abs(ds) - (v.len + len) / 2;
      if (ds > 0) { if (gap < g.ahead) { g.ahead = gap; g.aheadV = sp; g.aheadP = isP; } }
      else if (gap < g.behind) { g.behind = gap; g.behindV = sp; }
    };
    for (const o of this.list) {
      if (o === v || o.dir !== v.dir) continue;
      if (Math.abs(o.d - d) < 2.4 || Math.abs(o.targetD - d) < 1.0) look(o.s, o.len, o.v, false);
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
    for (const v of this.list) {
      // recycle
      const rel = (v.s - ps);
      if (rel > 1800 || rel < -1100 || v.s <= 5 || v.s >= route.length - 5) this.spawn(v, ps, false);

      // leader: in our lane, or in the lane we are moving into
      const own = this.gaps(v, v.d, player);
      let gap = own.ahead, lv = own.aheadV;
      if (Math.abs(v.targetD - v.d) > 0.6) {
        const tg = this.gaps(v, v.targetD, player);
        if (tg.ahead < gap) { gap = tg.ahead; lv = tg.aheadV; }
      }

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
      // pick a booth as the road starts to fan out; after the islands, merge back into the lanes
      if (v.booth === null && tollDist > 25 && tollDist < PLAZA.reach + 60) v.booth = this.pickBooth(v);
      if (v.booth !== null && tollDist < -(PLAZA.islandLen / 2 + v.len / 2)) v.booth = null;
      const nearToll = Math.abs(v.s - route.tollS) < TOLL_NO_CHANGE;

      // let the player in when they signal into our lane
      v.yieldT = Math.max(0, v.yieldT - dt);
      if (v.dir > 0 && (player.indL || player.indR) && player.side < 0) {
        const tgt = this.laneD(1, player.indR);
        const behind = player.s - v.s;
        if (Math.abs(v.d - tgt) < 1.8 && behind > 0 && behind < 70) v.yieldT = 3;
      }
      const inFast = this.isFast(v.targetD);
      const overtaking = inFast && Math.abs(v.targetD - v.d) < 1;
      // pushy drivers wind it up a little while passing
      let v0 = v.v0 + (overtaking ? v.agg * 1.5 : 0);
      if (v.yieldT > 0) v0 = Math.min(v0, Math.max(4, (player.vs ?? player.v) * 0.85));

      // IDM car following
      const a = v.K.a, b = 3;
      const sStar = 5 + v.v * 1.3 + (v.v * (v.v - lv)) / (2 * Math.sqrt(a * b));
      let acc = a * (1 - (v.v / v0) ** 4) - (gap < 1e8 ? a * (Math.max(0, sStar) / Math.max(0.5, gap)) ** 2 : 0);
      acc = THREE.MathUtils.clamp(acc, -9, a);
      v.v = Math.max(0, v.v + acc * dt);
      v.acc = acc;

      // ---- lane decisions ----
      v.cool -= dt;
      v.flashCool -= dt;
      const changing = Math.abs(v.targetD - v.d) > 0.35;
      const slowAhead = gap < 45 + v.v * 1.4 && lv < v.v0 - 1.5;
      if (v.plan) {
        // indicator is on: move over once we have signalled long enough and the gap is there
        const p = v.plan;
        p.t += dt;
        if (nearToll) { v.plan = null; v.sig = 0; }
        else if (p.t >= p.sig && this.roomIn(v, p.to, player)) {
          v.fromD = v.targetD; v.targetD = p.to; v.plan = null;
          v.cool = 3 + this.r() * 3;
        } else if (p.t > p.sig + 7) { v.plan = null; v.sig = 0; v.cool = 2; }   // never got a gap: give up
      } else if (!changing && v.cool <= 0 && !nearToll) {
        const fastD = this.laneD(v.dir, true), slowD = this.laneD(v.dir, false);
        if (!inFast) {
          // stuck behind something slower: signal right and pull out to overtake
          if (slowAhead && v.K.fast > 0 && this.roomIn(v, fastD, player, 1.2)) {
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
          const linger = pushed ? 0.6 : 1.2 + v.agg * 5 + (v.isBus ? 1.5 : 0);
          if (v.keepT > linger) { this.plan(v, slowD, 1.6 - v.agg * 0.8); v.keepT = 0; }
        }
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
      if (!v.plan) {
        const dd = (v.targetD - v.d) * v.dir;
        v.sig = Math.abs(dd) > 0.3 ? Math.sign(dd) : 0;
      }

      // ---- sideways motion: eases in and out like a real lane change ----
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
      const blinkOn = v.sig !== 0 && (v.blinkT % v.blinkP) < v.blinkP * 0.5;
      if (v.sig === 0) v.blinkT = v.blinkP * 0.02;   // next signal starts with a flash, like a real relay
      const indL = blinkOn && v.sig < 0, indR = blinkOn && v.sig > 0;
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
