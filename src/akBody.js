// Rounded Hino AK1J body shell, built from horizontal slices (plan view = rounded rectangle).
// Gives the wrap-around windshield, rounded front corners and curved roof edges of the BD AK1J
// bodies, instead of a box. Four meshes (left, front, right, rear) so the existing livery
// painters keep working; the windshield area is left open and covered by a curved glass mesh.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const FRONT_ROOF_R = 0.5;    // how far the roof rolls down into the windshield

export function akSlice(s, y) {
  const Rs = s.roofR;
  const sideIn = y > s.H - Rs ? Rs - Math.sqrt(Math.max(0, Rs * Rs - (y - (s.H - Rs)) ** 2)) : 0;
  const frontIn = y > s.H - FRONT_ROOF_R ? FRONT_ROOF_R - Math.sqrt(Math.max(0, FRONT_ROOF_R ** 2 - (y - (s.H - FRONT_ROOF_R)) ** 2)) : 0;
  const lean = y <= s.wsBot ? 0 : s.rake * Math.min(1, (y - s.wsBot) / (s.glassTop - s.wsBot));
  const hw = s.W / 2 - sideIn;
  const rcF = Math.min(hw - 0.05, 0.3 + 0.15 * smooth(s.wsBot - 0.1, s.wsBot + 0.2, y));
  const rcR = Math.min(hw - 0.05, 0.22);
  return { y, hw, zF: s.front - lean - frontIn, zR: s.rear + sideIn, rcF, rcR };
}
// z of the front surface (flat middle part) at height y
export const akFrontZ = (s, y) => akSlice(s, y).zF;

export const SKIRT = 0.13;                  // body skirt hangs this far below the floor line
export const archR = (s) => s.wheelR + 0.12;

function heights(s) {
  const ys = [s.floor - SKIRT, s.floor, s.floor + 0.25, s.wsBot - 0.15, s.wsBot - 0.05, s.wsBot, s.glassTop, s.winBot, s.winTop];
  for (let y = s.wsBot; y < s.glassTop; y += 0.2) ys.push(y);
  for (let y = s.floor - SKIRT; y < s.wheelR + archR(s) + 0.1; y += 0.06) ys.push(y);   // fine rows for the wheel arches
  const top0 = s.H - Math.max(s.roofR, FRONT_ROOF_R);
  for (let k = 0; k <= 12; k++) ys.push(top0 + (s.H - top0) * (1 - Math.cos((k / 12) * Math.PI / 2)));
  ys.sort((a, b) => a - b);
  return ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.012);
}

const arc = (cx, cz, r, a0, a1, n, ws) => {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n);
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a), ws });
  }
  return out;
};
const D = Math.PI / 180;
// fixed sample count so every slice has the same number of points (~9 cm apart on a 10.6 m bus)
const line = (a, b, f) => { const n = 110; return Array.from({ length: n + 1 }, (_, k) => f(a + (b - a) * (k / n))); };
// plan-view samples of one slice for each of the four panels (angles: 0 = +x/left side, 90 = +z/front)
function samples(sl, part) {
  const { hw, zF, zR, rcF, rcR } = sl;
  const cxF = hw - rcF, czF = zF - rcF, cxR = hw - rcR, czR = zR + rcR;
  const pts = [];
  const push = (arr) => { for (const p of arr) { const q = pts[pts.length - 1]; if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 1e-5) pts.push(p); } };
  if (part === 'left') {
    push(arc(cxR, czR, rcR, -45 * D, 0, 4, false));
    push(line(czR, czF, (z) => ({ x: hw, z, nx: 1, nz: 0, ws: false })));
    push(arc(cxF, czF, rcF, 0, 45 * D, 6, true));
  } else if (part === 'front') {
    push(arc(cxF, czF, rcF, 45 * D, 90 * D, 6, true));
    push([{ x: 0, z: zF, nx: 0, nz: 1, ws: true }]);
    push(arc(-cxF, czF, rcF, 90 * D, 135 * D, 6, true));
  } else if (part === 'right') {
    push(arc(-cxF, czF, rcF, 135 * D, 180 * D, 6, true));
    push(line(czF, czR, (z) => ({ x: -hw, z, nx: -1, nz: 0, ws: false })));
    push(arc(-cxR, czR, rcR, 180 * D, 225 * D, 4, false));
  } else {
    push(arc(-cxR, czR, rcR, 225 * D, 270 * D, 4, false));
    push([{ x: 0, z: zR, nx: 0, nz: -1, ws: false }]);
    push(arc(cxR, czR, rcR, 270 * D, 315 * D, 4, false));
  }
  return pts;
}

function grid(rows, uvOf, skip, offset = 0) {
  const pos = [], uv = [], idx = [];
  const nj = rows[0].pts.length;
  for (const r of rows) for (const p of r.pts) {
    pos.push(p.x + p.nx * offset, r.y, p.z + p.nz * offset);
    uv.push(...uvOf(p, r.y));
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < nj - 1; j++) {
    if (skip && skip(rows[i], rows[i + 1], j)) continue;
    const a = i * nj + j, b = a + 1, c = a + nj + 1, d = a + nj;
    idx.push(a, d, c, a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the faces point outward (flip if the first face looks inward)
  const n = g.attributes.normal, p = g.attributes.position;
  let dot = 0;
  for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 40))) dot += n.getX(i) * p.getX(i) + n.getZ(i) * (p.getZ(i) - rows[0].zc);
  if (dot < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// returns { meshes, glass }
const geoCache = new Map();
export function buildAkShell(s, mats, glassMat) {
  if (!geoCache.has(s)) geoCache.set(s, buildGeometry(s));
  const G = geoCache.get(s);
  const meshes = ['left', 'front', 'right', 'rear'].map((part) => {
    const m = new THREE.Mesh(G[part], mats[part]);
    m.castShadow = true;
    return m;
  });
  const roofMesh = new THREE.Mesh(G.roof, mats.roof);
  roofMesh.castShadow = true;
  meshes.push(roofMesh, new THREE.Mesh(G.floor, mats.under));
  // dark wheel wells behind the arches
  for (const wz of s.wheelZ) {
    const well = new THREE.Mesh(G.well, mats.under);
    well.position.set(0, s.wheelR, wz);
    meshes.push(well);
  }
  const glass = new THREE.Mesh(G.glass, glassMat);
  glass.renderOrder = 2;
  return { meshes, glass };
}

function buildGeometry(s) {
  const out = {};
  const ys = heights(s);
  const zc = (s.front + s.rear) / 2;
  const y0 = s.floor + s.r, y1 = s.H - s.r, z0 = s.front - s.r, z1 = s.rear + s.r;
  const hwT = s.W / 2 - s.r;
  const v = (y) => (y - y0) / (y1 - y0);
  const uvs = {
    left: (p, y) => [(z0 - p.z) / (z0 - z1), v(y)],
    right: (p, y) => [1 - (z0 - p.z) / (z0 - z1), v(y)],
    front: (p, y) => [(p.x + hwT) / (2 * hwT), v(y)],
    rear: (p, y) => [(hwT - p.x) / (2 * hwT), v(y)],
  };
  const inGlass = (ra, rb) => ra.y >= s.wsBot - 1e-6 && rb.y <= s.glassTop + 1e-6;
  const AR = archR(s);
  const inArch = (ra, rb, j) => {
    const zm = (ra.pts[j].z + ra.pts[j + 1].z) / 2, ym = (ra.y + rb.y) / 2;
    return s.wheelZ.some((wz) => (zm - wz) ** 2 + (ym - s.wheelR) ** 2 < AR * AR);
  };
  for (const part of ['left', 'front', 'right', 'rear']) {
    const rows = ys.map((y) => ({ y, zc, pts: samples(akSlice(s, y), part) }));
    const side = part === 'left' || part === 'right';
    const skip = (ra, rb, j) => (inGlass(ra, rb) && ra.pts[j].ws && ra.pts[j + 1].ws) || (side && inArch(ra, rb, j));
    out[part] = grid(rows, uvs[part], skip);
  }
  const well = new THREE.CylinderGeometry(AR, AR, s.W - 0.06, 20, 1, true, 0, Math.PI);
  well.rotateZ(Math.PI / 2);
  out.well = well;
  // roof cap
  const top = akSlice(s, s.H);
  const ring = ['left', 'front', 'right', 'rear'].flatMap((p) => samples(top, p));
  const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.z)));
  const roof = new THREE.ShapeGeometry(shape, 4);
  roof.rotateX(-Math.PI / 2);
  roof.translate(0, s.H, 0);
  out.roof = roof;
  // floor cap (closes the body seen from low angles)
  const bot = akSlice(s, s.floor - SKIRT);
  const ringB = ['left', 'front', 'right', 'rear'].flatMap((p) => samples(bot, p));
  const fl = new THREE.ShapeGeometry(new THREE.Shape(ringB.map((p) => new THREE.Vector2(p.x, p.z))), 4);
  fl.rotateX(Math.PI / 2);
  fl.translate(0, s.floor - SKIRT, 0);
  out.floor = fl;
  // wrap-around windshield glass over the opening
  const gRows = ys.filter((y) => y >= s.wsBot - 1e-6 && y <= s.glassTop + 1e-6).map((y) => {
    const sl = akSlice(s, y);
    const pts = [...samples(sl, 'left').filter((p) => p.ws), ...samples(sl, 'front').slice(1), ...samples(sl, 'right').filter((p) => p.ws).slice(1)];
    return { y, zc, pts };
  });
  out.glass = grid(gRows, () => [0, 0], null, 0.008);
  return out;
}
