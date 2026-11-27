// Bus terminals at the two ends of the N1: Sayedabad (Dhaka) and A.K. Khan (Chattogram).
// A walled, paved yard beside the carriageway the trip leaves on, with a two-storey terminal building
// (ticket counters of the operators), parked buses in bays, lamp posts and a gateway over the exit gap.
// Trips start parked in a bay here and end by stopping inside the destination terminal.
// Every solid part is pushed to `obstacles` as an (s, d) rectangle, like the other facilities.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { makeCanvas, canvasTexture, concreteTexture, grassTexture, BN_FONT, EN_FONT } from '../textures.js';
import { ribbon, streetGlowMat } from './road.js';
import { buildBus, setBusRouteBoard } from '../busModel.js';
import { OPERATORS } from '../operators.js';
import { sharedMats, mergeStatic } from './stream.js';

const R = (dy) => (s, h) => h + dy;
const G = (y) => () => y;

function panel(w, h, bg, draw) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  draw(x, w, h);
  return canvasTexture(c, { repeat: false });
}

// ground floor: a row of operator ticket counters; upper floor: windows
function facadeTexture(ops) {
  const W = 2048, H = 512;
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = '#e9e2d0'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#c9bfa8'; x.fillRect(0, H * 0.48, W, 10);
  // upper floor windows
  for (let wx = 20; wx < W - 60; wx += 86) {
    x.fillStyle = '#2f3d46'; x.fillRect(wx, 40, 64, 150);
    x.fillStyle = 'rgba(190,220,235,0.35)'; x.fillRect(wx + 6, 46, 52, 50);
  }
  // counters
  const n = ops.length, cw = W / n;
  ops.forEach((op, i) => {
    const x0 = i * cw + 8, col = op.c1 && op.c1.startsWith('#') ? op.c1 : '#1565c0';
    x.fillStyle = col; x.fillRect(x0, 268, cw - 16, 70);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold 34px ${BN_FONT}`;
    x.fillText(op.bn.split(' ')[0], x0 + (cw - 16) / 2, 292);
    x.font = `bold 22px ${BN_FONT}`;
    x.fillText('কাউন্টার', x0 + (cw - 16) / 2, 324);
    // glass counter window with a grille
    x.fillStyle = '#25323a'; x.fillRect(x0 + 14, 352, cw - 44, 120);
    x.fillStyle = 'rgba(255,236,190,0.45)'; x.fillRect(x0 + 20, 358, cw - 56, 54);
    x.strokeStyle = '#9aa3a8'; x.lineWidth = 3;
    for (let gx = x0 + 26; gx < x0 + cw - 34; gx += 16) { x.beginPath(); x.moveTo(gx, 352); x.lineTo(gx, 472); x.stroke(); }
    x.fillStyle = '#6d4c41'; x.fillRect(x0 + 8, 472, cw - 32, 24);
  });
  return canvasTexture(c, { repeat: false });
}

const termMats = sharedMats(() => ({
    pave: new THREE.MeshStandardMaterial({ map: concreteTexture(15, '#8a8984'), roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(3), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: concreteTexture(4, '#c8c2b4'), roughness: 0.85, side: THREE.DoubleSide }),
    line: new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: 0.6, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 }),
}));

// The bus terminal yards whose middle lies in this block (world/stream.js).
export function* terminalChunk(route, ctx) {
  const mats = termMats();
  const ops = OPERATORS.filter((o) => !o.custom);
  const H = ROAD.half;
  const obstacles = ctx.obstacles;
  for (const [ti, t] of route.terminals.entries()) {
    if (!ctx.in((t.s0 + t.s1) / 2)) continue;
    const sd = t.side, dir = t.dir, h = route.roadHeight(t.sc);
    // yard length along the road (a division's big terminal is longer, with more bays and a bigger building)
    const Ly = Math.abs(t.s1 - t.s0), big = !!t.big, nBays = Math.floor((Ly - 24) / 16);
    const grp = new THREE.Group();
    // s along the yard measured from the closed end towards the exit
    const S = (off) => t.closed + dir * off;
    // place a mesh at (s, d), turned with the road (+ extra yaw)
    const put = (o, s, d, y = 0, yaw = 0) => {
      const p = route.pointAt(s, d);
      o.position.set(p.x, route.roadHeight(s) + y, p.z);
      o.rotation.y = route.yawAt(s) + yaw;
      grp.add(o);
      return o;
    };
    const ob = (sa, sb, da, db) => obstacles.push({ s0: Math.min(sa, sb), s1: Math.max(sa, sb), d0: Math.min(da, db), d1: Math.max(da, db) });

    // ---- paved yard, grass skirt down to the fields
    const yard = sd < 0
      ? [{ d: -t.dOut, y: R(0.03), u: 0 }, { d: -(H - 0.3), y: R(0.03), u: 6 }]
      : [{ d: H - 0.3, y: R(0.03), u: 0 }, { d: t.dOut, y: R(0.03), u: 6 }];
    const ym = new THREE.Mesh(ribbon(route, t.s0, t.s1, 3, yard, 12), mats.pave);
    ym.receiveShadow = true;
    grp.add(ym);
    const skirt = sd < 0
      ? [{ d: -(t.dOut + 6), y: G(0), u: 0 }, { d: -t.dOut, y: R(0.03), u: 1 }]
      : [{ d: t.dOut, y: R(0.03), u: 0 }, { d: t.dOut + 6, y: G(0), u: 1 }];
    grp.add(new THREE.Mesh(ribbon(route, t.s0, t.s1, 4, skirt, 4), mats.grass));

    // ---- markings: row divider and the kerb line in front of the building, bay separators in row 2
    const strip = (d, w, a, b, mat) => {
      const cols = [{ d: d - w / 2, y: R(0.045), u: 0 }, { d: d + w / 2, y: R(0.045), u: 1 }];
      grp.add(new THREE.Mesh(ribbon(route, Math.min(a, b), Math.max(a, b), 3, cols, 10), mat));
    };
    strip(sd * (H + 18), 0.18, S(4), S(Ly - 24), mats.line);
    strip(sd * (H + 27.2), 0.3, S(4), S(Ly - 24), mats.yellow);
    for (let k = 0; k <= nBays; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 0.16), mats.line);
      bar.rotation.order = 'YXZ'; bar.rotation.x = -Math.PI / 2;
      put(bar, S(10 + k * 16), sd * (H + 24), 0.05);
    }

    // ---- boundary walls (with the exit gap in the roadside wall at the departure end)
    const WALL_H = 1.15;
    const vwall = (d, a, b, bottom) => {
      const cols = [{ d, y: bottom, u: 0 }, { d, y: R(WALL_H), u: 1 }];
      const m = new THREE.Mesh(ribbon(route, Math.min(a, b), Math.max(a, b), 3, cols, 4), mats.wall);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    };
    const roadA = t.closed, roadB = dir > 0 ? t.exitS0 : t.exitS1;
    vwall(sd * (H + 0.4), roadA, roadB, R(-0.2));
    ob(roadA, roadB, sd * (H + 0.2), sd * (H + 0.65));
    vwall(sd * t.dOut, t.s0, t.s1, G(0));
    ob(t.s0, t.s1, sd * (t.dOut - 0.25), sd * (t.dOut + 0.3));
    for (const se of [t.s0, t.s1]) {
      const depth = t.dOut - H;
      const w = new THREE.Mesh(new THREE.BoxGeometry(depth, h + WALL_H, 0.3), mats.wall);
      const p = route.pointAt(se, sd * (H + depth / 2));
      w.position.set(p.x, (h + WALL_H) / 2, p.z);
      w.rotation.y = route.yawAt(se);
      w.castShadow = true;
      grp.add(w);
      ob(se - 0.25, se + 0.25, sd * H, sd * t.dOut);
    }

    // ---- terminal building along the back of the yard
    const bLen = big ? Ly - 60 : 62, bDepth = big ? 11 : 9, bH = big ? 12.5 : 7.6;
    const bS = S(big ? (Ly - 20) / 2 : 50), bD = sd * (H + 36 + (bDepth - 9) / 2);
    const counters = [];
    for (let k = 0; k < (big ? 14 : 8); k++) counters.push(ops[(ti * 3 + k) % ops.length]);
    const facade = new THREE.MeshStandardMaterial({ map: facadeTexture(counters), roughness: 0.75 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 0.8 });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(bDepth, bH, bLen), wallMat);
    put(bld, bS, bD, bH / 2);
    bld.castShadow = true; bld.receiveShadow = true;
    // local x = -d: the side facing the yard (towards the road) is local x = +sd
    // the counters along the ground floor (a big terminal has an upper floor with windows above them)
    const fH = big ? 7.6 : bH;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(bLen, fH), facade);
    front.position.set(sd * (bDepth / 2 + 0.02), -bH / 2 + fH / 2, 0);
    front.rotation.y = sd * Math.PI / 2;
    bld.add(front);
    if (big) {
      const win = panel(1024, 128, '#d9d2c3', (x, w, hh) => {
        for (let i = 0; i < 16; i++) { x.fillStyle = '#35505f'; x.fillRect(i * 64 + 10, 26, 44, 70); x.fillStyle = '#9fb7c4'; x.fillRect(i * 64 + 12, 28, 18, 30); }
      });
      win.wrapS = THREE.RepeatWrapping; win.repeat.set(bLen / 40, 1);
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(bLen, bH - fH), new THREE.MeshStandardMaterial({ map: win, roughness: 0.7 }));
      upper.position.set(sd * (bDepth / 2 + 0.02), -bH / 2 + fH + (bH - fH) / 2, 0);
      upper.rotation.y = sd * Math.PI / 2;
      bld.add(upper);
    }
    // flat roof slab with a parapet, awning over the counters
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bDepth + 0.6, 0.35, bLen + 0.6), mats.white);
    roof.position.y = bH / 2 + 0.17;
    bld.add(roof);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, bLen - 2), new THREE.MeshStandardMaterial({ color: ti ? 0x1b5e20 : 0xb71c1c, roughness: 0.55 }));
    awn.position.set(sd * (bDepth / 2 + 2.1), -bH / 2 + 3.4, 0);
    awn.rotation.z = -sd * 0.08;
    awn.castShadow = true;
    bld.add(awn);
    for (let z = -bLen / 2 + 3; z <= bLen / 2 - 3; z += 8) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.3, 8), mats.pole);
      post.position.set(sd * (bDepth / 2 + 3.9), -bH / 2 + 1.65, z);
      bld.add(post);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 2.4), mats.bench);
      bench.position.set(sd * (bDepth / 2 + 1.4), -bH / 2 + 0.23, z + 4);
      bld.add(bench);
    }
    // the terminal's name on the roof, facing the yard and the road
    const nameTex = panel(2048, 200, ti ? '#1b5e20' : '#0d47a1', (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 118px ${BN_FONT}`; x.fillText(t.bn, w * 0.33, hh / 2 + 6);
      x.font = `bold 62px ${EN_FONT}`; x.fillText(t.en.toUpperCase(), w * 0.8, hh / 2 + 2);
    });
    const bw = big ? Math.min(bLen - 10, 70) : 40;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, big ? 5 : 3.4), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.5, emissive: 0x333333, emissiveMap: nameTex }));
    board.position.set(sd * (bDepth / 2 - 0.4), bH / 2 + 2.2, 0);
    board.rotation.y = sd * Math.PI / 2;
    bld.add(board);
    const boardBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, big ? 5.2 : 3.6, bw + 0.4), mats.dark);
    boardBack.position.set(sd * (bDepth / 2 - 0.6), bH / 2 + 2.2, 0);
    bld.add(boardBack);
    // the building and the covered walkway in front of it (awning posts, benches)
    ob(bS - bLen / 2, bS + bLen / 2, sd * (H + 27.6), sd * (H + 36 + bDepth / 2));

    // ---- parked buses in the second row, noses towards the exit
    const kinds = big ? ['coach', 'ak1j', 'highdeck', 'local', 'coach', 'ak1j', 'coach', 'local', 'ak1j', 'coach'].slice(0, nBays) : ['ak1j', 'local', 'coach', 'ak1j', 'local'];
    // the buses waiting in the bays run this terminal's services; their placards say where to
    const zilla = route.net?.nodes[t.node]?.zilla;
    const svcs = (route.net?._svc?.all || []).filter((x) => x.from === zilla);
    // (a terminal off the trip, seen in passing: fewer buses parked, to keep memory down)
    for (const [k, kind] of kinds.slice(0, ctx.lite ? (big ? 5 : 3) : kinds.length).entries()) {
      const svc = svcs.length ? svcs[(ti * 3 + k * 7) % svcs.length] : null;
      const op = (svc && ops.find((o) => o.id === svc.op)) || ops[(ti * 5 + k * 3 + 1) % ops.length];
      const b = buildBus(kind, op, { texScale: 0.5, seed: 500 + ti * 11 + k });
      if (svc) setBusRouteBoard(b, { bn: svc.bn, en: svc.en });
      const s = S(18 + k * 16), d = sd * (H + 24);
      put(b.root, s, d, 0, dir > 0 ? 0 : Math.PI);
      b.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      mergeStatic(b.root);          // (a parked bus never moves: a handful of draw calls instead of ~100)
      ob(s - dir * (b.spec.rearOH + 0.2), s + dir * (b.spec.front + 0.2), d - 1.35, d + 1.35);
      yield;
    }

    // ---- lamp posts along the roadside wall and the row divider
    const lampGeo = new THREE.CylinderGeometry(0.09, 0.13, 8, 8);
    const headGeo = new THREE.BoxGeometry(0.5, 0.18, 1.1);
    for (let off = 8; off <= Ly - 8; off += 26) {
      for (const dd of [H + 1.3, H + 18]) {
        if (off > Ly - 32) continue;                 // keep the exit / entry area clear
        const pole = new THREE.Mesh(lampGeo, mats.pole);
        put(pole, S(off), sd * dd, 4);
        const head = new THREE.Mesh(headGeo, streetGlowMat);
        put(head, S(off), sd * dd, 8);
        if (dd > H + 2) ob(S(off) - 0.25, S(off) + 0.25, sd * dd - 0.25, sd * dd + 0.25);
      }
    }

    // ---- gateway over the exit gap
    const gate = new THREE.Group();
    const gw = Math.abs(t.exitS1 - t.exitS0) - 2;
    const gateTex = panel(1536, 200, '#c62828', (x, w, hh) => {
      x.fillStyle = '#fff'; x.font = `bold 96px ${BN_FONT}`; x.fillText(`${t.bn.split(' ').slice(0, -1).join(' ')} · প্রবেশ / বাহির`, w / 2, hh * 0.42);
      x.font = `bold 46px ${EN_FONT}`; x.fillText('BUS TERMINAL · IN / OUT', w / 2, hh * 0.83);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, gw), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 }));
    beam.position.y = 6.6;
    gate.add(beam);
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(gw - 0.2, 1.5), new THREE.MeshBasicMaterial({ map: gateTex }));
      face.position.set(side * 0.26, 6.6, 0);
      face.rotation.y = side * Math.PI / 2;
      gate.add(face);
    }
    for (const z of [-gw / 2, gw / 2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 7.4, 0.55), mats.white);
      leg.position.set(0, 3.7, z);
      gate.add(leg);
    }
    gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const gS = (t.exitS0 + t.exitS1) / 2;
    put(gate, gS, sd * (H + 0.6));
    for (const z of [t.exitS0 + 1, t.exitS1 - 1]) ob(z - 0.35, z + 0.35, sd * (H + 0.3), sd * (H + 0.9));

    // ---- signs for buses arriving on the far carriageway: advance board and "turn here" at the median opening
    const arriveSide = -sd;
    const sign = (s, d, tex, w, hgt, lift = 2) => {
      const g = new THREE.Group();
      const flip = arriveSide > 0;     // faces the traffic on that carriageway
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      face.position.y = lift + hgt / 2;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, hgt + 0.08, 0.06), mats.pole);
      back.position.set(0, face.position.y, -0.05);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, lift + hgt, 8), mats.pole);
      leg.position.set(0, (lift + hgt) / 2, -0.1);
      g.add(face, back, leg);
      put(g, s, d, 0, flip ? 0 : Math.PI);
    };
    const advTex = (dist) => panel(512, 512, '#0d47a1', (x, w) => {
      x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(12, 12, w - 24, w - 24);
      x.fillStyle = '#fff'; x.font = `bold 130px ${EN_FONT}`; x.fillText('🚌', w / 2, 150);
      x.font = `bold 52px ${BN_FONT}`; x.fillText('বাস টার্মিনাল', w / 2, 290);
      x.font = `bold 42px ${EN_FONT}`; x.fillText(dist, w / 2, 400);
    });
    // arriving traffic comes from beyond the exit end (travelling towards the closed end), so its signs are on that side of the opening
    sign(gS + dir * 300, arriveSide * (H + 2), advTex('BUS TERMINAL 300 m'), 2.4, 2.4);
    sign(gS + dir * 26, arriveSide * 0.7, advTex('TURN HERE →'), 1.8, 1.8, 1.2);

    ctx.scene.add(grp);
    ctx.chunks.register(grp, t.sc, 420);
    yield;
  }
}
