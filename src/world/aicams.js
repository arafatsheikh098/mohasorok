// AI traffic cameras: a pole with an arm over the carriageway, camera + flash unit.
// They flash for every vehicle that passes, and check the player's speed.
import * as THREE from 'three';
import { ROAD, SPEED_LIMIT } from '../config.js';
import { makeCanvas, canvasTexture, glowTexture, BN_FONT, EN_FONT } from '../textures.js';

function zoneSignTexture() {
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#0d47a1'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(12, 12, 488, 488);
  // camera pictogram
  x.fillStyle = '#fff';
  x.fillRect(150, 150, 170, 95);
  x.beginPath(); x.moveTo(320, 175); x.lineTo(380, 150); x.lineTo(380, 245); x.lineTo(320, 220); x.fill();
  x.fillStyle = '#0d47a1'; x.beginPath(); x.arc(235, 197, 30, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 62px ${BN_FONT}`; x.fillText('এআই ক্যামেরা', 256, 320);
  x.font = `bold 34px ${BN_FONT}`; x.fillText('নিয়ন্ত্রিত এলাকা', 256, 380);
  x.font = `bold 30px ${EN_FONT}`; x.fillText(`AI CAMERA · ${SPEED_LIMIT} km/h`, 256, 440);
  return canvasTexture(c, { repeat: false });
}

// camera-flash sprite: hard white core, blue-white rim and a horizontal lens streak
function flareTexture() {
  const S = 256;
  const [c, x] = makeCanvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(210,235,255,0.75)');
  g.addColorStop(0.6, 'rgba(170,210,255,0.22)');
  g.addColorStop(1, 'rgba(160,200,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const h = x.createLinearGradient(0, 0, S, 0);
  h.addColorStop(0, 'rgba(200,230,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,0.95)'); h.addColorStop(1, 'rgba(200,230,255,0)');
  x.fillStyle = h; x.fillRect(0, S / 2 - 3, S, 6);
  const v = x.createLinearGradient(0, 0, 0, S);
  v.addColorStop(0, 'rgba(200,230,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,0.6)'); v.addColorStop(1, 'rgba(200,230,255,0)');
  x.fillStyle = v; x.fillRect(S / 2 - 2, S * 0.2, 4, S * 0.6);
  return canvasTexture(c, { repeat: false });
}

export function buildAICams(route, scene, chunks) {
  const spots = [];
  const ok = (s) => s > 150 && s < route.length - 150 && !route.bridgeAt(s) && !route.bridgeAt(s + 40) && !route.bridgeAt(s - 40) &&
    route.tollDist(s) > 200 && !route.uturnAt(s) && !route.junctions.some((j) => Math.abs(s - j.s) < 150) && ![...route.stations, ...route.rests].some((st) => Math.abs(s - st.sc) < 140);
  // only the big cities get one on each carriageway at their entry; plus one every ~6 km in between,
  // alternating sides (so each direction meets a camera about every 12 km, not every few km)
  for (const p of route.places) {
    if (p.kind !== 'city') continue;
    spots.push({ s: p.s - p.town / 2 + 25, side: -1 });   // towards Chattogram
    spots.push({ s: p.s + p.town / 2 - 25, side: 1 });    // towards Dhaka
  }
  for (let s = 3000, k = 0; s < route.length - 300; s += 6000, k++) {
    const side = k % 2 ? 1 : -1;
    // keep cameras on the same carriageway at least 400 m apart (no double flashes / fines)
    if (!spots.some((o) => o.side === side && Math.abs(o.s - s) < 400)) spots.push({ s, side });
  }
  const cams = spots.filter((c) => ok(c.s)).sort((a, b) => a.s - b.s);

  const steel = new THREE.MeshStandardMaterial({ color: 0x8d9297, roughness: 0.45, metalness: 0.7 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.3 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.6 });
  const signMat = new THREE.MeshStandardMaterial({ map: zoneSignTexture(), roughness: 0.5 });
  const glowMap = flareTexture();

  for (const c of cams) {
    const h = route.roadHeight(c.s);
    const g = new THREE.Group();
    const p = route.pointAt(c.s, 0);
    g.position.set(p.x, h, p.z);
    // local frame: +z faces the traffic that approaches this camera, +x points away from the road edge
    g.rotation.y = route.yawAt(c.s) + (c.side < 0 ? Math.PI : 0);
    const P = route.prof(c.s);
    const sideX = -(P.half + 1.4);          // after the rotation the camera's carriageway is at negative x
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 7, 10), steel);
    pole.position.set(sideX, 3.5, 0);
    const armLen = P.half - P.median - 2.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.14, 0.14), steel);
    arm.position.set(sideX + armLen / 2, 6.8, 0);
    g.add(pole, arm);
    // camera body + lens + flash unit hanging over the slow lane, looking at oncoming traffic
    const head = new THREE.Group();
    head.position.set(sideX + armLen * 0.55, 6.45, 0);
    head.rotation.x = 0.28;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.6), housing);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.68), housing);
    hood.position.y = 0.15;
    const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16), lens);
    ln.rotation.x = Math.PI / 2; ln.position.z = 0.31;
    head.add(body, hood, ln);
    const flashMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.06), flashMat);
    flash.position.set(0.5, 0, 0.1);
    const fbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.14), housing);
    fbox.position.set(0.5, 0, 0.04);
    head.add(fbox, flash);
    // halo sprite for the flash (invisible until it fires)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
    halo.scale.setScalar(4);
    halo.position.set(0.5, 0, 0.3);
    head.add(halo);
    // small status LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 1.5 }));
    led.position.set(-0.12, 0.08, 0.31);
    head.add(led);
    g.add(head);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    chunks.register(g, c.s, 60);
    // warning sign 150 m before the camera, on the same side
    const signS = c.s - c.side * -150;   // traffic towards Chattogram (side -1) meets it at lower s
    const sg = new THREE.Group();
    const sp = route.pointAt(signS, c.side * (route.prof(signS).half + 1.6));
    sg.position.set(sp.x, route.roadHeight(signS), sp.z);
    sg.rotation.y = route.yawAt(signS) + (c.side < 0 ? Math.PI : 0);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), signMat);
    panel.position.y = 2.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.66, 1.66, 0.05), steel);
    back.position.set(0, 2.6, -0.04);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), steel);
    post.position.set(0, 1.6, -0.08);
    sg.add(panel, back, post);
    scene.add(sg);
    chunks.register(sg, signS, 40);
    Object.assign(c, { flashMat, halo, t: 0, head });
  }

  // one shared light so a flash also lights up the bus for a moment
  const light = new THREE.PointLight(0xffffff, 0, 40, 1.6);
  scene.add(light);

  return {
    cams,
    // vehicles: [{ s, prevS, side, kmh, len, isPlayer }]
    // The camera photographs vehicles from the front while they are still TRIGGER metres away,
    // so the driver sees the flash ahead through the windshield.
    update(dt, vehicles, onPlayerPass) {
      const TRIGGER = 32, FLASH = 0.5;
      let brightest = null, bk = 0;
      for (const c of cams) {
        if (c.t > 0) {
          c.t = Math.max(0, c.t - dt);
          // two pops: 0.50–0.40 s and 0.30–0.18 s, then a short fade
          const e = FLASH - c.t;
          const k = e < 0.1 ? 1 : e < 0.2 ? 0.15 : e < 0.32 ? 1 : Math.max(0, 1 - (e - 0.32) / 0.18);
          c.flashMat.emissiveIntensity = 30 * k;
          c.halo.material.opacity = k;
          c.halo.scale.set(6 + 7 * k, 4 + 4 * k, 1);
          if (k > bk) { bk = k; brightest = c; }
        }
      }
      for (const v of vehicles) {
        // front of the vehicle in road distance; side -1 drives towards larger s, side +1 towards smaller s
        const half = (v.len || 10) / 2;
        const front = v.s - v.side * half, prevFront = v.prevS - v.side * half;
        for (const c of cams) {
          if (c.side !== v.side || c.t > 0.05) continue;
          const line = c.s + v.side * TRIGGER;
          const crossed = v.side < 0 ? prevFront < line && front >= line : prevFront > line && front <= line;
          if (!crossed) continue;
          c.t = FLASH;
          if (v.isPlayer) onPlayerPass?.(c, v.kmh);
        }
      }
      if (brightest && bk > 0.05) {
        brightest.head.getWorldPosition(light.position);
        light.intensity = 420 * bk;
      } else light.intensity = 0;
    },
  };
}
