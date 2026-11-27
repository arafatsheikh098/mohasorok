// Junctions (মোড় / চৌরাস্তা): where the trip's road meets other roads. A flat paved pad over the meeting point,
// the first stretch of every other road branching off (built from that road's own centreline, so it is the
// same road a later trip will drive), and green direction boards before the junction on both carriageways.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { Route } from '../route.js';
import { ribbon, roadMats, buildBridge, splitAround, medianRibbons } from './road.js';
import { sharedMats } from './stream.js';
import { directionSignTexture, ASPHALT_TILE, asphaltTexture2 } from '../textures.js';

export const STUB_LEN = 900;        // m of each branch road built at a junction

const jMats = sharedMats(() => {
  const m = roadMats();
  const off = (mat, f) => { const c = mat.clone(); c.polygonOffset = true; c.polygonOffsetFactor = f; c.polygonOffsetUnits = f; return c; };
  return {
    pad: off(new THREE.MeshStandardMaterial({ map: asphaltTexture2(false), roughness: 0.93 }), -2), stub: off(m.asphalt, -1), stub2: off(m.asphalt2, -1), stub6: off(m.asphalt6, -1), grass: m.grass, median: m.median, curb: m.curb,
    back: new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }),
    leg: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.4 }),
  };
});

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;
const nm = (x, k) => x[k].split(' (')[0];

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
function arrowFor(route, j, b, side) {
  const [tx, tz] = route.tangentAt(j.s);
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
    // the pad, and a grass skirt down to the fields
    const padGeo = new THREE.CircleGeometry(j.R, 48);
    const uv = padGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * j.R) / ASPHALT_TILE, uv.getY(i) * (2 * j.R) / ASPHALT_TILE);
    const pad = new THREE.Mesh(padGeo, M.pad);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(j.x, h + 0.03, j.z);        // (the log depth buffer ignores polygon offset: lift it clear of the roads under it)
    pad.receiveShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(j.R, j.R + ROAD.embank, h, 48, 1, true), M.grass);
    skirt.position.set(j.x, h / 2 - 0.02, j.z);
    skirt.receiveShadow = true;
    g.add(pad, skirt);
    // the branch roads: carriageways, median, embankments (or one 2-lane strip)
    for (const b of j.branches) {
      const st = b.stub, a = j.R - 4, e = b.len, ab = j.R + 1;     // asphalt starts under the pad, slopes outside it
      if (e - a < 5) continue;
      const P = st.prof(a + 1), Mh = P.median, H = P.half;
      const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); };
      if (P.two) add(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), M.stub2);
      else {
        const am = P.lanes === 3 ? M.stub6 : M.stub;
        add(ribbon(st, a, e, 4, [{ d: -H, y: R(0), u: 1 }, { d: -Mh, y: R(0), u: 0 }], ASPHALT_TILE), am);
        add(ribbon(st, a, e, 4, [{ d: Mh, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), am);
        add(ribbon(st, a, e, 4, [{ d: -Mh, y: R(0.002), u: 0 }, { d: Mh, y: R(0.002), u: 0.4 }], ASPHALT_TILE), M.stub);
        const m0 = j.R + 8;
        if (e > m0 + 4) medianRibbons(st, m0, e, P, add, roadMats());
      }
      // embankments, except under a bridge deck; the bridge itself (deck sides, piers, lamps, the river below)
      for (const [p0, p1] of splitAround(b.bridges, ab, e)) {
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
      const s = j.s + side * 300;
      if (!ctx.in(s) || s < 30 || s > route.length - 30 || !j.branches.length) continue;
      if (route.bridgeAt(s) || route.junctions.some((o) => o !== j && Math.abs(o.s - s) < 60)) continue;
      const lines = j.branches.map((b) => [b.target.bn, b.target.en, b.km, arrowFor(route, j, b, side)]);
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
