// The road network: every road of src/data/bd_network.js turned into a smooth centreline in game metres,
// with its places and roadside features in the road's own (s, side) frame, plus shortest paths between nodes.
//
// All roads share one projection (MAP_SCALE, one origin for the whole country), so roads that meet at a node
// meet in the game world too. A trip is then built from a path of roads by src/route.js.
import * as THREE from 'three';
import { MAP_SCALE, UTURN_SPACING, UTURN_GAP } from './config.js';
import { NODES, ROADS } from './data/bd_network.js';

export const ORIGIN = { lat: 23.7, lon: 90.35 };
const KX = Math.cos((ORIGIN.lat * Math.PI) / 180) * 111320 * MAP_SCALE;
const KZ = 110540 * MAP_SCALE;
export const DS = 2;                         // centreline sample spacing (m)
export const project = (lat, lon) => new THREE.Vector2((lon - ORIGIN.lon) * KX, -(lat - ORIGIN.lat) * KZ);
export const unproject = (x, z) => ({ lat: ORIGIN.lat - z / KZ, lon: ORIGIN.lon + x / KX });

const TERMINAL = { len: 120, depth: 42, exit: 30, gap: 8 };

// Smooth a polyline (Gaussian, radius r samples) with the ends held in place: the signal is mirrored through
// each end point, so the first and last points (and the direction there) stay where the road meets its node.
function smoothPts(X, Z, r, passes) {
  const w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * (r / 3) ** 2)));
  const n = X.length;
  const at = (A, j) => (j < 0 ? 2 * A[0] - A[Math.min(n - 1, -j)] : j >= n ? 2 * A[n - 1] - A[Math.max(0, 2 * (n - 1) - j)] : A[j]);
  for (let pass = 0; pass < passes; pass++) {
    const nx = new Float64Array(n), nz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sz = 0, sw = 0;
      for (let k = -r; k <= r; k++) { const g = w[k + r]; sx += at(X, i + k) * g; sz += at(Z, i + k) * g; sw += g; }
      nx[i] = sx / sw; nz[i] = sz / sw;
    }
    X = nx; Z = nz;
  }
  return [X, Z];
}

// resample a polyline at a fixed spacing
function resample(X, Z, step) {
  const n = X.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
  const N = Math.max(2, Math.floor(cum[n - 1] / step) + 1);
  const px = new Float64Array(N), pz = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.min(i * step, cum[n - 1]);
    while (j < n - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    px[i] = X[j] + (X[j + 1] - X[j]) * f;
    pz[i] = Z[j] + (Z[j + 1] - Z[j]) * f;
  }
  px[N - 1] = X[n - 1]; pz[N - 1] = Z[n - 1];
  return [px, pz];
}

// One road: centreline samples every DS metres from its `from` node to its `to` node.
export class Chain {
  constructor(def, nodes) {
    Object.assign(this, { id: def.id, ref: def.ref, lanes: def.lanes || 4, en: def.en, bn: def.bn, from: def.from, to: def.to, def });
    const A = nodes[def.from], B = nodes[def.to];
    const stops = [{ ...A, node: def.from }, ...(def.via || []), { ...B, node: def.to }];
    const wp = stops.map((w) => project(w.lat, w.lon));

    // gentle real-road-like bends between the via points (zero at each via point)
    const ctrl = [];
    let acc = 0;
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i], b = wp[i + 1];
      const seg = a.distanceTo(b);
      const n = Math.max(2, Math.round(seg / 320));
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector2(-dir.y, dir.x);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const g = acc + seg * t;
        const wig = (Math.sin(g / 610) * 38 + Math.sin(g / 233 + 1.3) * 12 + Math.sin(g / 1370 + 0.4) * 55) * Math.sin(Math.PI * t);
        const p = a.clone().lerp(b, t).addScaledVector(perp, wig);
        ctrl.push(new THREE.Vector3(p.x, 0, p.y));
      }
      acc += seg;
    }
    const lastP = wp[wp.length - 1];
    ctrl.push(new THREE.Vector3(lastP.x, 0, lastP.y));
    const dense = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(ctrl.length * 60);
    let [X, Z] = resample(dense.map((p) => p.x), dense.map((p) => p.z), DS);
    // Squeezing real roads to 1:12 leaves some hairpin-tight bends that no bus could take at highway speed:
    // smooth the centreline (Gaussian, ~±90 m) with the ends pinned to the nodes, and resample.
    [X, Z] = smoothPts(X, Z, 150, 3);
    [this.px, this.pz] = resample(X, Z, DS);
    this.N = this.px.length;
    this.length = (this.N - 1) * DS;
    this.km = def.km || (this.length / MAP_SCALE / 1000) * 1.2;

    // places along the road (the nodes at both ends included)
    this.places = stops.map((w, i) => {
      const s = i === 0 ? 0 : i === stops.length - 1 ? this.length : this.projectS(wp[i].x, wp[i].y);
      return { ...w, s };
    });
    this._features();
  }

  sAtKm(km) { return THREE.MathUtils.clamp((km / this.km) * this.length, 0, this.length); }

  // nearest centreline s to (x, z) (coarse scan, then the neighbouring samples)
  projectS(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i += 4) {
      const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    for (let i = Math.max(0, best - 4); i <= Math.min(this.N - 1, best + 4); i++) {
      const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d2 <= bd) { bd = d2; best = i; }
    }
    return best * DS;
  }

  bridgeAt(s) { return this.bridges.some((b) => s > b.s0 && s < b.s1); }

  // Roadside features in road coordinates (s from the `from` node, side -1 = left carriageway going from → to).
  // Kept here, not per trip, so a road looks the same whichever trip drives it.
  _features() {
    const L = this.length, def = this.def;
    // bridges where a river crosses (offset: metres from the place, along from → to)
    this.bridges = [];
    for (const p of this.places) {
      if (!p.river) continue;
      const sc = THREE.MathUtils.clamp(p.s + (p.river.offset || 0), 600, L - 600);
      const half = p.river.width / 2 + 30;
      this.bridges.push({ ...p.river, sc, s0: sc - half, s1: sc + half });
    }
    // toll plazas
    this.tolls = this.places.filter((p) => p.toll).map((p) => ({ s: p.s, ...(typeof p.toll === 'object' ? p.toll : {}) }));
    const tollNear = (s, m) => this.tolls.some((t) => Math.abs(s - t.s) < m);
    // fuel stations: a paved forecourt beside the road at road height
    this.stations = (def.fuel || []).map((f) => {
      let sc = this.sAtKm(f.km);
      while (this.bridgeAt(sc) || this.bridgeAt(sc - 80) || this.bridgeAt(sc + 80) || tollNear(sc, 200)) sc += 120;
      return { ...f, sc, s0: sc - 45, s1: sc + 45, depth: 30 };
    });
    // rest stops: a big paved lot with a restaurant, kept clear of bridges, tolls and fuel stations
    this.rests = (def.rest || []).map((r) => {
      let sc = this.sAtKm(r.km);
      const busy = (x) => this.bridgeAt(x) || this.bridgeAt(x - 120) || this.bridgeAt(x + 120) || tollNear(x, 300) || this.stations.some((st) => Math.abs(x - st.sc) < 260);
      while (busy(sc)) sc += 120;
      return { ...r, sc, s0: sc - 75, s1: sc + 75, depth: 42 };
    });
    // bus terminals at the road's end nodes that have one on this road: a walled yard beside one carriageway
    this.terminals = [];
    for (const [key, atEnd] of [[this.from, false], [this.to, true]]) {
      const t = NODES[key]?.terminal;
      if (!t || t.road !== this.id) continue;
      const s0 = atEnd ? L - TERMINAL.gap - TERMINAL.len : TERMINAL.gap;
      this.terminals.push({ id: key, bn: t.bn, en: t.en, node: key, side: t.side, s0, s1: s0 + TERMINAL.len, depth: TERMINAL.depth });
    }
    // U-turn openings in the median (4-lane roads)
    this.uturns = [];
    if (this.lanes >= 4) {
      for (let s = 1500; s < L - 800; s += UTURN_SPACING) {
        let u = s;
        while (this.bridgeAt(u) || this.bridgeAt(u + 200) || this.bridgeAt(u - 200) || tollNear(u, 300)) u += 150;
        this.uturns.push({ s: u });
      }
      // in front of every filling station, so buses on the far carriageway can cross in (and back out)
      for (const st of this.stations) {
        if (this.uturns.some((u) => Math.abs(u.s - st.sc) < UTURN_GAP / 2 + 45)) continue;
        this.uturns.push({ s: st.sc, station: true });
      }
    }
    // pedestrian footbridges: near town centres and every 4.2 km
    this.footbridges = [];
    for (const p of this.places) if (p.town >= 300 && p.s > 200 && p.s < L - 200) this.footbridges.push(p.s + 40);
    for (let s = 3000; s < L - 500; s += 4200) this.footbridges.push(s);
    // hills and sea along the road: from the first such place to the last (and on to the end if it is the last place)
    const range = (key, before, after) => {
      const ps = this.places.filter((p) => p[key]);
      if (!ps.length) return null;
      const a = ps[0].s - before, b = ps[ps.length - 1].s + after;
      return { s0: Math.max(0, a), s1: Math.min(L, b), openA: a > 0, openB: b < L };
    };
    this.hills = range('hills', 1500, 1500);
    this.sea = range('sea', 2500, 1200);
    this.police = (def.police || []).map((p) => ({ ...p, s: this.sAtKm(p.km) }));
  }
}

export class Network {
  constructor() {
    this.nodes = NODES;
    this.roads = new Map();
    for (const def of ROADS) this.roads.set(def.id, new Chain(def, NODES));
    // adjacency: node -> [{ road, rev, to }]
    this.adj = new Map();
    for (const c of this.roads.values()) {
      if (!this.adj.has(c.from)) this.adj.set(c.from, []);
      if (!this.adj.has(c.to)) this.adj.set(c.to, []);
      this.adj.get(c.from).push({ road: c.id, rev: false, to: c.to });
      this.adj.get(c.to).push({ road: c.id, rev: true, to: c.from });
    }
  }

  road(id) { return this.roads.get(id); }

  // Shortest path (by real km) from any of the start nodes to any of the goal nodes: [{ road, rev }]
  path(starts, goals) {
    starts = [].concat(starts); goals = new Set([].concat(goals));
    const dist = new Map(), prev = new Map(), done = new Set();
    for (const s of starts) dist.set(s, 0);
    for (;;) {
      let u = null, best = Infinity;
      for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
      if (u === null) return null;
      if (goals.has(u)) {
        const out = [];
        for (let k = u; prev.has(k); k = prev.get(k).from) out.unshift(prev.get(k).step);
        return out;
      }
      done.add(u);
      for (const e of this.adj.get(u) || []) {
        const c = this.roads.get(e.road);
        const nd = best + c.km + (c.def.ferry ? 40 : 0);
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: u, step: { road: e.road, rev: e.rev } }); }
      }
    }
  }
}
