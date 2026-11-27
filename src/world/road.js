import * as THREE from 'three';
import { ROAD, CHUNK, PLAZA, PROFILE } from '../config.js';
import { share, sharedMats } from './stream.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  asphaltTexture, asphaltTexture2, grassTexture, curbTexture, concreteTexture, waterNormalTexture, ASPHALT_TILE,
  makeCanvas, canvasTexture, BN_FONT, EN_FONT,
} from '../textures.js';

const tmp = new THREE.Vector3();
// shared emissive material for street / bridge lamps (turned on at night)
export const streetGlowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0 });

// Generic ribbon along the route. cols: [{ d, y: (s, h) => y, u }] ordered so that
// (col j -> col j+1) x forward gives the wanted face normal.
export function ribbon(route, s0, s1, step, cols, vScale) {
  const rows = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  const nc = cols.length;
  const pos = new Float32Array(rows * nc * 3);
  const uv = new Float32Array(rows * nc * 2);
  for (let i = 0; i < rows; i++) {
    const s = Math.min(s1, s0 + i * step);
    const h = route.roadHeight(s);
    for (let j = 0; j < nc; j++) {
      const c = cols[j];
      route.pointAt(s, typeof c.d === 'function' ? c.d(s) : c.d, tmp);
      const k = i * nc + j;
      pos[k * 3] = tmp.x;
      pos[k * 3 + 1] = c.y(s, h);
      pos[k * 3 + 2] = tmp.z;
      uv[k * 2] = c.u;
      uv[k * 2 + 1] = s / vScale;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = a + 1, c = a + nc, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;

export const roadMats = sharedMats(() => ({
  asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.93, metalness: 0 }),
  asphalt2: new THREE.MeshStandardMaterial({ map: asphaltTexture2(), roughness: 0.93, metalness: 0 }),
  asphalt6: new THREE.MeshStandardMaterial({ map: asphaltTexture(PROFILE[6]), roughness: 0.93, metalness: 0 }),
  barrier: new THREE.MeshStandardMaterial({ map: concreteTexture(11, '#c9c6bd'), roughness: 0.8 }),
  truss: new THREE.MeshStandardMaterial({ color: 0x7d8c8f, roughness: 0.5, metalness: 0.6 }),
  grass: new THREE.MeshStandardMaterial({ map: grassTexture(3), roughness: 1 }),
  median: new THREE.MeshStandardMaterial({ map: grassTexture(5, '#57702f'), roughness: 1 }),
  curb: new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.8 }),
  concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.85 }),
  bridgeConcrete: new THREE.MeshStandardMaterial({ map: concreteTexture(9, '#b9b5aa'), roughness: 0.8 }),
  plaza: new THREE.MeshStandardMaterial({ map: concreteTexture(4, '#a9aaa6'), roughness: 0.85 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5, metalness: 0.6 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xb8a98a, roughness: 1 }),
  boat: new THREE.MeshStandardMaterial({ color: 0x4e3b2a, roughness: 0.9 }),
}));
share(streetGlowMat);

// The water material and the river courses (one meandering river under every bridge). Rivers are only lines
// here; their meshes are built with the block of their bridge (roadChunk).
let waterShared = null;
export function initRoad(route) {
  if (!waterShared) {
    const normal = waterNormalTexture();
    normal.repeat.set(30, 30);
    const mat = share(new THREE.MeshStandardMaterial({
      color: 0x4d5f57, roughness: 0.12, metalness: 0.55, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
    }));
    waterShared = { mat, normal };
  }
  const { mat: waterMat, normal } = waterShared;
  waterMat_ = waterMat;
  const rivers = [...route.bridges, ...route.ferries].filter((b) => !b.elevated).map((b) => riverFor(route, b));
  // the rivers under the bridges of the side roads at the junctions, too
  for (const { b } of route.branchLines || []) for (const br of b.bridges) if (!br.elevated) rivers.push(riverFor(b.stub, br));
  // and every other river of the network (their bridges are built by world/netroads.js): kept clear of scenery
  for (const rv of route.net?.riverList?.() || []) if (!rivers.some((o) => Math.hypot(o.centre.x - rv.centre.x, o.centre.z - rv.centre.z) < 60)) rivers.push(rv);
  return { mats: roadMats(), water: { mat: waterMat, normal, rivers } };
}

// a meandering river under bridge b of `route`, roughly at right angles to the road (made once per bridge)
export function riverFor(route, b) {
  if (b.river) return b.river;
  {
    // a ferry: the river is as wide as the crossing (less the two ghats)
    if (b.ferry) b.width = Math.max(120, b.s1 - b.s0 - 70);
    const centre = route.pointAt(b.sc, 0);
    const [tx, tz] = route.tangentAt(b.sc);
    const nx = -tz, nz = tx; // road right vector
    const pts = [];
    for (let t = -3500; t <= 3500; t += 50) {
      const mw = Math.sin(t / 520) * 90 + Math.sin(t / 190) * 20;
      const fall = Math.min(1, Math.abs(t) / 250);
      pts.push(new THREE.Vector3(centre.x + nx * t + tx * mw * fall, 0, centre.z + nz * t + tz * mw * fall));
    }
    const own = route.segAt?.(b.sc)?.road;
    b.river = { pts: route.net && own ? route.net.trimRiver(pts, b.width, own) : pts, width: b.width, centre };
    return b.river;
  }
}

// one block of road: carriageways, median, toll apron, embankments, and any bridge (+ its river) in the block
export function* roadChunk(route, ctx) {
  const mats = roadMats();
  const embank = [
    [{ d: (s) => -route.halfAt(s) - ROAD.embank, y: G(0), u: 0 }, { d: (s) => -route.halfAt(s), y: R(0), u: 2 }],
    [{ d: (s) => route.halfAt(s), y: R(0), u: 0 }, { d: (s) => route.halfAt(s) + ROAD.embank, y: G(0), u: 2 }],
  ];
  // toll plaza aprons: concrete, as wide as the plaza needs (route.halfAt)
  // (and no road under a junction pad: the pad is the road there, and two surfaces would flicker)
  const plaza = [...route.tolls.map((t) => ({ s0: t.s - PLAZA.reach, s1: t.s + PLAZA.reach })), ...route.ferries.map((f) => ({ s0: f.s0, s1: f.s1, ferry: true })),
    ...(route.junctions || []).map((j) => {
      if (j.ic) return { s0: j.ic.s0, s1: j.ic.s1, ferry: true };      // an interchange builds its own carriageways
      return { s0: j.sA + 1, s1: j.sB - 1, ferry: true };          // (the road runs 1 m under the junction's mouth)
    })];

  const S0 = ctx.s0, S1 = Math.min(route.length, ctx.s1);
  const group = new THREE.Group();
  const add = (geo, mat, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = shadow;
    group.add(m);
  };
  // pieces of constant lane profile (it changes at junctions)
  const cuts = [S0, ...route.profBreaks(S0, S1), S1];
  for (let k = 0; k < cuts.length - 1; k++) {
    const s0 = cuts[k], s1 = cuts[k + 1];
    const P = route.prof((s0 + s1) / 2), M = P.median, H = P.half;
    const plazaCols = (side) => side < 0
      ? [{ d: (s) => -route.halfAt(s), y: R(0), u: 0 }, { d: -M, y: R(0), u: 3 }]
      : [{ d: M, y: R(0), u: 0 }, { d: (s) => route.halfAt(s), y: R(0), u: 3 }];
    if (P.two) {
      // undivided 2-lane road: one strip of asphalt, centre line and edge lines in the texture
      for (const [a, b] of splitAround(plaza, s0, s1)) add(ribbon(route, a, b, 4, [{ d: -H, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }], ASPHALT_TILE), mats.asphalt2);
      for (const pz of plaza) {
        if (pz.s1 <= s0 || pz.s0 >= s1 || pz.ferry) continue;      // (no road at all over a ferry crossing)
        const a = Math.max(s0, pz.s0), b = Math.min(s1, pz.s1);
        for (const side of [-1, 1]) add(ribbon(route, a, b, 2, plazaCols(side), 6), mats.plaza);
        add(ribbon(route, a, b, 2, [{ d: -M - 0.01, y: R(0.004), u: 0 }, { d: M + 0.01, y: R(0.004), u: 0.2 }], 6), mats.plaza);
      }
    } else {
      const asphaltMat = P.lanes === 3 ? mats.asphalt6 : mats.asphalt;
      const asphaltCols = (side) => side < 0
        ? [{ d: -H, y: R(0), u: 1 }, { d: -M, y: R(0), u: 0 }]
        : [{ d: M, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }];
      for (const [a, b] of splitAround(plaza, s0, s1)) for (const side of [-1, 1]) add(ribbon(route, a, b, 4, asphaltCols(side), ASPHALT_TILE), asphaltMat);
      for (const pz of plaza) {
        if (pz.s1 <= s0 || pz.s0 >= s1 || pz.ferry) continue;
        for (const side of [-1, 1]) add(ribbon(route, Math.max(s0, pz.s0), Math.min(s1, pz.s1), 2, plazaCols(side), 6), mats.plaza);
      }
      // median (with openings for U-turns and junctions, paved inside the gap): a grass strip between kerbs, or on
      // an expressway a concrete jersey barrier on asphalt
      for (const [a, b] of splitAround([...route.uturns, ...route.ferries, ...(route.icZones || [])], s0, s1)) medianRibbons(route, a, b, P, add, mats);
      for (const u of route.uturns) {
        if (u.s1 <= s0 || u.s0 >= s1) continue;
        add(ribbon(route, Math.max(s0, u.s0), Math.min(s1, u.s1), 2, [{ d: -M - 0.01, y: R(0.005), u: 0.12 }, { d: M + 0.01, y: R(0.005), u: 0.3 }], ASPHALT_TILE), mats.asphalt);
      }
    }
    // embankment except where we are on a bridge deck
    // (none inside a junction pad either: the pad's own skirt runs down to the fields there, so the side roads'
    // slopes and ours never cut through each other's asphalt)
    const noBank = [...route.bridges, ...route.ferries, ...(route.junctions || []).map((j) => ({ s0: j.s - j.R - 2, s1: j.s + j.R + 2 }))];
    for (const [a, b] of splitAround(noBank, s0, s1)) for (const e of embank) add(ribbon(route, a, b, 4, e, 3), mats.grass);
    // expressway: a 2-lane service road down at field level on each side, for the local traffic and the towns
    if (P.express) {
      const noSvc = [...noBank, ...(route.junctions || []).map((j) => ({ s0: j.s - j.R - 60, s1: j.s + j.R + 60 })), ...route.tolls.map((t) => ({ s0: t.s - PLAZA.reach - 40, s1: t.s + PLAZA.reach + 40 }))];
      const in0 = P.half + ROAD.embank + 2, out0 = in0 + P.service;
      for (const [a, b] of splitAround(noSvc, s0, s1)) {
        add(ribbon(route, a, b, 4, [{ d: -out0, y: G(0.06), u: 0 }, { d: -in0, y: G(0.06), u: 1 }], ASPHALT_TILE), mats.asphalt2);
        add(ribbon(route, a, b, 4, [{ d: in0, y: G(0.06), u: 0 }, { d: out0, y: G(0.06), u: 1 }], ASPHALT_TILE), mats.asphalt2);
      }
    }
  }
  // end barriers
  for (const s of [0, route.length]) {
    if (!ctx.in(s)) continue;
    const H = route.prof(s).half;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2 * H + 2, 1.2, 0.6), mats.curb);
    route.pointAt(s, 0, b.position);
    b.position.y += 0.6;
    b.rotation.y = route.yawAt(s);
    group.add(b);
  }
  ctx.scene.add(group);
  ctx.chunks.register(group, (S0 + S1) / 2, CHUNK / 2);
  yield;
  for (const b of route.bridges) {
    if (!ctx.in(b.sc)) continue;
    buildBridge(route, ctx, mats, b);
    yield;
  }
}

// the median between the carriageways over [a, b] of a divided road with profile P
export function medianRibbons(route, a, b, P, add, mats) {
  const M = P.median;
  if (P.barrier) {
    add(ribbon(route, a, b, 4, [{ d: -M - 0.01, y: R(0.004), u: 0.1 }, { d: M + 0.01, y: R(0.004), u: 0.2 }], ASPHALT_TILE), mats.asphalt);
    add(ribbon(route, a, b, 4, [{ d: -0.36, y: R(0), u: 0 }, { d: -0.24, y: R(0.3), u: 0.15 }, { d: -0.1, y: R(0.86), u: 0.45 },
      { d: 0.1, y: R(0.86), u: 0.55 }, { d: 0.24, y: R(0.3), u: 0.85 }, { d: 0.36, y: R(0), u: 1 }], 3), mats.barrier, true);
    return;
  }
  add(ribbon(route, a, b, 4, [{ d: -M + 0.12, y: R(0.27), u: 0 }, { d: M - 0.12, y: R(0.27), u: (2 * M) / 3 }], 3), mats.median);
  add(ribbon(route, a, b, 4, [{ d: -M, y: R(0), u: 0 }, { d: -M, y: R(0.25), u: 0.3 }, { d: -M + 0.12, y: R(0.27), u: 0.6 }], 4), mats.curb);
  add(ribbon(route, a, b, 4, [{ d: M - 0.12, y: R(0.27), u: 0 }, { d: M, y: R(0.25), u: 0.3 }, { d: M, y: R(0), u: 0.6 }], 4), mats.curb);
}

export function splitAround(list, s0, s1) {
  let pieces = [[s0, s1]];
  for (const b of list) {
    const next = [];
    for (const [a, c] of pieces) {
      if (b.s1 <= a || b.s0 >= c) { next.push([a, c]); continue; }
      if (b.s0 > a) next.push([a, b.s0]);
      if (b.s1 < c) next.push([b.s1, c]);
    }
    pieces = next;
  }
  return pieces.filter(([a, b]) => b - a > 1);
}

const pierGeo = share(new THREE.CylinderGeometry(0.9, 1.1, 1, 12));
const lampGeo = share(new THREE.CylinderGeometry(0.08, 0.1, 9, 6));
const headGeo = share(new THREE.BoxGeometry(0.9, 0.18, 0.35));
let waterMat_ = null;
export const waterMatRef = () => waterMat_;

// regS: where to register it for distance culling (default: the bridge itself, in route's own s)
export function buildBridge(route, ctx, mats, b, regS = b.sc) {
  const P = route.prof(b.sc), H = P.half;
  const group = new THREE.Group();
  // deck structure: parapets + slab underside
  const parapetL = [
    { d: -H - 0.35, y: R(-0.7), u: 0 }, { d: -H - 0.35, y: R(1.05), u: 0.4 },
    { d: -H + 0.05, y: R(1.05), u: 0.5 }, { d: -H + 0.05, y: R(0), u: 0.9 },
  ];
  const parapetR = [
    { d: H - 0.05, y: R(0), u: 0 }, { d: H - 0.05, y: R(1.05), u: 0.4 },
    { d: H + 0.35, y: R(1.05), u: 0.5 }, { d: H + 0.35, y: R(-0.7), u: 0.9 },
  ];
  const slab = [{ d: H + 0.35, y: R(-0.7), u: 0 }, { d: -H - 0.35, y: R(-0.7), u: 6 }];
  const a = b.s0 - 5, c = b.s1 + 5;
  for (const cols of [parapetL, parapetR]) {
    const m = new THREE.Mesh(ribbon(route, a, c, 3, cols, 3), mats.bridgeConcrete);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  group.add(new THREE.Mesh(ribbon(route, a, c, 3, slab, 3), mats.bridgeConcrete));
  // piers
  const capGeo = new THREE.BoxGeometry(2 * H + 1, 1.2, 2.2);
  const piers = [];
  for (let s = b.s0 + 18; s < b.s1 - 10; s += 32) {
    // (b.pierOk: a flyover keeps its piers off the road it spans)
    if (b.pierOk && ![-H, 0, H].every((d) => { const q = route.pointAt(s, d); return b.pierOk(q.x, q.z); })) continue;
    piers.push(s);
  }
  const pierDs = b.elevated ? [0] : P.two ? [-3, 0, 3, 0] : [-7, -3, 3, 7];
  const pm = new THREE.InstancedMesh(pierGeo, mats.bridgeConcrete, Math.max(1, piers.length * pierDs.length));
  const cm = new THREE.InstancedMesh(capGeo, mats.bridgeConcrete, Math.max(1, piers.length));
  pm.count = piers.length * pierDs.length; cm.count = piers.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  piers.forEach((s, i) => {
    const h = route.roadHeight(s);
    const yaw = route.yawAt(s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (const d of pierDs) {
      route.pointAt(s, d, p);
      p.y = (h - 1.3) / 2 - 1;
      sc.set(b.elevated ? 1.6 : 1, h - 1.3 + 2, b.elevated ? 1.6 : 1);
      m4.compose(p, q, sc);
      pm.setMatrixAt(k++, m4);
    }
    route.pointAt(s, 0, p);
    p.y = h - 1.3;
    m4.compose(p, q, sc.set(1, 1, 1));
    cm.setMatrixAt(i, m4);
  });
  pm.castShadow = cm.castShadow = true;
  group.add(pm, cm);

  // the Padma Bridge: a steel truss over the deck (the real one is a double-deck truss, road above, rail below)
  if (b.en === 'Padma' && b.width >= 300) group.add(trussFor(route, b, H, mats));
  // bridge lamps: on the median, or (2-lane bridges) on alternate parapets
  let li = 0;
  for (let s = b.s0 + 10; s < b.s1; s += 40, li++) {
    const ld = P.two ? (li % 2 ? 1 : -1) * (H - 0.2) : 0;
    route.pointAt(s, ld, p);
    const pole = new THREE.Mesh(lampGeo, mats.lamp);
    pole.position.set(p.x, route.roadHeight(s) + (P.two ? 1.05 : 0.27) + 4.5, p.z);
    group.add(pole);
    for (const sx of P.two ? [-Math.sign(ld)] : [-1, 1]) {
      const hd = new THREE.Mesh(headGeo, streetGlowMat);
      route.pointAt(s, ld + sx * 0.8, hd.position);
      hd.position.y = route.roadHeight(s) + 9;
      hd.rotation.y = route.yawAt(s) + Math.PI / 2;
      group.add(hd);
    }
  }

  // river ribbon (meandering, roughly perpendicular to the road)
  const rv = b.river;
  if (rv) {
    group.add(new THREE.Mesh(polyRibbon(rv.pts, b.width + 30, 0.12), mats.sand));
    const wm = new THREE.Mesh(polyRibbon(rv.pts, b.width, 0.3), waterMat_);
    wm.receiveShadow = true;
    group.add(wm);
    // country boats
    for (let i = 0; i < 5; i++) {
      const pi = rv.pts[Math.floor(rv.pts.length * (0.2 + i * 0.15))];
      const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 6, 4, 8), mats.boat);
      boat.rotation.z = Math.PI / 2;
      boat.rotation.y = Math.random() * Math.PI;
      boat.scale.set(1, 1, 0.45);
      boat.position.set(pi.x + (Math.random() - 0.5) * b.width * 0.5, 0.35, pi.z);
      group.add(boat);
    }
  }
  ctx.scene.add(group);
  ctx.chunks.register(group, regS, 3600);
}

// a Warren truss on both sides of a bridge deck: top and bottom chords, verticals and diagonals
function trussFor(route, b, H, mats) {
  const parts = [];
  const beam = (a, c, t) => {
    const len = a.distanceTo(c);
    const g = new THREE.BoxGeometry(t, t, len);
    g.lookAt(c.clone().sub(a));
    g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    parts.push(g);
  };
  const P = new THREE.Vector3(), Q = new THREE.Vector3();
  const pt = (s, d, up) => { route.pointAt(s, d, P); P.y = route.roadHeight(s) + up; return P.clone(); };
  const step = 12, top = 9;
  for (const d of [-(H + 0.5), H + 0.5]) {
    let k = 0;
    for (let s = b.s0; s < b.s1 - 1; s += step, k++) {
      const s2 = Math.min(b.s1, s + step);
      beam(pt(s, d, 0.3), pt(s2, d, 0.3), 0.5);            // bottom chord
      beam(pt(s, d, top), pt(s2, d, top), 0.55);           // top chord
      beam(pt(s, d, 0.3), pt(s, d, top), 0.35);            // vertical
      if (k % 2) beam(pt(s, d, 0.3), pt(s2, d, top), 0.32); else beam(pt(s, d, top), pt(s2, d, 0.3), 0.32);
    }
  }
  // cross bracing over the deck every other panel
  for (let s = b.s0; s < b.s1; s += step * 2) beam(pt(s, -(H + 0.5), top), pt(s, H + 0.5, top), 0.35);
  void Q;
  const m = new THREE.Mesh(mergeGeometries(parts), mats.truss);
  m.castShadow = true;
  return m;
}

// flat ribbon along an arbitrary XZ polyline
export function polyRibbon(pts, width, y, acc0 = 0) {
  const pos = [], uv = [], idx = [];
  let acc = acc0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
    const w = width / 2 * (1 + 0.15 * Math.sin(acc / 300)) * (pts[i].w ?? 1);      // (w: a river narrowing away)
    // right = (-dz, dx)
    pos.push(pts[i].x + dz * w, y, pts[i].z - dx * w, pts[i].x - dz * w, y, pts[i].z + dx * w);
    uv.push(0, acc / 40, width / 40, acc / 40);
    if (i < pts.length - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure it faces up
  const nrm = g.attributes.normal;
  if (nrm.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

