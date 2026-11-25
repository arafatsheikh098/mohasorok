// Glow for AI vehicle lamps: headlight halos (dipped / high beam / passing flash), the pool of light
// the beam throws on the road at night, and amber blink halos for the indicators.
// The game has no bloom pass, so these additive sprites are what make a lamp read as "on".
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './textures.js';

let haloMap = null, poolMap = null;
function haloTexture() {
  if (haloMap) return haloMap;
  const S = 128;
  const [c, x] = makeCanvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,250,235,0.9)');
  g.addColorStop(0.4, 'rgba(255,240,210,0.3)');
  g.addColorStop(1, 'rgba(255,230,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  haloMap = canvasTexture(c, { repeat: false });
  return haloMap;
}
// teardrop of light on the asphalt: bright near the bumper, fading out ahead
function poolTexture() {
  if (poolMap) return poolMap;
  const W = 64, H = 256;
  const [c, x] = makeCanvas(W, H);
  const img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const t = j / (H - 1);                       // 0 = far end, 1 = at the bumper
    const along = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (0.35 + 0.65 * t);
    const half = 0.25 + 0.75 * (1 - t);          // wider far away
    for (let i = 0; i < W; i++) {
      const u = Math.abs(i / (W - 1) - 0.5) * 2 / half;
      const a = Math.max(0, 1 - u * u) * along;
      const k = (j * W + i) * 4;
      img.data[k] = 255; img.data[k + 1] = 238; img.data[k + 2] = 205; img.data[k + 3] = Math.round(a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  poolMap = canvasTexture(c, { repeat: false });
  return poolMap;
}

const AMBER = 0xffa020;
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);   // starts at z=0, runs to +z

function sprite(map, color) {
  const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true });
  const s = new THREE.Sprite(m);
  s.visible = false;
  return s;
}

// geo: { front, rear (z in the vehicle group), headX (lamp half-spacing, 0 = single lamp), headY, indX, indY }
export function addLampGlow(group, geo) {
  const map = haloTexture();
  const heads = (geo.headX ? [-1, 1] : [0]).map((sx) => {
    const s = sprite(map, 0xfff3dc);
    s.position.set(sx * geo.headX, geo.headY, geo.front + 0.35);
    group.add(s);
    return s;
  });
  const ind = { L: [], R: [] };
  for (const sx of [-1, 1]) {
    for (const z of [geo.front + 0.15, geo.rear - 0.15]) {
      const s = sprite(map, AMBER);
      s.position.set(sx * geo.indX, geo.indY, z);
      group.add(s);
      (sx > 0 ? ind.L : ind.R).push(s);     // +x is the vehicle's left
    }
  }
  const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2 }));
  pool.position.set(0, 0.07, geo.front + 0.5);
  pool.visible = false;
  pool.renderOrder = 1;
  group.add(pool);
  return { heads, ind, pool };
}

const _f = new THREE.Vector3(), _c = new THREE.Vector3();
// beam: 0 off, 1 dipped, 2 high. facing: how much the front points at the camera (-1..1).
export function updateLampGlow(glow, { beam, night, indL, indR, facing, dist }) {
  const front = THREE.MathUtils.smoothstep(facing, -0.05, 0.6);
  const far = 1 + Math.min(dist, 600) / 120;      // keep distant lamps visible as points
  let op = 0, sc = 0;
  if (beam === 2) { op = night ? 1 : 0.85; sc = night ? 3.6 : 2.4; }
  else if (beam === 1) { op = night ? 0.6 : 0.25; sc = night ? 1.05 : 0.8; }
  op *= front;
  for (const h of glow.heads) {
    h.visible = op > 0.01;
    h.material.opacity = op;
    h.scale.setScalar(sc * Math.min(far, 3));
  }
  const ia = night ? 0.95 : 0.75, is = (night ? 1.1 : 0.75) * Math.min(far, 2.5);
  for (const [list, on] of [[glow.ind.L, indL], [glow.ind.R, indR]]) {
    for (const s of list) { s.visible = on; s.material.opacity = ia; s.scale.setScalar(is); }
  }
  const pool = glow.pool;
  pool.visible = night && beam > 0;
  if (pool.visible) {
    pool.material.opacity = beam === 2 ? 0.5 : 0.38;
    pool.scale.set(beam === 2 ? 9 : 6.5, 1, beam === 2 ? 55 : 24);
  }
}

// how much the vehicle's nose points at the camera
export function facingCamera(wrap, cam) {
  _f.set(Math.sin(wrap.rotation.y), 0, Math.cos(wrap.rotation.y));
  _c.subVectors(cam.position, wrap.position).setY(0);
  const d = _c.length();
  return { facing: d > 1e-3 ? _f.dot(_c) / d : 0, dist: d };
}
