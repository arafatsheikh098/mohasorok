// Every other road of the network near the bus, whichever trip you are on: like a real map, a road does not
// vanish because your route does not use it. The trip's own roads (world/road.js) and the first stretch of the
// side roads at its junctions (world/junction.js) are built elsewhere; this builds the rest — the parts of
// every road not already covered — in ~500 m pieces within a few km of the bus, a little each frame, with a
// paved pad where roads meet away from the trip. Built from each road's own centreline, so it is exactly the
// road a later trip (or a turn) will drive.
import * as THREE from 'three';
import { ROAD, profileOf } from '../config.js';
import { Route } from '../route.js';
import { ribbon, roadMats, buildBridge, splitAround, medianRibbons } from './road.js';
import { disposeTree, sharedMats } from './stream.js';
import { ASPHALT_TILE, asphaltTexture2 } from '../textures.js';
import { buildInterchange } from './interchange.js';
import { terminalChunk } from './terminal.js';

const PIECE = 500;          // m of road per piece
const NEAR = 2800;          // build pieces closer than this to the bus
const FAR = 3600;           // take them down beyond this

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;
const padMat = sharedMats(() => ({ pad: new THREE.MeshStandardMaterial({ map: asphaltTexture2(false, false), roughness: 0.93 }) }));

export class NetRoads {
  constructor(net, scene) {
    this.net = net;
    this.root = new THREE.Group();
    this.root.name = 'netroads';
    scene.add(this.root);
    this.built = new Map();        // key -> group
    this.pieces = [];
    this.budget = 3;               // ms per frame
    this._t = 0;
  }

  // the single-road corridor of a road, in its own direction (shared with the junction stubs)
  _st(id) {
    const net = this.net;
    net._stubs ||= new Map();
    const key = `${id}:0`;
    let st = net._stubs.get(key);
    if (!st) { st = new Route(net, [{ road: id, rev: false }]); net._stubs.set(key, st); }
    return st;
  }

  // what the trip already builds; everything else becomes pieces
  setRoute(route) {
    const net = this.net, cover = new Map();
    const add = (id, a, b) => { if (!cover.has(id)) cover.set(id, []); cover.get(id).push([a, b]); };
    route.segs.forEach((g, i) => {
      const L = g.chain.length;
      // the whole road is the trip's (its ends lie under the junction pads), except what a trip that starts
      // part-way along its first road skips
      if (i === 0 && route.path[0].cut) { if (g.rev) add(g.road, 0, L - g.u0); else add(g.road, g.u0, L); }
      else add(g.road, 0, L);
    });
    const tripNodes = new Set(route.junctions.map((j) => j.node));
    for (const g of route.segs) { tripNodes.add(g.from); tripNodes.add(g.to); }
    for (const j of route.junctions) for (const b of j.branches) {
      const L = net.road(b.road).length;
      if (b.rev) add(b.road, Math.max(0, L - b.len), L); else add(b.road, 0, Math.min(L, b.len));
    }
    // roads meeting away from the trip: a pad over the meeting point
    const nodeHalf = new Map();
    const pieces = [];
    for (const c of net.roads.values()) {
      if (c.def.ferry) continue;
      c.build();
      const L = c.length;
      const cv = (cover.get(c.id) || []).sort((x, y) => x[0] - y[0]);
      const gaps = [];
      let at = 0;
      for (const [a, b] of cv) { if (a > at + 1) gaps.push([at, a]); at = Math.max(at, b); }
      if (at < L - 1) gaps.push([at, L]);
      const half = profileOf(c.lanes).half;
      for (let [a, b] of gaps) {
        // at an interchange: the road ends at the edge of its circle (the interchange is built on its own)
        const icA = a < 1 && net.ic(c.from), icB = b > L - 1 && net.ic(c.to);
        if (icA) a = Math.max(a, icA.R);
        if (icB) b = Math.min(b, L - icB.R);
        if (b - a < 4) continue;
        // ends at a node that is not the trip's: trimmed back to the node pad's rim
        // (a terminal's access road just ends in its yard)
        const isT = (n) => net.nodes[n]?.kind === 'terminal';
        const trimA = !icA && a < 1 && !tripNodes.has(c.from) && !isT(c.from), trimB = !icB && b > L - 1 && !tripNodes.has(c.to) && !isT(c.to);
        if (trimA) nodeHalf.set(c.from, Math.max(nodeHalf.get(c.from) || 0, half));
        if (trimB) nodeHalf.set(c.to, Math.max(nodeHalf.get(c.to) || 0, half));
        pieces.push({ c, a, b, trimA, trimB });
      }
    }
    // split into pieces with a centre and radius for the distance test
    this.pieces = [];
    for (const p of pieces) {
      const { c } = p;
      const rA = p.trimA ? padR(nodeHalf.get(c.from)) : 0, rB = p.trimB ? padR(nodeHalf.get(c.to)) : 0;
      const half = profileOf(c.lanes).half;
      const a = p.a + (rA ? Math.sqrt(Math.max(0, rA * rA - half * half)) - 1 : 0);
      const b = p.b - (rB ? Math.sqrt(Math.max(0, rB * rB - half * half)) - 1 : 0);
      if (b - a < 4) continue;
      const n = Math.max(1, Math.round((b - a) / PIECE));
      for (let k = 0; k < n; k++) {
        const s0 = a + ((b - a) * k) / n, s1 = a + ((b - a) * (k + 1)) / n;
        const i = Math.min(c.N - 1, Math.round((s0 + s1) / 2 / 2));
        this.pieces.push({ key: `${c.id}:${s0.toFixed(1)}:${s1.toFixed(1)}`, id: c.id, s0, s1, x: c.px[i], z: c.pz[i], r: (s1 - s0) / 2 + 20, ga: p.a, gb: p.b });
      }
    }
    // every zilla's bus terminal (its yard beside the end of its access road), except the trip's own
    const own = new Set(route.segs.map((g) => g.road));
    for (const n of Object.values(net.nodes)) {
      if (n.kind !== 'terminal' || own.has(n.terminal?.road)) continue;
      const c = net.road(n.terminal.road);
      if (!c) continue;
      const i = c.from === n.id ? Math.min(c.N - 1, 50) : Math.max(0, c.N - 51);
      this.pieces.push({ key: `term:${n.id}`, term: c.id, x: c.px[i], z: c.pz[i], r: 160 });
    }
    // the interchanges themselves, always
    for (const ic of net.interchanges()) this.pieces.push({ key: `ic:${ic.node}`, ic: ic.node, x: ic.x, z: ic.z, r: ic.R });
    for (const [node, half] of nodeHalf) {
      const v = net.nodes[node], P = this._nodeXZ(node);
      if (!v || !P) continue;
      this.pieces.push({ key: `n:${node}:${padR(half)}`, node, R: padR(half), x: P[0], z: P[1], r: padR(half) });
    }
    // what is no longer wanted (the trip now builds it, or it changed shape) goes at once
    const keys = new Set(this.pieces.map((p) => p.key));
    for (const [k, g] of this.built) if (!keys.has(k)) this._drop(k, g);
    this._todo = null;
  }

  _nodeXZ(node) {
    for (const c of this.net.roads.values()) {
      if (c.def.link || c.def.ferry || !c.built) continue;
      if (c.from === node) return [c.px[0], c.pz[0]];
      if (c.to === node) return [c.px[c.N - 1], c.pz[c.N - 1]];
    }
    return null;
  }

  _drop(k, g) {
    if (this._cur?.p.key === k) this._cur = null;
    this.root.remove(g); disposeTree(g); this.built.delete(k);
  }

  // build a piece (a generator: the work is spread over frames; see update)
  *_make(p) {
    const g = new THREE.Group();
    this.root.add(g);
    this.built.set(p.key, g);
    if (p.term) {
      // a zilla's bus terminal: the same yard a trip starting or ending there drives into
      const st = this._st(p.term), ctx = { in: () => true, lite: true, scene: g, chunks: { register() {} }, obstacles: [], gates: [], onDispose() {} };
      yield* terminalChunk(st, ctx);
      return;
    }
    const M = roadMats();
    const addM = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); };
    if (p.ic) {
      g.add(buildInterchange(this.net, p.ic));
    } else if (p.node) {
      // a pad where roads meet
      let h = ROAD.height ?? 0;
      for (const c of this.net.roads.values()) {
        if (c.def.link || c.def.ferry || (c.from !== p.node && c.to !== p.node)) continue;
        const st = this._st(c.id);
        h = Math.max(h, st.roadHeight(c.from === p.node ? 1 : st.length - 1));
      }
      const geo = new THREE.CircleGeometry(p.R, 40);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * p.R) / ASPHALT_TILE, uv.getY(i) * (2 * p.R) / ASPHALT_TILE);
      const pad = new THREE.Mesh(geo, padMat().pad);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(p.x, h + 0.005, p.z);
      pad.receiveShadow = true;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(p.R, p.R + ROAD.embank, h, 40, 1, true), M.grass);
      skirt.position.set(p.x, h / 2 - 0.02, p.z);
      g.add(pad, skirt);
    } else {
      const st = this._st(p.id), a = p.s0, e = p.s1;
      const P = st.prof((a + e) / 2), Mh = P.median, H = P.half;
      if (P.two) addM(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), M.asphalt2);
      else {
        const am = P.lanes === 3 ? M.asphalt6 : M.asphalt;
        addM(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 1 }, { d: -Mh, y: R(0), u: 0 }], ASPHALT_TILE), am);
        addM(ribbon(st, a, e, 4, [{ d: Mh, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), am);
        if (e - a > 8) medianRibbons(st, a, e, P, addM, M);
      }
      // bridges wholly in this stretch of road (and their rivers); embankments elsewhere
      // (a bridge reaching into what the trip or a junction builds is built there)
      const bridges = st.bridges.filter((x) => x.s1 > a && x.s0 < e);
      const own = bridges.filter((x) => x.sc >= a && x.sc < e && x.s0 - ROAD.rampLen >= p.ga - 1 && x.s1 + ROAD.rampLen <= p.gb + 1);
      for (const [p0, p1] of splitAround(bridges, a, e)) {
        addM(ribbon(st, p0, p1, 4, [{ d: -H - ROAD.embank, y: G(0), u: 0 }, { d: -H, y: R(0), u: 2 }], 3), M.grass);
        addM(ribbon(st, p0, p1, 4, [{ d: H, y: R(0), u: 0 }, { d: H + ROAD.embank, y: G(0), u: 2 }], 3), M.grass);
      }
      const ctx = { scene: g, chunks: { register() {} } };
      for (const x of own) {
        if (!x.elevated && !x.river) x.river = this.net.riverList().find((rv) => rv.road === p.id && Math.abs(rv.sc - x.sc) < 6) || null;
        buildBridge(st, ctx, M, x);
      }
    }
  }

  _wanted(x, z) {
    return this.pieces.filter((p) => !this.built.has(p.key) && Math.hypot(p.x - x, p.z - z) - p.r < NEAR)
      .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z));
  }

  // build everything near (x, z) now (loading, teleports)
  buildNow(x, z) {
    if (this._cur) { for (const _ of this._cur.gen); this._cur = null; }
    // (terminals off the trip come in over the next frames: they are not needed to start driving)
    for (const p of this._wanted(x, z)) if (!p.term) for (const _ of this._make(p));
    this._trim(x, z);
  }

  _trim(x, z) {
    const byKey = new Map(this.pieces.map((p) => [p.key, p]));
    for (const [k, g] of [...this.built]) {
      const p = byKey.get(k);
      if (!p || Math.hypot(p.x - x, p.z - z) - p.r > FAR) this._drop(k, g);
    }
  }

  update(x, z, dt) {
    this._t -= dt;
    if (this._t <= 0 || !this._todo) { this._t = 0.5; this._todo = this._wanted(x, z); this._trim(x, z); }
    const t0 = performance.now();
    while (performance.now() - t0 < this.budget) {
      if (!this._cur) {
        const p = this._todo.shift();
        if (!p) break;
        if (this.built.has(p.key)) continue;
        this._cur = { p, gen: this._make(p) };
      }
      if (this._cur.gen.next().done) this._cur = null;
    }
  }

  disposeAll() { for (const [k, g] of [...this.built]) this._drop(k, g); }
}

const padR = (half) => half + 6;
