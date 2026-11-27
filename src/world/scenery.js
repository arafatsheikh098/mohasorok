import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD, CHUNK, PLAZA } from '../config.js';
import {
  rng, paddyTexture, PADDY_TILE, grassTexture, facadeTexture, FACADE_BAY, FACADE_HEIGHT, FLOOR_H, tinTexture,
  shopSignTexture, SHOP_COUNT, billboardTexture, BILLBOARD_COUNT, directionSignTexture, placeSignTexture,
  speedSignTexture, kmPostTexture, smokeTexture, concreteTexture, makeCanvas, canvasTexture, BN_FONT, toBn,
} from '../textures.js';
import { ribbon, polyRibbon, streetGlowMat } from './road.js';
import { OPERATORS } from '../operators.js';
import { share } from './stream.js';

const UP = new THREE.Vector3(0, 1, 0);
const N_FACADES = 10;

// ---------- shared geometry ----------
function jitter(geo, amt, r) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const j = seen.get(k);
    p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeGeometries() {
  const r = rng(99);
  const canopy = mergeGeometries([
    jitter(new THREE.IcosahedronGeometry(2.6, 1), 0.9, r).translate(0, 6, 0),
    jitter(new THREE.IcosahedronGeometry(2.0, 1), 0.8, r).translate(1.6, 5.2, 0.6),
    jitter(new THREE.IcosahedronGeometry(1.9, 1), 0.8, r).translate(-1.4, 5.4, -0.7),
  ]);
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 5, 6).translate(0, 2.5, 0);
  const palmTrunk = new THREE.CylinderGeometry(0.13, 0.2, 10, 5).translate(0, 5, 0);
  // palm fronds: drooping strips
  const fronds = [];
  for (let k = 0; k < 9; k++) {
    const g = new THREE.PlaneGeometry(0.7, 4.2, 1, 5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 2.1; // 0..4.2 along frond
      p.setXYZ(i, p.getX(i) * (1 - y / 5), -0.12 * y * y, y);
    }
    g.rotateY((k / 9) * Math.PI * 2 + r() * 0.3);
    g.translate(0, 10, 0);
    fronds.push(g);
  }
  const palmLeaves = mergeGeometries(fronds);
  palmLeaves.computeVertexNormals();
  const bush = jitter(new THREE.IcosahedronGeometry(0.8, 1), 0.3, r).translate(0, 0.6, 0);
  const hutWall = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // gable roof prism (unit), ridge along z
  const roof = new THREE.BufferGeometry();
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1], 2));
  roof.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
  const roofNI = roof.toNonIndexed();
  // re-uv the slopes so the tin corrugation runs downhill
  const uv = roofNI.attributes.uv;
  for (let i = 6; i < uv.count; i++) {
    const px = roofNI.attributes.position.getZ(i), py = roofNI.attributes.position.getY(i);
    uv.setXY(i, (px + 0.5) * 3, py * 2);
  }
  roofNI.computeVertexNormals();
  const hay = mergeGeometries([
    new THREE.CylinderGeometry(1.1, 1.2, 1.6, 8).translate(0, 0.8, 0),
    new THREE.ConeGeometry(1.25, 1.6, 8).translate(0, 2.4, 0),
  ]);
  const blob = jitter(new THREE.IcosahedronGeometry(1, 1), 0.25, r).scale(1, 0.55, 1).translate(0, 0.35, 0);
  const pole = mergeGeometries([
    new THREE.BoxGeometry(0.22, 10, 0.22).translate(0, 5, 0),
    new THREE.BoxGeometry(2.2, 0.12, 0.12).translate(0, 9.3, 0),
  ]);
  return { canopy, trunk, palmTrunk, palmLeaves, bush, hutWall, roof: roofNI, hay, blob, pole };
}

function buildingGeo(w, h, dep) {
  const g = new THREE.BoxGeometry(w, h, dep);
  const uv = g.attributes.uv;
  // faces: px, nx, py, ny, pz, nz (4 verts each)
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.995); continue; }
      const span = f < 2 ? dep : w;
      uv.setXY(i, uv.getX(i) * (span / FACADE_BAY), uv.getY(i) * (h / FACADE_HEIGHT));
    }
  }
  g.translate(0, h / 2, 0);
  return g;
}

class Batch {
  constructor() { this.items = new Map(); }
  add(key, geo) {
    if (!this.items.has(key)) this.items.set(key, []);
    this.items.get(key).push(geo);
  }
  build(group, matFor, { cast = true, receive = true } = {}) {
    for (const [key, list] of this.items) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), matFor(key));
      m.castShadow = cast;
      m.receiveShadow = receive;
      group.add(m);
    }
  }
}

class Inst {
  constructor(geo, mat, { cast = true, receive = true } = {}) {
    this.geo = geo; this.mat = mat; this.m = []; this.c = []; this.cast = cast; this.receive = receive;
  }
  push(m4, color) { this.m.push(m4.clone()); this.c.push(color ? color.clone() : null); }
  build(group) {
    if (!this.m.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.m.length);
    this.m.forEach((m, i) => im.setMatrixAt(i, m));
    if (this.c[0]) this.c.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = this.cast;
    im.receiveShadow = this.receive;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  }
}

// shared geometry and materials for every block (made once)
let SH = null;
function sceneryShared(water) {
  if (SH) return SH;
  const G = makeGeometries();
  const leafTex = grassTexture(41, '#3f6a2a');
  const mats = {
    canopy: new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.95 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }),
    palmTrunk: new THREE.MeshStandardMaterial({ color: 0x7d6b55, roughness: 1 }),
    palm: new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 0.9, side: THREE.DoubleSide }),
    bush: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    hutWall: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    tin: new THREE.MeshStandardMaterial({ map: tinTexture(), roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
    hay: new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1 }),
    blob: new THREE.MeshStandardMaterial({ color: 0x3d5c2c, roughness: 1 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x9e9a92, roughness: 0.9 }),
    wire: new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.7 }),
    facades: Array.from({ length: N_FACADES }, (_, i) => new THREE.MeshStandardMaterial({ map: facadeTexture(i), roughness: 0.9 })),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(3), roughness: 0.9 }),
    signs: Array.from({ length: SHOP_COUNT }, (_, i) => new THREE.MeshStandardMaterial({ map: shopSignTexture(i), roughness: 0.6 })),
    billboards: Array.from({ length: BILLBOARD_COUNT }, (_, i) => new THREE.MeshStandardMaterial({ map: billboardTexture(i), roughness: 0.5 })),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.5, metalness: 0.7 }),
    speed: new THREE.MeshStandardMaterial({ map: speedSignTexture(80), roughness: 0.5, transparent: true }),
    town: new THREE.MeshStandardMaterial({ map: grassTexture(77, '#8b7a5c'), roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x8a3b26, roughness: 1 }),
    mosque: new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.7 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.4, metalness: 0.3 }),
    signBack: new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }),
    signLeg: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.45, metalness: 0.7 }),
    hills: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }),
    flats: new THREE.MeshStandardMaterial({ color: 0x8f8a72, roughness: 1 }),
    pond: water.mat,
  };
  const sea = water.mat.clone();
  sea.color.setHex(0x5f7b84);
  mats.sea = sea;
  const counterMats = OPERATORS.map((op) => {
    const [c, ctx] = makeCanvas(1024, 256);
    ctx.fillStyle = op.base === '#ffffff' || op.base.startsWith('#f') ? op.c1 : op.base;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 100px ${BN_FONT}`;
    ctx.fillText(op.bn, 512, 100, 980);
    ctx.font = `bold 52px ${BN_FONT}`;
    ctx.fillText('টিকেট কাউন্টার', 512, 200);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false }), roughness: 0.6 });
  });
  const smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, fog: true });
  const geo = { mosqueHall: new THREE.BoxGeometry(16, 7, 16), dome: new THREE.SphereGeometry(5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    minaret: new THREE.CylinderGeometry(0.9, 1.1, 24, 10), minDome: new THREE.ConeGeometry(1.2, 2.6, 10),
    kilnBase: new THREE.BoxGeometry(36, 3.5, 20), chimney: new THREE.CylinderGeometry(1.1, 2.4, 34, 10), bricks: new THREE.BoxGeometry(5, 1.6, 2.5),
    bbPanel: new THREE.PlaneGeometry(12, 6), bbBack: new THREE.BoxGeometry(12.3, 6.3, 0.3), bbLeg: new THREE.BoxGeometry(0.35, 6, 0.35), kmPost: new THREE.BoxGeometry(0.4, 0.9, 0.16) };
  SH = share({ G, mats, counterMats, smokeMat, geo });
  return SH;
}

let groundMesh = null;
// The countryside along the road: the ground plane (follows the bus), and a generator that builds one
// block of trees, villages, towns, poles and wires, kilns, signs, hills and sea (see world/stream.js).
export function initScenery(route, scene, quality, water) {
  const { mats } = sceneryShared(water);
  // ---------- ground: one big paddy plane that follows the bus (made once) ----------
  if (!groundMesh) {
    const paddy = paddyTexture();
    const GROUND = 14000;
    paddy.repeat.set(GROUND / PADDY_TILE, GROUND / PADDY_TILE);
    groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshStandardMaterial({ map: paddy, roughness: 1 }));
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
  }
  const ground = groundMesh;
  const smokes = new Set();
  const signItems = signPlan(route);
  void mats;
  let t = 0;
  return {
    ground,
    chunk: (r, ctx) => sceneryChunk(route, ctx, quality, water, smokes, signItems),
    update(dt, focus) {
      t += dt;
      ground.position.set(Math.round(focus.x / PADDY_TILE) * PADDY_TILE, 0, Math.round(focus.z / PADDY_TILE) * PADDY_TILE);
      water.normal.offset.set(t * 0.004, t * 0.006);
      for (const sp of smokes) {
        if (!sp.parent.visible) continue;
        const ph = (sp.userData.phase + t * 0.03) % 1;
        const sz = 6 + ph * 30;
        sp.position.set(sp.userData.x + ph * 40, 34 + ph * 70, sp.userData.z + ph * 15);
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = 1;
      }
    },
  };
}

function* sceneryChunk(route, ctx, quality, water, smokes, signItems) {
  const { G, mats, counterMats, smokeMat, geo } = sceneryShared(water);
  // only the rivers that come near this block
  const cp = route.pointAt((ctx.s0 + ctx.s1) / 2, 0);
  const rivers = water.rivers.filter((rv) => Math.hypot(rv.centre.x - cp.x, rv.centre.z - cp.z) < 6000);
  const inWater = (x, z, margin) => {
    for (const rv of rivers) {
      if (Math.abs(x - rv.centre.x) > 3700 && Math.abs(z - rv.centre.z) > 3700) continue;
      const lim = (rv.width / 2) * 1.2 + margin;
      for (let i = 0; i < rv.pts.length - 1; i += 1) {
        const a = rv.pts[i], b = rv.pts[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z;
        const t = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
        const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
        if (dx * dx + dz * dz < lim * lim) return true;
      }
    }
    return false;
  };

  const town = (s) => route.places.find((p) => p.town && Math.abs(s - p.s) < p.town / 2);
  const nearStation = (s, d, m = 0) => [...route.stations, ...route.rests, ...route.terminals].some((st) => s > st.s0 - m - 20 && s < st.s1 + m + 20 && Math.sign(d) === st.side && Math.abs(d) < st.dOut + m + 8);
  const p = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  const dens = quality.treeDensity;
  const c = ctx.c;
  {
    const r = rng(1000 + c * 7);
    const s0 = ctx.s0, s1 = Math.min(route.length, ctx.s1);
    const group = new THREE.Group();
    const far = new THREE.Group();
    const I = {
      canopy: new Inst(G.canopy, mats.canopy), trunk: new Inst(G.trunk, mats.trunk),
      palmTrunk: new Inst(G.palmTrunk, mats.palmTrunk), palm: new Inst(G.palmLeaves, mats.palm),
      bush: new Inst(G.bush, mats.bush, { cast: false }), hut: new Inst(G.hutWall, mats.hutWall), roof: new Inst(G.roof, mats.tin),
      hay: new Inst(G.hay, mats.hay), blob: new Inst(G.blob, mats.blob, { cast: false }), pole: new Inst(G.pole, mats.pole),
    };
    const B = new Batch();
    const validAt = (s, d, x, z, margin = 4) => {
      const pr = route.project(x, z, Math.round(s / route.DS));
      if (Math.abs(pr.d) < route.halfAt(pr.s) + ROAD.embank + margin) return false;
      if (nearStation(pr.s, pr.d, 15)) return false;
      if (rivers.length && inWater(x, z, margin)) return false;
      if (route.nearBranch?.(x, z, margin)) return false;      // side roads at junctions
      return true;
    };
    const tree = (x, z, scale, palm) => {
      q.setFromAxisAngle(UP, r() * Math.PI * 2);
      sc.setScalar(scale);
      m4.compose(p.set(x, 0, z), q, sc);
      if (palm) {
        I.palmTrunk.push(m4); I.palm.push(m4, col.setHSL(0.24 + r() * 0.05, 0.45, 0.28 + r() * 0.1));
      } else {
        I.trunk.push(m4); I.canopy.push(m4, col.setHSL(0.22 + r() * 0.08, 0.35 + r() * 0.2, 0.55 + r() * 0.3));
      }
    };

    // roadside tree rows (rain trees / mahogany) outside towns
    for (const side of [-1, 1]) {
      for (let s = s0; s < s1; s += 8 + r() * 7) {
        if (town(s) || route.bridgeAt(s) || r() > 0.78 * dens) continue;
        const d = side * (ROAD.toe + 5 + r() * 6);
        route.pointAt(s, d, p);
        if (!validAt(s, d, p.x, p.z, 2)) continue;
        tree(p.x, p.z, 0.8 + r() * 0.6, r() < 0.2);
      }
    }
    yield;
    // villages
    const nv = 2 + Math.floor(r() * 3);
    for (let v = 0; v < nv; v++) {
      const s = s0 + r() * (s1 - s0);
      const side = r() < 0.5 ? -1 : 1;
      const d = side * (70 + r() * 380);
      route.pointAt(s, d, p);
      const cx = p.x, cz = p.z;
      if (!validAt(s, d, cx, cz, 40)) continue;
      // pond first
      if (r() < 0.7) {
        const pr = 12 + r() * 14;
        const pond = new THREE.Mesh(new THREE.CircleGeometry(pr, 20), mats.pond);
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(cx + 25, 0.2, cz);
        pond.scale.set(1, 0.7 + r() * 0.5, 1);
        group.add(pond);
      }
      const nt = Math.floor((30 + r() * 40) * dens);
      for (let k = 0; k < nt; k++) {
        const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 60;
        const x = cx + Math.cos(a) * rad - 10, z = cz + Math.sin(a) * rad;
        if (Math.hypot(x - cx - 25, z - cz) < 30) continue;
        if (!validAt(s, d, x, z, 3)) continue;
        tree(x, z, 0.8 + r() * 0.7, r() < 0.4);
      }
      const nh = 4 + Math.floor(r() * 9);
      for (let k = 0; k < nh; k++) {
        const a = r() * Math.PI * 2, rad = 8 + r() * 35;
        const x = cx + Math.cos(a) * rad - 10, z = cz + Math.sin(a) * rad;
        if (Math.hypot(x - cx - 25, z - cz) < 32 || !validAt(s, d, x, z, 5)) continue;
        const w = 4 + r() * 4, dp = 3.5 + r() * 2.5, h = 2.3 + r() * 0.5;
        q.setFromAxisAngle(UP, route.yawAt(s) + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.4);
        m4.compose(p.set(x, 0, z), q, sc.set(w, h, dp));
        const wc = [0x9c8466, 0x8d7a62, 0x6f8fae, 0x8aa07a, 0xb7b0a2, 0xa0705a][Math.floor(r() * 6)];
        I.hut.push(m4, col.setHex(wc));
        m4.compose(p.set(x, h, z), q, sc.set(w + 0.6, 1.2 + r() * 0.5, dp + 0.7));
        I.roof.push(m4);
        if (r() < 0.35) {
          m4.compose(p.set(x + 4 + r() * 3, 0, z + 3), q, sc.setScalar(0.8 + r() * 0.4));
          I.hay.push(m4);
        }
      }
    }
    yield;
    // scattered field trees
    for (let k = 0; k < 40 * dens; k++) {
      const s = s0 + r() * (s1 - s0), d = (r() < 0.5 ? -1 : 1) * (30 + r() * 600);
      route.pointAt(s, d, p);
      if (!validAt(s, d, p.x, p.z, 4)) continue;
      tree(p.x, p.z, 0.7 + r() * 0.8, r() < 0.5);
    }
    // far tree lines (villages on the horizon)
    for (let k = 0; k < 16; k++) {
      const s = s0 + r() * (s1 - s0), d = (r() < 0.5 ? -1 : 1) * (650 + r() * 1800);
      route.pointAt(s, d, p);
      if (rivers.length && inWater(p.x, p.z, 60)) continue;
      q.setFromAxisAngle(UP, r() * 3);
      m4.compose(p.setY(0), q, sc.set(40 + r() * 70, 14 + r() * 10, 25 + r() * 30));
      I.blob.push(m4, col.setHSL(0.26, 0.3, 0.35 + r() * 0.15));
    }
    // median shrubs
    for (let s = s0 + 3; s < s1; s += 7) {
      if ((route.bridgeAt(s) && r() < 0.8) || route.uturnAt(s) || route.tollDist(s) < 30) continue;
      route.pointAt(s, (r() - 0.5) * 0.6, p);
      q.identity();
      const pink = r() < 0.12;
      const k = pink ? 0.45 : 0.55 + r() * 0.25;
      m4.compose(p.setY(route.roadHeight(s) + 0.1), q, sc.set(k, k * (0.8 + r() * 0.4), k));
      I.bush.push(m4, pink ? col.setHSL(0.95, 0.45, 0.42) : col.setHSL(0.27 + r() * 0.04, 0.45, 0.2 + r() * 0.08));
    }
    // electric poles + wires (left side)
    const wirePts = [];
    let prev = null;
    for (let s = s0; s < s1; s += 45) {
      const d = -(ROAD.toe + 3.5);
      if (route.bridgeAt(s) || nearStation(s, d, 10) || route.plazaW(s) > 0 || route.uturnAt(s)?.junction) { prev = null; continue; }
      route.pointAt(s, d, p);
      if (route.nearBranch?.(p.x, p.z, 3)) { prev = null; continue; }
      p.y = 0;
      q.setFromAxisAngle(UP, route.yawAt(s) + Math.PI / 2);
      m4.compose(p, q, sc.set(1, 1, 1));
      I.pole.push(m4);
      const tops = [-0.9, 0, 0.9].map((o) => {
        const [tx, tz] = route.tangentAt(s);
        return new THREE.Vector3(p.x - tz * o, 9.3 + (o === 0 ? 0.6 : 0), p.z + tx * o);
      });
      if (prev) for (let w = 0; w < 3; w++) {
        const a = prev[w], b = tops[w];
        let last = a;
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          const pt = a.clone().lerp(b, t);
          pt.y -= Math.sin(t * Math.PI) * 0.9;
          wirePts.push(last.x, last.y, last.z, pt.x, pt.y, pt.z);
          last = pt;
        }
      }
      prev = tops;
    }
    if (wirePts.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
      group.add(new THREE.LineSegments(wg, mats.wire));
    }

    // brick kiln
    if (r() < 0.45) {
      const s = s0 + r() * (s1 - s0), d = (r() < 0.5 ? -1 : 1) * (160 + r() * 300);
      route.pointAt(s, d, p);
      if (validAt(s, d, p.x, p.z, 40)) {
        const yaw = r() * 3;
        const base = new THREE.Mesh(new THREE.BoxGeometry(36, 3.5, 20), mats.brick);
        base.position.set(p.x, 1.75, p.z);
        base.rotation.y = yaw;
        base.castShadow = base.receiveShadow = true;
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.4, 34, 10), mats.brick);
        ch.position.set(p.x, 17, p.z);
        ch.castShadow = true;
        group.add(base, ch);
        // brick stacks
        for (let k = 0; k < 6; k++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 2.5), mats.brick);
          st.position.set(p.x + 25 + (k % 3) * 7, 0.8, p.z + Math.floor(k / 3) * 5 - 3);
          group.add(st);
        }
        for (let k = 0; k < 7; k++) {
          const sp = new THREE.Sprite(smokeMat);
          sp.userData = { x: p.x, z: p.z, phase: k / 7 };
          group.add(sp);
          smokes.add(sp);
          ctx.onDispose(() => smokes.delete(sp));
        }
      }
    }

    yield;
    // ---------- towns ----------
    const tp = route.places.filter((pl) => pl.town && pl.s + pl.town / 2 > s0 && pl.s - pl.town / 2 < s1);
    for (const pl of tp) {
      const a = Math.max(s0, pl.s - pl.town / 2), b = Math.min(s1, pl.s + pl.town / 2);
      const big = pl.kind === 'city';
      // town ground
      for (const side of [-1, 1]) {
        const cols = side < 0
          ? [{ d: (x) => -(route.halfAt(x) + ROAD.embank + 70), y: () => 0.05, u: 0 }, { d: (x) => -(route.halfAt(x) + ROAD.embank) + 0.5, y: () => 0.05, u: 6 }]
          : [{ d: (x) => route.halfAt(x) + ROAD.embank - 0.5, y: () => 0.05, u: 0 }, { d: (x) => route.halfAt(x) + ROAD.embank + 70, y: () => 0.05, u: 6 }];
        const tg = new THREE.Mesh(ribbon(route, a, b, 8, cols, 12), mats.town);
        tg.receiveShadow = true;
        group.add(tg);
      }
      for (const side of [-1, 1]) {
        let s = a + r() * 6;
        let counterDone = 0;
        while (s < b) {
          if (route.bridgeAt(s) || nearStation(s, side * 20, 5) || route.plazaW(s) > 0 || route.plazaW(s + 16) > 0) { s += 20; continue; }   // no shops on the toll apron
          const w = 7 + r() * 8;
          const floors = big ? 3 + Math.floor(r() * 6) : 2 + Math.floor(r() * 3);
          const h = floors * FLOOR_H + 0.4;
          const dep = 10 + r() * 8;
          const gap = r() < 0.15 ? 6 + r() * 10 : 0.3;
          const sm = s + w / 2;
          const d = side * (ROAD.toe + 9 + dep / 2 + r() * 3);
          route.pointAt(sm, d, p);
          if (route.nearBranch?.(p.x, p.z, w / 2 + dep / 2) || route.junctionAt(sm, side * ROAD.half)) { s += w + gap + 6; continue; }   // keep side roads clear
          const [tx, tz] = route.tangentAt(sm);
          const yaw = Math.atan2(-tz, tx) + (side > 0 ? Math.PI : 0); // front faces the road
          m4.compose(p.setY(0.05), q.setFromAxisAngle(UP, yaw), sc.set(1, 1, 1));
          const fi = Math.floor(r() * N_FACADES);
          B.add(`f${fi}`, buildingGeo(w, h, dep).applyMatrix4(m4));
          // roof clutter
          const tank = new THREE.BoxGeometry(1.6, 1.4, 1.6).translate((r() - 0.5) * w * 0.6, h + 0.7, (r() - 0.5) * dep * 0.5);
          const parapet = new THREE.BoxGeometry(w, 0.8, 0.2).translate(0, h + 0.4, dep / 2 - 0.1);
          B.add('concrete', tank.applyMatrix4(m4));
          B.add('concrete', parapet.applyMatrix4(m4));
          // shop sign or operator counter
          const useCounter = counterDone < 1 && r() < 0.25;
          const sg = new THREE.PlaneGeometry(w - 0.8, 1.5).translate(0, FLOOR_H + 0.7, dep / 2 + 0.25).applyMatrix4(m4);
          if (useCounter) { B.add(`c${Math.floor(r() * OPERATORS.length)}`, sg); counterDone++; }
          else B.add(`s${Math.floor(r() * SHOP_COUNT)}`, sg);
          // awning
          if (r() < 0.5) B.add('tin', new THREE.BoxGeometry(w, 0.08, 2.2).translate(0, FLOOR_H - 0.2, dep / 2 + 1.1).applyMatrix4(m4));
          s += w + gap;
        }
        // mosque behind the front row
        if (r() < 0.8 && pl.town >= 300 && side === (pl.index % 2 ? 1 : -1)) {
          const sm = (a + b) / 2;
          route.pointAt(sm, side * (ROAD.toe + 48), p);
          if (validAt(sm, 0, p.x, p.z, 10)) {
            const mq = new THREE.Group();
            mq.position.set(p.x, 0, p.z);
            mq.rotation.y = route.yawAt(sm);
            const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 16), mats.mosque);
            hall.position.y = 3.5;
            const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.dome);
            dome.position.y = 7;
            const min = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 24, 10), mats.mosque);
            min.position.set(7, 12, 7);
            const mdome = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 10), mats.dome);
            mdome.position.set(7, 25.3, 7);
            for (const o of [hall, dome, min, mdome]) { o.castShadow = true; mq.add(o); }
            group.add(mq);
          }
        }
      }
      // median street lights
      for (let s = a; s < b; s += 36) {
        if (route.uturnAt(s) || route.uturnAt(s + 3) || route.uturnAt(s - 3) || route.tollDist(s) < 12) continue;
        route.pointAt(s, 0, p);
        const h0 = route.roadHeight(s) + 0.27;
        B.add('metal', new THREE.CylinderGeometry(0.08, 0.12, 9, 6).translate(p.x, h0 + 4.5, p.z));
        const bar = new THREE.BoxGeometry(3.2, 0.1, 0.1);
        bar.rotateY(route.yawAt(s) + Math.PI / 2);
        B.add('metal', bar.translate(p.x, h0 + 9.05, p.z));
        for (const sx of [-1, 1]) {
          const hp = route.pointAt(s, sx * 1.4);
          const arm = new THREE.BoxGeometry(0.8, 0.16, 0.3);
          arm.rotateY(route.yawAt(s) + Math.PI / 2);
          B.add('glow', arm.translate(hp.x, h0 + 9, hp.z));
        }
      }
    }

    yield;
    // ---------- road furniture ----------
    // km posts every 5 real km
    const total = route.realKm(route.length);
    for (let k = Math.ceil(route.realKm(s0) / 5) * 5; ; k += 5) {
      const s = route.sAtKm(k);
      if (s >= s1 || k > total) break;
      if (route.bridgeAt(s) || s < 30 || route.terminalAt(s, -(ROAD.half + 1))) continue;
      const km = Math.round(total - k);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.16), new THREE.MeshStandardMaterial({ map: kmPostTexture(km), roughness: 0.7 }));
      route.pointAt(s, -(route.halfAt(s) + 0.6), post.position);
      post.position.y = route.roadHeight(s) + 0.2;
      post.rotation.y = route.yawAt(s) + Math.PI;
      post.castShadow = true;
      group.add(post);
    }
    // billboards
    if (r() < 0.6) {
      const s = s0 + r() * (s1 - s0);
      if (!town(s) && !route.bridgeAt(s)) {
        const side = r() < 0.5 ? -1 : 1;
        const bb = new THREE.Group();
        route.pointAt(s, side * (route.halfAt(s) + ROAD.embank + 12), p);
        if (route.nearBranch?.(p.x, p.z, 10)) p.set(1e9, 0, 1e9);     // no billboard on a side road
        bb.position.set(p.x, 0, p.z);
        bb.rotation.y = route.yawAt(s) + Math.PI + side * -0.35 + (side > 0 ? 0 : 0);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), mats.billboards[Math.floor(r() * BILLBOARD_COUNT)]);
        panel.position.y = 9;
        const back = new THREE.Mesh(new THREE.BoxGeometry(12.3, 6.3, 0.3), mats.metal);
        back.position.set(0, 9, -0.2);
        bb.add(panel, back);
        for (const x of [-4, 4]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.35), mats.metal);
          leg.position.set(x, 3, -0.3);
          bb.add(leg);
        }
        bb.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        group.add(bb);
      }
    }

    I.canopy.build(group); I.trunk.build(group); I.palmTrunk.build(group); I.palm.build(group);
    I.bush.build(group); I.hut.build(group); I.roof.build(group); I.hay.build(group); I.pole.build(group);
    I.blob.build(far);
    B.build(group, (key) => {
      if (key[0] === 'f') return mats.facades[+key.slice(1)];
      if (key[0] === 's') return mats.signs[+key.slice(1)];
      if (key[0] === 'c') return counterMats[+key.slice(1)];
      if (key === 'tin') return mats.tin;
      if (key === 'metal') return mats.metal;
      if (key === 'glow') return streetGlowMat;
      return mats.concrete;
    });
    ctx.scene.add(group, far);
    ctx.chunks.register(group, (s0 + s1) / 2, CHUNK / 2);
    ctx.chunks.register(far, (s0 + s1) / 2, CHUNK / 2 + 2200);
    yield;
  }
  // signs whose post stands in this block
  for (const it of signItems) {
    if (!ctx.in(it.s)) continue;
    buildSign(route, ctx, mats, it);
  }
  yield;
  yield* hillsAndSeaChunk(route, ctx, mats);
}

function signPost(group, mat, w, h, s, d, route, yawFlip, heightAboveRoad = 2.4, mats) {
  const g = new THREE.Group();
  const p = route.pointAt(s, d);
  g.position.set(p.x, route.roadHeight(s), p.z);
  g.rotation.y = route.yawAt(s) + (yawFlip ? 0 : Math.PI);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.y = heightAboveRoad + h / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), mats.signBack);
  back.position.set(0, panel.position.y, -0.06);
  g.add(panel, back);
  for (const x of w > 3 ? [-w / 3, w / 3] : [0]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, heightAboveRoad + h, 8), mats.signLeg);
    leg.position.set(x, (heightAboveRoad + h) / 2 - 0.5, -0.1);
    g.add(leg);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(g);
}

// steel portal over the carriageway towards Chattogram with the green sign above the lanes
function gantry(group, mat, w, h, s, route, side = -1, mats) {
  const g = new THREE.Group();
  const p = route.pointAt(s, 0);
  g.position.set(p.x, route.roadHeight(s), p.z);
  // Chattogram-bound side: turn to face traffic coming up the left; Dhaka-bound side faces the other way
  g.rotation.y = route.yawAt(s) + (side < 0 ? Math.PI : 0);
  const steel = mats.steel;
  // after the PI turn local +x points along +d (right), so our carriageway is at negative x
  const legs = [-(ROAD.median + 0.4), -(ROAD.half + 0.8)];
  for (const d of legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8.2, 10), steel);
    leg.position.set(d, 4.1, 0);
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD.half - ROAD.median + 0.8, 0.5, 0.5), steel);
  beam.position.set((legs[0] + legs[1]) / 2, 7.8, 0.3);
  g.add(beam);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.set(-(ROAD.median + ROAD.lane), 7.6 - h / 2 + 0.4, 0.62);
  panel.rotation.y = 0;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), steel);
  back.position.set(panel.position.x, panel.position.y, 0.55);
  g.add(panel, back);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(g);
}

// where the road signs go (built later, block by block): direction gantries every ~1.9 km, town name boards
// and the speed limit after each town
function signPlan(route) {
  const L = route.length;
  const places = route.places;
  const majors = places.filter((p) => p.kind === 'city' || p.town >= 350);
  const kmTo = (s, target) => Math.max(1, Math.round(route.realKm(target.s) - route.realKm(s)));
  const kmBack = (s, target) => Math.max(1, Math.round(route.realKm(s) - route.realKm(target.s)));
  const end = places[places.length - 1], start = places[0];
  const nm = (p) => [p.bn.split(' (')[0], p.en.split(' (')[0]];
  const items = [];
  for (let s = 400; s < L - 300; s += 1900) {
    if (route.bridgeAt(s) || route.bridgeAt(s + 20) || route.tollDist(s) < PLAZA.reach + 70) s += 300;
    const ahead = majors.filter((p) => p.s > s + 200).slice(0, 2);
    const lines = ahead.map((p) => [...nm(p), kmTo(s, p)]);
    if (!lines.length || lines[lines.length - 1][1] !== nm(end)[1]) lines.push([...nm(end), kmTo(s, end)]);
    items.push({ s, d: -(ROAD.median + ROAD.lane), lines: lines.slice(-3), w: 6.2, flip: false, gantry: true });
    const behind = majors.filter((p) => p.s < s - 200).slice(-1);
    const bl = behind.map((p) => [...nm(p), kmBack(s, p)]);
    if (!bl.length || bl[0][1] !== nm(start)[1]) bl.push([...nm(start), kmBack(s, start)]);
    items.push({ s: s + 60, d: ROAD.median + ROAD.lane, lines: bl, w: 6.2, flip: true, gantry: true, side: 1 });
  }
  for (const p of places) {
    if (!p.town) continue;
    const sIn = p.s - p.town / 2 - 40;
    if (sIn > 50) items.push({ s: sIn, d: -(ROAD.half + 2.0), place: p, w: 4, flip: false, small: true });
    const sOut = p.s + p.town / 2 + 60;
    if (sOut < L - 50) items.push({ s: sOut, d: -(ROAD.half + 1.5), speed: true, w: 1.2, h: 1.2, flip: false, small: true });
    if (sOut < L - 50) items.push({ s: sOut + 10, d: ROAD.half + 2.0, place: p, w: 4, flip: true, small: true });
  }
  return items;
}

function buildSign(route, ctx, mats, it) {
  const group = new THREE.Group();
  const road = route.segAt(it.s).chain;
  const tex = it.lines ? directionSignTexture(it.lines, road.ref, road.bn) : it.place ? placeSignTexture(it.place.bn.split(' (')[0], it.place.en) : null;
  const mat = it.speed ? mats.speed : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const img = tex && tex.image;
  const h = it.h || (img ? it.w * (img.height / img.width) : 1);
  if (it.gantry) gantry(group, mat, it.w, h, it.s, route, it.side || -1, mats);
  else signPost(group, mat, it.w, h, it.s, it.d, route, it.flip, it.small ? 1.8 : 2.6, mats);
  ctx.scene.add(group);
  ctx.chunks.register(group, it.s, 60);
}

// smooth 2D value noise via sines (cheap, deterministic)
function hn(x, y) {
  return (Math.sin(x * 1.7 + Math.sin(y * 0.9)) + Math.sin(y * 1.3 + Math.sin(x * 1.1 + 2)) * 0.8 + Math.sin((x + y) * 2.9) * 0.3 + Math.sin(x * 5.1 - y * 4.3) * 0.12) / 2.2;
}

// hills (east of the road) and the sea (west), for the part of each range inside this block
function* hillsAndSeaChunk(route, ctx, mats) {
  const S0 = ctx.s0, S1 = Math.min(route.length, ctx.s1);
  for (const H of route.hills) {
    const s0 = Math.max(S0, H.s0), s1 = Math.min(S1, H.s1);
    if (s1 - s0 < 1) continue;
    const ex = 1; // world +x is east
    const ss = [];
    for (let s = s0; s < s1; s += 40) ss.push(s);
    ss.push(s1);
    const rows = ss.length, cols = 46;
    const pos = new Float32Array(rows * cols * 3), colr = new Float32Array(rows * cols * 3);
    const c = new THREE.Color();
    const p = new THREE.Vector3();
    for (let i = 0; i < rows; i++) {
      const s = ss[i];
      route.pointAt(s, 0, p);
      const fade = (H.openA ? THREE.MathUtils.smoothstep(s, H.s0, H.s0 + 2000) : 1) * (H.openB ? 1 - THREE.MathUtils.smoothstep(s, H.s1 - 2000, H.s1) : 1);
      for (let j = 0; j < cols; j++) {
        const lat = 220 + j * 45;
        const x = p.x + ex * lat, z = p.z;
        const ramp = THREE.MathUtils.smoothstep(lat, 220, 700);
        let h = (hn(s / 700, lat / 500) * 0.6 + 0.55) * 140 * ramp * fade;
        h += Math.max(0, hn(s / 200 + 3, lat / 180)) * 25 * ramp * fade;
        h = Math.max(0, h);
        const k = (i * cols + j) * 3;
        pos[k] = x; pos[k + 1] = h - 0.5; pos[k + 2] = z;
        c.setHSL(0.27 + hn(s / 90, lat / 80) * 0.03, 0.35, 0.2 + Math.min(0.12, h / 900) + hn(s / 60, lat / 50) * 0.03);
        colr[k] = c.r; colr[k + 1] = c.g; colr[k + 2] = c.b;
      }
    }
    const idx = [];
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, cc = a + cols, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(Math.floor(rows / 2) * cols + 20) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    const hills = new THREE.Mesh(g, mats.hills);
    hills.receiveShadow = true;
    ctx.scene.add(hills);
    ctx.chunks.register(hills, (s0 + s1) / 2, (s1 - s0) / 2 + 3000);
    yield;
  }
  for (const W of route.seas) {
    const s0 = Math.max(S0, W.s0), s1 = Math.min(S1, W.s1);
    if (s1 - s0 < 1) continue;
    const pts = [];
    const p = new THREE.Vector3();
    for (let s = s0; ; s += 150) {
      route.pointAt(Math.min(s, s1), 0, p);
      pts.push(new THREE.Vector3(p.x - 5200, 0, p.z));
      if (s >= s1) break;
    }
    if (pts.length < 2) continue;
    const sea = new THREE.Mesh(polyRibbon(pts, 7000, 0.25, s0), mats.sea);
    const flats = new THREE.Mesh(polyRibbon(pts.map((v) => v.clone().setX(v.x + 3200)), 1200, 0.1, s0), mats.flats);
    ctx.scene.add(sea, flats);
    ctx.chunks.register(sea, (s0 + s1) / 2, (s1 - s0) / 2 + 4000);
    ctx.chunks.register(flats, (s0 + s1) / 2, (s1 - s0) / 2 + 4000);
  }
}
