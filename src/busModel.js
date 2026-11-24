import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTexture, rng, EN_FONT, BN_FONT, grassTexture } from './textures.js';
import { paintSide, paintFront, paintRear, paintHeader, randomPlate, liveryFor } from './operators.js';
import { drawRegion } from './skins.js';
import { buildAkShell, akFrontZ } from './akBody.js';

export const BUS_TYPES = {
  ak1j: {
    name: 'AK1J AC', desc: 'Hino AK1J, BD-built AC body', L: 10.6, W: 2.5, H: 3.3, floor: 0.45, winBot: 1.58, winTop: 2.86,
    wheelbase: 5.4, rearOH: 2.95, wheelR: 0.5, pillars: 7, ac: true, bays: true, framed: false, rack: true, bags: false,
    eye: 2.0, wsBot: 1.3, dashY: 1.58, rake: 0.12, mass: 14000, power: 280, seatRows: 9, seat: 0x7a1f2b,
    cockpit: 'ak', bevel: 0.26, frontR: 0.4, roofR: 0.34, eyeZ: 1.62, seatStart: 2.4, visor: false,
  },
  coach: {
    name: 'Coach', desc: 'Universe-style AC coach', L: 12, W: 2.5, H: 3.55, floor: 0.38, winBot: 1.9, winTop: 3.25,
    wheelbase: 6.1, rearOH: 3.1, wheelR: 0.52, pillars: 7, ac: true, bays: true, framed: false, rack: false,
    eye: 2.4, wsBot: 1.6, rake: 0.32, mass: 17500, power: 300, seatRows: 10, seat: 0x7a1f2b,
  },
  highdeck: {
    name: 'High-deck', desc: 'Scania/Volvo-style double-glazed', L: 12.3, W: 2.55, H: 3.8, floor: 0.4, winBot: 2.15, winTop: 3.6,
    wheelbase: 6.3, rearOH: 3.2, wheelR: 0.53, pillars: 6, ac: true, bays: true, framed: false, rack: false,
    eye: 2.65, wsBot: 1.78, rake: 0.3, mass: 18500, power: 330, seatRows: 11, seat: 0x1f3a6b,
  },
  local: {
    name: 'AK1J Non-AC', desc: 'Hino AK1J local body, roof rack', L: 10.4, W: 2.45, H: 3.15, floor: 0.45, winBot: 1.5, winTop: 2.68,
    wheelbase: 5.3, rearOH: 2.9, wheelR: 0.5, pillars: 9, ac: false, bays: false, framed: true, rack: true, bags: true,
    eye: 1.94, wsBot: 1.26, dashY: 1.5, rake: 0.1, mass: 13000, power: 250, seatRows: 10, seat: 0x2e5d3a,
    cockpit: 'ak', bevel: 0.22, frontR: 0.32, eyeZ: 1.6, seatStart: 2.35, visor: false,
  },
};
for (const s of Object.values(BUS_TYPES)) {
  s.r = 0.12;
  s.front = s.L - s.rearOH;
  s.rear = -s.rearOH;
  s.center = (s.front + s.rear) / 2;
  s.wheelZ = [s.wheelbase, 0];
  s.roofR = s.roofR || 0.3;
  s.frontR = s.frontR || 0.24;
  s.bevel = s.bevel || 0.13;
  s.eyeZ = s.eyeZ || 1.9;
  s.seatStart = s.seatStart || 3.0;
  s.cockpit = s.cockpit || 'coach';
  s.dashY = s.dashY || s.wsBot;
  s.glassTop = s.H - s.frontR - 0.04;
  s.driverX = -(s.W / 2 - 0.62);
  s.lampX = s.W / 2 - Math.max(0.15, s.bevel * 0.9);   // keeps lamps on the flat end faces
}
// z of the windshield surface at height y (it leans back)
const wsZ = (s, y) => s.front - s.rake * THREE.MathUtils.clamp((y - s.wsBot) / (s.glassTop - s.wsBot), 0, 1);

const texCache = new Map();
function liveryTextures(type, op, scale, plate) {
  const key = `${type}|${op.id}|${op.ver || 0}|${scale}`;
  if (texCache.has(key)) return texCache.get(key);
  const s = BUS_TYPES[type];
  const sideL = s.L - 2 * s.r, sideH = s.H - s.floor - 2 * s.r;
  const W = Math.round(2048 * scale), H = Math.round((W * sideH) / sideL * 1.6);
  const [cl, xl] = makeCanvas(W, H);
  const [cr, xr] = makeCanvas(W, H);
  const fw = Math.round(1024 * scale), fh = Math.round((fw * sideH) / (s.W - 2 * s.r));
  const [cf, xf] = makeCanvas(fw, fh);
  const [cb, xb] = makeCanvas(fw, fh);
  if (op.custom) {
    // imported skin: copy the marked regions; fall back to painted front/rear in the skin's colours
    if (!drawRegion(xl, W, H, op.custom, 'left')) paintSide(xl, W, H, s, op, true);
    if (!drawRegion(xr, W, H, op.custom, 'right')) paintSide(xr, W, H, s, op, false);
    if (!drawRegion(xf, fw, fh, op.custom, 'front')) paintFront(xf, fw, fh, s, op, plate);
    if (!drawRegion(xb, fw, fh, op.custom, 'rear')) paintRear(xb, fw, fh, s, op, plate);
  } else {
    paintSide(xl, W, H, s, op, true);
    paintSide(xr, W, H, s, op, false);
    paintFront(xf, fw, fh, s, op, plate);
    paintRear(xb, fw, fh, s, op, plate);
  }
  const o = { left: canvasTexture(cl, { repeat: false }), right: canvasTexture(cr, { repeat: false }), front: canvasTexture(cf, { repeat: false }), rear: canvasTexture(cb, { repeat: false }) };
  texCache.set(key, o);
  return o;
}

// shared materials
const M = {
  tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.3, metalness: 0.85 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xe2e5e8, roughness: 0.15, metalness: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0x8fa3b0, roughness: 0.05, metalness: 1 }),
  acUnit: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.4, metalness: 0.2 }),
  rack: new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.5, metalness: 0.5 }),
  wellDark: new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.9, side: THREE.DoubleSide }),
  glassAIws: new THREE.MeshPhysicalMaterial({ color: 0x18374a, roughness: 0.05, metalness: 0.45, envMapIntensity: 1.5 }),
  glassAI: new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.86, envMapIntensity: 1.2 }),
  // outer face only (FrontSide): dark reflective glass from outside, invisible from the cab
  glassPlayer: new THREE.MeshPhysicalMaterial({ color: 0x1a4f78, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.6, envMapIntensity: 1.2, depthWrite: false }),
};
const wheelGeo = {};
function getWheelGeo(R, wid) {
  const k = `${R}|${wid}`;
  if (!wheelGeo[k]) {
    const tire = new THREE.CylinderGeometry(R, R, wid, 28, 1);
    tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(R * 0.58, R * 0.58, wid + 0.02, 18, 1);
    rim.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(R * 0.3, R * 0.34, wid + 0.08, 16, 1);   // chrome hub cap
    hub.rotateZ(Math.PI / 2);
    const nuts = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.BoxGeometry(wid + 0.05, 0.05, 0.05);
      const a = (i / 8) * Math.PI * 2;
      b.translate(0, Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44);
      nuts.push(b);
    }
    wheelGeo[k] = { tire, rim, hub: mergeGeometries([hub, ...nuts]) };
  }
  return wheelGeo[k];
}

function wheel(R, wid) {
  const g = getWheelGeo(R, wid);
  const w = new THREE.Group();
  const t = new THREE.Mesh(g.tire, M.tire);
  const r = new THREE.Mesh(g.rim, M.rim);
  const h = new THREE.Mesh(g.hub, M.hub);
  t.castShadow = true;
  w.add(t, r, h);
  return w;
}

function lightMat(color, emissive) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 });
}

// Side profile of the body (x = bus z, y = height); sign = -1 mirrors it.
function profileShape(s, inset = 0, sign = 1) {
  const zF = s.front - inset, zR = s.rear + inset, yB = s.floor + inset, yT = s.H - inset;
  const rf = s.frontR, rr = s.roofR;
  const sh = new THREE.Shape();
  const P = (z, y) => [sign * z, y];
  sh.moveTo(...P(zR, yB));
  sh.lineTo(...P(zF, yB));
  sh.lineTo(...P(zF, s.wsBot));
  sh.lineTo(...P(zF - s.rake, yT - rf));
  sh.quadraticCurveTo(...P(zF - s.rake - 0.02, yT), ...P(zF - s.rake - rf, yT));
  sh.lineTo(...P(zR + rr, yT));
  sh.quadraticCurveTo(...P(zR, yT), ...P(zR, yT - rr));
  sh.lineTo(...P(zR, yB));
  return sh;
}

// Extrude an (x = bus z, y) outline across the bus from x0 to x1.
function extrudeAcross(shape, x0, x1, bevel = 0) {
  const depth = x1 - x0 - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10,
  });
  g.rotateY(-Math.PI / 2);           // shape x -> bus z, extrusion -> -x
  g.translate(x1 - bevel, 0, 0);
  g.computeVertexNormals();
  return g;
}

function quadAlong(a, b, width, offsetNormal = 0) {
  // a plane spanning from point a (bottom centre) to b (top centre) across x
  const len = a.distanceTo(b);
  const g = new THREE.PlaneGeometry(width, len);
  const m = new THREE.Mesh(g);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  const ang = Math.atan2(a.z - b.z, b.y - a.y); // lean back
  m.rotation.x = -ang;
  m.translateZ(offsetNormal);
  return m;
}

export function buildBus(type, opIn, { interior = false, texScale = 1, seed = 1 } = {}) {
  const s = BUS_TYPES[type];
  const op = liveryFor(opIn, type);
  const r = rng(seed);
  const plate = randomPlate(r, r() < 0.7 ? 'ঢাকা' : 'চট্ট');
  const tex = liveryTextures(type, op, texScale, plate);
  const root = new THREE.Group();
  const pivot = new THREE.Group();          // roll/pitch pivot
  pivot.position.set(0, 1.0, s.center);
  const body = new THREE.Group();
  body.position.set(0, -1.0, -s.center);
  pivot.add(body);
  root.add(pivot);
  const exterior = new THREE.Group();
  body.add(exterior);
  const eye = new THREE.Vector3(s.driverX, s.eye, s.front - s.eyeZ);

  const paint = { roughness: 0.42, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.22, envMapIntensity: 0.45 };
  const baseMat = new THREE.MeshPhysicalMaterial({ color: op.roof || op.base, ...paint });
  const bev = s.bevel;  // rounded corners (AK1J bodies are very round in plan)
  const mk = (map) => new THREE.MeshPhysicalMaterial({ map, ...paint });
  const AK = s.cockpit === 'ak';
  if (AK) {
    // rounded AK1J shell with a wrap-around windshield (akBody.js)
    const { meshes, glass } = buildAkShell(s, { left: mk(tex.left), right: mk(tex.right), front: mk(tex.front), rear: mk(tex.rear), roof: baseMat, under: M.wellDark },
      interior ? M.glassPlayer : M.glassAIws);
    exterior.add(...meshes, glass);
  } else {
  const shell = new THREE.Mesh(extrudeAcross(profileShape(s, bev), -s.W / 2, s.W / 2, bev), baseMat);
  shell.castShadow = true;
  exterior.add(shell);

  // livery side panels follow the profile
  const y0 = s.floor + s.r, y1 = s.H - s.r, z0 = s.front - s.r, z1 = s.rear + s.r;
  const sidePanel = (left) => {
    const g = new THREE.ShapeGeometry(profileShape(s, bev + 0.01, left ? -1 : 1), 10);   // only on the flat part of the side
    g.rotateY(left ? Math.PI / 2 : -Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = (z0 - p.getZ(i)) / (z0 - z1);
      uv.setXY(i, left ? t : 1 - t, (p.getY(i) - y0) / (y1 - y0));
    }
    g.translate(left ? s.W / 2 + 0.004 : -s.W / 2 - 0.004, 0, 0);
    return new THREE.Mesh(g, mk(left ? tex.left : tex.right));
  };
  exterior.add(sidePanel(true), sidePanel(false));
  // front panel below the windshield
  const fh = s.wsBot - y0;
  const fGeo = new THREE.PlaneGeometry(s.W - 2 * Math.max(s.r, bev * 0.75), fh);
  const fv = fh / (y1 - y0);
  fGeo.attributes.uv.setY(0, fv); fGeo.attributes.uv.setY(1, fv);
  fGeo.attributes.uv.setY(2, 0); fGeo.attributes.uv.setY(3, 0);
  const front = new THREE.Mesh(fGeo, mk(tex.front));
  front.position.set(0, y0 + fh / 2, s.front + 0.004);
  // rear panel (stops below the rounded roof)
  const rh = s.H - s.roofR - y0;
  const rGeo = new THREE.PlaneGeometry(s.W - 2 * Math.max(s.r, bev * 0.75), rh);
  const rv = rh / (y1 - y0);
  rGeo.attributes.uv.setY(0, rv); rGeo.attributes.uv.setY(1, rv);
  rGeo.attributes.uv.setY(2, 0); rGeo.attributes.uv.setY(3, 0);
  const rear = new THREE.Mesh(rGeo, mk(tex.rear));
  rear.rotation.y = Math.PI;
  rear.position.set(0, y0 + rh / 2, s.rear - 0.004);
  exterior.add(front, rear);

  // windshield glass (outer face)
  const wsA = new THREE.Vector3(0, s.wsBot + 0.02, s.front);
  const wsB = new THREE.Vector3(0, s.glassTop, wsZ(s, s.glassTop));
  const glass = quadAlong(wsA, wsB, s.W - 2 * bev * 0.7, 0.012);
  glass.material = interior ? M.glassPlayer : M.glassAI;
  glass.renderOrder = 2;
  exterior.add(glass);
  }
  // one-piece windshield on every type: no centre divider bar
  // two wiper arms parked almost upright with a scissor brace (BD AK1J style)
  const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const lean0 = Math.atan2(s.rake, s.glassTop - s.wsBot);
  for (const [px, ang] of [[-0.15, 0.1], [0.45, 0.14]]) {
    const wg = new THREE.Group();
    wg.position.set(px, s.wsBot + 0.04, s.front + 0.035);
    wg.rotation.x = -lean0;
    const tilt = new THREE.Group();
    tilt.rotation.z = ang;
    tilt.scale.y = 1 + (s.dashY - s.wsBot) / 0.45;   // taller AK1J glass: longer arms so they rise above the dash
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.46, 0.018), wiperMat);
    arm.position.y = 0.23;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.44, 0.025), wiperMat);
    blade.position.set(0.035, 0.3, 0.02);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.012), wiperMat);
    brace.position.set(-0.05, 0.09, 0);
    brace.rotation.z = -0.5;
    tilt.add(arm, blade, brace);
    wg.add(tilt);
    exterior.add(wg);
  }

  // operator name sticker across the top of the windshield (white letters on a dark tint band)
  const [hc, hx] = makeCanvas(1024, 170);
  paintHeader(hx, 1024, 170, op, false, s.cockpit === 'ak');
  const hTex = canvasTexture(hc, { repeat: false });
  const hTop = new THREE.Vector3(0, s.glassTop - 0.01, wsZ(s, s.glassTop - 0.01));
  const hH = s.cockpit === 'ak' ? 0.5 : 0.43;
  const hBot = new THREE.Vector3(0, s.glassTop - hH, wsZ(s, s.glassTop - hH));
  const header = quadAlong(hBot, hTop, s.cockpit === 'ak' ? s.W - 0.6 : s.W - 2 * bev * 0.8, 0.02);
  header.material = new THREE.MeshBasicMaterial({ map: hTex, transparent: true, side: THREE.FrontSide, depthWrite: false });
  header.renderOrder = 3;
  exterior.add(header);
  // the same sticker seen from inside the cab (dark tint, teal letters, mirrored automatically)
  if (interior) {
    const [ic, ix] = makeCanvas(1024, 170);
    paintHeader(ix, 1024, 170, op, true, s.cockpit === 'ak');
    const hIn = header.clone();
    hIn.material = new THREE.MeshBasicMaterial({ map: canvasTexture(ic, { repeat: false }), transparent: true, side: THREE.BackSide, depthWrite: false });
    exterior.add(hIn);
  }

  // bumpers & chassis
  const bumperMat = s.cockpit === 'ak' && op.frontBumper
    ? new THREE.MeshPhysicalMaterial({ color: op.frontBumper, roughness: 0.45, clearcoat: 0.3 }) : M.dark;
  const ak = s.cockpit === 'ak';
  const bumper = new THREE.Mesh(new RoundedBoxGeometry(s.W - 2 * bev * 0.5 + 0.04, ak ? 0.36 : 0.34, 0.2, 2, 0.06), bumperMat);
  bumper.position.set(0, s.floor + (ak ? 0.16 : 0.12), s.front + 0.04);
  if (ak) {
    const lip = new THREE.Mesh(new RoundedBoxGeometry(s.W - 2 * bev * 0.5 + 0.06, 0.09, 0.22, 2, 0.03), M.dark);
    lip.position.set(0, s.floor - 0.04, s.front + 0.05);
    exterior.add(lip);
  }
  const rbumper = new THREE.Mesh(bumper.geometry, M.dark);
  rbumper.position.z = s.rear - 0.04;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(s.W - 0.5, 0.3, s.L - 1.4), M.dark);
  chassis.position.set(0, 0.32, s.center);
  exterior.add(bumper, rbumper, chassis);

  // lights
  const mats = {
    head: lightMat(0xf4f4f0, 0xfff4d6),
    tail: lightMat(0x7a0000, 0xff1a0a),
    brake: lightMat(0x900000, 0xff2010),
    indL: lightMat(0xb36b00, 0xffa000),
    indR: lightMat(0xb36b00, 0xffa000),
    marker: lightMat(0xb36b00, 0xffb030),
    reverse: lightMat(0xdddddd, 0xffffff),
  };
  const lbox = (w, h, d, mat, x, y, z, parent = exterior) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h) * 0.3), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  mats.drl = new THREE.MeshStandardMaterial({ color: 0xdfe9ff, emissive: 0xcfe0ff, emissiveIntensity: 2.2 });
  const LX = s.lampX;
  for (const sx of [-1, 1]) {
    if (s.cockpit === 'ak') {
      // angular projector headlamp at each corner, outer end raised (as on the ETS2 BD AK1J bodies)
      const hl = new THREE.Group();
      hl.position.set(sx * (LX - 0.27), s.floor + 0.6, s.front + 0.01);
      hl.rotation.z = sx * 0.14;
      exterior.add(hl);
      const eyeShape = new THREE.Shape();
      const P = [[-0.25, -0.07], [0.2, -0.085], [0.27, -0.01], [0.23, 0.075], [-0.2, 0.075], [-0.27, 0.0]];
      P.forEach(([x, y], k) => (k ? eyeShape.lineTo(sx * x, y) : eyeShape.moveTo(sx * x, y)));
      eyeShape.closePath();
      const eye3 = new THREE.Mesh(new THREE.ExtrudeGeometry(eyeShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2 }), M.dark);
      hl.add(eye3);
      for (const [x, r] of [[-0.13, 0.052], [0.02, 0.04]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 8, 24), M.chrome);
        ring.position.set(sx * x, -0.005, 0.062);
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(r - 0.004, 24), mats.head);
        lamp.position.set(sx * x, -0.005, 0.06);
        hl.add(ring, lamp);
      }
      lbox(0.07, 0.09, 0.03, sx > 0 ? mats.indL : mats.indR, sx * 0.17, -0.005, 0.055, hl);
      lbox(0.4, 0.018, 0.03, mats.drl, sx * -0.02, 0.058, 0.057, hl);
      // red reflector / tail-style lamp low on each bumper corner
      lbox(0.16, 0.07, 0.04, mats.tail, sx * (LX - 0.12), s.floor + 0.26, s.front + 0.15);
      // round yellow fog lamp in the bumper
      const fog = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 18), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffc400, emissiveIntensity: 0.35, roughness: 0.2 }));
      fog.rotation.x = Math.PI / 2;
      fog.position.set(sx * (LX - 0.2), s.floor + 0.15, s.front + 0.16);
      exterior.add(fog);
    } else {
      lbox(0.24, 0.13, 0.06, mats.head, sx * (LX - 0.27), s.floor + 0.86, s.front + 0.02);
      lbox(0.2, 0.12, 0.06, mats.head, sx * (LX - 0.03), s.floor + 0.86, s.front + 0.02);
      lbox(0.14, 0.1, 0.06, sx > 0 ? mats.indL : mats.indR, sx * (LX - 0.05), s.floor + 0.72, s.front + 0.02);
    }
    lbox(0.16, 0.36, 0.06, mats.tail, sx * LX, s.floor + 1.15, s.rear - 0.02);
    lbox(0.16, 0.22, 0.06, mats.brake, sx * LX, s.floor + 0.8, s.rear - 0.02);
    lbox(0.16, 0.14, 0.06, sx > 0 ? mats.indL : mats.indR, sx * LX, s.floor + 0.58, s.rear - 0.02);
    lbox(0.12, 0.08, 0.06, mats.reverse, sx * (LX - 0.25), s.floor + 0.58, s.rear - 0.02);
    // side repeater near the front wheel
    lbox(0.05, 0.07, 0.16, sx > 0 ? mats.indL : mats.indR, sx * (s.W / 2 + 0.01), s.floor + 0.55, s.wheelbase + 1.0);
  }
  // roof "eyebrow" visor over the windshield (AK1J bodies) + the little dome light on the roof cap
  if (s.visor) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x88aaff, emissiveIntensity: 0.4, roughness: 0.3 }));
    dome.position.set(0, s.H - 0.02, (s.cockpit === 'ak' ? akFrontZ(s, s.H) - 0.15 : wsZ(s, s.glassTop) - 0.25));
    exterior.add(dome);
    const vz = wsZ(s, s.glassTop);
    const eb = new THREE.Mesh(new RoundedBoxGeometry(s.W - 2 * bev * 0.6, 0.09, 0.32, 3, 0.04), baseMat);
    eb.position.set(0, s.glassTop + 0.07, vz - 0.02);
    eb.rotation.x = -0.12;
    eb.castShadow = true;
    exterior.add(eb);
  }
  for (let k = 0; k < 5; k++) lbox(0.12, 0.07, 0.05, mats.marker, (k - 2) * 0.28, s.H - 0.14, (s.cockpit === 'ak' ? akFrontZ(s, s.H - 0.14) + 0.01 : s.front - s.rake - 0.06));
  if (s.cockpit === 'ak') {
    // chrome grille between the lamps with the big Hino "H" oval, small red badge under the windshield
    const gy = s.floor + 0.53;
    const tz = new THREE.Shape();
    tz.moveTo(-0.42, 0.2); tz.lineTo(0.42, 0.2); tz.lineTo(0.3, -0.17); tz.lineTo(-0.3, -0.17); tz.closePath();
    const grille = new THREE.Mesh(new THREE.ExtrudeGeometry(tz, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2 }), M.dark);
    grille.position.set(0, gy, s.front);
    exterior.add(grille);
    for (const dy of [-0.1, 0.1]) lbox(0.5, 0.018, 0.02, M.chrome, 0, gy + dy, s.front + 0.065);
    const oval = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 28), M.chrome);
    oval.scale.set(1.45, 1, 1);
    oval.position.set(0, gy, s.front + 0.072);
    exterior.add(oval);
    const hMat = M.chrome;
    for (const sx of [-1, 1]) lbox(0.028, 0.13, 0.02, hMat, sx * 0.05, gy, s.front + 0.08);
    lbox(0.1, 0.024, 0.02, hMat, 0, gy, s.front + 0.08);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.3 }));
    badge.scale.set(1.6, 1, 1);
    badge.position.set(0, s.wsBot - 0.12, s.front + 0.008);
    exterior.add(badge);
    // number plate on the bumper
    const [pc, px] = makeCanvas(256, 96);
    px.fillStyle = '#18a558'; px.fillRect(0, 0, 256, 96);
    px.strokeStyle = '#f5f5f5'; px.lineWidth = 4; px.strokeRect(4, 4, 248, 88);
    px.fillStyle = '#f5f5f5'; px.textAlign = 'center'; px.textBaseline = 'middle';
    const [l1, l2] = plate.split(' ব ');
    px.font = `bold 34px ${BN_FONT}`; px.fillText(`${l1} ব`, 128, 30, 236);
    px.font = `bold 38px ${BN_FONT}`; px.fillText(l2 || '', 128, 68, 236);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.19), new THREE.MeshStandardMaterial({ map: canvasTexture(pc, { repeat: false }), roughness: 0.5 }));
    pl.position.set(0, s.floor + 0.09, s.front + 0.145);
    exterior.add(pl);
    // black air intake across the bumper, above the plate
    lbox(1.3, 0.09, 0.03, M.dark, 0, s.floor + 0.25, s.front + 0.14);
  }

  // bull-horn mirrors; the glass faces the driver
  const mirrorGlass = [];
  for (const sx of [-1, 1]) {
    const hp = s.cockpit === 'ak' ? new THREE.Vector3(sx * (s.W / 2 + 0.06), s.H - 1.0, s.front + 0.5) : new THREE.Vector3(sx * (s.W / 2 + 0.36), s.H - 0.95, s.front + 0.62);
    const curve = new THREE.CatmullRomCurve3([
      s.cockpit === 'ak' ? new THREE.Vector3(sx * (s.W / 2 - 0.3), s.H - 0.25, s.front - 0.55) : new THREE.Vector3(sx * (s.W / 2 - 0.12), s.H - 0.12, s.front - s.rake - 0.1),
      new THREE.Vector3(sx * (s.W / 2 + 0.02), s.H - 0.2, s.front + 0.12),
      new THREE.Vector3(hp.x, s.H - 0.42, hp.z - 0.02),
      hp.clone().setY(hp.y + 0.3),
    ]);
    exterior.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, s.cockpit === 'ak' ? 0.042 : 0.028, 8), op.mirror && op.mirror !== '#151515' ? new THREE.MeshStandardMaterial({ color: op.mirror, roughness: 0.4 }) : M.dark));
    const head = new THREE.Group();
    head.position.copy(hp);
    // aim the glass so the driver sees down the side of the bus (bisector of eye and rear view)
    const toEye = eye.clone().sub(hp).normalize();
    const toRear = new THREE.Vector3(sx * (s.W / 2 + 1.2), 1.4, s.rear - 40).sub(hp).normalize();
    head.lookAt(hp.clone().add(toEye.add(toRear).normalize()));
    const mirMat = op.mirror ? new THREE.MeshPhysicalMaterial({ color: op.mirror, roughness: 0.35, clearcoat: 0.5 }) : M.dark;
    const mw = s.cockpit === 'ak' ? 0.3 : 0.36, mh = s.cockpit === 'ak' ? 0.56 : 0.62;
    head.add(new THREE.Mesh(new RoundedBoxGeometry(mw, mh, 0.1, 2, 0.05), mirMat));
    // split glass: a thin divider between the flat upper and convex lower mirror
    const divider = new THREE.Mesh(new THREE.BoxGeometry(mw - 0.04, 0.025, 0.11), M.dark);
    divider.position.y = -mh * 0.18;
    head.add(divider);
    if (op.mirrorTip) {
      const tip = new THREE.Mesh(new RoundedBoxGeometry(0.37, 0.16, 0.11, 2, 0.04), new THREE.MeshStandardMaterial({ color: op.mirrorTip, roughness: 0.4 }));
      tip.position.y = -0.24;
      head.add(tip);
    }
    const mg = new THREE.Mesh(new THREE.PlaneGeometry(mw - 0.06, mh - 0.08), M.mirror);
    mg.position.z = 0.052;
    mg.userData = { w: mw - 0.06, h: mh - 0.08, side: sx };
    head.add(mg);
    mirrorGlass.push(mg);
    exterior.add(head);
  }

  // mud flaps behind the wheels, roof hatches and antenna
  const flapMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  for (const sx of [-1, 1]) for (const z of [s.wheelbase - s.wheelR - 0.25, -s.wheelR - 0.3]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.02), flapMat);
    f.position.set(sx * (s.W / 2 - 0.25), 0.28, z);
    exterior.add(f);
  }
  for (const z of [s.center + 2.2, s.center - 3.2]) {
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.07, 0.75, 2, 0.03), M.acUnit);
    h.position.set(0, s.H + 0.03, z);
    exterior.add(h);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.5, 6), M.dark);
  ant.position.set(-0.5, s.H + 0.25, s.front - 1.0);
  ant.rotation.x = -0.4;
  exterior.add(ant);
  // chrome side trim under the windows
  for (const sx of [-1, 1]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, s.L - 1.6), M.chrome);
    tr.position.set(sx * (s.W / 2 + 0.012), s.winBot - 0.05, s.center - 0.3);
    exterior.add(tr);
  }

  // roof: AK1J bodies carry a low, rounded AC pod forward of centre; coaches a flatter unit
  if (s.ac) {
    if (s.cockpit === 'ak') {
      const pod = new THREE.Mesh(new RoundedBoxGeometry(1.95, 0.3, 3.8, 4, 0.14), M.acUnit);
      pod.position.set(0, s.H + 0.1, s.center + 0.7);
      pod.castShadow = true;
      exterior.add(pod);
      const nose = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.16, 0.7, 3, 0.07), M.acUnit);
      nose.position.set(0, s.H + 0.05, s.center + 2.85);
      nose.rotation.x = 0.12;
      exterior.add(nose);
      for (const z of [-0.9, 0, 0.9]) {         // vent grilles
        const v = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.3), M.dark);
        v.position.set(0, s.H + 0.26, s.center + 0.7 + z);
        exterior.add(v);
      }
    } else {
      const ac = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.22, 3.2, 3, 0.08), M.acUnit);
      ac.position.set(0, s.H + 0.08, s.center - 1.2);
      ac.castShadow = true;
      exterior.add(ac);
    }
  }
  // Bangladeshi touches on the AK1J body
  if (s.cockpit === 'ak') {
    const glassMat = interior ? M.glassPlayer : M.glassAI;
    // real entrance door on the left: black frame + two glass leaves
    const dz0 = s.front - 0.5, dz1 = s.front - 1.4, dh = s.winTop - s.floor - 0.05;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, dh, dz0 - dz1), M.dark);
    frame.position.set(s.W / 2 + 0.01, s.floor + dh / 2, (dz0 + dz1) / 2);
    exterior.add(frame);
    for (const k of [0, 1]) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry((dz0 - dz1) / 2 - 0.06, dh - 0.12), glassMat);
      leaf.rotation.y = Math.PI / 2;
      leaf.position.set(s.W / 2 + 0.028, s.floor + dh / 2 + 0.02, dz0 - (dz0 - dz1) * (0.25 + k * 0.5));
      exterior.add(leaf);
    }
    // chrome air horns on the roof cap
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 12, 1, true), M.chrome);
      horn.rotation.x = Math.PI / 2;
      horn.position.set(sx * 0.35, s.H + 0.05, akFrontZ(s, s.H) - 0.35);
      exterior.add(horn);
    }
  }
  // LED marker lights along the roof edge (amber) and skirt (blue), as on most BD buses
  mats.led = new THREE.MeshStandardMaterial({ color: 0x664400, emissive: 0xffa31a, emissiveIntensity: 1 });
  mats.ledBlue = new THREE.MeshStandardMaterial({ color: 0x113366, emissive: 0x3d7bff, emissiveIntensity: 1 });
  const ledGeo = new THREE.BoxGeometry(0.03, 0.04, 0.07);
  const nLed = Math.floor((s.L - 1.2) / 0.55);
  const ledA = new THREE.InstancedMesh(ledGeo, mats.led, nLed * 2);
  const ledB = new THREE.InstancedMesh(ledGeo, mats.ledBlue, nLed * 2);
  const lm = new THREE.Matrix4();
  let li = 0;
  for (const sx of [-1, 1]) for (let k = 0; k < nLed; k++) {
    const z = s.rear + 0.6 + k * 0.55;
    lm.makeTranslation(sx * (s.W / 2 + 0.006), s.H - bev - 0.03, z); ledA.setMatrixAt(li, lm);
    lm.makeTranslation(sx * (s.W / 2 + 0.006), s.floor + 0.16, z); ledB.setMatrixAt(li, lm);
    li++;
  }
  exterior.add(ledA, ledB);
  if (s.rack) {
    const bags = s.bags !== false;
    const rails = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.05, 0.05, s.L * 0.7);
      g.translate(sx * (s.W / 2 - 0.15), s.H + 0.28, s.center - 0.5);
      rails.push(g);
    }
    for (let k = 0; k < 9; k++) {
      const g = new THREE.BoxGeometry(s.W - 0.3, 0.04, 0.04);
      g.translate(0, s.H + 0.28, s.center - 0.5 - s.L * 0.35 + (k * s.L * 0.7) / 8);
      rails.push(g);
      for (const sx of [-1, 1]) {
        const p = new THREE.BoxGeometry(0.04, 0.28, 0.04);
        p.translate(sx * (s.W / 2 - 0.15), s.H + 0.14, s.center - 0.5 - s.L * 0.35 + (k * s.L * 0.7) / 8);
        rails.push(p);
      }
    }
    // ladder up the rear, on the left, to reach the roof rack
    const lx = s.W / 2 - 0.45;
    for (const off of [-0.18, 0.18]) {
      const g = new THREE.BoxGeometry(0.035, s.H - s.floor - 0.3, 0.035);
      g.translate(lx + off, (s.H + s.floor) / 2 + 0.1, s.rear - 0.06);
      rails.push(g);
    }
    for (let k = 0; k < 7; k++) {
      const g = new THREE.BoxGeometry(0.36, 0.03, 0.03);
      g.translate(lx, s.floor + 0.55 + k * 0.33, s.rear - 0.06);
      rails.push(g);
    }
    const zf = s.center - 0.5 + s.L * 0.35;
    const hoop = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-(s.W / 2 - 0.15), s.H + 0.28, zf), new THREE.Vector3(-(s.W / 2 - 0.25), s.H + 0.2, zf + 0.35),
      new THREE.Vector3(0, s.H + 0.16, zf + 0.48), new THREE.Vector3(s.W / 2 - 0.25, s.H + 0.2, zf + 0.35), new THREE.Vector3(s.W / 2 - 0.15, s.H + 0.28, zf),
    ]);
    rails.push(new THREE.TubeGeometry(hoop, 24, 0.025, 6).toNonIndexed());
    exterior.add(new THREE.Mesh(mergeGeometries(rails.map((g) => (g.index ? g.toNonIndexed() : g))), M.rack));
    const bagCols = [0x6d4c41, 0x1e88e5, 0xd84315, 0x9e9d24, 0xeeeeee];
    for (let k = 0; k < (bags ? 6 : 0); k++) {
      const bag = new THREE.Mesh(new RoundedBoxGeometry(0.5 + r() * 0.5, 0.3 + r() * 0.3, 0.5 + r() * 0.6, 2, 0.1),
        new THREE.MeshStandardMaterial({ color: bagCols[k % bagCols.length], roughness: 0.9 }));
      bag.position.set((r() - 0.5) * 1.3, s.H + 0.3, s.center - 2.5 + r() * 4);
      bag.rotation.y = r();
      bag.castShadow = true;
      exterior.add(bag);
    }
  }

  // wheels (on root so they don't roll with the body)
  const wheels = { front: [], all: [] };
  const wx = s.W / 2 - 0.14;
  for (const sx of [-1, 1]) {
    const steer = new THREE.Group();
    steer.position.set(sx * wx, s.wheelR, s.wheelbase);
    const fw = wheel(s.wheelR, 0.3);
    steer.add(fw);
    root.add(steer);
    wheels.front.push(steer);
    wheels.all.push(fw);
    const rw = wheel(s.wheelR, 0.5);
    rw.position.set(sx * (wx - 0.08), s.wheelR, 0);
    root.add(rw);
    wheels.all.push(rw);
  }

  const bus = { root, pivot, body, exterior, wheels, mats, spec: s, type, op, plate, mirrorGlass, driver: eye };
  if (interior) addInterior(bus, r);
  return bus;
}

// ---------------------------------------------------------------------------
// Driver cabin + passenger saloon (player bus only)
// ---------------------------------------------------------------------------
let fabricTex = null;
function switchPanelTexture() {
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#1b1c1f'; x.fillRect(0, 0, 512, 512);
  const labels = ['HEAD', 'FOG', 'HAZ', 'WIPE', 'A/C', 'FAN', 'LIGHT', 'DOOR', 'MIC', 'TV', 'HORN', 'RTD'];
  labels.forEach((l, i) => {
    const cx = 40 + (i % 4) * 116, cy = 40 + Math.floor(i / 4) * 120;
    x.fillStyle = '#2c2e33'; x.fillRect(cx, cy, 90, 70);
    x.fillStyle = i === 2 ? '#c62828' : '#0e0f11'; x.fillRect(cx + 18, cy + 8, 54, 40);
    x.fillStyle = i % 3 === 0 ? '#2ecc71' : '#ffb300'; x.fillRect(cx + 40, cy + 12, 10, 6);
    x.fillStyle = '#c9ced4'; x.font = `600 15px ${EN_FONT}`; x.textAlign = 'center'; x.fillText(l, cx + 45, cy + 66);
  });
  // gear push buttons
  ['R', 'N', 'D'].forEach((g, i) => {
    const cx = 120 + i * 100;
    x.fillStyle = '#2c2e33'; x.beginPath(); x.arc(cx, 440, 36, 0, Math.PI * 2); x.fill();
    x.fillStyle = g === 'D' ? '#2ecc71' : '#e9edf0'; x.font = `bold 34px ${EN_FONT}`; x.fillText(g, cx, 452);
  });
  return canvasTexture(c, { repeat: false });
}
function floralTexture() {
  const [c, x] = makeCanvas(512, 256);
  x.fillStyle = '#8e1022'; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 46; i++) {
    const cx = (i % 12) * 44 + (Math.floor(i / 12) % 2) * 22 + 10, cy = Math.floor(i / 12) * 64 + 30;
    x.fillStyle = 'rgba(240,215,220,0.75)';
    for (let p = 0; p < 6; p++) { x.beginPath(); x.ellipse(cx + Math.cos(p) * 9, cy + Math.sin(p) * 9, 8, 5, p, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffcc33'; x.beginPath(); x.arc(cx, cy, 4, 0, Math.PI * 2); x.fill();
  }
  const t = canvasTexture(c); t.repeat.set(9, 1.6);
  return t;
}
function speakerTexture() {
  const [c, x] = makeCanvas(128, 160);
  x.fillStyle = '#c9ccd0'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#1a1b1d';
  for (let r = 0; r < 12; r++) for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(10 + k * 13.5 + (r % 2) * 6, 10 + r * 12.5, 4, 0, Math.PI * 2); x.fill(); }
  return canvasTexture(c, { repeat: false });
}
function moquetteTexture() {
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#1d3f8f'; x.fillRect(0, 0, 512, 512);
  const cols = ['#e53935', '#fdd835', '#43a047', '#8e24aa', '#ff7043', '#4fc3f7', '#0d1b3e'];
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = cols[i % cols.length];
    x.lineWidth = 2 + Math.random() * 5;
    x.beginPath();
    const px = Math.random() * 512, py = Math.random() * 512;
    x.moveTo(px, py);
    x.bezierCurveTo(px + Math.random() * 80 - 40, py + Math.random() * 80 - 40, px + Math.random() * 80 - 40, py + Math.random() * 80 - 40, px + Math.random() * 90 - 45, py + Math.random() * 90 - 45);
    x.stroke();
  }
  const t = canvasTexture(c); t.repeat.set(1.5, 1.5);
  return t;
}
function woodTexture() {
  const [c, x] = makeCanvas(512, 128);
  x.fillStyle = '#6b3f22'; x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(${40 + Math.random() * 40},${20 + Math.random() * 20},10,${0.2 + Math.random() * 0.3})`;
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const y = Math.random() * 128;
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++) x.lineTo(k * 64, y + Math.sin(k + i) * 6);
    x.stroke();
  }
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,220,180,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 128);
  return canvasTexture(c);
}
function seatCoverTexture(op) {
  const [c, x] = makeCanvas(256, 160);
  x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, 256, 160);
  x.strokeStyle = op.c1; x.lineWidth = 8; x.strokeRect(8, 8, 240, 144);
  x.fillStyle = op.text === '#ffffff' ? op.c1 : op.text;
  x.font = `bold 40px ${BN_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(op.bn.split(' ')[0], 128, 70, 220);
  x.font = `bold 18px ${EN_FONT}`; x.fillText(op.en, 128, 120, 220);
  return canvasTexture(c, { repeat: false });
}
function tintTexture(clear = false) {
  const [c, x] = makeCanvas(8, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  if (clear) {       // clean glass: just a whisper of tint, no sun strip
    g.addColorStop(0, 'rgba(30,40,45,0.04)'); g.addColorStop(1, 'rgba(30,40,45,0.04)');
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    return canvasTexture(c, { repeat: false });
  }
  g.addColorStop(0, 'rgba(20,70,60,0.85)');
  g.addColorStop(0.16, 'rgba(20,70,60,0.55)');
  g.addColorStop(0.2, 'rgba(30,40,45,0.10)');
  g.addColorStop(1, 'rgba(30,40,45,0.06)');
  x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  return canvasTexture(c, { repeat: false });
}

function addInterior(bus, r) {
  const s = bus.spec;
  const g = new THREE.Group();
  bus.body.add(g);
  bus.interior = g;
  const eye = bus.driver;
  const std = (c, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...extra });
  if (!fabricTex) { fabricTex = grassTexture(91, '#777777'); fabricTex.repeat.set(3, 3); }
  const dashMat = std(0x26272a, 0.75);
  const plastic = std(0x34363a, 0.6);
  const trim = std(0x18191b, 0.6);
  const wall = std(0xcfcac0, 0.85);
  const ceilingMat = std(0xe4e1da, 0.9);
  const floorY = s.eye - 1.25;
  const dX = s.driverX;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    p.position.set(x, y, z);
    p.rotation.set(rx, ry, 0, 'YXZ');
    g.add(p);
    return p;
  };

  if (s.cockpit === 'ak') {
  // ===== Hino AK1J front-engine cockpit (clean, black, classic Hino layout) =====
  const dz = s.front, dy = s.dashY;
  const dashBlack = std(0x1c1d1f, 0.75);
  const dashShape = new THREE.Shape();
  dashShape.moveTo(dz - 0.03, dy - 0.02);
  dashShape.lineTo(dz - 0.42, dy + 0.01);
  dashShape.quadraticCurveTo(dz - 0.52, dy + 0.01, dz - 0.52, dy - 0.09);
  dashShape.lineTo(dz - 0.47, floorY + 0.25);
  dashShape.lineTo(dz - 0.03, floorY + 0.2);
  dashShape.lineTo(dz - 0.03, dy - 0.02);
  add(extrudeAcross(dashShape, -(s.W / 2 - s.bevel * 0.95), s.W / 2 - s.bevel * 0.95, 0.02), dashBlack);
  // red floral cloth on the dash top (every BD bus has one)
  const matTex = floralTexture();
  add(new THREE.BoxGeometry(s.W - 1.25, 0.012, 0.46), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 }), 0.42, dy + 0.02, dz - 0.27);
  // rectangular black gauge hood sitting on the dash in front of the wheel
  const ez = eye.z;
  const hoodY = dy + 0.05, hoodZ = dz - 0.41;
  // gauge hood: vertical face towards the driver, top sloping down to the windshield
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(hoodZ - 0.15, hoodY - 0.16);
  hoodShape.lineTo(hoodZ - 0.15, hoodY + 0.16);
  hoodShape.quadraticCurveTo(hoodZ - 0.13, hoodY + 0.19, hoodZ - 0.05, hoodY + 0.18);
  hoodShape.lineTo(hoodZ + 0.22, hoodY + 0.06);
  hoodShape.lineTo(hoodZ + 0.22, hoodY - 0.16);
  hoodShape.lineTo(hoodZ - 0.15, hoodY - 0.16);
  add(extrudeAcross(hoodShape, dX - 0.38, dX + 0.38, 0.025), dashBlack);
  const [gc, gx] = makeCanvas(1024, 360);
  const gt = canvasTexture(gc, { repeat: false });
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.253), new THREE.MeshBasicMaterial({ map: gt, toneMapped: false }));
  cluster.position.set(dX, hoodY - 0.005, hoodZ - 0.225);   // in front of the hood face (it tilts back towards the eye)
  cluster.lookAt(eye);
  g.add(cluster);
  bus.gauge = { canvas: gc, ctx: gx, tex: gt };
  // dash face left of the gauges: perforated speaker, switch block, radio (as on BD AK1J cabs)
  const faceZ = dz - 0.515;
  const spk = add(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ map: speakerTexture(), roughness: 0.6 }), dX + 0.56, dy - 0.16, faceZ);
  spk.rotation.y = Math.PI;
  const swp = add(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ map: switchPanelTexture(), roughness: 0.5 }), dX + 0.85, dy - 0.14, faceZ);
  swp.rotation.y = Math.PI;
  const radio = add(new RoundedBoxGeometry(0.34, 0.09, 0.05, 2, 0.01), std(0x111214, 0.4), dX + 0.7, dy - 0.38, faceZ + 0.02);
  const lcd = add(new THREE.PlaneGeometry(0.12, 0.035), new THREE.MeshBasicMaterial({ color: 0x3fa9ff, toneMapped: false }), dX + 0.7, dy - 0.38, faceZ - 0.006);
  lcd.rotation.y = Math.PI;
  void radio;
  // engine cover beside the driver in colourful bus-seat moquette, with the long gear lever
  const quilt = new THREE.MeshStandardMaterial({ map: moquetteTexture(), roughness: 0.95 });
  const humpX = dX + 0.82;
  add(new RoundedBoxGeometry(0.85, 0.62, 1.35, 3, 0.12), quilt, humpX, floorY + 0.31, dz - 1.15);
  const lever = new THREE.Group();
  lever.position.set(humpX - 0.25, floorY + 0.62, ez + 0.1);
  const boot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10), std(0x111111, 0.9));
  boot.position.y = 0.05;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.62, 8), std(0x1a1a1a, 0.4));
  rod.position.y = 0.32;
  const knobG = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), std(0x101010, 0.3));
  knobG.position.y = 0.64;
  lever.add(boot, rod, knobG);
  g.add(lever);
  bus.gearLever = lever;
  // big thin-rimmed wheel, tilted back like a real Hino, two spokes dropping to a low hub
  const swc = new THREE.Vector3(dX, dy - 0.05, dz - 0.88);
  const wheelMount = new THREE.Group();
  wheelMount.position.copy(swc);
  wheelMount.lookAt(eye);
  wheelMount.rotateX(-0.2);    // big and fairly upright, like the AK1J wheel
  g.add(wheelMount);
  const wheelG = new THREE.Group();
  const rimMat = std(0x0f0f10, 0.45);
  wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 12, 72), rimMat));
  for (const a of [-0.55, Math.PI + 0.55]) {
    const sp = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.05, 0.025, 2, 0.012), rimMat);
    sp.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17 - 0.06, -0.02);
    sp.rotation.z = a;
    wheelG.add(sp);
  }
  const hub = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.08, 3, 0.04), rimMat);
  hub.position.set(0, -0.13, -0.03);
  wheelG.add(hub);
  wheelMount.add(wheelG);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.85, 12), dashBlack);
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.45;
  wheelMount.add(column);
  const shroud = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.15, 0.22, 2, 0.04), dashBlack);
  shroud.position.z = -0.18;
  wheelMount.add(shroud);
  // stalk cluster on the left of the column (lights/indicators), wiper stalk on the right
  const stalkPivot = new THREE.Group();
  stalkPivot.position.set(-0.1, 0.02, -0.18);
  for (const [dy2, len] of [[0, 0.22], [-0.035, 0.17]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, len, 8), std(0x151515, 0.4));
    st.rotation.z = Math.PI / 2; st.position.set(-len / 2, dy2, 0);
    stalkPivot.add(st);
  }
  wheelMount.add(stalkPivot);
  const wiper = new THREE.Group();
  wiper.position.set(0.1, 0.02, -0.18);
  const wst = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.18, 8), std(0x151515, 0.4));
  wst.rotation.z = Math.PI / 2; wst.position.x = 0.09;
  wiper.add(wst);
  wheelMount.add(wiper);
  bus.steeringWheel = wheelG;
  bus.indicatorStalk = stalkPivot;
  } else {
  // ---- dashboard: wrap-around moulding across the full width ----
  const dz = s.front, dy = s.dashY;
  const dashShape = new THREE.Shape();
  dashShape.moveTo(dz - 0.02, dy - 0.02);
  dashShape.lineTo(dz - 0.55, dy + 0.05);
  dashShape.quadraticCurveTo(dz - 0.74, dy + 0.06, dz - 0.74, dy - 0.08);
  dashShape.lineTo(dz - 0.66, dy - 0.48);
  dashShape.quadraticCurveTo(dz - 0.5, floorY + 0.35, dz - 0.4, floorY + 0.25);
  dashShape.lineTo(dz - 0.02, floorY + 0.2);
  dashShape.lineTo(dz - 0.02, dy - 0.02);
  add(extrudeAcross(dashShape, -(s.W / 2 - s.bevel * 0.95), s.W / 2 - s.bevel * 0.95, 0.02), dashMat);
  // AC vents across the fascia
  for (const x of [0.15, 0.55, 0.95]) {
    const v = add(new RoundedBoxGeometry(0.28, 0.09, 0.03, 2, 0.02), trim, x, dy - 0.16, dz - 0.72);
    v.rotation.x = 0.2;
  }
  // driver instrument pod + cluster
  const pod = add(new RoundedBoxGeometry(0.98, 0.38, 0.5, 4, 0.1), plastic, dX, dy + 0.16, dz - 0.95);
  pod.rotation.x = -0.15;
  const visor = add(new RoundedBoxGeometry(0.96, 0.03, 0.26, 2, 0.01), trim, dX, dy + 0.37, dz - 1.17);
  visor.rotation.x = 0.25;
  const [gc, gx] = makeCanvas(1024, 400);
  const gt = canvasTexture(gc, { repeat: false });
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.32), new THREE.MeshBasicMaterial({ map: gt, toneMapped: false }));
  cluster.position.set(dX, dy + 0.16, dz - 1.21);
  cluster.lookAt(eye);
  g.add(cluster);
  bus.gauge = { canvas: gc, ctx: gx, tex: gt };

  // centre console (switches + gear buttons) to the driver's left
  const con = add(new RoundedBoxGeometry(0.46, 0.08, 0.5, 2, 0.03), plastic, dX + 0.68, dy - 0.05, dz - 1.2);
  con.rotation.set(0.45, 0.35, 0);
  const sw = add(new THREE.PlaneGeometry(0.42, 0.46), new THREE.MeshStandardMaterial({ map: switchPanelTexture(), roughness: 0.5 }), 0, 0.045, 0);
  sw.rotation.x = -Math.PI / 2;
  g.remove(sw); con.add(sw);

  // ---- steering wheel (bus style, nearly flat) ----
  const swc = new THREE.Vector3(dX, s.eye - 0.66, s.front - 1.42);
  const wheelMount = new THREE.Group();
  wheelMount.position.copy(swc);
  wheelMount.lookAt(eye);
  wheelMount.rotateX(-0.35);           // flatter than facing the eye, like a real bus
  g.add(wheelMount);
  const wheelG = new THREE.Group();
  const leather = std(0x121212, 0.55);
  wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 12, 48), leather));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.025), std(0x2a2a2a, 0.5));
    sp.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, -0.01);
    sp.rotation.z = a;
    wheelG.add(sp);
  }
  const padG = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 24), std(0x1d1d1d, 0.5));
  padG.rotation.x = Math.PI / 2;
  wheelG.add(padG);
  wheelMount.add(wheelG);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.75, 12), trim);
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.4;
  wheelMount.add(column);
  const shroud = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.14, 0.2, 2, 0.04), trim);
  shroud.position.z = -0.16;
  wheelMount.add(shroud);
  // indicator stalk (right of the column, like Japanese RHD buses) + wiper stalk
  const stalkPivot = new THREE.Group();
  stalkPivot.position.set(0.08, 0.02, -0.16);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), std(0x111111, 0.4));
  stalk.rotation.z = Math.PI / 2;
  stalk.position.x = 0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), std(0x111111, 0.4));
  knob.position.x = 0.2;
  stalkPivot.add(stalk, knob);
  wheelMount.add(stalkPivot);
  const wiper = stalkPivot.clone();
  wiper.position.x = -0.08;
  wiper.rotation.y = Math.PI;
  wheelMount.add(wiper);
  bus.steeringWheel = wheelG;
  bus.indicatorStalk = stalkPivot;

  }

  // ---- windshield inside: seal, tint band, A-pillars, header, visors, fringe ----
  const wsA = new THREE.Vector3(0, s.wsBot + 0.02, s.front);
  const wsB = new THREE.Vector3(0, s.glassTop, wsZ(s, s.glassTop));
  const inner = quadAlong(wsA, wsB, s.W - 0.14, -0.01);
  inner.material = new THREE.MeshBasicMaterial({ map: tintTexture(s.cockpit === 'ak'), transparent: true, side: THREE.BackSide, depthWrite: false });
  inner.renderOrder = 3;
  g.add(inner);
  const lean = Math.atan2(s.rake, s.glassTop - s.wsBot);
  const pillarLen = wsA.distanceTo(wsB) + 0.1;
  for (const sx of [-1, 1]) {
    const ak = s.cockpit === 'ak';
    const pw = ak ? 0.045 : 0.12;
    // AK1J: slim dark pillar just beyond the edge of the windshield glass, so from outside the body hides it
    const glassHalf = s.W / 2 - s.bevel * 0.7;
    const px = ak ? glassHalf + pw / 2 + 0.005 : s.W / 2 - s.bevel * 0.55;
    if (ak) continue;   // AK1J: clean windshield, no pillar frame
    const p = add(new RoundedBoxGeometry(pw, pillarLen, 0.06, 2, 0.015), trim, sx * px, (wsA.y + wsB.y) / 2, (wsA.z + wsB.z) / 2 - 0.05);
    p.rotation.x = -lean;
  }
  const inW = s.W - 2 * s.bevel - 0.12;   // inner width that stays inside the rounded body edges
  if (s.cockpit !== 'ak') add(new THREE.BoxGeometry(inW, 0.3, 0.5), std(0x3b2a24, 0.7), 0, s.glassTop - 0.12, wsB.z - 0.32);
  if (s.cockpit !== 'ak') for (const x of [dX, -dX * 0.6]) {   // sun visors (coach cabs only; the AK1J view stays open)
    const v = add(new RoundedBoxGeometry(0.62, 0.03, 0.26, 2, 0.01), std(0x55524c, 0.8), x, s.glassTop - 0.08, wsB.z - 0.22);
    v.rotation.x = 0.35;
  }
  // fringe (jhalar) along the top of the windshield
  const fringeCols = [0xe53935, 0xffd600, 0x43a047, 0x1e88e5, 0xff6f00, 0xd81b60];
  const tassel = new THREE.ConeGeometry(0.022, 0.11, 5).rotateX(Math.PI);
  const n = 40;
  const fr = new THREE.InstancedMesh(tassel, new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
  const m4 = new THREE.Matrix4(), col4 = new THREE.Color();
  const fy = s.glassTop - 0.3;
  for (let k = 0; k < n; k++) {
    m4.makeTranslation(-s.W / 2 + 0.15 + (k / (n - 1)) * (s.W - 0.3), fy - (k % 2) * 0.02, wsZ(s, fy) - 0.1);
    fr.setMatrixAt(k, m4);
    fr.setColorAt(k, col4.setHex(fringeCols[k % fringeCols.length]));
  }
  if (s.cockpit !== 'ak') {
    g.add(fr);
    add(new THREE.BoxGeometry(s.W - 0.3, 0.035, 0.02), std(0xc62828, 0.6), 0, fy + 0.06, wsZ(s, fy) - 0.1);
  }
  // interior rear-view mirror
  if (s.cockpit !== 'ak') {
    const irm = add(new RoundedBoxGeometry(0.42, 0.13, 0.04, 2, 0.02), trim, 0.1, s.glassTop - 0.35, wsZ(s, s.glassTop - 0.35) - 0.25);
    irm.lookAt(eye);
  }

  // ---- saloon shell ----
  const L = s.L - 0.3, zc = s.center;
  plane(s.W - 2 * s.bevel * 0.7, L - 2 * s.bevel, ceilingMat, 0, s.H - 0.14, zc, 0, Math.PI / 2);
  // close the ceiling right up to the top of the windshield (no sky gap above the glass)
  {
    const zEnd = zc + (L - 2 * s.bevel) / 2, zTop = wsZ(s, s.glassTop) - 0.02;
    const a = new THREE.Vector3(0, s.H - 0.14, zEnd), b = new THREE.Vector3(0, s.glassTop + 0.01, zTop);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(s.W - 2 * s.bevel * 0.7, a.distanceTo(b) + 0.02), ceilingMat);
    cap.position.copy(a).add(b).multiplyScalar(0.5);
    cap.rotation.x = Math.PI / 2 - Math.atan2(a.y - b.y, b.z - a.z);
    g.add(cap);
  }
  plane(s.W - 0.1, L, std(0x5a5d62, 0.9), 0, floorY, zc, 0, -Math.PI / 2);
  plane(0.6, L - 2.2, std(0x7d2430, 0.95), 0, floorY + 0.005, zc - 1.1, 0, -Math.PI / 2);   // aisle carpet
  const roofIn = s.H - s.bevel - 0.03;            // top of the flat side walls
  const lowH = s.winBot - floorY, upH = Math.max(0.05, roofIn - s.winTop);
  const tint = new THREE.MeshBasicMaterial({ color: 0x203038, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  for (const sx of [-1, 1]) {
    const ry = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    const zStart = sx > 0 ? s.front - 1.3 : s.front - 0.3;    // door on the left, driver window on the right
    const zl = zStart - (s.rear + 0.15);
    plane(zl, lowH, wall, sx * (s.W / 2 - 0.05), floorY + lowH / 2, (zStart + s.rear + 0.15) / 2, ry);
    plane(L, upH, wall, sx * (s.W / 2 - 0.05), s.winTop + upH / 2, zc, ry);
    const tg = plane(L - 0.4, s.winTop - s.winBot, tint, sx * (s.W / 2 - 0.06), (s.winTop + s.winBot) / 2, zc - 0.2, ry);
    tg.renderOrder = 3;
    // window pillars and curtains
    const cur = new THREE.MeshStandardMaterial({ color: s.seat, roughness: 0.95, side: THREE.DoubleSide });
    const curGeo = new THREE.PlaneGeometry(0.28, s.winTop - s.winBot + 0.05, 6, 1);
    const cp = curGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 40) * 0.025);
    curGeo.computeVertexNormals();
    for (let k = 0; k <= s.pillars; k++) {
      const z = s.front - 1.25 - ((s.front - 1.25 - (s.rear + 0.35)) / s.pillars) * k;
      add(new THREE.BoxGeometry(0.08, s.winTop - s.winBot, 0.1), trim, sx * (s.W / 2 - 0.08), (s.winTop + s.winBot) / 2, z);
      if (z < s.front - 1.6) {
        const c = add(curGeo, cur, sx * (s.W / 2 - 0.16), (s.winTop + s.winBot) / 2 + 0.02, z);
        c.rotation.y = ry;
      }
    }
    // luggage rack + reading-light strip
    const rack = add(new THREE.BoxGeometry(0.42, 0.05, L - 2.4), std(0xb8b4ab, 0.6), sx * (s.W / 2 - 0.27), s.H - 0.45, zc - 1.0);
    rack.castShadow = false;
    add(new THREE.BoxGeometry(0.05, 0.12, L - 2.4), std(0x9e9a91, 0.5), sx * (s.W / 2 - 0.47), s.H - 0.4, zc - 1.0);
  }
  // ceiling AC duct with blue LED strip
  add(new THREE.BoxGeometry(0.5, 0.08, L - 2.4), std(0xd5d2cb, 0.7), 0, s.H - 0.15, zc - 1.0);
  const led = add(new THREE.BoxGeometry(0.04, 0.01, L - 2.6), new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x3b6bff, emissiveIntensity: 0.6 }), 0, s.H - 0.195, zc - 1.0);
  bus.cabinLed = led.material;
  // rear wall
  plane(s.W - 0.1, lowH, wall, 0, floorY + lowH / 2, s.rear + 0.15);
  plane(s.W - 2 * s.bevel, Math.max(0.05, s.H - s.roofR - 0.05 - s.winTop), wall, 0, s.winTop + Math.max(0.05, s.H - s.roofR - 0.05 - s.winTop) / 2, s.rear + 0.15);
  // driver's side window frame (right side): posts, rails, sliding divider and one glass pane
  if (s.cockpit === 'ak') {
    const fx = -(s.W / 2 - 0.07), frameMat = std(0x3a3c3f, 0.5);
    const zA = s.front - 0.34, zB = s.front - 1.62, yB = s.winBot - 0.12, yT = s.winTop;
    add(new THREE.BoxGeometry(0.04, yT - yB, 0.04), std(0x8f8a80, 0.6), fx, (yT + yB) / 2, zA);
    add(new THREE.BoxGeometry(0.06, yT - yB, 0.08), frameMat, fx, (yT + yB) / 2, zB);
    add(new THREE.BoxGeometry(0.06, yT - yB, 0.05), frameMat, fx, (yT + yB) / 2, (zA + zB) / 2);
    add(new THREE.BoxGeometry(0.06, 0.06, zA - zB), frameMat, fx, yT, (zA + zB) / 2);
    add(new THREE.BoxGeometry(0.1, 0.07, zA - zB), frameMat, fx + 0.02, yB, (zA + zB) / 2);
    const pane = plane(Math.abs(zA - zB) / 2 - 0.04, yT - yB - 0.08, new THREE.MeshBasicMaterial({ color: 0x203038, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      fx + 0.03, (yT + yB) / 2, zB + Math.abs(zA - zB) / 4, Math.PI / 2);
    pane.renderOrder = 3;
  }
  // driver-side lower wall + window frame
  add(new THREE.BoxGeometry(0.06, s.winBot - floorY - 0.15, 1.3), wall, -(s.W / 2 - 0.06), (s.winBot + floorY - 0.15) / 2, s.front - 0.95);
  // entrance door (left): glass panel and steps
  const door = plane(0.95, s.winTop - (floorY - 0.6), tint, s.W / 2 - 0.05, (s.winTop + floorY - 0.6) / 2, s.front - 0.78, -Math.PI / 2);
  door.renderOrder = 3;
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.55, 0.06, 0.3), std(0x3a3a3a, 0.9), s.W / 2 - 0.35, floorY - 0.2 - k * 0.35, s.front - 0.55 - k * 0.12);
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), M.chrome, s.W / 2 - 0.35, floorY + 0.5, s.front - 1.3);

  // ---- seats ----
  const fabric = new THREE.MeshStandardMaterial({ color: s.seat, roughness: 0.95, map: fabricTex });
  const seatGeo = mergeGeometries([
    new RoundedBoxGeometry(0.46, 0.13, 0.48, 2, 0.05).translate(0, 0.46, 0),
    new RoundedBoxGeometry(0.46, 0.72, 0.12, 2, 0.05).rotateX(-0.18).translate(0, 0.86, -0.22),
    new THREE.BoxGeometry(0.06, 0.42, 0.06).translate(0, 0.2, 0),
  ].map((x) => (x.index ? x.toNonIndexed() : x)));
  const armGeo = new RoundedBoxGeometry(0.05, 0.05, 0.42, 2, 0.02).translate(0.25, 0.68, -0.02);
  const coverGeo = new RoundedBoxGeometry(0.47, 0.26, 0.13, 2, 0.04).rotateX(-0.18).translate(0, 1.15, -0.27);
  const rows = s.seatRows;
  const seats = new THREE.InstancedMesh(seatGeo, fabric, rows * 4 + 1);
  const arms = new THREE.InstancedMesh(armGeo, plastic, rows * 4);
  const covers = new THREE.InstancedMesh(coverGeo, new THREE.MeshStandardMaterial({ map: seatCoverTexture(bus.op), roughness: 0.9 }), rows * 4 + 1);
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const z = s.front - s.seatStart - row * 0.8;
    for (const x of [-0.95, -0.48, 0.48, 0.95]) {
      m4.identity();
      m4.setPosition(x * (s.W / 2.5), floorY, z);
      seats.setMatrixAt(i, m4);
      covers.setMatrixAt(i, m4);
      arms.setMatrixAt(i, m4);
      i++;
    }
  }
  // driver seat
  m4.makeScale(1.25, 1.05, 1.15);
  m4.setPosition(dX, floorY, eye.z - 0.3);
  seats.setMatrixAt(i, m4);
  covers.setMatrixAt(i, m4);
  seats.material = fabric;
  g.add(seats, arms, covers);
  // dashboard bits: tissue box, air freshener, flowers
  if (s.cockpit !== 'ak') {
    add(new RoundedBoxGeometry(0.24, 0.1, 0.13, 2, 0.02), std(0xf06292), 0.45, s.dashY + 0.08, s.front - 0.4);
    add(new THREE.SphereGeometry(0.05, 10, 8), std(0x4fc3f7, 0.3), 0.85, s.dashY + 0.09, s.front - 0.3);
  }

  // night lighting for the cabin
  const dashLight = new THREE.PointLight(0x9fb6ff, 0, 3.5, 1.5);
  dashLight.position.set(dX + 0.3, s.dashY + 0.35, eye.z + 0.5);
  g.add(dashLight);
  bus.dashLight = dashLight;
  g.traverse((o) => { if (o.isMesh && !o.material?.isMeshBasicMaterial) o.receiveShadow = true; });
  void r;
}

export function setBusLights(bus, { head = false, brake = false, indL = false, indR = false, reverse = false, night = false }) {
  const m = bus.mats;
  m.head.emissiveIntensity = head ? 6 : 0;
  m.tail.emissiveIntensity = head ? 2.5 : 0;
  m.brake.emissiveIntensity = brake ? 6 : 0;
  m.indL.emissiveIntensity = indL ? 6 : 0;
  m.indR.emissiveIntensity = indR ? 6 : 0;
  m.marker.emissiveIntensity = head || night ? 3 : 0;
  m.reverse.emissiveIntensity = reverse ? 5 : 0;
  if (m.led) { m.led.emissiveIntensity = head || night ? 3 : 0.9; m.ledBlue.emissiveIntensity = head || night ? 3 : 0.7; }
}

// Instrument cluster: speedo, tacho, small gauges, LCD and warning lamps.
export function drawGauges(bus, { kmh, rpm, gear, cruise, lights, indL, indR, limit, odo = 0, air = 8.2, fuel = 0.8, temp = 0.5, clock = '' }) {
  if (!bus.gauge) return;
  const { ctx: c, tex, canvas } = bus.gauge;
  const hino = bus.spec.cockpit === 'ak';
  if (hino) { drawHinoPanel(c, canvas.width, canvas.height, { kmh, rpm, gear, cruise, lights, indL, indR, limit, fuel, temp, air }); tex.needsUpdate = true; return; }
  const W = canvas.width, H = canvas.height;
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#15171a'); bg.addColorStop(1, '#07080a');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  const dial = (cx, cy, R, v, max, major, minor, label, redFrom, fmt = (x) => x) => {
    c.fillStyle = '#0a0b0d';
    c.beginPath(); c.arc(cx, cy, R + 10, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3a3e44'; c.lineWidth = 4;
    c.beginPath(); c.arc(cx, cy, R + 8, 0, Math.PI * 2); c.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = (x) => a0 + (x / max) * (a1 - a0);
    if (redFrom != null) { c.strokeStyle = '#d32f2f'; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, R - 6, A(redFrom), a1); c.stroke(); }
    for (let k = 0; k <= max + 1e-6; k += minor) {
      const a = A(k), big = Math.abs(k / major - Math.round(k / major)) < 1e-6;
      c.strokeStyle = hino ? '#ff9a2e' : '#e8ecef'; c.lineWidth = big ? 4 : 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - (big ? 22 : 12)), cy + Math.sin(a) * (R - (big ? 22 : 12)));
      c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.stroke();
      if (big) {
        c.fillStyle = hino ? '#ffb347' : '#e8ecef'; c.font = `600 ${R * 0.15}px ${EN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(fmt(k)), cx + Math.cos(a) * (R - 42), cy + Math.sin(a) * (R - 42));
      }
    }
    c.fillStyle = '#9aa3ab'; c.font = `600 ${R * 0.11}px ${EN_FONT}`;
    c.fillText(label, cx, cy + R * 0.45);
    const a = A(Math.min(max * 1.02, v));
    c.strokeStyle = '#ff3d1f'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - Math.cos(a) * 18, cy - Math.sin(a) * 18); c.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14)); c.stroke();
    c.fillStyle = '#25282c'; c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fill();
  };
  const small = (cx, cy, R, f, label, warnLow) => {
    c.strokeStyle = '#3a3e44'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, Math.PI, 2 * Math.PI); c.stroke();
    const a = Math.PI + f * Math.PI;
    c.strokeStyle = warnLow && f < 0.2 ? '#ff5252' : '#ff3d1f'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); c.stroke();
    c.fillStyle = '#9aa3ab'; c.font = `600 15px ${EN_FONT}`; c.textAlign = 'center'; c.fillText(label, cx, cy + 18);
  };
  dial(190, 210, 165, kmh, 160, 20, 10, 'km/h', null);
  dial(834, 210, 165, rpm / 1000, 3, 0.5, 0.1, 'x1000 r/min', 2.3, (x) => x.toFixed(1).replace('.0', ''));
  // centre LCD
  c.fillStyle = '#0d1a14'; c.fillRect(392, 120, 240, 170);
  c.strokeStyle = '#2b3a33'; c.lineWidth = 3; c.strokeRect(392, 120, 240, 170);
  c.fillStyle = kmh > limit + 2 ? '#ff6b6b' : '#c9f5df';
  c.font = `bold 64px ${EN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(Math.round(kmh)), 512, 175);
  c.fillStyle = '#ffd54f'; c.font = `bold 34px ${EN_FONT}`; c.fillText(gear, 512, 228);
  c.fillStyle = '#9fd8bd'; c.font = `500 18px ${EN_FONT}`;
  c.fillText(`${odo.toFixed(1)} km   ${clock}`, 512, 268);
  if (cruise) { c.fillStyle = '#2ecc71'; c.font = `bold 18px ${EN_FONT}`; c.fillText('CRUISE', 512, 140); }
  small(450, 345, 34, fuel, 'FUEL', true);
  small(574, 345, 34, temp, 'TEMP');
  small(392 - 24, 375, 0, 0, '');
  c.fillStyle = '#9aa3ab'; c.font = `600 14px ${EN_FONT}`;
  c.fillText(`AIR ${air.toFixed(1)} bar`, 512, 385);
  // indicator arrows (big, green) and warning lamps
  const arrow = (x, dir, on) => {
    c.fillStyle = on ? '#2bff6a' : '#16301f';
    if (on) { c.shadowColor = '#2bff6a'; c.shadowBlur = 18; }
    c.beginPath();
    c.moveTo(x + dir * 42, 60); c.lineTo(x, 28); c.lineTo(x, 46); c.lineTo(x - dir * 30, 46); c.lineTo(x - dir * 30, 74); c.lineTo(x, 74); c.lineTo(x, 92);
    c.closePath(); c.fill();
    c.shadowBlur = 0;
  };
  arrow(440, -1, indL);
  arrow(584, 1, indR);
  c.fillStyle = lights ? '#3d8bff' : '#14223a';
  c.font = `bold 26px ${EN_FONT}`; c.fillText('≣D', 512, 60);
  c.fillStyle = '#3a1a1a'; c.fillText('(P)', 360, 50);
  c.fillStyle = air < 6 ? '#ff5252' : '#2a1a1a'; c.fillText('(!)', 664, 50);
  tex.needsUpdate = true;
}

// Classic Hino AK panel: grey metal face, small gauges on the left, tacho in the middle, big speedo on the right.
function drawHinoPanel(c, W, H, { kmh, rpm, gear, cruise, lights, indL, indR, fuel, temp, air }) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2e3034'); g.addColorStop(1, '#1d1f22');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#2a2c2f'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
  const face = (x, y, w, h) => { c.fillStyle = '#101113'; c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill(); };
  const needle = (cx, cy, R, a) => {
    c.strokeStyle = '#ff3b1f'; c.lineWidth = Math.max(3, R * 0.05); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - Math.cos(a) * R * 0.15, cy - Math.sin(a) * R * 0.15); c.lineTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88); c.stroke();
    c.fillStyle = '#2b2d30'; c.beginPath(); c.arc(cx, cy, R * 0.1, 0, Math.PI * 2); c.fill();
  };
  const dial = (cx, cy, R, v, max, major, minor, label, fmt, arcCols) => {
    c.fillStyle = '#0b0b0c'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.shadowColor = '#ff2a1a'; c.shadowBlur = R * 0.12; c.strokeStyle = '#e0231a'; c.lineWidth = R * 0.07; c.beginPath(); c.arc(cx, cy, R * 0.97, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = (x) => a0 + (x / max) * (a1 - a0);
    if (arcCols) for (const [f0, f1, col] of arcCols) { c.strokeStyle = col; c.lineWidth = R * 0.08; c.beginPath(); c.arc(cx, cy, R * 0.8, A(f0 * max), A(f1 * max)); c.stroke(); }
    for (let k = 0; k <= max + 1e-6; k += minor) {
      const a = A(k), big = Math.abs(k / major - Math.round(k / major)) < 1e-6;
      c.strokeStyle = '#f2f2f2'; c.lineWidth = big ? 3 : 1.5;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * R * (big ? 0.76 : 0.83), cy + Math.sin(a) * R * (big ? 0.76 : 0.83)); c.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); c.stroke();
      if (big) { c.fillStyle = '#ffffff'; c.font = `bold ${R * 0.17}px ${EN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(fmt(k), cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58); }
    }
    c.fillStyle = '#c9cdd1'; c.font = `600 ${R * 0.12}px ${EN_FONT}`; c.fillText(label, cx, cy + R * 0.42);
    needle(cx, cy, R, A(Math.min(max * 1.02, v)));
  };
  const small = (cx, cy, R, f, label) => {
    c.fillStyle = '#0b0b0c'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e0231a'; c.lineWidth = 2;
    for (let k = 0; k <= 4; k++) { const a = Math.PI * 1.15 + (k / 4) * Math.PI * 0.7; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.65, cy + Math.sin(a) * R * 0.65); c.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85); c.stroke(); }
    c.fillStyle = '#f2f2f2'; c.font = `bold ${R * 0.26}px ${EN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, cx, cy + R * 0.42);
    needle(cx, cy, R * 0.9, Math.PI * 1.15 + Math.min(1, Math.max(0, f)) * Math.PI * 0.7);
  };
  // left block: four small gauges + warning lamps
  face(18, 70, 330, 272);
  small(100, 150, 62, fuel, 'FUEL');
  small(262, 150, 62, temp, 'TEMP');
  small(100, 280, 62, Math.min(1, air / 10), 'AIR 1');
  small(262, 280, 62, Math.min(1, (air - 0.3) / 10), 'AIR 2');
  const lamps = [['#2bff6a', indL], ['#3d8bff', lights], ['#ff3b30', false], ['#ffb300', false], ['#2bff6a', cruise], ['#2bff6a', indR]];
  lamps.forEach(([col, on], i) => { c.fillStyle = on ? col : '#1b1c1e'; c.fillRect(30 + i * 52, 22, 40, 30); });
  // indicator arrows on the outer lamps
  c.fillStyle = '#0b0b0c'; c.font = `bold 24px ${EN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('◀', 50, 38); c.fillText('▶', 310, 38);
  // middle: tachometer with green / amber / red arc
  face(365, 40, 270, 302);
  dial(500, 180, 118, rpm / 1000, 3, 0.5, 0.25, 'x1000 r/min', (k) => (Number.isInteger(k) ? String(k) : ''), [[0, 0.62, '#2e9e4f'], [0.62, 0.78, '#e0b020'], [0.78, 1, '#d33']]);
  c.fillStyle = '#0a1410'; c.fillRect(440, 290, 120, 40);
  c.fillStyle = '#9dffbf'; c.font = `bold 28px ${EN_FONT}`; c.fillText(gear, 500, 311);
  // right: big speedometer
  face(650, 12, 360, 336);
  dial(830, 180, 162, kmh, 140, 20, 10, 'km/h', (k) => String(k));
}
