// Interchanges (data/interchanges.js): a real multi-level junction, e.g. the Bhanga cloverleaf (ভাঙ্গা গোলচত্বর):
// one-way carriageways, loops and ramps, the flyover in the middle, lamps all round. The whole thing is built here
// as one model (whichever trip you are on); a trip through it follows the carriageways of its movement — over the
// flyover, round a loop, along a ramp — see Route._centreline. Roads end at the edge of its circle.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { ribbon, roadMats, buildBridge, streetGlowMat } from './road.js';
import { ASPHALT_TILE } from '../textures.js';

const DS = 2;
// a one-way carriageway (2 lanes + shoulders) relative to its own centre line: d > 0 is the median side
const IN = 3.6, OUT = -(3.6 + 2.0);

// A smooth path through [x, z, h] points with the corridor's API (pointAt, roadHeight, tangentAt, yawAt, prof),
// so the road builders (ribbon, buildBridge) can lay a carriageway along it.
export class PathRoad {
  constructor(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z, h]) => new THREE.Vector3(x, h, z)), false, 'centripetal');
    const L = curve.getLength(), n = Math.max(2, Math.round(L / DS));
    const P = curve.getSpacedPoints(n);
    this.N = P.length;
    this.px = P.map((p) => p.x); this.pz = P.map((p) => p.z); this.h = P.map((p) => p.y);
    const acc = [0];
    for (let i = 1; i < this.N; i++) acc.push(acc[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.pz[i] - this.pz[i - 1]));
    this.acc = acc;
    this.length = acc[this.N - 1];
    this.P = { half: -OUT, two: true, lanes: 1, median: 0 };
  }
  _i(s) {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let lo = 0, hi = this.N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.acc[m] <= s) lo = m; else hi = m; }
    return [lo, (s - this.acc[lo]) / Math.max(1e-6, this.acc[hi] - this.acc[lo])];
  }
  tangentAt(s) {
    const [i] = this._i(s), a = Math.max(0, i - 1), b = Math.min(this.N - 1, i + 2);
    const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
  yawAt(s) { const [tx, tz] = this.tangentAt(s); return Math.atan2(tx, tz); }
  pointAt(s, d = 0, out = new THREE.Vector3()) {
    const [i, f] = this._i(s), j = Math.min(this.N - 1, i + 1);
    const [tx, tz] = this.tangentAt(s);
    const x = this.px[i] + (this.px[j] - this.px[i]) * f, z = this.pz[i] + (this.pz[j] - this.pz[i]) * f;
    return out.set(x - tz * d, this.roadHeight(s), z + tx * d);
  }
  roadHeight(s) { const [i, f] = this._i(s), j = Math.min(this.N - 1, i + 1); return ROAD.baseHeight + this.h[i] + (this.h[j] - this.h[i]) * f; }
  prof() { return this.P; }
  halfAt() { return this.P.half; }
}

// world-space version of an interchange (cached on the network)
export function icWorld(net, node) {
  const ic = net.ic(node);
  if (!ic) return null;
  if (ic.world) return ic.world;
  const { x: cx, z: cz, data } = ic;
  const W = (p) => [cx + p[0], cz + p[1], p[2]];
  ic.world = {
    ...ic,
    ways: data.ways.map((w) => ({ link: w.link, bridge: w.bridge, pts: w.p.map(W) })),
    moves: Object.fromEntries(Object.entries(data.moves).map(([k, p]) => [k, p.map(W)])),
  };
  return ic.world;
}

// The corridor centreline through the interchange for the movement inRoad -> outRoad: the path of the
// carriageway, shifted K to the right (the corridor's left carriageway centre lies at d = -K), with heights.
// Returns [{ x, z, h }] from the edge on inRoad's side to the edge on outRoad's side, or null.
export function icMove(net, node, inRoad, outRoad) {
  const w = icWorld(net, node);
  const pts = w?.moves[`${inRoad}>${outRoad}`];
  if (!pts) return null;
  const pr = new PathRoad(pts), K = w.data.K, out = [];
  for (let i = 0; i < pr.N; i++) {
    const s = pr.acc[i], [tx, tz] = pr.tangentAt(s);
    out.push({ x: pr.px[i] - tz * K, z: pr.pz[i] + tx * K, h: pr.h[i] });
  }
  return out;
}

// the carriageway path (no shift) of a movement, as a PathRoad (for "which ramp is the bus on")
export function icMovePath(net, node, inRoad, outRoad) {
  const w = icWorld(net, node);
  w._paths ||= new Map();
  const key = `${inRoad}>${outRoad}`;
  if (!w._paths.has(key) && w.moves[key]) w._paths.set(key, new PathRoad(w.moves[key]));
  return w._paths.get(key) || null;
}

const lampGeo = new THREE.CylinderGeometry(0.08, 0.11, 10, 6);
const armGeo = new THREE.BoxGeometry(1.6, 0.1, 0.1);
const headGeo = new THREE.BoxGeometry(0.8, 0.18, 0.35);

// the whole interchange: every carriageway and ramp with its embankment, the flyover decks on piers, lamps
export function buildInterchange(net, node) {
  const w = icWorld(net, node);
  const M = roadMats();
  const g = new THREE.Group();
  g.name = `ic:${node}`;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); return m; };
  const R = (dy) => (s, h) => h + dy, G = (y) => () => y;
  const ctx = { scene: g, chunks: { register() {} } };
  const lamps = [];
  const paths = w.ways.map((way) => new PathRoad(way.pts));
  w.ways.forEach((way, wi) => {
    const pr = paths[wi], L = pr.length;
    if (L < 2) return;
    // (ramps sit a hair above the carriageways they leave and join, so the two surfaces never flicker)
    const lift = way.link ? 0.035 : 0;
    add(ribbon(pr, 0, L, 2, [{ d: OUT, y: R(lift), u: 1 }, { d: IN, y: R(lift), u: 0 }], ASPHALT_TILE), M.asphalt);
    if (way.bridge) {
      // the flyover over the N8: a deck on piers (no earth under it), centred on the carriageway's asphalt
      const mid = (IN + OUT) / 2, deck = [];
      for (let i = 0; i < pr.N; i++) { const p = pr.pointAt(pr.acc[i], mid); deck.push([p.x, p.z, p.y - ROAD.baseHeight]); }
      const pb = new PathRoad(deck);
      pb.P = { half: (IN - OUT) / 2, two: true, lanes: 1, median: 0 };
      const pierOk = (x, z) => !paths.some((q, qi) => {
        if (qi === wi || w.ways[qi].bridge || q.length < 2) return false;
        for (let i = 0; i < q.N; i += 2) if (Math.hypot(q.px[i] - x, q.pz[i] - z) < 9) return true;
        return false;
      });
      buildBridge(pb, ctx, M, { s0: 0, s1: pb.length, sc: pb.length / 2, en: 'Bhanga Interchange', bn: 'ভাঙ্গা ইন্টারচেঞ্জ', pierOk });
    } else {
      // earth embankments, as wide as the ramp is high (the real ones are earth, not concrete)
      const run = (s, h) => Math.max(ROAD.embank, (h - 0) * 1.6);
      add(ribbon(pr, 0, L, 4, [{ d: (s) => OUT - run(s, pr.roadHeight(s)), y: G(0), u: 0 }, { d: OUT, y: R(lift - 0.02), u: 2 }], 3), M.grass);
      add(ribbon(pr, 0, L, 4, [{ d: IN, y: R(lift - 0.02), u: 0 }, { d: (s) => IN + run(s, pr.roadHeight(s)), y: G(0), u: 2 }], 3), M.grass);
    }
    // lamps along the outer edge ("like a flower in bloom" at night)
    for (let s = 12; s < L - 6; s += 34) lamps.push([pr, s]);
  });
  // (no lamp where its post would stand on another carriageway, e.g. where a ramp runs into the main road)
  const onOther = (pr, x, z) => paths.some((q) => {
    if (q === pr || q.length < 2) return false;
    for (let i = 0; i < q.N; i += 3) if (Math.hypot(q.px[i] - x, q.pz[i] - z) < 7.5) return true;
    return false;
  });
  for (const [pr, s] of lamps) {
    const p = pr.pointAt(s, OUT - 0.6), yaw = pr.yawAt(s), h = pr.roadHeight(s);
    if (onOther(pr, p.x, p.z)) continue;
    const pole = add(lampGeo, M.lamp);
    pole.position.set(p.x, h + 5, p.z);
    const arm = add(armGeo, M.lamp);
    const q = pr.pointAt(s, OUT + 0.2);
    arm.position.set(q.x, h + 9.9, q.z);
    arm.rotation.y = yaw + Math.PI / 2;
    const hd = add(headGeo, streetGlowMat);
    const r = pr.pointAt(s, OUT + 0.9);
    hd.position.set(r.x, h + 9.8, r.z);
    hd.rotation.y = yaw + Math.PI / 2;
  }
  return g;
}
