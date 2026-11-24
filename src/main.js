import * as THREE from 'three';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/700.css';
import { TouchControls, IS_TOUCH, IS_PHONE } from './touch.js';
import { Route } from './route.js';
import { ROAD, CHUNK, VIEW_CHUNKS, QUALITY, SPEED_LIMIT, TOLL_FEE, DIESEL_PRICE, TANK_LITRES, START_FUEL, BUS_KM_PER_LITRE, REAL_ROUTE_KM } from './config.js';
import { buildFacilities } from './world/facilities.js';
import { Mirrors } from './mirrors.js';
import { resolveImpulse } from './collide.js';
import { loadCustomSkins, openSkinEditor, deleteSkin } from './skins.js';
import { setMaxAnisotropy, makeCanvas, toBn } from './textures.js';
import { SkySystem, TIMES, TIME_ORDER } from './world/sky.js';
import { buildRoad, streetGlowMat } from './world/road.js';
import { buildScenery } from './world/scenery.js';
import { OPERATORS, paintSide } from './operators.js';
import { BUS_TYPES, buildBus, setBusLights, drawGauges } from './busModel.js';
import { BusPhysics } from './physics.js';
import { Traffic } from './traffic.js';
import { CameraRig, CAM_MODES } from './camera.js';
import { HUD } from './hud.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Chunks {
  constructor() { this.list = []; }
  register(obj, s, r) { this.list.push({ obj, s, r }); }
  update(s) {
    const R = VIEW_CHUNKS * CHUNK;
    for (const c of this.list) c.obj.visible = Math.abs(c.s - s) < R + c.r;
  }
}

// ---------- renderer ----------
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_PHONE, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'flex';
  document.getElementById('loading').style.display = 'none';
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setMaxAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 9000);

// settings persist between visits; phones start lighter
const SAVED = (() => { try { return JSON.parse(localStorage.getItem('mohasorok.settings') || '{}'); } catch { return {}; } })();
const settings = {
  op: OPERATORS[0], type: 'ak1j', time: 'morning',
  traffic: IS_PHONE ? 22 : 38, quality: IS_PHONE ? 'low' : IS_TOUCH ? 'medium' : 'high',
  ...SAVED, opId: SAVED.opId,
};
settings.op = OPERATORS.find((o) => o.id === settings.opId) || OPERATORS[0];
function saveSettings() {
  const { type, time, traffic, quality } = settings;
  try { localStorage.setItem('mohasorok.settings', JSON.stringify({ type, time, traffic, quality, opId: settings.op.id })); } catch { /* private mode */ }
}
let route, chunks, sky, road, scenery, hud, traffic, rig, facilities, mirrors;
const audio = new GameAudio();
const input = new Input();
const touch = new TouchControls(input);
let state = 'loading';

const player = {
  bus: null, phys: null, s: 0, d: 0, hint: -1, len: 12, wid: 2.5, v: 0,
  lights: false, indL: false, indR: false, blinkT: 0, blink: false,
  elapsed: 0, fines: 0, crashes: 0, rating: 5, crashCool: 0, complainCool: 0,
  lastPlace: null, lastBridge: null, lastS: 0, spot: null,
  side: -1, vs: 0, heading: 1, fuel: TANK_LITRES * START_FUEL, fuelCost: 0, tollCost: 0, tollWait: 0, refuelling: false,
  indArmed: false, indCancelT: 0, promptCool: 0, fuelWarn: 0,
};

function applyQuality() {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  if (sky.sun.shadow.mapSize.x !== q.shadow) {
    sky.sun.shadow.mapSize.set(q.shadow, q.shadow);
    sky.sun.shadow.map?.dispose();
    sky.sun.shadow.map = null;
  }
}

function setTime(key) {
  settings.time = key;
  sky.set(key);
  const night = TIMES[key].night;
  streetGlowMat.emissiveIntensity = night ? 4 : 0;
  player.lights = night || key === 'evening';
}

function createPlayerBus() {
  if (player.bus) scene.remove(player.bus.root);
  const bus = buildBus(settings.type, settings.op, { interior: true, texScale: 1, seed: 7 });
  scene.add(bus.root);
  // headlight beam
  const spot = new THREE.SpotLight(0xfff1d6, 0, 160, 0.5, 0.55, 1.25);
  spot.position.set(0, bus.spec.floor + 0.9, bus.spec.front + 0.2);
  spot.target.position.set(0, 0, bus.spec.front + 35);
  bus.body.add(spot, spot.target);
  player.spot = spot;
  player.bus = bus;
  player.phys = new BusPhysics(bus.spec);
  player.len = bus.spec.L;
  player.wid = bus.spec.W;
  if (mirrors) mirrors.attach(bus);
  resetPlayer(60, ROAD.laneCenters[0]);
}

function resetPlayer(s, d) {
  const { phys, bus } = player;
  const yaw = route.yawAt(s) + (d > 0 ? Math.PI : 0);
  const c = route.pointAt(s, d);
  phys.place(new THREE.Vector3(c.x - Math.sin(yaw) * bus.spec.center, 0, c.z - Math.cos(yaw) * bus.spec.center), yaw);
  player.s = s; player.d = d; player.hint = -1; player.lastS = s;
  player.side = d > 0 ? 1 : -1; player.heading = d > 0 ? -1 : 1;
  placeBusModel(0);
}

function restartTrip() {
  resetPlayer(60, ROAD.laneCenters[0]);
  Object.assign(player, { elapsed: 0, fines: 0, crashes: 0, rating: 5, lastPlace: null, lastBridge: null, indL: false, indR: false,
    fuel: TANK_LITRES * START_FUEL, fuelCost: 0, tollCost: 0, refuelling: false, fuelWarn: 0 });
  for (const g of facilities.gates) { g.holdPlayer = false; g.openT = 0; }
  traffic.init(player.s);
}

// ---------- road constraints / placement ----------
// impact = speed into the wall (m/s). Glancing touches are just scrapes; hard hits are crashes.
function wallHit(impact, msg) {
  if (impact <= 3 || player.crashCool > 0) return;
  audio.crash(impact);
  rig.shake = Math.min(1, impact / 10);
  player.crashCool = 1.5;
  player.rating = Math.max(1, player.rating - Math.min(1, impact / 12));
  if (impact > 5.5) {
    const dmg = Math.round(Math.min(30000, impact * 3.6 * 250) / 100) * 100;
    player.crashes++;
    player.fines += dmg;
    hud.toast(`${msg} Damage ৳ ${dmg.toLocaleString('en-IN')}`, 'bad');
  } else hud.toast(msg, 'bad');
}

function constrain(dt) {
  const { phys, bus } = player;
  const spec = bus.spec;
  const cx = phys.pos.x + Math.sin(phys.yaw) * spec.center, cz = phys.pos.z + Math.cos(phys.yaw) * spec.center;
  const pr = route.project(cx, cz, player.hint);
  player.hint = pr.index;
  let { s, d } = pr;
  const bridge = route.bridgeAt(s);
  const gap = route.uturnAt(s);
  const [tx, tz] = route.tangentAt(s);
  const rel = wrapAngle(phys.yaw - Math.atan2(tx, tz));
  // the bus is angled: its half-extent across / along the road
  const halfAcross = Math.abs(Math.sin(rel)) * spec.L / 2 + Math.abs(Math.cos(rel)) * spec.W / 2;
  const halfAlong = Math.abs(Math.cos(rel)) * spec.L / 2 + Math.abs(Math.sin(rel)) * spec.W / 2;
  // carriageway: free to cross only inside a U-turn opening
  if (gap) player.side = d > 0 ? 1 : -1;
  const sd = player.side;
  const inner = ROAD.median + 0.1 + halfAcross;
  const outer = bridge ? ROAD.half - 0.1 - Math.min(halfAcross, 2) : ROAD.toe + 45;
  let lo, hi;
  if (gap) { lo = -outer; hi = outer; } else if (sd < 0) { lo = -outer; hi = -inner; } else { lo = inner; hi = outer; }
  let push = 0;
  if (d > hi) push = hi - d; else if (d < lo) push = lo - d;
  if (push !== 0) {
    phys.pos.x += -tz * push;
    phys.pos.z += tx * push;
    d += push;
    // velocity into the wall (along the road's right vector, sign of the push) is removed;
    // the part along the barrier stays, minus a little scrape friction
    const vInto = -phys.v * Math.sin(rel) * (push < 0 ? 1 : -1);  // +ve = moving into the wall (right = -v·sin(rel))
    if (vInto > 0) {
      const along = phys.v * Math.cos(rel);
      phys.v = Math.sign(phys.v || 1) * Math.hypot(Math.max(0, Math.abs(along) - 1.6 * dt), vInto * 0.1);
      // the wall turns the bus parallel to it, a bit at a time
      // the impact swings the bus (mostly) parallel to the barrier straight away
      const target = Math.cos(rel) >= 0 ? 0 : Math.PI;
      phys.yaw -= wrapAngle(rel - target) * 0.8;
      phys.steer *= 0.5;
      if (vInto > 1.5) audio.crash(vInto * 0.6);
      const towardMedian = Math.abs(d) < ROAD.median + 4;
      wallHit(vInto, bridge && !towardMedian ? 'Hit the bridge railing!' : 'Scraped the median divider!');
    } else {
      // rubbing along the barrier: gentle, steady scrape (~0.8 m/s²)
      phys.v = Math.sign(phys.v) * Math.max(0, Math.abs(phys.v) - 0.8 * dt);
    }
  }
  // solid objects: toll islands & gates, fuel-station pillars, pumps and shop
  for (const o of facilities.obstacles) {
    if (o.gate && o.gate.open > 0.55) continue;
    const ds0 = s + halfAlong - o.s0, ds1 = o.s1 - (s - halfAlong);
    if (ds0 <= 0 || ds1 <= 0) continue;
    const dd0 = d + halfAcross - o.d0, dd1 = o.d1 - (d - halfAcross);
    if (dd0 <= 0 || dd1 <= 0) continue;
    const pens = [[ds0, 0, -1], [ds1, 0, 1], [dd0, 1, -1], [dd1, 1, 1]].sort((x, y) => x[0] - y[0]);
    const [amt, axis, sg] = pens[0];
    let impact;
    if (axis === 0) {
      phys.pos.x += tx * amt * sg; phys.pos.z += tz * amt * sg; s += amt * sg;
      impact = Math.abs(phys.v);
      phys.v = 0;
    } else {
      phys.pos.x += -tz * amt * sg; phys.pos.z += tx * amt * sg; d += amt * sg;
      impact = Math.abs(phys.v * Math.sin(rel));
      phys.v *= 0.8;
    }
    wallHit(impact, o.gate ? 'Hit the toll barrier! Stop before the gate and wait.' : 'Crashed into a concrete island!');
  }
  // ends of the route
  if (s < 3) { phys.pos.x += tx * (3 - s); phys.pos.z += tz * (3 - s); s = 3; }
  if (s > route.length - 3) { const m = s - (route.length - 3); phys.pos.x -= tx * m; phys.pos.z -= tz * m; s = route.length - 3; }
  phys.offroad = Math.abs(d) > ROAD.half + 0.6 && !route.stationAt(s, d) ? 1 : 0;
  player.s = s; player.d = d; player.v = phys.v;
  player.vs = phys.v * Math.cos(rel);
  player.heading = Math.cos(rel) >= 0 ? 1 : -1;
}

// toll gates: stop at the barrier, wait, pay, gate opens
function tollLogic(dt) {
  const ph = player.phys;
  player.promptCool -= dt;
  for (const g of facilities.gates) {
    if (g.side !== player.side) continue;
    const ahead = (g.s - player.s) * g.dir;
    const inLane = player.d > g.d0 - 0.6 && player.d < g.d1 + 0.6;
    if (g.holdPlayer && (ahead < -(player.len / 2 + 6) || ahead > 60)) g.holdPlayer = false;
    if (!inLane || g.holdPlayer) continue;
    if (ahead > 0 && ahead < 70 && player.promptCool <= 0) {
      hud.toast(`<span class="bn">টোল প্লাজা</span> — stop at the barrier to pay ৳${TOLL_FEE}`, '', 3000);
      player.promptCool = 12;
    }
    if (ahead > 0 && ahead < player.len / 2 + 8 && Math.abs(ph.v) < 0.8) {
      player.tollWait += dt;
      if (player.tollWait > 1.2) {
        player.tollWait = 0;
        g.holdPlayer = true;
        player.tollCost += TOLL_FEE;
        audio.tick(true);
        hud.toast(`Toll paid ৳${TOLL_FEE} — <span class="bn">ধন্যবাদ</span>, gate opening`, 'good', 3000);
      }
    } else if (Math.abs(ph.v) > 1) player.tollWait = 0;
  }
}

// fuel use and refuelling at filling stations
function fuelLogic(dt) {
  const ph = player.phys;
  const realKm = (Math.abs(ph.v) * dt) * (REAL_ROUTE_KM / route.length);
  if (!player.refuelling) {
    player.fuel = Math.max(0, player.fuel - (realKm / BUS_KM_PER_LITRE) * (0.45 + 0.9 * ph.throttle) - dt * 0.0012);
  }
  const frac = player.fuel / TANK_LITRES;
  if (frac < 0.15 && player.fuelWarn < 1) { player.fuelWarn = 1; hud.toast('⛽ Fuel low (15%) — refuel at the next filling station', 'bad', 4500); }
  if (frac < 0.05 && player.fuelWarn < 2) { player.fuelWarn = 2; hud.toast('⛽ Fuel reserve! The engine will stop soon', 'bad', 4500); }
  if (player.fuel <= 0 && player.fuelWarn < 3) { player.fuelWarn = 3; hud.toast('Out of fuel! Press R and refuel… (call the supervisor)', 'bad', 5000); player.fuel = 0; }
  const st = route.stationAt(player.s, player.d);
  const atPump = st && Math.abs(player.s - st.sc) < 15 && Math.abs(ph.v) < 0.5;
  if (atPump && !player.refuelling && player.fuel < TANK_LITRES - 1) {
    $('prompt').style.display = 'block';
    $('prompt').innerHTML = `⛽ <b>${st.en}</b> — press <kbd>F</kbd> to refuel (diesel ৳${DIESEL_PRICE}/L)`;
    if (input.hit('KeyF')) { player.refuelling = true; player.refuelStart = player.fuel; return; }
  } else if (!player.refuelling) $('prompt').style.display = 'none';
  if (player.refuelling) {
    $('prompt').style.display = 'block';
    const add = Math.min(TANK_LITRES - player.fuel, 30 * dt);
    player.fuel += add;
    player.fuelCost += add * DIESEL_PRICE;
    $('prompt').innerHTML = `⛽ Refuelling… ${Math.round(player.fuel)} / ${TANK_LITRES} L &nbsp; <b>৳${Math.round((player.fuel - player.refuelStart) * DIESEL_PRICE).toLocaleString('en-IN')}</b>`;
    if (player.fuel >= TANK_LITRES - 0.01 || !atPump || input.hit('KeyF')) {
      player.refuelling = false;
      const litres = player.fuel - player.refuelStart;
      if (litres > 1) hud.toast(`Refuelled ${Math.round(litres)} L — paid ৳${Math.round(litres * DIESEL_PRICE).toLocaleString('en-IN')}`, 'good', 3500);
      player.fuelWarn = player.fuel / TANK_LITRES > 0.2 ? 0 : player.fuelWarn;
      $('prompt').style.display = 'none';
    }
  }
}

// indicators cancel themselves after the lane change, like a real stalk
function indicatorLogic(dt) {
  if (player.indL || player.indR) {
    const dir = player.indL ? 1 : -1;
    if (input.steer * dir > 0.2) player.indArmed = true;
    if (player.indArmed && Math.abs(input.steer) < 0.05) {
      player.indCancelT += dt;
      if (player.indCancelT > 0.8) { player.indL = player.indR = false; player.indArmed = false; player.indCancelT = 0; }
    } else player.indCancelT = 0;
  } else { player.indArmed = false; player.indCancelT = 0; }
  const st = player.bus.indicatorStalk;
  if (st) st.rotation.z += ((player.indL ? -0.35 : player.indR ? 0.35 : 0) - st.rotation.z) * Math.min(1, dt * 12);
}

function placeBusModel(dt) {
  const { phys, bus } = player;
  const spec = bus.spec;
  const sR = player.s - spec.center, sF = sR + spec.wheelbase;
  const hR = route.heightAt(sR, player.d), hF = route.heightAt(sF, player.d);
  const hL = route.heightAt(player.s, player.d - spec.W / 2), hRt = route.heightAt(player.s, player.d + spec.W / 2);
  const pitchT = -Math.atan2(hF - hR, spec.wheelbase);
  const rollT = Math.atan2(hL - hRt, spec.W);
  bus.root.position.set(phys.pos.x, hR, phys.pos.z);
  bus.root.rotation.set(pitchT, phys.yaw, rollT, 'YXZ');
  bus.pivot.rotation.set(phys.pitch, 0, phys.roll);
  for (const w of bus.wheels.front) w.rotation.y = phys.steer;
  for (const w of bus.wheels.all) w.rotation.x = phys.wheelSpin;
  if (bus.steeringWheel) bus.steeringWheel.rotation.z = phys.steer * 18;
  if (bus.fan) bus.fan.rotation.z += 0.9;
  if (bus.gearLever) {
    // H-pattern: 1/2 left, 3/4 middle, 5/6 right, R far left-forward
    const G = { '-1': [-0.3, 0.35], 0: [0, 0], 1: [-0.28, 0.2], 2: [0.28, 0.2], 3: [-0.28, 0], 4: [0.28, 0], 5: [-0.28, -0.2], 6: [0.28, -0.2] };
    const [gx, gz] = phys.shiftTimer > 0 ? [0, 0] : (G[phys.gear] || [0, 0]);
    const L = bus.gearLever.rotation;
    L.x += (gx - L.x) * Math.min(1, dt * 14);
    L.z += (gz - L.z) * Math.min(1, dt * 14);
  }
  void dt;
}

// ---------- events ----------
function events(dt) {
  const s = player.s;
  const kmh = Math.abs(player.phys.v) * 3.6;
  const place = route.placeAt(s);
  if (place && place !== player.lastPlace) {
    hud.toast(`<span class="bn">স্বাগতম — ${place.bn}</span><br><small>Welcome to ${place.en}</small>`, 'good', 3600);
    if (place.rest) setTimeout(() => hud.toast('Highway restaurants ahead — buses stop here for a 20 minute break 🍛', '', 4200), 1200);
  }
  player.lastPlace = place;
  const br = route.bridgeAt(s);
  if (br && br !== player.lastBridge) hud.toast(`<span class="bn">${br.bn} নদী</span> · ${br.en} River bridge`, '', 3200);
  player.lastBridge = br;
  // speed cameras at town entries
  for (const p of route.places) {
    if (!p.town) continue;
    const cs = p.s - p.town / 2;
    if (player.side < 0 && player.lastS < cs && s >= cs && kmh > SPEED_LIMIT + 5) {
      const fine = kmh > SPEED_LIMIT + 25 ? 2000 : 1000;
      player.fines += fine;
      player.rating = Math.max(1, player.rating - 0.3);
      hud.toast(`📸 Speed camera at ${p.en.split(' (')[0]}: ${Math.round(kmh)} km/h in an ${SPEED_LIMIT} zone<br><b>Fine ৳ ${fine.toLocaleString('en-IN')}</b>`, 'bad', 4200);
    }
  }
  // passenger comfort
  player.complainCool -= dt;
  const ph = player.phys;
  if (player.complainCool <= 0 && (Math.abs(ph.latAcc) > 3.4 || ph.lonAcc < -5.5)) {
    const lines = ['আস্তে চালান! — Drive slowly!', 'ড্রাইভার ভাই, সাবধানে! — Careful, driver bhai!', 'পেটের ভাত উল্টে যাবে! — My lunch is coming back up!'];
    hud.toast(`<span class="bn">${lines[Math.floor(Math.random() * lines.length)]}</span>`, 'bad', 2600);
    player.rating = Math.max(1, player.rating - 0.1);
    player.complainCool = 7;
  }
  player.lastS = s;
  const toCtg = player.side < 0 && s >= route.length - 45;
  const toDhaka = player.side > 0 && s <= 45;
  if (toCtg || toDhaka) {
    state = 'arrived';
    hud.arrival(player, settings.op.en, toCtg ? 'Chattogram' : 'Dhaka');
    audio.horn(false);
    $('prompt').style.display = 'none';
  }
}

const AI_MASS = { bus: 15000, truck: 14000, car: 1300, micro: 2000, cng: 450 };
const KIND_NAME = { bus: 'bus', truck: 'truck', car: 'car', micro: 'microbus', cng: 'CNG auto-rickshaw' };

// player bounding box (world x/z) used by the traffic collision test
function updatePlayerBox() {
  const ph = player.phys, sp = player.bus.spec;
  player.box = {
    x: ph.pos.x + Math.sin(ph.yaw) * sp.center, z: ph.pos.z + Math.cos(ph.yaw) * sp.center,
    yaw: ph.yaw, hw: sp.W / 2 - 0.04, hl: sp.L / 2 - 0.05,
  };
}

// momentum-based response: heavy trucks barely move, a CNG gets shoved; sideswipes keep most speed
function handleCrashes(crashes) {
  const ph = player.phys, sp = player.bus.spec;
  for (const c of crashes) {
    const v = c.v, n = c.n;
    const mA = sp.mass, mB = AI_MASS[v.K.kind] || 2000;
    const wa = (1 / mA) / (1 / mA + 1 / mB), wb = 1 - wa;
    // separate the boxes
    ph.pos.x += n.nx * n.depth * wa; ph.pos.z += n.nz * n.depth * wa;
    const [tx, tz] = route.tangentAt(v.s);
    v.s -= (n.nx * tx + n.nz * tz) * n.depth * wb;
    v.d -= (n.nx * -tz + n.nz * tx) * n.depth * wb;
    // exchange momentum along the contact normal
    const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw);
    const va = { x: fx * ph.v, z: fz * ph.v };
    const vb = { x: tx * v.v * v.dir, z: tz * v.v * v.dir };
    const closing = resolveImpulse(va, mA, vb, mB, n, 0.12);
    if (closing <= 0) continue;
    // tyres keep the bus pointing along its heading; the sideways part becomes a small yaw kick
    const newV = va.x * fx + va.z * fz;
    const lat = va.x * -fz + va.z * fx;                       // right-hand component
    const arm = THREE.MathUtils.clamp((c.box.x - player.box.x) * fx + (c.box.z - player.box.z) * fz, -sp.L / 2, sp.L / 2);
    ph.yaw += THREE.MathUtils.clamp(-(12 * arm * lat) / (sp.L * sp.L) * 0.35, -0.06, 0.06);
    ph.v = newV;
    v.v = Math.max(0, (vb.x * tx + vb.z * tz) * v.dir);
    // how bad was it?
    if (player.crashCool > 0) continue;
    const kmh = closing * 3.6;
    if (kmh < 8) {
      audio.crash(1);
      player.crashCool = 0.8;
      hud.toast(`Light scrape with a ${KIND_NAME[v.K.kind]}`, '', 1800);
    } else {
      const dmg = Math.round(Math.min(25000, 300 * kmh) / 100) * 100;
      player.crashes++;
      player.crashCool = 1.5;
      player.rating = Math.max(1, player.rating - Math.min(1.2, kmh / 40));
      player.fines += dmg;
      audio.crash(closing);
      rig.shake = Math.min(1, closing / 8);
      hud.toast(`Collision with a ${KIND_NAME[v.K.kind]} at ${Math.round(kmh)} km/h! Damage ৳ ${dmg.toLocaleString('en-IN')}`, 'bad');
    }
  }
}

// ---------- keys ----------
function handleKeys() {
  if (input.hit('KeyM')) { audio.setMuted(!audio.muted); }
  if (state === 'drive' || state === 'paused') {
    if (input.hit('KeyP') || input.hit('Escape')) togglePause();
  }
  if (state !== 'drive') return;
  if (input.hit('KeyC')) rig.next();
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((k, i) => { if (input.hit(k)) rig.setMode(CAM_MODES[[1, 0, 2, 3][i]]); });
  if (input.hit('KeyL')) player.lights = !player.lights;
  if (input.hit('KeyV')) {
    const inCab = rig.mode === 'cabin';
    if (inCab) mirrors.hudCabin = !mirrors.hudCabin; else mirrors.hudOn = !mirrors.hudOn;
    hud.toast(`Screen mirrors ${(inCab ? mirrors.hudCabin : mirrors.hudOn) ? 'ON' : 'OFF'}${inCab ? ' in the cab' : ''}`);
  }
  if (input.hit('KeyQ')) { player.indL = !player.indL; player.indR = false; }
  if (input.hit('KeyE')) { player.indR = !player.indR; player.indL = false; }
  if (input.hit('KeyT')) {
    const k = TIME_ORDER[(TIME_ORDER.indexOf(settings.time) + 1) % TIME_ORDER.length];
    setTime(k);
    hud.toast(`Time: ${TIMES[k].label}`);
  }
  if (input.hit('KeyX')) {
    const ph = player.phys;
    if (ph.cruise == null && ph.v > 8) { ph.cruise = ph.v; hud.toast(`Cruise control ${Math.round(ph.v * 3.6)} km/h`); }
    else ph.cruise = null;
  }
  if (input.hit('KeyR')) {
    resetPlayer(player.s, player.side > 0 ? -ROAD.laneCenters[0] : ROAD.laneCenters[0]);
    if (player.fuel <= 0) { player.fuel = 40; player.fuelCost += 40 * DIESEL_PRICE * 1.5; hud.toast('Supervisor brought 40 L of diesel in a jerrycan (৳ extra)'); }
    hud.toast('Bus reset to the road');
  }
  if (input.hit('KeyH')) traffic.nudge(player);
  if (input.hit('F1')) { const h = $('help'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; }
}

function togglePause() {
  if (state === 'drive') { state = 'paused'; $('pause').style.display = 'flex'; audio.horn(false); audio.ctx?.suspend(); }
  else if (state === 'paused') { state = 'drive'; $('pause').style.display = 'none'; audio.ctx?.resume(); }
}

// ---------- menu ----------
function buildMenu() {
  renderOps();
  const types = $('types');
  Object.entries(BUS_TYPES).forEach(([k, t], i) => {
    const b = document.createElement('button');
    b.className = k === settings.type ? 'sel' : '';
    b.innerHTML = `${t.name}<small>${t.desc}</small>`;
    b.onclick = () => { selectSeg(types, b); settings.type = k; createPlayerBus(); saveSettings(); };
    types.appendChild(b);
  });
  const times = $('times');
  TIME_ORDER.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = k === settings.time ? 'sel' : '';
    b.innerHTML = `${TIMES[k].label}<small>${TIMES[k].clock}</small>`;
    b.onclick = () => { selectSeg(times, b); setTime(k); saveSettings(); };
    times.appendChild(b);
  });
  for (const id of ['traffic', 'quality']) {
    const el = $(id);
    el.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('sel', String(id === 'traffic' ? settings.traffic : settings.quality) === b.dataset.v);
      b.onclick = () => {
        selectSeg(el, b);
        if (id === 'traffic') settings.traffic = +b.dataset.v;
        else { settings.quality = b.dataset.v; applyQuality(); }
        saveSettings();
      };
    });
  }
  $('start').onclick = startDrive;
  $('about-open').onclick = () => ($('about').style.display = 'flex');
  $('about-close').onclick = () => ($('about').style.display = 'none');
  $('resume').onclick = togglePause;
  $('to-menu').onclick = () => { togglePause(); toMenu(); };
  $('again').onclick = () => { $('arrival').style.display = 'none'; restartTrip(); state = 'drive'; };
  $('arr-menu').onclick = () => { $('arrival').style.display = 'none'; toMenu(); };
}
function renderOps() {
  const ops = $('ops');
  ops.innerHTML = '';
  for (const op of OPERATORS) {
    const el = document.createElement('div');
    el.className = 'op' + (op === settings.op ? ' sel' : '');
    const [c, ctx] = makeCanvas(480, 118);
    if (op.custom) {
      const r = op.custom.regions.left.on ? op.custom.regions.left : op.custom.regions.right;
      ctx.drawImage(op.custom.img, r.x, r.y, r.w, r.h, 0, 0, 480, 118);
    } else paintSide(ctx, 480, 118, BUS_TYPES.coach, op, false);
    el.appendChild(c);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.innerHTML = op.custom
      ? `<span>${op.en}</span><span><span class="del" data-a="edit">edit</span><span class="del" data-a="del">delete</span></span>`
      : `<span>${op.en}</span><span class="bn">${op.bn}</span>`;
    el.appendChild(nm);
    el.onclick = async (e) => {
      const a = e.target.dataset?.a;
      if (a === 'del') {
        if (!confirm(`Delete skin "${op.bn}"?`)) return;
        await deleteSkin(op.custom.rec.id);
        OPERATORS.splice(OPERATORS.indexOf(op), 1);
        if (settings.op === op) { settings.op = OPERATORS[0]; createPlayerBus(); }
        renderOps();
        return;
      }
      if (a === 'edit') {
        openSkinEditor((nop) => { OPERATORS[OPERATORS.indexOf(op)] = nop; settings.op = nop; createPlayerBus(); renderOps(); }, op.custom.rec);
        return;
      }
      settings.op = op;
      createPlayerBus();
      renderOps();
      saveSettings();
    };
    ops.appendChild(el);
  }
  const add = document.createElement('div');
  add.className = 'op add';
  add.innerHTML = '<b>＋</b>Import skin<br><small>your own image (BUSSID / ETS2 template or bus photo)</small>';
  add.onclick = () => openSkinEditor((nop) => { OPERATORS.push(nop); settings.op = nop; createPlayerBus(); renderOps(); });
  ops.appendChild(add);
}

function selectSeg(parent, btn) { parent.querySelectorAll('button').forEach((x) => x.classList.remove('sel')); btn.classList.add('sel'); }

function toMenu() {
  state = 'menu';
  $('menu').style.display = 'block';
  hud.show(false);
  audio.horn(false);
  restartTrip();
  rig.setMode('chase');
}

function startDrive() {
  audio.init();
  audio.resume();
  saveSettings();
  if (IS_TOUCH) {
    // full screen + landscape on phones (ignored where the browser doesn't allow it)
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  applyQuality();
  if (traffic.list.length !== settings.traffic || traffic.opCount !== OPERATORS.length) {
    for (const v of traffic.list) scene.remove(v.wrap);
    traffic = new Traffic(route, scene, settings.traffic, settings.op.id, audio, facilities.gates);
    traffic.opCount = OPERATORS.length;
  }
  restartTrip();
  camera.clearViewOffset();
  rig.setMode('chase');
  $('menu').style.display = 'none';
  hud.show(true);
  state = 'drive';
  perf.t = 0; perf.n = 0;
  hud.toast(`<span class="bn">${settings.op.bn}</span> · ${BUS_TYPES[settings.type].name}<br><small>Sayedabad → Chattogram via N1. Drive on the LEFT.${IS_TOUCH ? ' Turn the wheel, hold GAS / BRAKE.' : ' Mirrors: V · Refuel: F'}</small>`, 'good', 5000);
}

// ---------- automatic graphics reduction on slow devices ----------
const perf = { t: 0, n: 0, steps: 0 };
function autoPerf(dt) {
  perf.t += dt; perf.n++;
  if (perf.t < 5) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  if (fps < 32 && perf.steps < 3) {
    perf.steps++;
    const pr = Math.max(0.6, renderer.getPixelRatio() - 0.25);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    if (perf.steps === 2) { mirrors.hudOn = false; sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null; }
    hud.toast(`Graphics lowered for smoother driving (${Math.round(fps)} fps)`, '', 2500);
  }
}

// ---------- main loop ----------
let last = performance.now();
let hudT = 0, menuT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);
  touch.update(dt);
  touch.show(state === 'drive');
  handleKeys();
  if (state === 'drive') autoPerf(dt);
  const night = TIMES[settings.time].night;
  const ph = player.phys;

  if (state === 'drive') {
    player.elapsed += dt;
    player.crashCool -= dt;
    // two physics substeps for stability
    for (let k = 0; k < 2; k++) {
      ph.update(dt / 2, { throttle: player.fuel > 0 && !player.refuelling ? input.throttle : 0, brake: input.brake, steer: input.steer, handbrake: input.handbrake || player.refuelling });
      constrain(dt / 2);
    }
    placeBusModel(dt);
    tollLogic(dt);
    fuelLogic(dt);
    indicatorLogic(dt);
    facilities.update(dt);
    updatePlayerBox();
    handleCrashes(traffic.update(dt, player, night));
    audio.horn(input.horn);
    player.blinkT += dt;
    const blink = (player.blinkT % 0.8) < 0.4;
    if (blink !== player.blink && (player.indL || player.indR)) audio.tick(blink);
    player.blink = blink;
    setBusLights(player.bus, { head: player.lights, brake: ph.brake > 0.1 || input.handbrake, indL: player.indL && blink, indR: player.indR && blink, reverse: ph.gear < 0, night });
    player.spot.intensity = player.lights ? 260 : 0;
    audio.update({ rpm: ph.rpm, throttle: ph.throttle, speed: Math.abs(ph.v), cabin: rig.mode === 'cabin', braking: ph.brake > 0.1 });
    events(dt);
    rig.update(dt, player.bus, ph, input, player.s);
    player.bus.cabinLed.emissiveIntensity = night ? 1.2 : 0.3;
    player.bus.dashLight.intensity = night && rig.mode === 'cabin' ? 0.8 : 0;
    $('dashbox').style.display = rig.mode === 'cabin' ? 'none' : 'block';
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 1 / 15;
      const kmh = Math.abs(ph.v) * 3.6;
      const t0 = TIMES[settings.time].clock.split(':').map(Number);
      const mins = t0[0] * 60 + t0[1] + player.elapsed / 5;
      const clock = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;
      const st = {
        s: player.s, x: ph.pos.x, z: ph.pos.z, yaw: ph.yaw, kmh, rpm: ph.rpm, gear: ph.gearLabel(),
        elapsed: player.elapsed, fines: player.fines, crashes: player.crashes, rating: player.rating,
        place: route.placeAt(player.s), clock, camLabel: rig.label(), indL: player.indL, indR: player.indR, blink,
        lights: player.lights, cruise: ph.cruise != null, cruiseKmh: (ph.cruise || 0) * 3.6, traffic: traffic.list,
        side: player.side, heading: player.heading, fuel: player.fuel, tank: TANK_LITRES, costs: player.fuelCost + player.tollCost, mirrorsHud: mirrors.hudOn,
      };
      hud.update(st);
      if (rig.mode === 'cabin') drawGauges(player.bus, { kmh, rpm: ph.rpm, gear: st.gear, cruise: st.cruise, lights: player.lights, indL: player.indL && blink, indR: player.indR && blink, limit: SPEED_LIMIT, odo: route.realKm(player.s), fuel: player.fuel / TANK_LITRES, temp: 0.45 + ph.throttle * 0.1, clock });
    }
  } else if (state === 'menu') {
    // showroom orbit with the bus on the right half of the screen
    menuT += dt;
    traffic.update(dt, player, night);
    setBusLights(player.bus, { head: player.lights, night });
    player.spot.intensity = player.lights ? 260 : 0;
    const c = player.bus.root.position.clone().add(new THREE.Vector3(Math.sin(ph.yaw) * player.bus.spec.center, 0, Math.cos(ph.yaw) * player.bus.spec.center));
    const a = ph.yaw + 2.4 + Math.sin(menuT * 0.12) * 0.9;
    camera.position.set(c.x + Math.sin(a) * 17, c.y + 3.2, c.z + Math.cos(a) * 17);
    camera.lookAt(c.x, c.y + 1.6, c.z);
    camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
  } else if (state === 'arrived' || state === 'paused') {
    if (state === 'arrived') rig.update(dt, player.bus, ph, input, player.s);
  }

  const focus = player.bus.root.position;
  chunks.update(player.s);
  sky.update(dt, focus, camera);
  scenery.update(dt, focus);
  const driving = state === 'drive' || state === 'arrived';
  const cabin = rig.mode === 'cabin';
  if (driving) {
    player.bus.root.updateMatrixWorld(true);
    const eye = player.bus.driver.clone().applyMatrix4(player.bus.body.matrixWorld);
    const hudMir = cabin ? mirrors.hudCabin : mirrors.hudOn;
    mirrors.update(eye, cabin, hudMir);
  }
  renderer.render(scene, camera);
  if (driving && (cabin ? mirrors.hudCabin : mirrors.hudOn)) mirrors.renderHUD();
  input.endFrame();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  mirrors?.layoutHUD(innerWidth, innerHeight);
});

async function boot() {
  const msg = (t) => { $('load-msg').textContent = t; return new Promise((r) => setTimeout(r, 30)); };
  await msg('Loading Bangla font…');
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 40px "Noto Sans Bengali"', 'বাংলা'), document.fonts.load('700 40px "Noto Sans Bengali"', 'বাংলা')]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to system fonts */ }
  if (IS_PHONE) mirrors_defaultOff = true;
  await msg('Loading your skins…');
  OPERATORS.push(...(await loadCustomSkins()));
  await msg('Tracing N1 from real coordinates…');
  route = new Route();
  chunks = new Chunks();
  applyQualityBase();
  await msg('Lighting the sky…');
  sky = new SkySystem(renderer, scene, QUALITY[settings.quality] || QUALITY.high);
  await msg('Paving 4 lanes, bridges over Meghna & Gumti…');
  road = buildRoad(route, scene, chunks);
  await msg('Planting paddy, palms and villages…');
  facilities = buildFacilities(route, scene, chunks);
  scenery = buildScenery(route, scene, chunks, { treeDensity: (QUALITY[settings.quality] || QUALITY.high).treeDensity }, road.water);
  mirrors = new Mirrors(renderer, scene);
  if (mirrors_defaultOff) { mirrors.hudOn = false; mirrors.lowRes = true; }
  hud = new HUD(route, road.water);
  rig = new CameraRig(camera, route);
  await msg('Painting the buses…');
  createPlayerBus();
  traffic = new Traffic(route, scene, settings.traffic, settings.op.id, audio, facilities.gates);
  traffic.opCount = OPERATORS.length;
  traffic.init(player.s);
  mirrors.layoutHUD(innerWidth, innerHeight);
  setTime(settings.time);
  buildMenu();
  // warm up: compile shaders before showing the menu
  renderer.compile(scene, camera);
  $('loading').style.display = 'none';
  $('menu').style.display = 'block';
  state = 'menu';
  requestAnimationFrame(frame);
  console.info(`[mohasorok] route ${(route.length / 1000).toFixed(1)} km game, ${route.places.length} places, ${route.bridges.length} bridges`);
  window.__game = { route, player, get traffic() { return traffic; }, scene, renderer, settings, toBn, setTime,
    teleport(s, d = ROAD.laneCenters[0]) { resetPlayer(s, d); traffic.init(s); }, get facilities() { return facilities; }, get mirrors() { return mirrors; } };
}
let mirrors_defaultOff = false;
function applyQualityBase() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, (QUALITY[settings.quality] || QUALITY.high).pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
}

boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = 'Error: ' + e.message;
});
