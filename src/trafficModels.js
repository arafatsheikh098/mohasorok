import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { truckBodyTexture, rng } from './textures.js';

const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0e161c, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.9 });

const paintCache = new Map();
function paint(hex) {
  if (!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.42, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 0.5 }));
  return paintCache.get(hex);
}
const truckTex = [];
function truckSideMat(i) {
  if (!truckTex[i]) truckTex[i] = new THREE.MeshStandardMaterial({ map: truckBodyTexture(i), roughness: 0.75 });
  return truckTex[i];
}

const geoCache = new Map();
function rbox(w, h, d, rad = 0.08) {
  const k = `${w}|${h}|${d}|${rad}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, rad));
  return geoCache.get(k);
}
function wheelGeo(R, w) {
  const k = `wheel${R}|${w}`;
  if (!geoCache.has(k)) {
    const t = new THREE.CylinderGeometry(R, R, w, 16);
    t.rotateZ(Math.PI / 2);
    const r = new THREE.CylinderGeometry(R * 0.55, R * 0.55, w + 0.02, 10);
    r.rotateZ(Math.PI / 2);
    geoCache.set(k, [t, r]);
  }
  return geoCache.get(k);
}

function lights() {
  return {
    head: new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff2d0, emissiveIntensity: 0 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x700000, emissive: 0xff1a0a, emissiveIntensity: 0 }),
  };
}

function add(root, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  root.add(m);
  return m;
}

function addWheels(root, R, w, xs, zs) {
  const [tg, rg] = wheelGeo(R, w);
  const list = [];
  for (const z of zs) for (const x of xs) {
    const g = new THREE.Group();
    g.position.set(x, R, z);
    g.add(new THREE.Mesh(tg, tireMat), new THREE.Mesh(rg, rimMat));
    root.add(g);
    list.push(g);
  }
  return list;
}

function addLamps(root, L, W, y, mats, headW = 0.22) {
  for (const sx of [-1, 1]) {
    add(root, rbox(headW, 0.12, 0.05, 0.03), mats.head, sx * (W / 2 - 0.25), y, L / 2 + 0.01, false);
    add(root, rbox(0.18, 0.14, 0.05, 0.03), mats.tail, sx * (W / 2 - 0.2), y + 0.05, -L / 2 - 0.01, false);
  }
}

const TRUCK_CABS = [0xf9a825, 0xe53935, 0xfb8c00, 0x1e88e5, 0x43a047, 0xfdd835];
export function buildTruck(seed) {
  const r = rng(seed);
  const root = new THREE.Group();
  const L = 8.6, W = 2.4;
  const mats = lights();
  const cab = paint(TRUCK_CABS[(r() * TRUCK_CABS.length) | 0]);
  // chassis
  add(root, rbox(W - 0.6, 0.3, L - 0.6, 0.04), darkMat, 0, 0.75, 0);
  // cab (short nose)
  add(root, rbox(W, 1.55, 1.9, 0.12), cab, 0, 1.75, L / 2 - 1.05);
  add(root, rbox(W - 0.1, 0.7, 0.6, 0.12), cab, 0, 1.05, L / 2 - 0.25);
  add(root, rbox(W - 0.25, 0.75, 0.05, 0.04), glassMat, 0, 2.05, L / 2 - 0.08, false);
  for (const sx of [-1, 1]) add(root, rbox(0.04, 0.6, 0.9, 0.02), glassMat, sx * (W / 2 + 0.005), 2.05, L / 2 - 0.85, false);
  add(root, rbox(W + 0.05, 0.25, 0.15, 0.04), darkMat, 0, 0.75, L / 2 + 0.02);
  // cargo body
  const bodyL = L - 2.3, bz = -L / 2 + bodyL / 2 + 0.05;
  const kind = r();
  const side = truckSideMat(seed % 7);
  add(root, rbox(W, 0.12, bodyL, 0.02), woodMat, 0, 1.0, bz);
  const sideGeo = new THREE.BoxGeometry(0.08, 1.35, bodyL);
  for (const sx of [-1, 1]) {
    const m = add(root, sideGeo, side, sx * (W / 2 - 0.04), 1.75, bz);
    m.rotation.y = 0;
  }
  add(root, new THREE.BoxGeometry(W, 1.35, 0.08), side, 0, 1.75, -L / 2 + 0.09);
  add(root, new THREE.BoxGeometry(W, 1.6, 0.08), side, 0, 1.85, bz + bodyL / 2 - 0.04);
  if (kind < 0.45) {
    // tarpaulin hump
    const tg = new THREE.CylinderGeometry(W / 2, W / 2, bodyL - 0.1, 14, 1, false, 0, Math.PI);
    tg.rotateX(Math.PI / 2);
    tg.rotateZ(Math.PI / 2);
    const tarp = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: r() < 0.5 ? 0x1565c0 : 0xf9a825, roughness: 0.85, side: THREE.DoubleSide }));
    tarp.position.set(0, 2.42, bz);
    tarp.scale.set(1, 0.55, 1);
    tarp.castShadow = true;
    root.add(tarp);
  } else if (kind < 0.8) {
    // load of sacks
    const sack = new THREE.MeshStandardMaterial({ color: r() < 0.5 ? 0xd7ccc8 : 0x8d6e63, roughness: 1 });
    add(root, rbox(W - 0.2, 0.9, bodyL - 0.3, 0.35), sack, 0, 2.55, bz);
  }
  addLamps(root, L, W, 0.95, mats, 0.25);
  const wheels = addWheels(root, 0.5, 0.32, [-(W / 2 - 0.2), W / 2 - 0.2], [L / 2 - 1.5, -L / 2 + 1.9, -L / 2 + 2.95]);
  return { root, mats, len: L, wid: W, wheels, wheelR: 0.5, kind: 'truck' };
}

const CAR_COLS = [0xf2f2f2, 0xe8e8e8, 0xb9bec4, 0x202224, 0x8a1c1c, 0x2f4f7f, 0xd9d9d9];
export function buildCar(seed) {
  const r = rng(seed);
  const root = new THREE.Group();
  const L = 4.5, W = 1.76;
  const mats = lights();
  const p = paint(CAR_COLS[(r() * CAR_COLS.length) | 0]);
  add(root, rbox(W, 0.62, L, 0.18), p, 0, 0.62, 0);
  add(root, rbox(W - 0.14, 0.55, 2.3, 0.2), p, 0, 1.15, -0.25);
  add(root, rbox(W - 0.1, 0.46, 2.2, 0.18), glassMat, 0, 1.14, -0.25, false);
  addLamps(root, L, W, 0.72, mats);
  const wheels = addWheels(root, 0.31, 0.22, [-(W / 2 - 0.15), W / 2 - 0.15], [L / 2 - 0.95, -L / 2 + 0.95]);
  return { root, mats, len: L, wid: W, wheels, wheelR: 0.31, kind: 'car' };
}

export function buildMicrobus(seed) {
  const r = rng(seed);
  const root = new THREE.Group();
  const L = 4.7, W = 1.72;
  const mats = lights();
  const p = paint(r() < 0.75 ? 0xf4f4f4 : 0xb0b6bb);
  add(root, rbox(W, 1.55, L, 0.2), p, 0, 1.2, 0);
  add(root, rbox(W + 0.01, 0.5, L - 0.8, 0.1), glassMat, 0, 1.55, -0.3, false);
  add(root, rbox(W - 0.2, 0.55, 0.05, 0.05), glassMat, 0, 1.52, L / 2 - 0.03, false);
  addLamps(root, L, W, 0.8, mats);
  const wheels = addWheels(root, 0.32, 0.22, [-(W / 2 - 0.15), W / 2 - 0.15], [L / 2 - 0.85, -L / 2 + 0.95]);
  return { root, mats, len: L, wid: W, wheels, wheelR: 0.32, kind: 'micro' };
}

const cngGreen = paint(0x1b8f3a);
const cngCanopy = new THREE.MeshStandardMaterial({ color: 0x1f3d24, roughness: 0.9 });
const cageMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.6 });
export function buildCNG() {
  const root = new THREE.Group();
  const L = 2.7, W = 1.35;
  const mats = lights();
  add(root, rbox(W, 0.6, L, 0.2), cngGreen, 0, 0.62, -0.05);
  add(root, rbox(0.8, 0.55, 0.5, 0.2), cngGreen, 0, 0.75, L / 2 - 0.2);
  add(root, rbox(W + 0.04, 0.12, L - 0.2, 0.06), cngCanopy, 0, 1.72, -0.1);
  // cage pillars
  for (const sx of [-1, 1]) for (const z of [L / 2 - 0.35, -0.2, -L / 2 + 0.2]) add(root, new THREE.BoxGeometry(0.04, 0.8, 0.04), cageMat, sx * (W / 2 - 0.02), 1.3, z, false);
  add(root, rbox(W - 0.1, 0.55, 0.04, 0.02), glassMat, 0, 1.32, L / 2 - 0.35, false);
  add(root, rbox(0.25, 0.14, 0.05, 0.04), mats.head, 0, 0.9, L / 2 + 0.06, false);
  for (const sx of [-1, 1]) add(root, rbox(0.12, 0.12, 0.05, 0.03), mats.tail, sx * 0.5, 0.7, -L / 2 - 0.08, false);
  const wheels = addWheels(root, 0.22, 0.14, [0], [L / 2 - 0.25]).concat(addWheels(root, 0.22, 0.14, [-0.55, 0.55], [-L / 2 + 0.55]));
  return { root, mats, len: L, wid: W, wheels, wheelR: 0.22, kind: 'cng' };
}

export function setVehicleLights(v, head, brake) {
  v.mats.head.emissiveIntensity = head ? 5 : 0;
  v.mats.tail.emissiveIntensity = brake ? 6 : head ? 2 : 0;
}
