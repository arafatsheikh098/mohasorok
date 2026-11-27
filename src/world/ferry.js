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
}));

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
  // ticket booth and the ghat board
  const bp = route.pointAt(s - dir * 30, -12);
  const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3), M.booth);
  booth.position.set(bp.x, h + 1.3, bp.z);
  booth.castShadow = true;
  g.add(booth);
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
function ferryBoat(M) {
  const b = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 2.2, 52), M.hull);
  hull.position.y = 0.6; hull.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(16.1, 0.5, 52.1), M.red);
  stripe.position.y = 1.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 0.1, 50), M.deck);
  deck.position.y = 1.75;
  const house = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), M.hull);
  house.position.set(5, 3.8, 22); house.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 4.6), M.red);
  roof.position.set(5, 5.9, 22);
  b.add(hull, stripe, deck, house, roof);
  for (const x of [-7.6, 7.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 48), M.rail); r.position.set(x, 2.3, 0); b.add(r); }
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
      // the ferry waits at the first ghat
      if (dir > 0) {
        const boat = ferryBoat(M);
        boat.position.copy(pont.position);
        boat.rotation.y = pont.rotation.y;
        boat.translateZ(dir * 44);
        g.add(boat);
      }
      ctx.scene.add(g);
      ctx.chunks.register(g, s, 400);
      yield;
    }
  }
}
