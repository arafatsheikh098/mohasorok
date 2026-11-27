import * as THREE from 'three';
import { ROAD, CHUNK, PLAZA } from '../config.js';
import { share, sharedMats } from './stream.js';
import {
  asphaltTexture, grassTexture, curbTexture, concreteTexture, waterNormalTexture, ASPHALT_TILE,
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

const roadMats = sharedMats(() => ({
  asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.93, metalness: 0 }),
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
  waterMatRef = waterMat;
  const rivers = route.bridges.map((b) => {
    const centre = route.pointAt(b.sc, 0);
    const [tx, tz] = route.tangentAt(b.sc);
    const nx = -tz, nz = tx; // road right vector
    const pts = [];
    for (let t = -3500; t <= 3500; t += 50) {
      const mw = Math.sin(t / 520) * 90 + Math.sin(t / 190) * 20;
      const fall = Math.min(1, Math.abs(t) / 250);
      pts.push(new THREE.Vector3(centre.x + nx * t + tx * mw * fall, 0, centre.z + nz * t + tz * mw * fall));
    }
    b.river = { pts, width: b.width, centre };
    return b.river;
  });
  return { mats: roadMats(), water: { mat: waterMat, normal, rivers } };
}

// one block of road: carriageways, median, toll apron, embankments, and any bridge (+ its river) in the block
export function* roadChunk(route, ctx) {
  const mats = roadMats();
  const M = ROAD.median, H = ROAD.half;
  const asphaltCols = (side) => side < 0
    ? [{ d: -H, y: R(0), u: 1 }, { d: -M, y: R(0), u: 0 }]
    : [{ d: M, y: R(0), u: 0 }, { d: H, y: R(0), u: 1 }];
  const medianTop = [
    { d: -M + 0.12, y: R(0.27), u: 0 }, { d: M - 0.12, y: R(0.27), u: (2 * M) / 3 },
  ];
  const curbCols = [
    [{ d: -M, y: R(0), u: 0 }, { d: -M, y: R(0.25), u: 0.3 }, { d: -M + 0.12, y: R(0.27), u: 0.6 }],
    [{ d: M - 0.12, y: R(0.27), u: 0 }, { d: M, y: R(0.25), u: 0.3 }, { d: M, y: R(0), u: 0.6 }],
  ];
  const embank = [
    [{ d: (s) => -route.halfAt(s) - ROAD.embank, y: G(0), u: 0 }, { d: (s) => -route.halfAt(s), y: R(0), u: 2 }],
    [{ d: (s) => route.halfAt(s), y: R(0), u: 0 }, { d: (s) => route.halfAt(s) + ROAD.embank, y: G(0), u: 2 }],
  ];
  // toll plaza aprons: concrete, as wide as the plaza needs (route.halfAt)
  const plaza = route.tolls.map((t) => ({ s0: t.s - PLAZA.reach, s1: t.s + PLAZA.reach }));
  const plazaCols = (side) => side < 0
    ? [{ d: (s) => -route.halfAt(s), y: R(0), u: 0 }, { d: -M, y: R(0), u: 3 }]
    : [{ d: M, y: R(0), u: 0 }, { d: (s) => route.halfAt(s), y: R(0), u: 3 }];

  const s0 = ctx.s0, s1 = Math.min(route.length, ctx.s1);
  const group = new THREE.Group();
  const add = (geo, mat, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = shadow;
    group.add(m);
  };
  for (const [a, b] of splitAround(plaza, s0, s1)) for (const side of [-1, 1]) add(ribbon(route, a, b, 4, asphaltCols(side), ASPHALT_TILE), mats.asphalt);
  for (const pz of plaza) {
    if (pz.s1 <= s0 || pz.s0 >= s1) continue;
    for (const side of [-1, 1]) add(ribbon(route, Math.max(s0, pz.s0), Math.min(s1, pz.s1), 2, plazaCols(side), 6), mats.plaza);
  }
  // median (with openings for U-turns, paved inside the gap)
  for (const [a, b] of splitAround(route.uturns, s0, s1)) {
    add(ribbon(route, a, b, 4, medianTop, 3), mats.median);
    for (const cc of curbCols) add(ribbon(route, a, b, 4, cc, 4), mats.curb);
  }
  for (const u of route.uturns) {
    if (u.s1 <= s0 || u.s0 >= s1) continue;
    add(ribbon(route, Math.max(s0, u.s0), Math.min(s1, u.s1), 2, [{ d: -M - 0.01, y: R(0.005), u: 0.12 }, { d: M + 0.01, y: R(0.005), u: 0.3 }], ASPHALT_TILE), mats.asphalt);
  }
  // embankment except where we are on a bridge deck
  for (const [a, b] of splitAround(route.bridges, s0, s1)) for (const e of embank) add(ribbon(route, a, b, 4, e, 3), mats.grass);
  // end barriers
  for (const s of [0, route.length]) {
    if (!ctx.in(s)) continue;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2 * H + 2, 1.2, 0.6), mats.curb);
    route.pointAt(s, 0, b.position);
    b.position.y += 0.6;
    b.rotation.y = route.yawAt(s);
    group.add(b);
  }
  ctx.scene.add(group);
  ctx.chunks.register(group, (s0 + s1) / 2, CHUNK / 2);
  yield;
  for (const b of route.bridges) {
    if (!ctx.in(b.sc)) continue;
    buildBridge(route, ctx, mats, b);
    yield;
  }
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
let waterMatRef = null;

function buildBridge(route, ctx, mats, b) {
  const H = ROAD.half;
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
  for (let s = b.s0 + 18; s < b.s1 - 10; s += 32) piers.push(s);
  const pm = new THREE.InstancedMesh(pierGeo, mats.bridgeConcrete, Math.max(1, piers.length * 4));
  const cm = new THREE.InstancedMesh(capGeo, mats.bridgeConcrete, Math.max(1, piers.length));
  pm.count = piers.length * 4; cm.count = piers.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  piers.forEach((s, i) => {
    const h = route.roadHeight(s);
    const yaw = route.yawAt(s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (const d of [-7, -3, 3, 7]) {
      route.pointAt(s, d, p);
      p.y = (h - 1.3) / 2 - 1;
      sc.set(1, h - 1.3 + 2, 1);
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

  // bridge lamps
  for (let s = b.s0 + 10; s < b.s1; s += 40) {
    route.pointAt(s, 0, p);
    const pole = new THREE.Mesh(lampGeo, mats.lamp);
    pole.position.set(p.x, route.roadHeight(s) + 0.27 + 4.5, p.z);
    group.add(pole);
    for (const sx of [-1, 1]) {
      const hd = new THREE.Mesh(headGeo, streetGlowMat);
      route.pointAt(s, sx * 0.8, hd.position);
      hd.position.y = route.roadHeight(s) + 9;
      hd.rotation.y = route.yawAt(s) + Math.PI / 2;
      group.add(hd);
    }
  }

  // river ribbon (meandering, roughly perpendicular to the road)
  const rv = b.river;
  if (rv) {
    group.add(new THREE.Mesh(polyRibbon(rv.pts, b.width + 30, 0.12), mats.sand));
    const wm = new THREE.Mesh(polyRibbon(rv.pts, b.width, 0.3), waterMatRef);
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
  ctx.chunks.register(group, b.sc, 3600);
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
    const w = width / 2 * (1 + 0.15 * Math.sin(acc / 300));
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

