// The road network: every road of src/data/bd_network.js turned into a smooth centreline in game metres,
// with its places and roadside features in the road's own (s, side) frame, plus shortest paths between nodes.
//
// All roads share one projection (MAP_SCALE, one origin for the whole country), so roads that meet at a node
// meet in the game world too. A trip is then built from a path of roads by src/route.js.
import * as THREE from 'three';
import { MAP_SCALE, UTURN_SPACING, UTURN_GAP, ROAD, profileOf } from './config.js';

const FLYOVER_H = 11;          // deck height of a flyover / elevated expressway (m)
import { NODES, ROADS } from './data/bd_network.js';
import { INTERCHANGES } from './data/interchanges.js';

export const ORIGIN = { lat: 23.7, lon: 90.35 };
const KX = Math.cos((ORIGIN.lat * Math.PI) / 180) * 111320 * MAP_SCALE;
const KZ = 110540 * MAP_SCALE;
export const DS = 2;                         // centreline sample spacing (m)
export const project = (lat, lon) => new THREE.Vector2((lon - ORIGIN.lon) * KX, -(lat - ORIGIN.lat) * KZ);
export const unproject = (x, z) => ({ lat: ORIGIN.lat - z / KZ, lon: ORIGIN.lon + x / KX });

const TERMINAL = { len: 120, depth: 42, exit: 30, gap: 8 };
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const LINK_KM = 4;
// division headquarters: a big terminal (longer yard, more bays, a two-storey building)
const DIV_HQ = new Set(['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh']);
const BIG_LEN = 200;            // real km of the access road from a zilla's junction to its bus terminal

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
    Object.assign(this, { id: def.id, ref: def.ref, lanes: def.lanes || 4, en: def.en, bn: def.bn, from: def.from, to: def.to, def, nodes });
    const A = nodes[def.from], B = nodes[def.to];
    const stops = [{ ...A, node: def.from }, ...(def.via || []), { ...B, node: def.to }];
    const wp = stops.map((w) => project(w.lat, w.lon));
    this._stops = stops; this._wp = wp;
    // real km: given, or the straight-line distance through the via points plus ~18 % for the bends
    let crow = 0;
    for (let i = 1; i < wp.length; i++) crow += wp[i].distanceTo(wp[i - 1]);
    this.km = def.km || Math.max(1, (crow / MAP_SCALE / 1000) * 1.18);
    this.built = false;
  }

  // the smooth centreline and everything along it (made the first time a trip needs this road)
  build() {
    if (this.built) return this;
    this.built = true;
    const stops = this._stops, wp = this._wp;
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
        const wig = this.def.ferry ? 0 : (Math.sin(g / 610) * 38 + Math.sin(g / 233 + 1.3) * 12 + Math.sin(g / 1370 + 0.4) * 55) * Math.sin(Math.PI * t) * Math.min(1, seg / 2500);
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
    // at an interchange (data/interchanges.js) the road leaves exactly along its real direction, dead straight,
    // to the edge of the interchange and a little beyond, where the interchange's own carriageways meet it
    for (const atEnd of [false, true]) {
      const node = atEnd ? this.to : this.from, ic = INTERCHANGES[node], dir = ic?.legs[this.id];
      if (!dir) continue;
      const n = this.px.length, X2 = Array.from(this.px), Z2 = Array.from(this.pz);
      const i0 = atEnd ? n - 1 : 0, ox = X2[i0], oz = Z2[i0], A = ic.R + 30, B = 560;
      for (let k = 0; k < n; k++) {
        const u = k * DS, i = atEnd ? n - 1 - k : k;
        if (u > A + B) break;
        const w = u <= A ? 0 : smooth01((u - A) / B);
        X2[i] = (ox + dir[0] * u) * (1 - w) + X2[i] * w;
        Z2[i] = (oz + dir[1] * u) * (1 - w) + Z2[i] * w;
      }
      [this.px, this.pz] = resample(X2, Z2, DS);
    }
    this.N = this.px.length;
    this.length = (this.N - 1) * DS;

    // places along the road (the nodes at both ends included; shape points are not places)
    this.places = stops.map((w, i) => {
      const s = i === 0 ? 0 : i === stops.length - 1 ? this.length : this.projectS(wp[i].x, wp[i].y);
      return { ...w, s };
    }).filter((p) => !p.shape);
    this._features();
    return this;
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
      const m = Math.min(300, L / 2);
      const sc = THREE.MathUtils.clamp(p.s + (p.river.offset || 0), m, L - m);
      const half = p.river.width / 2 + 30;
      this.bridges.push({ ...p.river, sc, s0: sc - half, s1: sc + half });
    }
    // a bridge's ramps must end before the junctions at both ends of the road (they are flat), so on a short road
    // the ramps get steeper, and if even that does not fit the bridge is made shorter
    for (const b of this.bridges) {
      const keep = 70;                                  // flat ground kept at each end (junction pad + a bit)
      let room = Math.min(b.s0 - keep, L - keep - b.s1);
      if (room < 45) {
        const half = Math.max(20, Math.min((b.s1 - b.s0) / 2, L / 2 - keep - 45));
        b.sc = THREE.MathUtils.clamp(b.sc, keep + 45 + half, L - keep - 45 - half);
        b.s0 = b.sc - half; b.s1 = b.sc + half;
        room = Math.min(b.s0 - keep, L - keep - b.s1);
      }
      b.ramp = Math.max(40, Math.min(ROAD.rampLen, room));
      if (room < 40) b.height = ROAD.baseHeight + Math.max(1.5, (ROAD.bridgeHeight - ROAD.baseHeight) * room / 40);   // a low bridge
    }
    // flyovers / elevated expressways: one long deck on pillars (a "bridge" with no river), ramps at both ends
    if (def.elevated) {
      const e = def.elevated, ramp = ROAD.rampLen * 1.3;
      const a = Math.max(90 + ramp, e.from * L), b = Math.min(L - 90 - ramp, e.to * L);
      if (b - a > 60) this.bridges.push({ elevated: true, en: e.en, bn: e.bn, fee: e.fee || 0, width: 0, height: FLYOVER_H, ramp, sc: (a + b) / 2, s0: a, s1: b });
    }
    // toll plazas
    // (a toll that comes with a bridge stands just past the bridge, on the flat, not on the deck)
    const offBridge = (x) => !this.bridges.some((b) => x > b.s0 - ROAD.rampLen - 140 && x < b.s1 + ROAD.rampLen + 140);
    this.tolls = this.places.filter((p) => p.toll).map((p) => {
      const T = typeof p.toll === 'object' ? p.toll : {};
      let s = p.s;
      for (let k = 0; k < 80 && !offBridge(s); k++) s += 40;
      if (!offBridge(s) || s > L - 250) { s = p.s; for (let k = 0; k < 80 && !offBridge(s); k++) s -= 40; }
      if (offBridge(s) && s >= 250 && s <= L - 250) return { s, ...T };
      // no room for a plaza on this short road: the toll is taken at the bridge as you cross it
      const b = this.bridges.reduce((a, x) => (!a || Math.abs(x.sc - p.s) < Math.abs(a.sc - p.s) ? x : a), null);
      if (b) Object.assign(b, { fee: T.fee || 0, tollBn: T.bn, tollEn: T.en });
      return null;
    }).filter(Boolean);
    const tollNear = (s, m) => this.tolls.some((t) => Math.abs(s - t.s) < m);
    // fuel stations: a paved forecourt beside the road at road height
    // fuel stations: given, or one about every 45 km (alternating sides) on longer roads (none on a ferry)
    const fuel = def.ferry || def.expressway || def.elevated ? [] : def.fuel || (this.km >= 22 ? Array.from({ length: Math.floor((this.km - 12) / 45) + 1 }, (_, i) => ({ km: 16 + i * 45, side: i % 2 ? 1 : -1 })) : []);
    const fname = ['মেঘনা', 'পদ্মা', 'যমুনা', 'রূপালী', 'সোনালী', 'সবুজ', 'নিউ', 'হাইওয়ে'];
    this.stations = fuel.filter((f) => f.km < this.km - 3).map((f, i) => {
      if (!f.bn) { const k = (this.id.length * 7 + i * 3) % fname.length; Object.assign(f, { bn: `${fname[k]} ফিলিং স্টেশন`, en: 'Filling Station' }); }
      let sc = this.sAtKm(f.km);
      while (this.bridgeAt(sc) || this.bridgeAt(sc - 80) || this.bridgeAt(sc + 80) || tollNear(sc, 340)) sc += 120;
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
      const t = this.nodes[key]?.terminal;
      if (!t || t.road !== this.id) continue;
      const len = t.big ? BIG_LEN : TERMINAL.len;
      const s0 = atEnd ? L - TERMINAL.gap - len : TERMINAL.gap;
      this.terminals.push({ id: key, bn: t.bn, en: t.en, node: key, side: t.side, s0, s1: s0 + len, depth: TERMINAL.depth, big: !!t.big });
    }
    // U-turn openings in the median (4-lane roads)
    this.uturns = [];
    if (this.lanes === 4) {     // (a 2-lane road has no median: turn round anywhere; an expressway has none at all)
      for (let s = 1500; s < L - 800; s += UTURN_SPACING) {
        let u = s;
        while (this.bridgeAt(u) || this.bridgeAt(u + 200) || this.bridgeAt(u - 200) || tollNear(u, 300)) u += 150;
        if (u < L - 400) this.uturns.push({ s: u });       // (never right by the junction at the end)
      }
      // in front of every filling station, so buses on the far carriageway can cross in (and back out)
      for (const st of this.stations) {
        if (this.uturns.some((u) => Math.abs(u.s - st.sc) < UTURN_GAP / 2 + 45)) continue;
        this.uturns.push({ s: st.sc, station: true });
      }
    }
    // pedestrian footbridges: near town centres and every 4.2 km
    this.footbridges = [];
    if (!def.ferry && !def.expressway && !def.elevated) {
      for (const p of this.places) if (!p.node && p.town >= 300 && p.s > 200 && p.s < L - 200) this.footbridges.push(p.s + 40);
      for (let s = 3000; s < L - 500; s += 4200) this.footbridges.push(s);
    }
    // hills and sea along the road: from the first such place to the last (and on to the end if it is the last place)
    const range = (key, before, after) => {
      const ps = this.places.filter((p) => p[key]);
      if (!ps.length) return null;
      const a = ps[0].s - before, b = ps[ps.length - 1].s + after;
      return { s0: Math.max(0, a), s1: Math.min(L, b), openA: a > 0, openB: b < L };
    };
    this.hills = range('hills', 1500, 1500);
    this.sea = range('sea', 2500, 1200);
    // highway police: given, or one checkpoint on longer 4-lane roads
    const police = def.police || (this.lanes >= 4 && this.km >= 60 ? [{ km: this.km * 0.45, en: this.en || this.ref }] : []);
    this.police = police.map((p) => ({ ...p, s: this.sAtKm(p.km) }));
  }
}

export class Network {
  constructor() {
    this.nodes = {};
    for (const [id, n] of Object.entries(NODES)) this.nodes[id] = { ...n, id };
    const defs = [...ROADS];
    // every zilla town (and the big-city terminals) gets its bus terminal at the end of a short access road,
    // leading away from the highways that meet there. Trips start and end in these yards.
    for (const [id, n] of Object.entries(NODES)) {
      if (!n.term) continue;
      const here = project(n.lat, n.lon);
      // the terminal road goes off into the widest gap between the roads that meet here (straight on at a road end)
      const angs = [];
      for (const r of ROADS) {
        if (r.from !== id && r.to !== id) continue;
        const via = r.from === id ? [...(r.via || []), NODES[r.to]] : [...(r.via || [])].reverse().concat([NODES[r.from]]);
        const q = project(via[0].lat, via[0].lon).sub(here);
        angs.push(Math.atan2(q.y, q.x));
      }
      angs.sort((a, b) => a - b);
      let dirA = 0;
      if (angs.length === 1) dirA = angs[0] + Math.PI;
      else if (angs.length > 1) {
        let best = -1;
        for (let i = 0; i < angs.length; i++) {
          const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
          if (b - a > best) { best = b - a; dirA = (a + b) / 2; }
        }
      }
      // (or a compass bearing given in the data, where the widest gap is taken by something else)
      if (n.termDir !== undefined) { const b = (n.termDir * Math.PI) / 180; dirA = Math.atan2(-Math.cos(b), Math.sin(b)); }
      const mx = -Math.cos(dirA), mz = -Math.sin(dirA), ml = 1;
      const dist = LINK_KM * 1000 * MAP_SCALE / 1.1;
      const tp = unproject(here.x - (mx / ml) * dist, here.y - (mz / ml) * dist);
      const nm = (x) => x.split(' (')[0];
      const [tbn, ten] = Array.isArray(n.term) ? n.term : [`${nm(n.bn)} কেন্দ্রীয় বাস টার্মিনাল`, `${nm(n.en)} Central Bus Terminal`];
      const tid = `t:${id}`, lid = `L:${id}`;
      this.nodes[tid] = { id: tid, lat: tp.lat, lon: tp.lon, en: n.en, bn: n.bn, town: 0, kind: 'terminal', terminalOf: id, zilla: n.zilla, div: n.div,
        hills: n.hills, sea: n.sea, terminal: { en: ten, bn: tbn, road: lid, side: -1, big: DIV_HQ.has(n.zilla) } };
      defs.push({ id: lid, ref: '', lanes: 4, from: tid, to: id, via: [], km: LINK_KM, link: true, en: ten, bn: tbn });
    }
    this.roads = new Map();
    for (const def of defs) this.roads.set(def.id, new Chain(def, this.nodes));
    // adjacency: node -> [{ road, rev, to }]
    this.adj = new Map();
    for (const c of this.roads.values()) {
      if (!this.adj.has(c.from)) this.adj.set(c.from, []);
      if (!this.adj.has(c.to)) this.adj.set(c.to, []);
      this.adj.get(c.from).push({ road: c.id, rev: false, to: c.to });
      this.adj.get(c.to).push({ road: c.id, rev: true, to: c.from });
    }
    // the zillas a trip can start or end in: name -> { en, bn, div, terminals: [terminal node ids] }
    this.zillas = new Map();
    for (const n of Object.values(this.nodes)) {
      if (n.kind !== 'terminal') continue;
      const key = n.zilla;
      if (!this.zillas.has(key)) {
        const home = Object.values(NODES).find((x) => x.zilla === key && !/\(/.test(x.en)) || this.nodes[n.terminalOf];
        this.zillas.set(key, { key, en: key, bn: home.bn.split(' (')[0], div: n.div, terminals: [], lat: home.lat, lon: home.lon });
      }
      this.zillas.get(key).terminals.push(n.id);
    }
  }

  // the direction a road leaves `node` in (unit x, z), from its first stretch
  leaving(node, step) {
    const c = this.roads.get(step.road), st = c._stops;
    const seq = step.rev ? [...st].reverse() : st;
    const a = project(seq[0].lat, seq[0].lon), b = project(seq[1].lat, seq[1].lon);
    const d = b.sub(a), l = d.length() || 1;
    return [d.x / l, d.y / l];
  }
  // Free drive: from `node` (arriving along road `fromStep`), keep going the straightest way at every junction
  // for about `km` real km; never into a terminal yard, a ferry or back the way we came.
  straightOn(node, fromStep, km = 160) {
    const out = [];
    let at = node, prev = fromStep, left = km;
    const used = new Set([fromStep.road]);
    while (left > 0) {
      // the arriving direction = the reverse of how the previous road leaves this node
      const back = this.leaving(at, { road: prev.road, rev: !prev.rev });
      const hx = -back[0], hz = -back[1];
      let best = null, bd = -Infinity;
      for (const e of this.adj.get(at) || []) {
        const c = this.roads.get(e.road);
        if (used.has(e.road) || c.def.link || c.def.ferry) continue;
        const [dx, dz] = this.leaving(at, e);
        const dot = dx * hx + dz * hz + (c.lanes >= 4 ? 0.15 : 0);
        if (dot > bd) { bd = dot; best = e; }
      }
      if (!best) break;
      const step = { road: best.road, rev: best.rev };
      out.push(step); used.add(best.road);
      left -= this.roads.get(best.road).km;
      at = best.to; prev = step;
    }
    return out;
  }

  // The bus services (src/data/services.js) on their roads, both ways. byRoad: 'road:rev' -> [service]
  services(list) {
    if (this._svc) return this._svc;
    const all = [], byRoad = new Map();
    for (const [op, a, b] of list) {
      for (const [from, to] of [[a, b], [b, a]]) {
        const path = this.trip(from, to);
        if (!path) continue;
        const A = this.zillas.get(from), B = this.zillas.get(to);
        const idx = new Map(), stops = new Set();
        path.forEach((st, i) => {
          idx.set(st.road, { i, rev: st.rev });
          const n = this.nodes[st.rev ? this.roads.get(st.road).from : this.roads.get(st.road).to];
          if (n?.term) stops.add(n.zilla);
        });
        const svc = { op, from, to, bn: `${A.bn} ⇄ ${B.bn}`, en: `${from} – ${to}`, path, idx, stops };
        all.push(svc);
        for (const st of path) {
          const k = `${st.road}:${st.rev ? 1 : 0}`;
          if (!byRoad.has(k)) byRoad.set(k, []);
          byRoad.get(k).push(svc);
        }
      }
    }
    this._svc = { all, byRoad };
    return this._svc;
  }

  // shortest trip between two zillas (from any of their terminals): [{ road, rev }]
  // is (x, z) on any road of the network (or within `margin` of its embankment)? For the scenery: nothing is
  // built on a road, whether the trip uses it or not.
  nearAny(x, z, margin = 0, skip = null) {
    // (an interchange: its ramps and loops fill the whole circle)
    for (const ic of this.interchanges()) if (Math.hypot(x - ic.x, z - ic.z) < ic.R + margin) return true;
    const C = 120;
    if (!this._anyGrid) {
      this._anyGrid = new Map();
      for (const c of this.roads.values()) {
        if (c.def.ferry) continue;
        c.build();
        // (a terminal's access road has its walled yard beside it)
        const lim = c.def.link ? 70 : profileOf(c.lanes).half + ROAD.embank;
        for (let i = 0; i < c.N - 1; i += 4) {
          const j = Math.min(c.N - 1, i + 4);
          // (the last ~30 m at each end: the pad where roads meet is a little wider)
          const seg = [c.px[i], c.pz[i], c.px[j], c.pz[j], lim + (i * DS < 30 || (c.N - 1 - j) * DS < 30 ? 6 : 0), c.id];
          const pad = Math.max(40, seg[4] + 10);
          const x0 = Math.floor((Math.min(seg[0], seg[2]) - pad) / C), x1 = Math.floor((Math.max(seg[0], seg[2]) + pad) / C);
          const z0 = Math.floor((Math.min(seg[1], seg[3]) - pad) / C), z1 = Math.floor((Math.max(seg[1], seg[3]) + pad) / C);
          for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
            const k = a * 100003 + b;
            if (!this._anyGrid.has(k)) this._anyGrid.set(k, []);
            this._anyGrid.get(k).push(seg);
          }
        }
      }
    }
    const r = Math.ceil(Math.max(0, margin - 10) / C);         // (segments are filed with 40 m to spare)
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      for (const [ax, az, bx, bz, lim, id] of this._anyGrid.get((cx + a) * 100003 + cz + b) || []) {
        if (skip?.has(id)) continue;
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < lim + margin) return true;
      }
    }
    return false;
  }

  // the interchanges (world position of their centre node)
  interchanges() {
    return (this._ics ||= Object.entries(INTERCHANGES).filter(([n]) => this.nodes[n]).map(([node, d]) => {
      const p = project(this.nodes[node].lat, this.nodes[node].lon);
      return { node, x: p.x, z: p.y, R: d.R, data: d };
    }));
  }
  ic(node) { return this.interchanges().find((x) => x.node === node) || null; }

  // the river under every (non-elevated) bridge of every road, made once: drawn with whichever road's bridge is
  // built, and kept clear of trees and houses whichever trip is driven
  riverList() {
    if (this._rivers) return this._rivers;
    this._rivers = [];
    for (const c of this.roads.values()) {
      if (c.def.link || c.def.ferry) continue;
      c.build();
      for (const b of c.bridges) {
        if (b.elevated) continue;
        const i = Math.round(b.sc / DS), i0 = Math.max(0, i - 5), i1 = Math.min(c.N - 1, i + 5);
        const cx = c.px[i], cz = c.pz[i], l = Math.hypot(c.px[i1] - c.px[i0], c.pz[i1] - c.pz[i0]) || 1;
        const tx = (c.px[i1] - c.px[i0]) / l, tz = (c.pz[i1] - c.pz[i0]) / l, nx = -tz, nz = tx;
        const pts = [];
        for (let t = -3500; t <= 3500; t += 50) {
          const mw = Math.sin(t / 520) * 90 + Math.sin(t / 190) * 20, fall = Math.min(1, Math.abs(t) / 250);
          pts.push(new THREE.Vector3(cx + nx * t + tx * mw * fall, 0, cz + nz * t + tz * mw * fall));
        }
        this._rivers.push({ pts: this.trimRiver(pts, b.width, c.id), width: b.width, centre: new THREE.Vector3(cx, 0, cz), road: c.id, sc: b.sc });
      }
    }
    return this._rivers;
  }

  // A river runs out to both sides of its bridge; it stops (narrowing away) before it would reach any other road
  // or an interchange, since those have no bridge for it. pts: from one end to the other through the bridge.
  trimRiver(pts, width, ownRoad) {
    const n = pts.length, mid = (n - 1) / 2, skip = new Set([ownRoad]), clear = width / 2 + 30;
    // (a ferry's river: the roads coming down to its two ghats end at the water)
    const own = this.roads.get(ownRoad);
    if (own?.def.ferry) for (const nd of [own.from, own.to]) for (const e of this.adj.get(nd) || []) skip.add(e.road);
    let a = 0, b = n - 1;
    for (let i = Math.ceil(mid); i < n; i++) if (Math.abs(i - mid) * 50 > clear + 40 && this.nearAny(pts[i].x, pts[i].z, clear, skip)) { b = i - 1; break; }
    for (let i = Math.floor(mid); i >= 0; i--) if (Math.abs(i - mid) * 50 > clear + 40 && this.nearAny(pts[i].x, pts[i].z, clear, skip)) { a = i + 1; break; }
    const out = pts.slice(a, b + 1).map((p) => p.clone());
    // narrow away over the last ~400 m of each cut end
    const T = 8;
    out.forEach((p, i) => {
      const fromA = a > 0 ? i : 1e9, fromB = b < n - 1 ? out.length - 1 - i : 1e9;
      p.w = Math.min(1, 0.12 + Math.min(fromA, fromB) / T);
    });
    return out;
  }

  // real km of a path
  pathKm(path) { return path.reduce((a, st) => a + this.roads.get(st.road).km, 0); }

  // A trip from a point on a road (where the bus was left): at = { road, s (m from the road's `from` node), dir
  // (+1 = facing its `to` node) }. Goes on the way the bus faces, or turns round if that is clearly shorter.
  // toZilla null = free drive (straight on). Returns [{ road, rev, cut }, ...]; cut = metres of that road skipped.
  pathFromRoad(at, toZilla) {
    const c = this.road(at.road);
    if (!c) return null;
    const L = c.length, goals = toZilla ? this.zillas.get(toZilla)?.terminals || [] : null;
    const opt = (rev) => {
      const cut = THREE.MathUtils.clamp(rev ? L - at.s : at.s, 0, L - 90);
      const node = rev ? c.from : c.to, first = { road: c.id, rev, cut };
      const restKm = ((L - cut) / L) * c.km;
      if (!goals) return { path: [first, ...this.straightOn(node, first)], km: (rev ? 1 : 0) !== (at.dir < 0 ? 1 : 0) ? 9 : 0 };
      const rest = goals.includes(node) ? [] : this.path(node, goals, { avoid: new Set([c.id]) });
      if (!rest) return null;
      // turning round costs a little (find a U-turn), so the bus keeps going unless the other way is shorter
      return { path: [first, ...rest], km: restKm + this.pathKm(rest) + ((rev ? -1 : 1) !== (at.dir || 1) ? 6 : 0) };
    };
    const a = opt(false), b = opt(true);
    return (!a ? b : !b ? a : a.km <= b.km ? a : b)?.path || null;
  }

  trip(fromZilla, toZilla, opts) {
    const a = this.zillas.get(fromZilla), b = this.zillas.get(toZilla);
    if (!a || !b || a === b) return null;
    return this.path(a.terminals, b.terminals, opts);
  }

  road(id) { return this.roads.get(id)?.build(); }

  // Shortest path (by real km) from any of the start nodes to any of the goal nodes: [{ road, rev }]
  // opts.ferry: allow ferry crossings (default: yes, but a crossing counts as 40 km extra so bridges win);
  // opts.avoid: a Set of road ids not to use
  path(starts, goals, opts = {}) {
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
        if (c.def.ferry && opts.ferry === false) continue;
        if (opts.avoid?.has?.(e.road)) continue;
        // a terminal access road is only used at the ends of a trip, never as a short cut through a yard
        if (c.def.link && !starts.includes(e.to) && !goals.has(e.to) && !starts.includes(u) && !goals.has(u)) continue;
        // cost = time, roughly: expressways and flyovers are faster than town roads, a ferry adds its wait
        const nd = best + c.km * (c.def.expressway ? 0.72 : c.def.elevated ? 0.6 : c.lanes >= 4 ? 0.9 : 1) + (c.def.ferry ? 40 : 0);
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: u, step: { road: e.road, rev: e.rev } }); }
      }
    }
  }
}
