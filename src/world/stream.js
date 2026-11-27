// World streaming: the roadside world is built in CHUNK-long blocks around the bus, a little at a time each
// frame, and blocks far behind (or far ahead after a turn) are taken down again. So only ~8 km of world exists
// at any moment, however long the trip, and a long trip loads as fast as a short one.
//
// A block is built by `jobs`: generator functions (route, ctx) that build everything whose anchor s lies in
// [ctx.s0, ctx.s1) and `yield` between pieces, so one frame never does more than its time budget.
//   ctx.scene.add(obj)               add to the block (removed with it)
//   ctx.chunks.register(obj, s, r)   distance culling, as before
//   ctx.obstacles.push(o) / ctx.gates.push(g)   solid things / toll gates, removed with the block
//   ctx.onDispose(fn)                called when the block is taken down
import * as THREE from 'three';
import { CHUNK } from '../config.js';

// Materials, textures and geometries that many blocks share: never disposed with a block.
export const SHARED = new WeakSet();
export function share(x) {
  if (!x) return x;
  if (x.isMaterial || x.isTexture || x.isBufferGeometry) {
    SHARED.add(x);
    if (x.isMaterial) for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap', 'bumpMap', 'metalnessMap']) if (x[k]) SHARED.add(x[k]);
  } else if (Array.isArray(x)) x.forEach(share);
  else if (typeof x === 'object') Object.values(x).forEach(share);
  return x;
}
// a lazily made, shared set of materials: const M = sharedMats(() => ({ ... }))
export function sharedMats(make) { let m = null; return () => (m ||= share(make())); }

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (SHARED.has(m)) continue;
      for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap', 'bumpMap', 'metalnessMap']) {
        const t = m[k];
        if (t && !SHARED.has(t)) t.dispose();
      }
      m.dispose();
    }
  });
}

export class Stream {
  // ahead / behind: metres around the bus that must be built; keep: blocks further than this are taken down
  constructor({ route, scene, chunks, obstacles, gates, jobs, ahead = 4000, behind = 1800, keep = 5600 }) {
    Object.assign(this, { route, scene, chunks, obstacles, gates, jobs, ahead, behind, keep });
    this.n = Math.ceil(route.length / CHUNK);
    this.blocks = new Map();       // chunk index -> block
    this.stale = new Map();        // blocks of the previous corridor, still shown until their replacement is built
    this.queue = null;             // block being built: { c, gen }
    this.budget = 4;               // ms per frame
  }

  _block(c) {
    const root = new THREE.Group();
    root.name = `block${c}`;
    this.scene.add(root);
    const b = { c, root, obstacles: [], gates: [], hooks: [], done: false };
    const self = this;
    b.ctx = {
      c, s0: c * CHUNK, s1: Math.min(this.route.length, (c + 1) * CHUNK) + (c === this.n - 1 ? 1 : 0),
      scene: root,
      chunks: { register: (o, s, r) => self.chunks.register(o, s, r, c) },
      obstacles: { push: (...o) => { b.obstacles.push(...o); self.obstacles.push(...o); } },
      gates: { push: (...g) => { b.gates.push(...g); self.gates.push(...g); } },
      onDispose: (fn) => b.hooks.push(fn),
      in(s) { return s >= this.s0 && s < this.s1; },
    };
    b.gen = this._run(b);
    this.blocks.set(c, b);
    return b;
  }
  *_run(b) {
    for (const job of this.jobs) yield* job(this.route, b.ctx);
    b.done = true;
    const old = this.stale.get(b.c);
    if (old) this._disposeStale(old);
  }

  // The trip turned onto another road at fromS: everything before it is the same road (keep it), everything
  // after it is rebuilt for the new corridor. The old blocks stay on screen until the new ones are ready, so
  // nothing flickers; their solid parts and toll gates go at once.
  setRoute(route, fromS) {
    this.route = route;
    this.n = Math.ceil(route.length / CHUNK);
    const c0 = Math.max(0, Math.floor((fromS - 80) / CHUNK));
    for (const b of [...this.blocks.values()]) {
      if (b.c < c0) continue;
      if (b === this.queue) this.queue = null;
      this._dropGameplay(b);
      this.blocks.delete(b.c);
      if (!b.done || this.stale.has(b.c)) { this._final(b); continue; }    // half built: just remove it
      this.chunks.retag(b.c, `stale${b.c}`);
      this.stale.set(b.c, b);
    }
  }
  _dropGameplay(b) {
    const drop = (arr, list) => { if (!list.length) return; const set = new Set(list); for (let i = arr.length - 1; i >= 0; i--) if (set.has(arr[i])) arr.splice(i, 1); };
    drop(this.obstacles, b.obstacles); drop(this.gates, b.gates);
    b.obstacles = []; b.gates = [];
  }
  _final(b, tag = b.c) {
    for (const fn of b.hooks) fn();
    this.chunks.drop(tag);
    this.scene.remove(b.root);
    disposeTree(b.root);
  }
  _disposeStale(b) { this.stale.delete(b.c); this._final(b, `stale${b.c}`); }

  _dispose(b) {
    if (b === this.queue) this.queue = null;
    this._dropGameplay(b);
    this._final(b);
    this.blocks.delete(b.c);
  }

  // which blocks are wanted around s for a bus heading `dir` (+1 = towards larger s)
  _wanted(s, dir) {
    const a = dir >= 0 ? s - this.behind : s - this.ahead, b = dir >= 0 ? s + this.ahead : s + this.behind;
    const c0 = Math.max(0, Math.floor(a / CHUNK)), c1 = Math.min(this.n - 1, Math.floor(b / CHUNK));
    // nearest first
    const cs = [];
    for (let c = c0; c <= c1; c++) cs.push(c);
    cs.sort((x, y) => Math.abs((x + 0.5) * CHUNK - s) - Math.abs((y + 0.5) * CHUNK - s));
    return cs;
  }

  // build everything around s right now (loading screen, teleports)
  buildNow(s, dir = 1) {
    for (const c of this._wanted(s, dir)) {
      const b = this.blocks.get(c) || this._block(c);
      while (!b.done) b.gen.next();
    }
    this.queue = null;
    this._trim(s);
  }

  _trim(s) {
    for (const b of [...this.blocks.values()]) if (Math.abs((b.c + 0.5) * CHUNK - s) > this.keep + CHUNK / 2) this._dispose(b);
    for (const b of [...this.stale.values()]) if (b.c >= this.n || Math.abs((b.c + 0.5) * CHUNK - s) > this.keep + CHUNK / 2) this._disposeStale(b);
  }

  update(s, dir = 1) {
    this._trim(s);
    const t0 = performance.now();
    while (performance.now() - t0 < this.budget) {
      if (!this.queue || this.queue.done) {
        const c = this._wanted(s, dir).find((k) => !this.blocks.has(k) || !this.blocks.get(k).done);
        if (c === undefined) { this.queue = null; return; }
        this.queue = this.blocks.get(c) || this._block(c);
      }
      this.queue.gen.next();
    }
  }

  // everything still to build near s (for a loading bar)
  pending(s, dir = 1) { return this._wanted(s, dir).filter((c) => !this.blocks.get(c)?.done).length; }

  disposeAll() {
    for (const b of [...this.blocks.values()]) this._dispose(b);
    for (const b of [...this.stale.values()]) this._disposeStale(b);
  }
}
