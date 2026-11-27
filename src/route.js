import * as THREE from 'three';
import { ROAD, UTURN_GAP, PLAZA, profileOf } from './config.js';
import { DS } from './net.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const FILLET = 30;           // m of each road trimmed at a junction, replaced by a smooth curve through the node
const EXIT = 30;             // terminal exit gap (m)
export const PAD_R = 32;     // radius of the paved junction area where roads meet

// The trip corridor: the roads of a path (src/net.js) joined end to end into one centreline, sampled every DS
// metres, with everything along it (towns, bridges, toll plazas, fuel stations, rest stops, terminals, U-turns)
// in the corridor's own frame: s = metres from the start, d = metres to the right (d < 0 is the left
// carriageway, the one the trip drives on, since Bangladesh drives on the left).
export class Route {
  // path: [{ road, rev }] from src/net.js Network.path(); rev = the road is driven from its `to` node to its `from` node
  constructor(net, path) {
    this.net = net;
    this.path = path;
    this.DS = DS;
    this._centreline();
    this._features();
    this._grid();
  }

  // a coarse spatial index of the centreline (every 8 m, 50 m cells) for "is this point on the road?"
  _grid() {
    this.cell = 50;
    this.cells = new Map();
    for (let i = 0; i < this.N; i += 4) {
      const k = `${Math.floor(this.px[i] / this.cell)},${Math.floor(this.pz[i] / this.cell)}`;
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(i);
    }
  }
  // is (x, z) on this road, its embankment or within `margin` of it, anywhere along the trip (also on a part
  // of the trip far away in s, e.g. where it doubles back near a junction), on a side road or a junction pad?
  nearRoad(x, z, margin = 0) {
    const c = this.cell, r = Math.ceil((20 + ROAD.embank + margin + 14) / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const list = this.cells.get(`${cx + a},${cz + b}`);
      if (!list) continue;
      for (const i of list) {
        // distance to the centreline pieces either side of this sample
        for (const k of [Math.max(0, i - 4), i]) {
          const k2 = Math.min(this.N - 1, k + 4);
          const ax = this.px[k], az = this.pz[k], bx = this.px[k2] - ax, bz = this.pz[k2] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
          const d = Math.hypot(ax + bx * t - x, az + bz * t - z);
          if (d < this.halfAt((k + 4 * t) * DS) + ROAD.embank + margin) return true;
        }
      }
    }
    for (const j of this.junctions || []) if (Math.hypot(x - j.x, z - j.z) < j.R + ROAD.embank + margin) return true;
    return !!this.nearBranch?.(x, z, margin);
  }

  // ---------------------------------------------------------------- building
  _centreline() {
    const X = [], Z = [];
    this.segs = [];
    this.path.forEach((step, k) => {
      const c = this.net.road(step.road), N = c.N;
      // the sharper the turn at a junction, the longer the curve through it (so a bus can take it)
      const turn = (a, b) => {
        if (!a || !b) return 0;
        const ca = this.net.road(a.road), cb = this.net.road(b.road);
        const end = (ch, rev, atStart) => { const i = atStart ? (rev ? ch.N - 1 : 0) : (rev ? 0 : ch.N - 1), j = atStart ? (rev ? ch.N - 16 : 15) : (rev ? 15 : ch.N - 16); return [ch.px[j] - ch.px[i], ch.pz[j] - ch.pz[i]]; };
        const [ax, az] = end(ca, a.rev, false), [bx, bz] = end(cb, b.rev, true);
        const dot = (-ax * bx - az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
        return Math.acos(Math.max(-1, Math.min(1, dot)));       // 0 = straight on, π = straight back
      };
      const fil = (th) => Math.min(70, FILLET * Math.max(1, th / (Math.PI / 3)));
      const trimA = k > 0 ? fil(turn(this.path[k - 1], step)) : 0, trimB = k < this.path.length - 1 ? fil(turn(step, this.path[k + 1])) : 0;
      const trim = (t) => Math.min(t, c.length * 0.3);
      const iA = Math.round(trim(trimA) / DS), iB = N - 1 - Math.round(trim(trimB) / DS);
      const pt = (u) => (step.rev ? [c.px[N - 1 - u], c.pz[N - 1 - u]] : [c.px[u], c.pz[u]]);
      if (k > 0) {
        // a quadratic curve from the end of the last road to this road, bending through the node they share
        const [nx, nz] = pt(0), [ex, ez] = pt(iA);
        const sx = X[X.length - 1], sz = Z[Z.length - 1];
        const n = Math.max(2, Math.ceil((Math.hypot(nx - sx, nz - sz) + Math.hypot(ex - nx, ez - nz)) / DS));
        for (let j = 1; j < n; j++) {
          const t = j / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), cc = t * t;
          X.push(a * sx + b * nx + cc * ex); Z.push(a * sz + b * nz + cc * ez);
        }
      }
      const i0 = X.length;
      for (let u = iA; u <= iB; u++) { const [x, z] = pt(u); X.push(x); Z.push(z); }
      this.segs.push({ road: c.id, chain: c, rev: step.rev, i0, u0: iA * DS, u1: iB * DS, from: step.rev ? c.to : c.from, to: step.rev ? c.from : c.to });
    });
    // resample at DS (the road samples already are; this only evens out the curves at junctions)
    const n = X.length, acc = [0];
    for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
    for (const g of this.segs) g.o = acc[g.i0];
    const N = Math.max(2, Math.floor(acc[n - 1] / DS) + 1);
    this.N = N;
    this.px = new Float64Array(N); this.pz = new Float64Array(N);
    this.tx = new Float64Array(N); this.tz = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * DS;
      while (j < n - 2 && acc[j + 1] < s) j++;
      const f = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
      this.px[i] = X[j] + (X[j + 1] - X[j]) * f;
      this.pz[i] = Z[j] + (Z[j + 1] - Z[j]) * f;
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    this.length = (N - 1) * DS;
    // real km along the corridor: each road counts its own real length, junction curves at the same rate
    this.kmTab = [];
    let km = 0;
    this.segs.forEach((g, k) => {
      const rate = g.chain.km / g.chain.length;
      if (k > 0) { const p = this.segs[k - 1]; km += (g.o - (p.o + p.u1 - p.u0)) * rate; }
      g.km0 = km;
      this.kmTab.push([g.o, km]);
      km += (g.u1 - g.u0) * rate;
      this.kmTab.push([Math.min(this.length, g.o + g.u1 - g.u0), km]);
    });
    this.totalKm = km;
    // lane profile per road: it changes at the junctions (in the middle of the junction pad)
    this.profTab = this.segs.map((g, k) => {
      const p = this.segs[k - 1];
      const at = k === 0 ? -1e9 : (p.o + p.u1 - p.u0 + g.o) / 2;
      return [at, profileOf(g.chain.lanes)];
    });
  }

  // the lane profile (PROFILE in config.js) at s
  prof(s) {
    const T = this.profTab;
    let P = T[0][1];
    for (let i = 1; i < T.length; i++) { if (s >= T[i][0]) P = T[i][1]; else break; }
    return P;
  }
  // where the profile changes, inside [a, b]
  profBreaks(a, b) { return this.profTab.slice(1).map((x) => x[0]).filter((x) => x > a && x < b); }

  // corridor s of road s (in the road's own from → to frame) on segment g, or null when that part was trimmed
  _s(g, s, slack = 0) {
    const L = g.chain.length, u = g.rev ? L - s : s;
    if (u < g.u0 - slack || u > g.u1 + slack) return null;
    return g.o + (u - g.u0);
  }

  _features() {
    const sd = (g, side) => (g.rev ? -side : side);
    const pair = (g, a, b) => { const x = this._s(g, a, 1e9), y = this._s(g, b, 1e9); return x < y ? [x, y] : [y, x]; };
    this.places = []; this.bridges = []; this.tolls = []; this.stations = []; this.rests = []; this.terminals = [];
    this.uturns = []; this.footbridges = []; this.hills = []; this.seas = []; this.policeSpots = []; this.ferries = [];
    this.segs.forEach((g, k) => {
      const c = g.chain;
      // a ferry crossing: no road here, the bus crosses on the ferry (main.js ferryLogic)
      if (c.def.ferry) {
        const A = this.net.nodes[g.from], B = this.net.nodes[g.to];
        const s0 = g.o, s1 = g.o + (g.u1 - g.u0);
        this.ferries.push({ ferry: true, s0, s1, sc: (s0 + s1) / 2, ...c.def.ferry, en: c.en, bn: c.bn, from: A, to: B, width: 0 });
      }
      for (const p of c.places) {
        if (k > 0 && p.node === g.from) continue;          // the node it shares with the previous road (already in)
        const s = this._s(g, p.s, FILLET + 1);
        if (s === null) continue;
        this.places.push({ ...p, s: THREE.MathUtils.clamp(s, 0, this.length), road: c.id, seg: k });
      }
      for (const b of c.bridges) {
        const sc = this._s(g, b.sc);
        if (sc === null) continue;
        const [s0, s1] = pair(g, b.s0, b.s1);
        this.bridges.push({ ...b, sc, s0, s1 });
      }
      for (const t of c.tolls) { const s = this._s(g, t.s); if (s !== null) this.tolls.push({ ...t, s }); }
      for (const st of c.stations) {
        const sc = this._s(g, st.sc);
        if (sc === null) continue;
        const [s0, s1] = pair(g, st.s0, st.s1);
        const H = profileOf(c.lanes).half;
        this.stations.push({ ...st, sc, s0, s1, side: sd(g, st.side), dIn: H, dOut: H + st.depth });
      }
      for (const r of c.rests) {
        const sc = this._s(g, r.sc);
        if (sc === null) continue;
        const [s0, s1] = pair(g, r.s0, r.s1);
        const H = profileOf(c.lanes).half;
        this.rests.push({ ...r, sc, s0, s1, side: sd(g, r.side), dIn: H, dOut: H + r.depth });
      }
      for (const t of c.terminals) {
        if (this._s(g, t.s0) === null || this._s(g, t.s1) === null) continue;
        const [s0, s1] = pair(g, t.s0, t.s1);
        this.terminals.push({ ...t, s0, s1, side: sd(g, t.side) });
      }
      for (const u of c.uturns) { const s = this._s(g, u.s); if (s !== null) this.uturns.push({ ...u, s, s0: s - UTURN_GAP / 2, s1: s + UTURN_GAP / 2 }); }
      for (const f of c.footbridges) { const s = this._s(g, f); if (s !== null) this.footbridges.push(s); }
      for (const p of c.police) { const s = this._s(g, p.s); if (s !== null) this.policeSpots.push({ ...p, s }); }
      for (const [key, list] of [['hills', this.hills], ['sea', this.seas]]) {
        const h = c[key];
        if (!h) continue;
        const [s0, s1] = pair(g, h.s0, h.s1);
        const a = Math.max(0, s0), b = Math.min(this.length, s1);
        if (b - a > 50) list.push({ s0: a, s1: b, openA: g.rev ? h.openB : h.openA, openB: g.rev ? h.openA : h.openB });
      }
    });
    const byS = (a, b) => a.s - b.s;
    this.places.sort(byS);
    this.places.forEach((p, i) => { p.index = i; });
    if (this.places.length) { this.places[0].s = 0; this.places[this.places.length - 1].s = this.length; }
    this.tolls.sort(byS);
    this.bridges.sort((a, b) => a.sc - b.sc);
    this.stations.sort((a, b) => a.sc - b.sc);
    this.rests.sort((a, b) => a.sc - b.sc);
    this.footbridges.sort((a, b) => a - b);
    this.policeSpots.sort(byS);

    // bus terminals: a walled yard beside one carriageway, exit gap at the end its own carriageway drives out of,
    // with a median opening in front of it so buses on the other carriageway can cross in (and out)
    const startNode = this.segs[0].from, endNode = this.segs[this.segs.length - 1].to;
    this.startNode = startNode; this.endNode = endNode;
    this.terminals = this.terminals.map((t) => {
      const dir = t.side < 0 ? 1 : -1;
      const closed = dir > 0 ? t.s0 : t.s1;
      const exitS0 = dir > 0 ? t.s1 - EXIT : t.s0, exitS1 = dir > 0 ? t.s1 : t.s0 + EXIT;
      const end = t.node === startNode ? 0 : t.node === endNode ? 1 : null;
      return { ...t, end, sc: (t.s0 + t.s1) / 2, dIn: ROAD.half, dOut: ROAD.half + t.depth, dir, closed, exitS0, exitS1,
        // the player's bay: first row, near the closed end, nose towards the exit
        bay: { s: closed + dir * 22, d: t.side * (ROAD.half + 12) } };
    });
    for (const t of this.terminals) {
      const c = (t.exitS0 + t.exitS1) / 2;
      this.uturns.push({ s: c, s0: c - UTURN_GAP / 2, s1: c + UTURN_GAP / 2, terminal: true });
    }
    // junctions: every node the trip passes through. A paved pad where the roads meet, the median opens across
    // it, and the other roads branch off (their first stretch is built too, see world/junction.js)
    this.junctions = [];
    for (let k = 1; k < this.segs.length; k++) {
      const node = this.segs[k].from, p = this.places.find((x) => x.node === node && x.seg === k - 1);
      if (!p) continue;
      const used = new Set([this.segs[k - 1].road, this.segs[k].road]);
      const branches = (this.net.adj.get(node) || []).filter((e) => !used.has(e.road));
      const n = this.net.nodes[node];
      // the pad is centred on the node itself (where every road there starts), not on our curve through it:
      // on a sharp turn the curve cuts the corner, and the side roads would start outside the pad
      const g = this.segs[k], ch = g.chain, ni = g.rev ? ch.N - 1 : 0;
      const c = [ch.px[ni], ch.pz[ni]];
      // and the pad reaches the curve's furthest point from the node as well
      let reach = 0;
      for (let ds = -76; ds <= 76; ds += 2) { const [x, z] = this._xz(p.s + ds, 0); reach = Math.max(reach, Math.hypot(x - c[0], z - c[1]) - Math.abs(ds)); }
      this.junctions.push({ s: p.s, node, k, name: n, x: c[0], z: c[1], R: PAD_R + Math.max(0, Math.min(30, reach)), branches });
      const R = this.junctions[this.junctions.length - 1].R;
      this.uturns.push({ s: p.s, s0: p.s - R - 6, s1: p.s + R + 6, junction: true });
    }
    this.uturns.sort(byS);
    // keep U-turn openings out of the junction areas
    this.uturns = this.uturns.filter((u) => u.junction || !this.junctions.some((j) => Math.abs(u.s - j.s) < PAD_R + 60));
  }

  // ---------------------------------------------------------------- real kilometres
  realKm(s) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    const T = this.kmTab;
    for (let i = 1; i < T.length; i++) {
      if (s <= T[i][0] || i === T.length - 1) {
        const [s0, k0] = T[i - 1], [s1, k1] = T[i];
        return s1 > s0 ? k0 + (k1 - k0) * THREE.MathUtils.clamp((s - s0) / (s1 - s0), 0, 1) : k1;
      }
    }
    return this.totalKm;
  }
  sAtKm(km) {
    const T = this.kmTab;
    for (let i = 1; i < T.length; i++) {
      if (km <= T[i][1] || i === T.length - 1) {
        const [s0, k0] = T[i - 1], [s1, k1] = T[i];
        return k1 > k0 ? s0 + (s1 - s0) * THREE.MathUtils.clamp((km - k0) / (k1 - k0), 0, 1) : s1;
      }
    }
    return this.length;
  }
  // corridor s of real km `km` from the `from` node of road `roadId` (null when the trip does not use it)
  sAtRoadKm(roadId, km) {
    for (const g of this.segs) if (g.road === roadId) return this._s(g, g.chain.sAtKm(km), FILLET + 1);
    return null;
  }
  // the road (segment) the corridor follows at s
  segAt(s) {
    let best = this.segs[0];
    for (const g of this.segs) if (s >= g.o - FILLET) best = g;
    return best;
  }

  // ---------------------------------------------------------------- toll plazas
  get tollS() { return this.tolls.length ? this.tolls[0].s : -1e9; }
  tollNear(s) {
    let best = null, bd = Infinity;
    for (const t of this.tolls) { const d = Math.abs(t.s - s); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  tollDist(s) { const t = this.tollNear(s); return t ? Math.abs(t.s - s) : Infinity; }

  // ---------------------------------------------------------------- geometry
  _interp(s) {
    const t = THREE.MathUtils.clamp(s, 0, this.length) / this.DS;
    const i = Math.min(this.N - 2, Math.floor(t));
    return [i, t - i];
  }

  pointAt(s, d = 0, out = new THREE.Vector3()) {
    const [i, f] = this._interp(s);
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * f;
    const z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * f;
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * f;
    let tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * f;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    // extrapolate beyond the ends
    const ext = s < 0 ? s : s > this.length ? s - this.length : 0;
    // right = (-tz, tx)
    out.set(x - tz * d + tx * ext, this.heightAt(s, d), z + tx * d + tz * ext);
    return out;
  }

  tangentAt(s) {
    const [i, f] = this._interp(s);
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * f;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * f;
    const l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }

  yawAt(s) {
    const [tx, tz] = this.tangentAt(s);
    return Math.atan2(tx, tz);
  }

  // Closest point on the centreline. hint = previous sample index for a fast local search.
  project(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.N; i += 8) {
        const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
      hint = best;
    }
    const a = Math.max(0, hint - 60), b = Math.min(this.N - 1, hint + 60);
    bd = Infinity;
    for (let i = a; i <= b; i++) {
      const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    // refine on neighbouring segment
    let i0 = Math.max(0, Math.min(this.N - 2, best));
    const fx = x - this.px[i0], fz = z - this.pz[i0];
    let along = fx * this.tx[i0] + fz * this.tz[i0];
    if (along < 0 && i0 > 0) { i0--; along += this.DS; }
    const s = THREE.MathUtils.clamp(i0 * this.DS + along, -50, this.length + 50);
    const [tx, tz] = this.tangentAt(s);
    const p = this.pointAt(THREE.MathUtils.clamp(s, 0, this.length));
    const d = (x - p.x) * -tz + (z - p.z) * tx;
    return { s, d, index: best };
  }

  uturnAt(s) {
    for (const u of this.uturns) if (s > u.s0 && s < u.s1) return u;
    return null;
  }

  stationAt(s, d) {
    for (const st of this.stations) {
      if (s > st.s0 && s < st.s1 && Math.sign(d) === Math.sign(st.side) && Math.abs(d) > st.dIn - 1 && Math.abs(d) < st.dOut) return st;
    }
    return null;
  }

  restAt(s, d) {
    for (const r of this.rests) {
      if (s > r.s0 && s < r.s1 && Math.sign(d) === Math.sign(r.side) && Math.abs(d) > r.dIn - 1 && Math.abs(d) < r.dOut) return r;
    }
    return null;
  }
  // the bus terminal yard (s, d) is inside, or null
  terminalAt(s, d) {
    for (const t of this.terminals) {
      if (s > t.s0 && s < t.s1 && Math.sign(d) === Math.sign(t.side) && Math.abs(d) > t.dIn - 1 && Math.abs(d) < t.dOut) return t;
    }
    return null;
  }
  // paved ground beside the road (fuel forecourt, rest-stop lot or terminal yard)
  paved(s, d) { return this.stationAt(s, d) || this.restAt(s, d) || this.terminalAt(s, d); }

  bridgeAt(s) {
    for (const b of this.bridges) if (s > b.s0 && s < b.s1) return b;
    for (const f of this.ferries || []) if (s > f.s0 && s < f.s1) return f;      // (nothing is built on the river either)
    return null;
  }
  ferryAt(s) {
    for (const f of this.ferries || []) if (s > f.s0 && s < f.s1) return f;
    return null;
  }

  // 0..1: how far the road has widened for the nearest toll plaza at s
  plazaW(s) {
    if (!this.tolls) return 0;   // still building the route
    const x = this.tollDist(s);
    return x <= PLAZA.flat ? 1 : x >= PLAZA.reach ? 0 : smooth(1 - (x - PLAZA.flat) / PLAZA.taper);
  }
  // paved half-width of the road at s (wider at a toll plaza)
  halfAt(s) { const h = this.prof(s).half; return h + (PLAZA.half - h) * this.plazaW(s); }

  // road surface height (centreline, with bridge ramps)
  roadHeight(s) {
    let h = ROAD.baseHeight;
    for (const b of this.bridges) {
      const ramp = b.ramp || ROAD.rampLen, top = b.height || ROAD.bridgeHeight;     // (a flyover is higher, with longer ramps)
      if (s < b.s0 - ramp || s > b.s1 + ramp) continue;
      const up = smooth((s - (b.s0 - ramp)) / ramp);
      const down = smooth(((b.s1 + ramp) - s) / ramp);
      h = Math.max(h, ROAD.baseHeight + (top - ROAD.baseHeight) * Math.min(up, down));
    }
    return h;
  }

  // world x, z of (s, d) (no height: used inside heightAt)
  _xz(s, d) {
    const [i, f] = this._interp(s);
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * f, z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * f;
    const [tx, tz] = this.tangentAt(s);
    return [x - tz * d, z + tx * d];
  }
  // the junction pad (s, d) stands on, or null
  junctionAt(s, d) {
    for (const j of this.junctions || []) {
      if (Math.abs(s - j.s) > j.R + 40) continue;
      const [x, z] = this._xz(s, d);
      if (Math.hypot(x - j.x, z - j.z) < j.R + 1) return j;
    }
    return null;
  }

  // height of the ground/road surface at (s, d)
  heightAt(s, d) {
    const h = this.roadHeight(s);
    const ad = Math.abs(d);
    const half = this.halfAt(s);
    if (ad <= half) return h;
    if (this.junctionAt(s, d)) return h;    // the flat junction pad
    // on one of the side roads at a junction (driving off the pad onto it, before the trip switches over to it)
    for (const j of this.junctions || []) {
      if (Math.abs(s - j.s) > j.R + 140 || !j.branches.length) continue;
      const [x, z] = this._xz(s, d);
      for (const b of j.branches) {
        if (!b.stub) continue;
        const pr = b.stub.project(x, z, b.hHint ?? -1);
        b.hHint = pr.index;
        if (pr.s > 0 && pr.s < b.len && Math.abs(pr.d) <= b.stub.halfAt(pr.s) + 0.5) return b.stub.roadHeight(pr.s);
      }
    }
    if (this.bridgeAt(s)) return h; // off the deck there is nothing, the walls keep you on
    if (this.paved(s, d)) return h; // paved forecourt / rest-stop lot
    const t = (ad - half) / ROAD.embank;
    return t >= 1 ? 0 : h * (1 - t);
  }

  // +1 if the right-hand side of the road is towards east at s, else -1
  eastSide(s) {
    // right = (-tz, tx) -> its x (east) component is -tz
    const [, tz] = this.tangentAt(s);
    return -tz >= 0 ? 1 : -1;
  }

  nextPlace(s) {
    const last = this.places[this.places.length - 1];
    return this.places.find((p) => p.s > s + 20 && (p.kind !== 'terminal' || p === last)) || last;
  }

  placeAt(s) {
    for (const p of this.places) if (p.town && Math.abs(s - p.s) < p.town / 2 + 50) return p;
    return null;
  }

  // the places at the two ends of the trip
  get startPlace() { return this.places[0]; }
  get endPlace() { return this.places[this.places.length - 1]; }
}
