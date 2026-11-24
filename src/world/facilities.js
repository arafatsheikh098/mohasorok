// Toll plaza with barrier gates, fuel stations and U-turn signs.
// Everything solid is also returned as (s, d) rectangles so the bus can collide with it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROAD, TOLL_FEE, DIESEL_PRICE } from '../config.js';
import { makeCanvas, canvasTexture, concreteTexture, grassTexture, curbTexture, BN_FONT, EN_FONT, toBn } from '../textures.js';
import { ribbon } from './road.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// toll lane geometry (|d| values); the plaza uses the paved shoulder so lanes are wider
export const TOLL = { islandA: 6.0, islandB: 10.3, islandW: 0.6, laneFast: 3.65, laneSlow: 8.15, half: 10, gateOff: 5 };

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;

function textPanel(w, h, bg, draw) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  draw(x, w, h);
  return canvasTexture(c, { repeat: false });
}

function stripeTexture() {
  const [c, x] = makeCanvas(256, 32);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#d32f2f'; x.fillRect(i * 32, 0, 32, 32); }
  return canvasTexture(c, { repeat: false });
}

export function buildFacilities(route, scene, chunks) {
  const obstacles = [];
  const gates = [];
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(12, '#b9b6ae'), roughness: 0.85 }),
    pave: new THREE.MeshStandardMaterial({ map: concreteTexture(14, '#8f8d88'), roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(3), roughness: 1 }),
    curb: new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x24343d, roughness: 0.1, metalness: 0.4 }),
    arm: new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5 }),
  };

  // ------------------------------------------------------------ toll plaza
  if (route.tollS > 0) {
    const sT = route.tollS, h = route.roadHeight(sT);
    const grp = new THREE.Group();
    const p = route.pointAt(sT, 0);
    grp.position.set(p.x, h, p.z);
    grp.rotation.y = route.yawAt(sT);
    const X = (d) => -d; // local x = -d
    const W = (ROAD.half + 1.5) * 2;
    const canopy = new THREE.Mesh(new RoundedBoxGeometry(W, 1.1, 15, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.45, metalness: 0.3 }));
    canopy.position.y = 7.2; canopy.castShadow = true;
    grp.add(canopy);
    const signTex = textPanel(2048, 150, '#1f5fa8', (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 92px ${BN_FONT}`; x.fillText('মেঘনা–গোমতী সেতু টোল প্লাজা', w * 0.38, hh / 2 + 4);
      x.font = `bold 60px ${EN_FONT}`; x.fillText(`TOLL PLAZA · BUS ৳${TOLL_FEE}`, w * 0.82, hh / 2 + 2);
    });
    for (const z of [7.52, -7.52]) {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 1.0), new THREE.MeshBasicMaterial({ map: signTex }));
      sg.position.set(0, 7.2, z);
      if (z < 0) sg.rotation.y = Math.PI;
      grp.add(sg);
    }
    const islandGeo = new THREE.BoxGeometry(TOLL.islandW, 0.25, 22);
    const boothGeo = new RoundedBoxGeometry(0.9, 2.6, 3, 2, 0.08);
    for (const sd of [-1, 1]) {
      for (const di of [TOLL.islandA, TOLL.islandB]) {
        const d = sd * di;
        const isl = new THREE.Mesh(islandGeo, mats.curb);
        isl.position.set(X(d), 0.12, 0);
        grp.add(isl);
        const booth = new THREE.Mesh(boothGeo, mats.white);
        booth.position.set(X(d), 1.5, sd < 0 ? -1.5 : 1.5);
        booth.castShadow = true;
        grp.add(booth);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.02 + 2.2, 1.0), mats.glass);
        win.rotation.y = Math.PI / 2 * (d < 0 ? 1 : -1);
        win.position.set(X(d) + (d < 0 ? 0.46 : -0.46), 1.8, booth.position.z);
        grp.add(win);
        for (const z of [-6.5, 6.5]) {
          const pil = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6.7, 0.45), mats.concrete);
          pil.position.set(X(d), 3.6, z);
          grp.add(pil);
        }
        obstacles.push({ s0: sT - 11, s1: sT + 11, d0: d - TOLL.islandW / 2, d1: d + TOLL.islandW / 2 });
      }
      // gates for both lanes of this carriageway; traffic travels +s on the left (sd=-1), -s on the right
      const dir = sd < 0 ? 1 : -1;
      const gs = sT + dir * TOLL.gateOff;
      const lanes = [
        { c: TOLL.laneFast, from: TOLL.islandA - TOLL.islandW / 2, to: ROAD.median + 0.1 },
        { c: TOLL.laneSlow, from: TOLL.islandB - TOLL.islandW / 2, to: TOLL.islandA + TOLL.islandW / 2 },
      ];
      for (const ln of lanes) {
        const len = ln.from - ln.to;
        const pivot = new THREE.Group();
        pivot.position.set(X(sd * ln.from), 1.05, gs - sT);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.5 }));
        post.position.y = -0.5;
        pivot.add(post);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.09), mats.arm);
        // the arm reaches towards the median
        arm.position.x = X(sd) * -1 * 0 + (sd < 0 ? -len / 2 : len / 2);
        pivot.add(arm);
        grp.add(pivot);
        const lamp = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 2 });
        const lampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), lamp);
        lampMesh.position.set(X(sd * ln.c), 6.45, -dir * 7.6);
        grp.add(lampMesh);
        const gate = { s: gs, d: sd * ln.c, dir, side: sd, pivot, lamp, open: 0, openT: 0, holdPlayer: false,
          openSign: sd < 0 ? -1 : 1, d0: sd < 0 ? -ln.from : ln.to, d1: sd < 0 ? -ln.to : ln.from };
        gates.push(gate);
        obstacles.push({ s0: gs - 0.2, s1: gs + 0.2, d0: gate.d0, d1: gate.d1, gate });
      }
    }
    scene.add(grp);
    chunks.register(grp, sT, 60);
    // advance warning signs
    for (const [s, d, flip] of [[sT - 350, -(ROAD.half + 2), false], [sT + 350, ROAD.half + 2, true]]) {
      addSign(scene, chunks, route, s, d, flip, textPanel(1024, 512, '#1f5fa8', (x, w, hh) => {
        x.strokeStyle = '#fff'; x.lineWidth = 14; x.strokeRect(16, 16, w - 32, hh - 32);
        x.fillStyle = '#fff'; x.font = `bold 120px ${BN_FONT}`; x.fillText('টোল প্লাজা', w / 2, 170);
        x.font = `bold 70px ${EN_FONT}`; x.fillText('TOLL PLAZA  350 m', w / 2, 300);
        x.fillStyle = '#ffd54f'; x.font = `bold 60px ${BN_FONT}`; x.fillText(`বাস ৳${toBn(TOLL_FEE)} · থামুন`, w / 2, 410);
      }), 4.2, 2.1);
    }
  }

  // ------------------------------------------------------------ fuel stations
  for (const st of route.stations) {
    const sd = st.side, h = route.roadHeight(st.sc);
    const cols = sd < 0
      ? [{ d: -st.dOut, y: R(0.03), u: 0 }, { d: -ROAD.half + 0.3, y: R(0.03), u: 4 }]
      : [{ d: ROAD.half - 0.3, y: R(0.03), u: 0 }, { d: st.dOut, y: R(0.03), u: 4 }];
    const grp = new THREE.Group();
    const fc = new THREE.Mesh(ribbon(route, st.s0, st.s1, 3, cols, 8), mats.pave);
    fc.receiveShadow = true;
    grp.add(fc);
    const skirt = sd < 0
      ? [{ d: -(st.dOut + 6), y: G(0), u: 0 }, { d: -st.dOut, y: R(0.03), u: 1 }]
      : [{ d: st.dOut, y: R(0.03), u: 0 }, { d: st.dOut + 6, y: G(0), u: 1 }];
    grp.add(new THREE.Mesh(ribbon(route, st.s0, st.s1, 3, skirt, 4), mats.grass));

    const dc = sd * (ROAD.half + 15);
    const local = new THREE.Group();
    const p = route.pointAt(st.sc, dc);
    local.position.set(p.x, h, p.z);
    local.rotation.y = route.yawAt(st.sc);
    const X = (d) => -(d - dc);
    const brand = ['#0a7d3b', '#c62828', '#1565c0'][route.stations.indexOf(st) % 3];
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.4 });
    const canopy = new THREE.Mesh(new RoundedBoxGeometry(15, 0.9, 26, 2, 0.15), canopyMat);
    canopy.position.y = 6.0; canopy.castShadow = true;
    local.add(canopy);
    const fasciaTex = textPanel(2048, 128, brand, (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 80px ${BN_FONT}`; x.fillText(st.bn, w * 0.4, hh / 2 + 4);
      x.font = `bold 52px ${EN_FONT}`; x.fillText('DIESEL • OCTANE • CNG', w * 0.82, hh / 2);
    });
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(25.6, 0.8), new THREE.MeshBasicMaterial({ map: fasciaTex }));
    fascia.position.set(X(sd * ROAD.half) > 0 ? 7.52 : -7.52, 6.0, 0);
    fascia.rotation.y = X(sd * ROAD.half) > 0 ? Math.PI / 2 : -Math.PI / 2;
    local.add(fascia);
    for (const x of [-5, 5]) for (const z of [-9, 9]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6, 0.45), canopyMat);
      pil.position.set(x, 3, z);
      local.add(pil);
      obstacles.push({ s0: st.sc + z - 0.35, s1: st.sc + z + 0.35, d0: dc - x - 0.35, d1: dc - x + 0.35 });
    }
    const pumpTex = textPanel(256, 512, brand, (x, w, hh) => {
      x.fillStyle = '#111'; x.fillRect(30, 60, w - 60, 150);
      x.fillStyle = '#7CFC9A'; x.font = `bold 46px ${EN_FONT}`; x.fillText(`${DIESEL_PRICE}.00`, w / 2, 110);
      x.font = `bold 30px ${EN_FONT}`; x.fillText('Tk / L', w / 2, 170);
      x.fillStyle = '#fff'; x.font = `bold 54px ${BN_FONT}`; x.fillText('ডিজেল', w / 2, 300);
      x.fillStyle = '#ffd54f'; x.fillRect(40, 380, w - 80, 60);
    });
    const pumpMat = new THREE.MeshStandardMaterial({ map: pumpTex, roughness: 0.5 });
    for (const di of [9, 21]) {
      const d = sd * (ROAD.half + di);
      const isl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 13), mats.curb);
      isl.position.set(X(d), 0.11, 0);
      local.add(isl);
      for (const z of [-3.5, 3.5]) {
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.9), [mats.white, mats.white, mats.white, mats.white, pumpMat, pumpMat]);
        pump.position.set(X(d), 1.15, z);
        pump.rotation.y = Math.PI / 2;
        pump.castShadow = true;
        local.add(pump);
      }
      obstacles.push({ s0: st.sc - 6.5, s1: st.sc + 6.5, d0: d - 0.65, d1: d + 0.65 });
    }
    // shop + office
    const shopD = sd * (ROAD.half + 27);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.8, 14), mats.white);
    shop.position.set(X(shopD), 1.9, 0);
    shop.castShadow = true;
    local.add(shop);
    const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.2), new THREE.MeshBasicMaterial({ map: textPanel(1024, 96, brand, (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 58px ${BN_FONT}`; x.fillText('মিনি মার্ট · চা · নাস্তা · টয়লেট', w / 2, hh / 2 + 4);
    }) }));
    const face = X(shopD) + (X(shopD) > 0 ? -2.76 : 2.76);
    shopSign.position.set(face, 3.0, 0);
    shopSign.rotation.y = X(shopD) > 0 ? -Math.PI / 2 : Math.PI / 2;
    local.add(shopSign);
    obstacles.push({ s0: st.sc - 7, s1: st.sc + 7, d0: Math.min(shopD - 2.75, shopD + 2.75), d1: Math.max(shopD - 2.75, shopD + 2.75) });
    grp.add(local);
    // tall price pole near the entrance, facing traffic on this side
    const poleS = sd < 0 ? st.s0 + 4 : st.s1 - 4;
    addSign(grp, null, route, poleS, sd * (ROAD.half + 3), sd > 0, textPanel(512, 640, brand, (x, w) => {
      x.fillStyle = '#fff'; x.font = `bold 64px ${BN_FONT}`; x.fillText(st.bn.split(' ')[0], w / 2, 90);
      x.font = `bold 38px ${BN_FONT}`; x.fillText('ফিলিং স্টেশন', w / 2, 160);
      x.fillStyle = '#111'; x.fillRect(40, 220, w - 80, 360);
      x.fillStyle = '#ffd54f'; x.font = `bold 40px ${EN_FONT}`;
      x.textAlign = 'left'; x.fillText('DIESEL', 70, 290); x.fillText('OCTANE', 70, 390); x.fillText('PETROL', 70, 490);
      x.textAlign = 'right'; x.fillStyle = '#7CFC9A'; x.fillText(`${DIESEL_PRICE}`, w - 70, 290); x.fillText('135', w - 70, 390); x.fillText('131', w - 70, 490);
    }), 2.2, 2.75, 5.5);
    // advance sign
    const advS = sd < 0 ? st.s0 - 400 : st.s1 + 400;
    addSign(grp, null, route, advS, sd * (ROAD.half + 2), sd > 0, textPanel(512, 512, '#0d47a1', (x, w) => {
      x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(12, 12, w - 24, w - 24);
      x.fillStyle = '#fff'; x.font = `bold 150px ${EN_FONT}`; x.fillText('⛽', w / 2, 190);
      x.font = `bold 56px ${BN_FONT}`; x.fillText('ফিলিং স্টেশন', w / 2, 340);
      x.font = `bold 60px ${EN_FONT}`; x.fillText('400 m', w / 2, 430);
    }), 2.2, 2.2);
    scene.add(grp);
    chunks.register(grp, st.sc, 450);
  }

  // ------------------------------------------------------------ U-turn signs
  const uTex = textPanel(512, 512, '#0d47a1', (x, w) => {
    x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(12, 12, w - 24, w - 24);
    x.strokeStyle = '#fff'; x.lineWidth = 30; x.lineCap = 'round';
    x.beginPath(); x.moveTo(330, 330); x.lineTo(330, 170); x.arc(255, 170, 75, 0, Math.PI, true); x.lineTo(180, 260); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(140, 250); x.lineTo(220, 250); x.lineTo(180, 310); x.fill();
    x.font = `bold 58px ${BN_FONT}`; x.fillText('ইউ-টার্ন', w / 2, 400);
    x.font = `bold 44px ${EN_FONT}`; x.fillText('U-TURN 250 m', w / 2, 460);
  });
  for (const u of route.uturns) {
    addSign(scene, chunks, route, u.s - 250, -(ROAD.half + 2), false, uTex, 2, 2);
    addSign(scene, chunks, route, u.s + 250, ROAD.half + 2, true, uTex, 2, 2);
  }

  // ------------------------------------------------------------ pedestrian footbridges (steel truss, red/white or green)
  const fbSpots = [];
  for (const p of route.places) if (p.town >= 300 && p.s > 200 && p.s < route.length - 200) fbSpots.push(p.s + 40);
  for (let s0 = 3000; s0 < route.length - 500; s0 += 4200) fbSpots.push(s0);
  const clear = (sx) => !route.bridgeAt(sx) && !route.bridgeAt(sx - 60) && !route.bridgeAt(sx + 60) && Math.abs(sx - route.tollS) > 150 &&
    !route.uturnAt(sx) && !route.stations.some((st) => Math.abs(sx - st.sc) < 120);
  fbSpots.filter(clear).forEach((sf, i) => {
    const colour = i % 2 ? 0x2e8b3e : 0xc62828;
    const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6, metalness: 0.2 });
    const conc = mats.concrete;
    const h = route.roadHeight(sf), half = ROAD.toe + 2, deckY = 5.6;
    const grp = new THREE.Group();
    const p = route.pointAt(sf, 0);
    grp.position.set(p.x, h, p.z);
    grp.rotation.y = route.yawAt(sf);
    const red = [], wht = [], grey = [];
    const box = (arr, w, hh, d, x, y, z, rz = 0) => { const g = new THREE.BoxGeometry(w, hh, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); arr.push(g); };
    const W = 2.4; // deck width (along the road)
    // deck and roof
    box(grey, half * 2, 0.25, W, 0, deckY, 0);
    box(red, half * 2, 0.12, W + 0.4, 0, deckY + 2.7, 0);
    // side trusses: chords, verticals, diagonals
    for (const zz of [-W / 2, W / 2]) {
      box(red, half * 2, 0.2, 0.15, 0, deckY + 0.15, zz);
      box(red, half * 2, 0.18, 0.15, 0, deckY + 2.55, zz);
      const n = Math.round(half / 2);
      for (let k = -n; k <= n; k++) {
        const x = (k / n) * (half - 0.2);
        box(red, 0.14, 2.4, 0.14, x, deckY + 1.35, zz);
        if (k < n) box(wht, 0.08, 2.9, 0.08, x + half / n / 2, deckY + 1.35, zz, (k % 2 ? 1 : -1) * 0.62);
      }
      box(wht, half * 2, 0.06, 0.06, 0, deckY + 1.1, zz);   // hand rail
    }
    // columns: both road edges and the median
    for (const x of [-half + 0.4, half - 0.4, 0]) box(grey, 0.5, deckY, 0.5, x, deckY / 2 - (x === 0 ? 0 : 0.6), 0);
    // stairs at both ends running along the road
    for (const sx of [-1, 1]) {
      const sx0 = sx * (half + 1.4);
      const stairs = new THREE.BoxGeometry(1.8, 0.2, 9.5);
      stairs.rotateX(Math.atan2(deckY + 0.6, 9.5));
      stairs.translate(sx0, (deckY - 0.6) / 2, -W / 2 - 4.2);
      grey.push(stairs);
      box(grey, 2.2, 0.25, 2.4, sx * (half + 0.6), deckY, 0);
      box(red, 0.08, 1.0, 9.8, sx0 + 0.9, deckY / 2 + 0.3, -W / 2 - 4.2, 0);
    }
    const m = (arr, mat) => { const mesh = new THREE.Mesh(mergeGeometries(arr), mat); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh); };
    m(red, paint); m(wht, white); m(grey, conc);
    // banner on the span (they always carry an ad or a slogan)
    const ban = textPanel(1024, 128, i % 2 ? '#0b6b3a' : '#ffffff', (x, w, hh) => {
      x.fillStyle = i % 2 ? '#ffffff' : '#c62828'; x.font = `bold 70px ${BN_FONT}`;
      x.fillText(i % 2 ? 'নিরাপদ সড়ক — নিরাপদ জীবন' : 'ফুটওভার ব্রিজ ব্যবহার করুন', w / 2, hh / 2 + 4);
    });
    for (const zz of [-W / 2 - 0.1, W / 2 + 0.1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshStandardMaterial({ map: ban, roughness: 0.6 }));
      pl.position.set(0, deckY + 1.35, zz);
      if (zz < 0) pl.rotation.y = Math.PI;
      grp.add(pl);
    }
    scene.add(grp);
    chunks.register(grp, sf, 80);
  });

  // ------------------------------------------------------------ median railing through towns (keeps people off the median)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.5 });
  for (const p of route.places) {
    if (!p.town) continue;
    const a = Math.max(20, p.s - p.town / 2), b = Math.min(route.length - 20, p.s + p.town / 2);
    const geos = [];
    const q = new THREE.Vector3();
    for (let sx = a; sx < b; sx += 2.5) {
      if (route.uturnAt(sx) || route.bridgeAt(sx)) continue;
      route.pointAt(sx, 0, q);
      const yaw = route.yawAt(sx), y0 = route.roadHeight(sx) + 0.27;
      const post = new THREE.BoxGeometry(0.06, 1.1, 0.06); post.translate(q.x, y0 + 0.55, q.z); geos.push(post);
      for (const ry of [0.55, 1.05]) {
        const rail = new THREE.BoxGeometry(0.04, 0.05, 2.5); rail.rotateY(yaw); rail.translate(q.x, y0 + ry, q.z); geos.push(rail);
      }
    }
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), railMat);
    scene.add(mesh);
    chunks.register(mesh, (a + b) / 2, (b - a) / 2 + 50);
  }

  // ------------------------------------------------------------ runtime
  return {
    obstacles, gates,
    update(dt) {
      for (const g of gates) {
        g.openT = Math.max(0, g.openT - dt);
        const target = g.openT > 0 || g.holdPlayer ? 1 : 0;
        g.open += THREE.MathUtils.clamp(target - g.open, -dt * 1.2, dt * 1.2);
        g.pivot.rotation.z = g.openSign * g.open * 1.45;
        g.lamp.emissive.setHex(g.open > 0.8 ? 0x20ff40 : 0xff2020);
      }
    },
  };
}

function addSign(parent, chunks, route, s, d, flip, tex, w, h, lift = 1.8) {
  const g = new THREE.Group();
  const p = route.pointAt(s, d);
  g.position.set(p.x, route.roadHeight(s), p.z);
  g.rotation.y = route.yawAt(s) + (flip ? 0 : Math.PI);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  panel.position.y = lift + h / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }));
  back.position.set(0, panel.position.y, -0.05);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, lift + h + 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.4 }));
  leg.position.set(0, (lift + h) / 2 - 0.25, -0.1);
  g.add(panel, back, leg);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  parent.add(g);
  if (chunks) chunks.register(g, s, 60);
}
