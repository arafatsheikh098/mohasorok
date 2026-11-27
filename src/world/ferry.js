// Ferry crossings (ফেরি ঘাট): Paturia–Daulatdia over the Padma and Laharhat–Veduria to Bhola.
// The river between the two ghats, a steel pontoon with a ramp at each ghat, a ticket booth, and the
// ferry tied up at the ghat. Crossing itself happens in main.js (stop on the pontoon, F, fade, other bank).
import * as THREE from 'three';
import { polyRibbon, waterMatRef } from './road.js';
import { sharedMats } from './stream.js';
import { makeCanvas, canvasTexture, BN_FONT, EN_FONT } from '../textures.js';

const fMats = sharedMats(() => ({
  steel: new THREE.MeshStandardMaterial({ color: 0x5d6b75, roughness: 0.6, metalness: 0.5 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 0.85, metalness: 0.2 }),
  hull: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xb8a98a, roughness: 1 }),
  booth: new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.6 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x2a3f4f, roughness: 0.2, metalness: 0.3 }),
  tin: new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.5, metalness: 0.5 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5533, roughness: 0.9 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
  gravel: new THREE.MeshStandardMaterial({ color: 0x8f8574, roughness: 1 }),
  trucks: [0xe65100, 0xf9a825, 0x2e7d32, 0xc62828, 0x1565c0, 0x6a1b9a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
}));

// a Bangladeshi truck (colourful cab, tarpaulin-covered body)
function truck(M, k) {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 2.0), M.trucks[k % M.trucks.length]);
  cab.position.set(0, 1.75, 3.6);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.05), M.glass);
  glass.position.set(0, 2.3, 4.62);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.6, 6.2), k % 2 ? M.trucks[(k + 2) % M.trucks.length] : M.tin);
  body.position.set(0, 1.95, -0.6);
  g.add(cab, glass, body);
  for (const z of [3.4, -1.6, -2.8]) for (const x of [-1.1, 1.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 10), M.tyre);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.48, z);
    g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// a small shop / tea stall with a tin roof
function stall(M, w = 4) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 3.2), M.wall);
  box.position.y = 1.3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.12, 4.4), M.tin);
  roof.position.set(0, 2.75, 0.5); roof.rotation.x = -0.1;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.9, 0.5), M.wood);
  counter.position.set(0, 0.45, 1.85);
  g.add(box, roof, counter);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function board(bn, en) {
  const [c, x] = makeCanvas(1024, 256);
  x.fillStyle = '#0d47a1'; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#fff'; x.lineWidth = 10; x.strokeRect(10, 10, 1004, 236);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 92px ${BN_FONT}`; x.fillText(bn, 512, 100, 960);
  x.font = `bold 48px ${EN_FONT}`; x.fillText(en, 512, 196, 960);
  return canvasTexture(c, { repeat: false });
}

// a pontoon + ramp at ghat s (dir: +1 = the river is towards larger s)
function ghat(route, g, M, s, dir, f) {
  const h = route.roadHeight(s);
  const p = route.pointAt(s + dir * 22, 0), yaw = route.yawAt(s);
  const pont = new THREE.Group();
  pont.position.set(p.x, 0, p.z);
  pont.rotation.y = yaw;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 34), M.steel);
  deck.position.y = 0.6; deck.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.08, 33.4), M.deck);
  top.position.y = 1.24; top.receiveShadow = true;
  pont.add(deck, top);
  for (const x of [-6.9, 6.9]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 32), M.rail); r.position.set(x, 1.7, 0); pont.add(r); }
  // ramp from the road down onto the pontoon
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 14), M.steel);
  ramp.position.set(0, (h + 1.25) / 2, -dir * 20);
  ramp.rotation.x = dir * Math.atan2(h - 1.25, 14);
  pont.add(ramp);
  g.add(pont);
  // the side away from the trucks' queue (traffic heading for the river keeps left)
  const half = route.prof(s).half, qSide = dir > 0 ? -1 : 1;
  const place = (o, ss, d, y = 0, yaw = 0) => {
    const q = route.pointAt(ss, d);
    o.position.set(q.x, y, q.z);
    o.rotation.y = route.yawAt(ss) + yaw;
    g.add(o);
    return o;
  };
  // ticket counter (টিকিট কাউন্টার): a small building with its sign, on the far side from the queue
  const tc = new THREE.Group();
  const tcb = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), M.wall);
  tcb.position.y = 1.5; tcb.castShadow = true;
  const tcr = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.25, 4.8), M.blue);
  tcr.position.y = 3.1;
  const tcs = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.1), new THREE.MeshStandardMaterial({ map: board('টিকিট কাউন্টার', 'FERRY TICKETS'), roughness: 0.5 }));
  tcs.position.set(0, 3.9, 2.0);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), M.glass);
  win.position.set(0, 1.6, 2.02);
  tc.add(tcb, tcr, tcs, win);
  place(tc, s - dir * 40, -qSide * (half + 9), h, -qSide * Math.PI / 2 + (dir > 0 ? 0 : Math.PI));
  // tea stalls and shops along the approach (every ghat has them)
  for (let k = 0; k < 4; k++) place(stall(M, 3.5 + (k % 2)), s - dir * (70 + k * 9), -qSide * (half + 8), h, -qSide * Math.PI / 2 + (dir > 0 ? 0 : Math.PI));
  // trucks waiting their turn on the shoulder
  for (let k = 0; k < 6; k++) place(truck(M, k), s - dir * (60 + k * 15), qSide * (half + 2.2), h - 0.1, dir > 0 ? 0 : Math.PI);
  const qs = [s - dir * 150, s - dir * 45].sort((a, b) => a - b);
  g.add(new THREE.Mesh(polyRibbon([route.pointAt(qs[0], qSide * (half + 2.2)), route.pointAt(qs[1], qSide * (half + 2.2))].map((q) => q.setY(0)), 5, h - 0.15), M.gravel));
  // the ghat's gateway over the road
  const gate = new THREE.Group();
  const gw = 2 * half + 4;
  for (const x of [-gw / 2, gw / 2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), M.wall); post.position.set(x, 3.75, 0); gate.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.7, 1.9, 0.5), M.blue);
  beam.position.y = 7.3;
  gate.add(beam);
  const gn = (dir > 0 ? f.from : f.to) || {};
  const gtex = board(`${(gn.bn || '').split(' (')[0].replace(/ ?ঘাট$/, '')} ফেরিঘাট`, `${(gn.en || '').split(' (')[0].replace(/ Ghat$/, '').toUpperCase()} FERRY GHAT`);
  for (const zz of [0.27, -0.27]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(gw, 1.7), new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.5 }));
    face.position.set(0, 7.3, zz);
    if (zz < 0) face.rotation.y = Math.PI;
    gate.add(face);
  }
  gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  place(gate, s - dir * 170, 0, h, dir > 0 ? Math.PI : 0);
  const sp = route.pointAt(s - dir * 70, -13);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshStandardMaterial({ map: board(f.bn, `${f.en.toUpperCase()} · ৳${f.fare}`), roughness: 0.5 }));
  sign.position.set(sp.x, h + 5, sp.z);
  sign.rotation.y = yaw + (dir > 0 ? Math.PI : 0);
  g.add(sign);
  for (const o of [-3, 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), M.steel);
    const lp = route.pointAt(s - dir * 70 + o * 0, -13 + o * 0.0);
    leg.position.set(lp.x + Math.cos(yaw) * o, h + 2.3, lp.z - Math.sin(yaw) * o);
    g.add(leg);
  }
  return pont;
}

// a roll-on/roll-off river ferry: flat white hull, red stripe, a small bridge house at one end
function ferryBoat(M, name) {
  const b = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 2.6, 60), M.hull);
  hull.position.y = 0.7; hull.castShadow = true;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.9, 60.1), M.red);
  bottom.position.y = 0;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(18.15, 0.45, 60.15), M.blue);
  stripe.position.y = 1.55;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(17, 0.1, 58), M.deck);
  deck.position.y = 2.05;
  b.add(hull, bottom, stripe, deck);
  // the two-deck cabin and wheelhouse along one side, with a name board
  const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 26), M.hull);
  cab.position.set(6.4, 3.6, 0); cab.castShadow = true;
  const cabWin = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.9, 24), M.glass);
  cabWin.position.set(6.4, 4.0, 0);
  const wh = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 6), M.hull);
  wh.position.set(6.4, 6.3, 0); wh.castShadow = true;
  const whWin = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.8, 5.6), M.glass);
  whWin.position.set(6.4, 6.6, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 6.6), M.red);
  roof.position.set(6.4, 7.65, 0);
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshStandardMaterial({ map: board(name, 'BIWTC FERRY'), roughness: 0.5 }));
  nb.position.set(9.07, 1.0, 0); nb.rotation.y = Math.PI / 2;
  b.add(cab, cabWin, wh, whWin, roof, nb);
  for (const x of [-8.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 56), M.rail); r.position.set(x, 2.6, 0); b.add(r); }
  // a couple of trucks already aboard
  for (const [k, z] of [[1, -18], [3, -6]]) { const t = truck(M, k); t.position.set(-2.5, 2.1, z); b.add(t); }
  return b;
}

export function* ferryChunk(route, ctx) {
  if (!route.ferries?.length) return;
  const M = fMats();
  for (const f of route.ferries) {
    // the river and its sandy banks, with the block of the crossing's middle
    if (ctx.in(f.sc) && f.river) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(polyRibbon(f.river.pts, f.width + 40, 0.12), M.sand));
      const w = new THREE.Mesh(polyRibbon(f.river.pts, f.width, 0.3), waterMatRef());
      w.receiveShadow = true;
      g.add(w);
      ctx.scene.add(g);
      ctx.chunks.register(g, f.sc, 4000);
      yield;
    }
    for (const [s, dir] of [[f.s0, 1], [f.s1, -1]]) {
      if (!ctx.in(s)) continue;
      const g = new THREE.Group();
      const pont = ghat(route, g, M, s, dir, f);
      // a ferry tied up at each ghat, ramp to the pontoon
      const names = ['কাকলি', 'কিষাণী', 'শাহ আলী', 'ক্যামেলিয়া', 'বীর শ্রেষ্ঠ'];
      const boat = ferryBoat(M, `ফেরি ${names[(Math.round(f.sc) + (dir > 0 ? 0 : 2)) % names.length]}`);
      boat.position.copy(pont.position);
      boat.rotation.y = pont.rotation.y;
      boat.translateZ(dir * 48);
      g.add(boat);
      ctx.scene.add(g);
      ctx.chunks.register(g, s, 400);
      yield;
    }
  }
}
