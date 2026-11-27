// Junctions (মোড় / চৌরাস্তা): where the trip's road meets other roads. A flat paved pad over the meeting point,
// the first stretch of every other road branching off (built from that road's own centreline, so it is the
// same road a later trip will drive), and green direction boards before the junction on both carriageways.
import * as THREE from 'three';
import { ROAD, PROFILE } from '../config.js';
import { Route } from '../route.js';
import { ribbon, roadMats, buildBridge, splitAround, medianRibbons } from './road.js';
import { sharedMats } from './stream.js';
import { directionSignTexture, ASPHALT_TILE, asphaltTexture2 } from '../textures.js';

export const STUB_LEN = 1400;        // m of each branch road built at a junction

const jMats = sharedMats(() => {
  const m = roadMats();
  const off = (mat, f) => { const c = mat.clone(); c.polygonOffset = true; c.polygonOffsetFactor = f; c.polygonOffsetUnits = f; return c; };
  return {
    pad: off(new THREE.MeshStandardMaterial({ map: asphaltTexture2(false, false), roughness: 0.93 }), -2), stub: off(m.asphalt, -1), stub2: off(m.asphalt2, -1), stub6: off(m.asphalt6, -1), grass: m.grass, median: m.median, curb: m.curb,
    back: new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }),
    leg: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.4 }),
    stop: new THREE.MeshStandardMaterial({ color: 0xe9e8e2, roughness: 0.8 }),
  };
});

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;
const nm = (x, k) => x[k].split(' (')[0];

// ---------------------------------------------------------------- the paved junction itself
// Shaped like a real crossroads, not a disc: every road's mouth, and between two neighbouring roads a kerb
// that curves from one road's edge round to the next one's. Triangles fanned out from the node (cx, cz);
// pieces may overlap, which never shows: one material, texture coordinates from world x, z.
// legs: [{ x, z: the centre of the road's mouth, ux, uz: unit vector along the road away from the node, H: half width }]
// strips: [[[xl, zl], [xr, zr]], ...] rows across a road that runs through (the trip's own curve over the junction)
export function padGeometry(cx, cz, legs, strips = []) {
  const P2 = PROFILE[2];
  const pos = [];
  const tri = (a, b, c) => {
    // (facing up)
    if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
    pos.push(a[0], 0, a[1], b[0], 0, b[1], c[0], 0, c[1]);
  };
  const C = [cx, cz];
  const L = legs.map((l) => {
    const px = -l.uz * l.H, pz = l.ux * l.H;            // towards the side with the larger angle round the node
    return { ...l, th: Math.atan2(l.z - cz, l.x - cx), hi: [l.x + px, l.z + pz], lo: [l.x - px, l.z - pz] };
  }).sort((a, b) => a.th - b.th);
  for (const l of L) tri(C, l.lo, l.hi);
  for (let i = 0; i < L.length && L.length > 1; i++) {
    const A = L[i], B = L[(i + 1) % L.length];
    let gap = B.th - A.th;
    if (gap <= 0) gap += 2 * Math.PI;
    const P = A.hi, Q = B.lo;
    // the kerb: a curve leaving A's edge towards the node and turning onto B's edge, with its corner where the
    // two edges (extended) cross
    const ax = -A.ux, az = -A.uz, bx = -B.ux, bz = -B.uz, wx = Q[0] - P[0], wz = Q[1] - P[1];
    const det = -ax * bz + az * bx;
    let ctrl = null;
    if (Math.abs(det) > 1e-4) {
      const t = (wx * -bz + wz * bx) / det, s = (ax * wz - az * wx) / det;
      const dP = Math.hypot(P[0] - cx, P[1] - cz), dQ = Math.hypot(Q[0] - cx, Q[1] - cz);
      if (t > 0 && s > 0 && t < dP + 2 && s < dQ + 2) ctrl = [P[0] + ax * t, P[1] + az * t];
    }
    const n = 14, pts = [];
    if (ctrl && gap <= 2.6) {
      for (let k = 0; k <= n; k++) {
        const t = k / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
        pts.push([a * P[0] + b * ctrl[0] + c * Q[0], a * P[1] + b * ctrl[1] + c * Q[1]]);
      }
    } else if (gap > 0.35) {
      // (roads far apart round the node, e.g. the straight side of a T: the kerb runs along the roads' edges,
      // past the node)
      const ba = A.th + gap / 2, hb = Math.min(A.H, B.H) / Math.max(0.5, Math.sin(Math.min(gap, 2 * Math.PI - gap, Math.PI) / 2));
      pts.push(P, [cx + Math.cos(ba) * hb, cz + Math.sin(ba) * hb], Q);
    } else pts.push(P, Q);
    for (let k = 0; k < pts.length - 1; k++) tri(C, pts[k], pts[k + 1]);
  }
  for (let i = 0; i < strips.length - 1; i++) {
    const [a, b] = strips[i], [c, d] = strips[i + 1];
    tri(a, b, c); tri(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(pos), uv = new Float32Array((pos.length / 3) * 2), nrm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = P[i * 3] / (2 * P2.half);
    uv[i * 2 + 1] = P[i * 3 + 2] / ASPHALT_TILE;
    nrm[i * 3 + 1] = 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// the leg of a road at its mouth `s` metres along corridor `st` (dir +1: the road leaves the node towards larger s)
export function legAt(st, s, dir) {
  const [x, z] = st._xz(s, 0), [tx, tz] = st.tangentAt(s);
  return { x, z, ux: tx * dir, uz: tz * dir, H: st.halfAt(s) };
}

// a flat grass top round the junction (between the roads, at road level) and its slope down to the fields
export function padGround(cx, cz, h, r, grassMat) {
  const g = new THREE.Group();
  const top = new THREE.CircleGeometry(r, 40);
  const p = top.attributes.position, uv = top.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + p.getX(i)) / 3, (cz - p.getY(i)) / 3);
  const m = new THREE.Mesh(top, grassMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, h - 0.06, cz);
  m.receiveShadow = true;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r, r + ROAD.embank, h, 40, 1, true), grassMat);
  skirt.position.set(cx, h / 2 - 0.06, cz);
  skirt.receiveShadow = true;
  g.add(m, skirt);
  return g;
}

// a white stop line across the carriageway coming in to the junction, just outside its mouth
// (leg as legAt; two: an undivided road, whose incoming half is right of the centre line as seen leaving)
export function stopLine(leg, median, two, h, mat) {
  const w = leg.H - (two ? 0.3 : median + 0.2) - 0.4;
  if (w < 1) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.45), mat);
  // across the road, 2 m out from the mouth, on the incoming side (right of the direction leaving the node)
  const rx = -leg.uz, rz = leg.ux;                      // right of "leaving", in this x/z frame
  const off = (two ? 0.3 : median + 0.2) + w / 2;
  m.position.set(leg.x + leg.ux * 2 + rx * off, h + 0.045, leg.z + leg.uz * 2 + rz * off);
  m.rotation.set(-Math.PI / 2, 0, Math.atan2(-leg.ux, -leg.uz));
  return m;
}

// Branch roads: their centrelines (as small one-road corridors, cached on the network) and the lines the
// scenery keeps clear of. Call once per trip corridor.
export function initJunctions(route, net) {
  net._stubs ||= new Map();
  route.branchLines = [];
  for (const j of route.junctions) {
    for (const b of j.branches) {
      const key = `${b.road}:${b.rev ? 1 : 0}`;
      let st = net._stubs.get(key);
      if (!st) { st = new Route(net, [{ road: b.road, rev: b.rev }]); net._stubs.set(key, st); }
      b.stub = st;
      b.len = Math.max(40, Math.min(STUB_LEN, st.length - 20));
      // a bridge close to the junction: build the side road on over it and its ramps (never stop half way up)
      b.bridges = st.bridges.filter((x) => x.s0 - ROAD.rampLen < b.len);
      for (const x of b.bridges) b.len = Math.min(st.length - 20, Math.max(b.len, x.s1 + ROAD.rampLen + 80));
      b.pts = [];
      for (let s = 0; s <= b.len; s += 10) b.pts.push(st._xz(s, 0));
      const far = net.nodes[b.to];
      b.target = far.kind === 'terminal' ? { bn: 'বাস টার্মিনাল', en: 'Bus Terminal', terminal: true } : { bn: nm(far, 'bn'), en: nm(far, 'en') };
      b.km = Math.max(1, Math.round(st.totalKm));
      route.branchLines.push({ j, b });
    }
  }
  // is (x, z) on (or within `margin` of the embankment of) a branch road?
  route.nearBranch = (x, z, margin = 0) => {
    for (const { j, b } of route.branchLines) {
      const lim = b.stub.prof(10).half + ROAD.embank;
      if (Math.hypot(x - j.x, z - j.z) > b.len + lim + margin + 20) continue;
      const L = lim + margin;
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [ax, az] = b.pts[i], [bx, bz] = b.pts[i + 1];
        const abx = bx - ax, abz = bz - az;
        const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
        if (Math.hypot(ax + abx * t - x, az + abz * t - z) < L) return true;
      }
    }
    return false;
  };
}

// a direction board on a post, facing traffic on `side` (-1 = driving towards larger s)
function board(route, s, d, side, tex, w, M) {
  const g = new THREE.Group();
  const p = route.pointAt(s, d);
  g.position.set(p.x, route.roadHeight(s), p.z);
  g.rotation.y = route.yawAt(s) + (side < 0 ? Math.PI : 0);
  const h = w * (tex.image.height / tex.image.width), lift = 2.4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  panel.position.y = lift + h / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), M.back);
  back.position.set(0, panel.position.y, -0.06);
  g.add(panel, back);
  for (const x of [-w / 3, w / 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, lift + h, 8), M.leg);
    leg.position.set(x, (lift + h) / 2 - 0.4, -0.1);
    g.add(leg);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// which way a branch leaves, as the driver approaching on `side` sees it
function arrowFor(route, j, b, side, at = j.s) {
  const [tx, tz] = route.tangentAt(at);
  const hx = tx * -side, hz = tz * -side;                 // driving direction
  const k = Math.min(8, b.pts.length - 1);
  const dx = b.pts[k][0] - j.x, dz = b.pts[k][1] - j.z, l = Math.hypot(dx, dz) || 1;
  const fwd = (dx * hx + dz * hz) / l, right = (dx * -hz + dz * hx) / l;
  if (fwd > 0.9) return '↑';
  if (fwd < -0.6) return right > 0 ? '↘' : '↙';
  return right > 0 ? '→' : '←';
}

export function* junctionChunk(route, ctx) {
  if (!route.junctions?.length) return;
  const M = jMats();
  for (const j of route.junctions) {
    if (!ctx.in(j.s)) continue;
    const g = new THREE.Group();
    const h = route.roadHeight(j.s);
    // (an interchange has no pad: world/interchange.js builds it, the side roads start at the edge of its circle)
    if (!j.ic) {
      // the paved junction: the trip's road through it, every road's mouth, kerbs curving between them;
      // a flat grass top between the roads and a slope down to the fields
      const legs = [legAt(route, j.sA, -1), legAt(route, j.sB, 1), ...j.branches.map((b) => legAt(b.stub, j.m, 1))];
      const strip = [];
      for (let s = j.sA; s < j.sB + 1.9; s += 2) { const q = Math.min(s, j.sB), H = route.halfAt(q); strip.push([route._xz(q, -H), route._xz(q, H)]); }
      const pad = new THREE.Mesh(padGeometry(j.x, j.z, legs, strip), M.pad);
      pad.position.y = h + 0.03;                   // (the log depth buffer ignores polygon offset: lift it clear of the roads under it)
      pad.receiveShadow = true;
      g.add(pad, padGround(j.x, j.z, h, j.R, M.grass));
      // stop lines where each road comes in
      const P0 = route.prof(j.sA - 2), P1 = route.prof(j.sB + 2);
      // (not where the trip starts or ends right at the junction)
      const lines = [j.sA > 2 && stopLine(legs[0], P0.median, P0.two, h, M.stop), j.sB < route.length - 2 && stopLine(legs[1], P1.median, P1.two, h, M.stop),
        ...j.branches.map((b, i) => { const P = b.stub.prof(j.m + 2); return stopLine(legs[2 + i], P.median, P.two, b.stub.roadHeight(j.m), M.stop); })];
      for (const l of lines) if (l) g.add(l);
    }
    // the branch roads: carriageways, median, embankments (or one 2-lane strip)
    for (const b of j.branches) {
      const st = b.stub, e = b.len, ab = j.R + 1;
      // the asphalt starts 1 m under the junction's mouth, the slopes outside the flat ground round it
      const a = j.ic ? j.ic.R : j.m - 1;
      if (e - a < 5) continue;
      const P = st.prof(a + 1), Mh = P.median, H = P.half;
      const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); };
      if (P.two) add(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), M.stub2);
      else {
        const am = P.lanes === 3 ? M.stub6 : M.stub;
        add(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 1 }, { d: -Mh, y: R(0), u: 0 }], ASPHALT_TILE), am);
        add(ribbon(st, a, e, 4, [{ d: Mh, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), am);
        add(ribbon(st, a, e, 4, [{ d: -Mh, y: R(0.002), u: 0 }, { d: Mh, y: R(0.002), u: 0.4 }], ASPHALT_TILE), M.stub);
        const m0 = j.ic ? a : j.m + 6;
        if (e > m0 + 4) medianRibbons(st, m0, e, P, add, roadMats());
      }
      // embankments, except under a bridge deck; the bridge itself (deck sides, piers, lamps, the river below)
      for (const [p0, p1] of splitAround(b.bridges, j.ic ? a : ab, e)) {
        add(ribbon(st, p0, p1, 4, [{ d: -H - ROAD.embank, y: G(0), u: 0 }, { d: -H, y: R(0), u: 2 }], 3), M.grass);
        add(ribbon(st, p0, p1, 4, [{ d: H, y: R(0), u: 0 }, { d: H + ROAD.embank, y: G(0), u: 2 }], 3), M.grass);
      }
      for (const x of b.bridges) buildBridge(st, ctx, roadMats(), x, j.s);
    }
    ctx.scene.add(g);
    ctx.chunks.register(g, j.s, STUB_LEN + 200);
    yield;
  }
  // direction boards 300 m before each junction, on both carriageways
  for (const j of route.junctions) {
    for (const side of [-1, 1]) {
      const s = j.ic ? (side < 0 ? j.ic.s0 - 260 : j.ic.s1 + 260) : j.s + side * 300;
      if (!ctx.in(s) || s < 30 || s > route.length - 30 || !j.branches.length) continue;
      if (route.bridgeAt(s) || route.junctions.some((o) => o !== j && Math.abs(o.s - s) < 60)) continue;
      const lines = j.branches.map((b) => [b.target.bn, b.target.en, b.km, arrowFor(route, j, b, side, j.ic ? s : j.s)]);
      const ahead = side < 0 ? route.places.find((p) => p.s > j.s + 200 && p.town) : [...route.places].reverse().find((p) => p.s < j.s - 200 && p.town);
      if (ahead) lines.push([nm(ahead, 'bn'), nm(ahead, 'en'), Math.max(1, Math.round(Math.abs(route.realKm(ahead.s) - route.realKm(j.s)))), '↑']);
      const road = route.segAt(j.s + side * 40).chain;
      const tex = directionSignTexture(lines.slice(0, 4), road.ref, road.bn);
      const g = board(route, s, side * (route.prof(s).half + 2.2), side, tex, 5.2, M);
      ctx.scene.add(g);
      ctx.chunks.register(g, s, 60);
    }
  }
}
