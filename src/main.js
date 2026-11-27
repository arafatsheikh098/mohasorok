import { SAVE } from './saves.js';
import * as THREE from 'three';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/700.css';
import { TouchControls, IS_TOUCH, IS_PHONE } from './touch.js';
import { Route } from './route.js';
import { ROAD, CHUNK, VIEW_CHUNKS, QUALITY, SPEED_LIMIT, TOLL_FEE, DIESEL_PRICE, TANK_LITRES, START_FUEL, BUS_KM_PER_LITRE, REAL_ROUTE_KM } from './config.js';
import { initFacilities } from './world/facilities.js';
import { Network } from './net.js';
import { Stream, disposeTree } from './world/stream.js';
import { NetRoads } from './world/netroads.js';
import { icMovePath } from './world/interchange.js';
import { initJunctions, junctionChunk } from './world/junction.js';
import { ferryChunk } from './world/ferry.js';
import { buildAICams } from './world/aicams.js';
import { Mirrors } from './mirrors.js';
import { resolveImpulse, obbOverlap } from './collide.js';
import { loadCustomSkins, openSkinEditor, deleteSkin } from './skins.js';
import { setMaxAnisotropy, makeCanvas, toBn } from './textures.js';
import { SkySystem, TIMES, TIME_ORDER } from './world/sky.js';
import { REST_MINUTES } from './config.js';
const presetMinutes = (k) => { const [h, m] = TIMES[k].clock.split(':').map(Number); return h * 60 + m; };
import { initRoad, roadChunk, streetGlowMat } from './world/road.js';
import { initScenery } from './world/scenery.js';
import { OPERATORS, paintSide } from './operators.js';
import { BUS_TYPES, buildBus, setBusLights, drawGauges } from './busModel.js';
import { BusPhysics } from './physics.js';
import { Traffic } from './traffic.js';
import { CameraRig, CAM_MODES } from './camera.js';
import { HUD } from './hud.js';
import { GameAudio } from './audio.js';
import { voice } from './voice.js';
import { MusicPlayer, fmtSize, parseYouTube } from './music.js';
import { Input } from './input.js';
import { Passengers } from './passengers.js';
import { Weather } from './world/weather.js';
import { Police } from './world/police.js';
import { career, BUS_PRICES, REAL_PRICE, taka, fmtDuration, feedbackURL } from './career.js';
import { initTripMenu } from './tripmenu.js';
import { BigMap } from './bigmap.js';
import { SERVICES } from './data/services.js';
import { setBusRouteBoard } from './busModel.js';
import { Race } from './race.js';
import { initRaceUI, fmtRace } from './raceui.js';

const $ = (id) => document.getElementById(id);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Chunks {
  constructor() { this.list = []; }
  // tag: the stream block the object belongs to (dropped with it), or undefined for the whole trip
  register(obj, s, r, tag) { this.list.push({ obj, s, r, tag }); }
  drop(tag) { this.list = this.list.filter((c) => c.tag !== tag); }
  retag(from, to) { for (const c of this.list) if (c.tag === from) c.tag = to; }
  clear() { this.list = []; }
  update(s) {
    const R = VIEW_CHUNKS * CHUNK;
    for (const c of this.list) c.obj.visible = Math.abs(c.s - s) < R + c.r;
  }
}

// ---------- renderer ----------
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'flex';
  document.getElementById('loading').style.display = 'none';
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;   // keeps liveries bright and saturated (ACES greyed them)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setMaxAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 9000);

// settings persist between visits; phones start lighter
const SAVED = (() => { try { return JSON.parse(localStorage.getItem(SAVE('settings')) || '{}'); } catch { return {}; } })();
// v2: phones used to be saved as 'low' automatically; forget that unless the player picked it
if (SAVED.v !== 2 && !SAVED.qualityManual) delete SAVED.quality;
const settings = {
  op: OPERATORS[0], type: 'ak1j', time: 'morning', dir: 'ctg',
  traffic: IS_PHONE ? 26 : 38, quality: IS_TOUCH ? 'medium' : 'high', qualityManual: false,
  ...SAVED, opId: SAVED.opId,
};
settings.op = OPERATORS.find((o) => o.id === settings.opId) || OPERATORS[0];
// the trip: any zilla to any zilla (older saves only knew Dhaka ⇄ Chattogram)
if (!settings.trip?.from || !settings.trip?.to) settings.trip = settings.dir === 'dhk' ? { from: 'Chattogram', to: 'Dhaka' } : { from: 'Dhaka', to: 'Chattogram' };
if (settings.trip.from === '@here' && !settings.at?.road) settings.trip.from = settings.at?.zilla || 'Dhaka';
settings.seats = settings.seats || {};
settings.type = career.ownedType(settings.type);     // career: only buses the company owns can be driven
function saveSettings() {
  const { type, time, traffic, quality, qualityManual, trip, mode, seats, at, speedCode } = settings;
  try { localStorage.setItem(SAVE('settings'), JSON.stringify({ v: 2, type, time, traffic, quality, qualityManual, trip, mode, seats, at, speedCode, opId: settings.op.id })); } catch { /* private mode */ }
}
let route, chunks, sky, road, scenery, hud, traffic, rig, facilities, mirrors, aicams;   // eslint-disable-line prefer-const
let net, stream, corridorRoot, tripMenu, netRoads;   // the road network, the world streamer, and the per-trip objects (src/world/stream.js)
let passengers;   // bus counters, boarding / alighting (src/passengers.js)
let weather;      // rain, fog, wet road, wipers (src/world/weather.js)
let police;       // highway police checkpoints + jam warnings (src/world/police.js)
const audio = new GameAudio();
const music = new MusicPlayer();
const input = new Input();
const touch = new TouchControls(input);
let state = 'loading';

// racing with friends (src/race.js): the room, and whether this drive is the race (not a solo practice trip)
const race = new Race(scene);
let raceUI = null, raceRun = false;
const raceMe = () => ({ name: localStorage.getItem(SAVE('name')) || 'Driver', op: settings.op.id, opName: settings.op.en, type: settings.type });
const player = {
  bus: null, phys: null, s: 0, d: 0, hint: -1, len: 12, wid: 2.5, v: 0,
  lights: false, indL: false, indR: false, blinkT: 0, blink: false,
  elapsed: 0, fines: 0, crashes: 0, rating: 5, crashCool: 0, complainCool: 0,
  lastPlace: null, lastBridge: null, lastS: 0, spot: null, fogSpot: null, high: false, fog: false,
  side: -1, vs: 0, heading: 1, fuel: TANK_LITRES * START_FUEL, fuelCost: 0, tollCost: 0, tollWait: 0, refuelling: false,
  indArmed: false, indCancelT: 0, promptCool: 0, fuelWarn: 0,
};

// graphics level while driving (I key, the 🖥 button, the GFX button on phones): High → Medium → Low → High.
// Picking one is the player's choice: the game stops lowering it on its own.
const GFX_NAME = { high: 'High', medium: 'Medium', low: 'Low' };
function cycleGraphics() {
  const order = ['high', 'medium', 'low'];
  settings.quality = order[(order.indexOf(settings.quality) + 1) % order.length];
  settings.qualityManual = true;
  perf.steps = 0; perf.slow = 0;
  applyQuality();
  if (perf.mirrorsOff) { mirrors.hudOn = true; perf.mirrorsOff = false; }   // (the automatic drop had turned the screen mirrors off)
  saveSettings();
  gfxLabel();
  // (the menu's Graphics buttons show the same choice)
  document.querySelectorAll('#quality button').forEach((b) => b.classList.toggle('sel', b.dataset.v === settings.quality));
  hud?.toast(`🖥 Graphics: <b>${GFX_NAME[settings.quality]}</b> (I) — kept as you set it`, '', 2200);
}
function gfxLabel() { const b = document.getElementById('gfx-btn'); if (b) b.textContent = `🖥 ${GFX_NAME[settings.quality] || 'High'}`; }

function applyQuality() {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? q.touchPR : q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  if (sky.sun.shadow.mapSize.x !== q.shadow) {
    sky.sun.shadow.mapSize.set(q.shadow, q.shadow);
    sky.sun.shadow.map?.dispose();
    sky.sun.shadow.map = null;
  }
}

// starting time (menu, T key); after that the clock runs while you drive and the sky follows it
function setTime(key) {
  settings.time = key;
  player.clockMin = presetMinutes(key);
  sky.set(key);
  applyNight(true);
}
// street lights and headlights follow dusk and dawn
function applyNight(force = false) {
  const night = sky.night, dim = sky.hour > 17.4 || sky.hour < 6.4;
  if (!force && night === player.wasNight && dim === player.wasDim) return;
  streetGlowMat.emissiveIntensity = night ? 4 : 0;
  if (force || dim !== player.wasDim) {
    player.lights = dim;
    if (!force && state === 'drive') hud.toast(dim ? (sky.hour > 12 ? '🌇 Getting dark — headlights on' : '🌌 Before sunrise — headlights on') : '🌅 Morning — headlights off', '', 2500);
  }
  player.wasNight = night; player.wasDim = dim;
}
// headlight beams: dipped, or the upper dipper (brighter, longer, aimed further up the road); fog lamps low and wide
function beams() {
  const { spot, fogSpot } = player, hi = player.lights && player.high;
  spot.intensity = player.lights ? (hi ? 520 : 260) : 0;
  spot.distance = hi ? 320 : 160;
  spot.angle = hi ? 0.42 : 0.5;
  spot.target.position.z = player.bus.spec.front + (hi ? 90 : 35);
  spot.target.position.y = hi ? 1.2 : 0;
  if (fogSpot) fogSpot.intensity = player.fog ? 140 : 0;
}
const clockText = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.floor(mins % 60)).padStart(2, '0')}`;

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
  // fog lamps: a low, wide, warm beam that lights the road just ahead and the verges (cuts under fog)
  const fogSpot = new THREE.SpotLight(0xffd27a, 0, 45, 1.0, 0.7, 1.4);
  fogSpot.position.set(0, bus.spec.floor + 0.2, bus.spec.front + 0.2);
  fogSpot.target.position.set(0, 0, bus.spec.front + 14);
  bus.body.add(fogSpot, fogSpot.target);
  player.fogSpot = fogSpot;
  player.bus = bus;
  player.phys = new BusPhysics(bus.spec);
  // the Sakura Non-AC with the speed code: a tuned engine and the limiter at 160 km/h (the normal limit is 140)
  if (speedUnlocked()) { player.phys.governor = 160 / 3.6; player.phys.torqueScale *= 1.5; }
  player.len = bus.spec.L;
  player.wid = bus.spec.W;
  if (mirrors) mirrors.attach(bus);
  playerBoard();
  resetPlayer(...startPoint());
  if (race.inRoom) race.hello(raceMe());       // friends see the new bus / livery
}

// ---------- speed code: only for the Sakura AK1J Non-AC. Any code can be typed; only the right one works ----------
const SPEED_CODE = '0987';
function speedCodeApplies() { return settings.op?.id === 'sakura' && settings.type === 'local'; }
function speedUnlocked() { return speedCodeApplies() && settings.speedCode === SPEED_CODE; }
function renderSpeedCode() {
  const row = $('speed-code'), inp = $('speed-code-in'), msg = $('speed-code-msg');
  if (!row) return;
  row.style.display = speedCodeApplies() ? '' : 'none';
  if (document.activeElement !== inp) inp.value = settings.speedCode || '';
  const code = (settings.speedCode || '').trim();
  msg.className = speedUnlocked() ? 'ok' : '';
  msg.textContent = speedUnlocked() ? '✓ unlocked — top speed 160 km/h' : code ? 'no effect — top speed stays normal' : 'normal top speed';
}
function initSpeedCode() {
  const inp = $('speed-code-in');
  if (!inp) return;
  // typing a code must not drive the game (M, Z, … are game keys)
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
  inp.addEventListener('keyup', (e) => e.stopPropagation());
  inp.addEventListener('input', () => {
    const was = speedUnlocked();
    settings.speedCode = inp.value.trim();
    saveSettings();
    if (speedUnlocked() !== was) createPlayerBus();
    renderSpeedCode();
  });
  renderSpeedCode();
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

// trip start: parked in a bay of the origin terminal, nose towards the exit gate
// (the trip corridor always runs from the origin at s = 0 to the destination)
function startPoint() {
  const t = route.terminals.find((x) => x.end === 0);
  if (!t) return [20, ROAD.laneCenters[0]];
  // a race: the starting grid, two buses side by side in the first row of the yard, one row behind another
  if (raceRun) {
    const k = race.slot(), Ly = Math.abs(t.s1 - t.s0);
    return [t.closed + t.dir * Math.min(22 + Math.floor(k / 2) * 15, Ly - 30), t.side * (ROAD.half + (k % 2 ? 14.5 : 8.5))];
  }
  return [t.bay.s, t.bay.d];
}
// the terminal the trip ends at
function destTerminal() {
  if (settings.mode === 'free') return null;
  const goals = net.zillas.get(settings.trip.to)?.terminals || [];
  return route.terminals.find((x) => x.end === 1 && goals.includes(x.node));
}

// the roads of the chosen trip
function tripPath() {
  // the bus was left out on the road: the trip starts right there
  if (settings.trip.from === '@here') {
    const p = settings.at?.road && net.pathFromRoad(settings.at, settings.mode === 'free' ? null : settings.trip.to);
    if (p) return p;
    settings.trip.from = settings.at?.near || 'Dhaka';
  }
  if (settings.mode === 'free') {
    // free drive: out of the start zilla's terminal, then straight on
    const z = net.zillas.get(settings.trip.from) || net.zillas.get('Dhaka');
    const t = z.terminals[0], link = net.adj.get(t)[0];
    const first = { road: link.road, rev: link.rev };
    return [first, ...net.straightOn(link.to, first, 160)];
  }
  return net.trip(settings.trip.from, settings.trip.to) || net.trip('Dhaka', 'Chattogram');
}
// the key the career keeps the fastest time under ('ctg' / 'dhk' for the original N1 trips)
function tripKey() {
  const { to } = settings.trip, from = settings.trip.from === '@here' ? settings.at?.near || 'road' : settings.trip.from;
  return from === 'Dhaka' && to === 'Chattogram' ? 'ctg' : from === 'Chattogram' && to === 'Dhaka' ? 'dhk' : `${from}>${to}`;
}

// (Re)build everything that belongs to one trip corridor: the route itself, the world streamer, and the
// trip's eager objects (cameras, police, counters, HUD). Shared materials survive; trip objects are disposed.
function buildWorld(path) {
  stream?.disposeAll();
  if (corridorRoot) { scene.remove(corridorRoot); disposeTree(corridorRoot); }
  corridorRoot = new THREE.Group();
  corridorRoot.name = 'corridor';
  scene.add(corridorRoot);
  tripRoot = null;
  chunks.clear();
  route = new Route(net, path);
  initJunctions(route, net);
  // every other road near the bus, whether the trip uses it or not
  netRoads ||= new NetRoads(net, scene);
  netRoads.setRoute(route);
  road = initRoad(route);
  scenery = initScenery(route, scene, { treeDensity: (QUALITY[settings.quality] || QUALITY.high).treeDensity }, road.water);
  facilities = initFacilities(route);
  hud = new HUD(route, road.water);
  hud.free = settings.mode === 'free';
  hud.dest = settings.mode === 'free' ? null : net.zillas.get(settings.trip.to)?.bn;     // (even after a wrong turn)
  passengers = new Passengers({ route, scene: corridorRoot, chunks, hud, player, free: settings.mode === 'free' });
  passengers.onBreak = onRestBreak;
  buildTripObjects();
  stream = new Stream({ route, scene, chunks, obstacles: facilities.obstacles, gates: facilities.gates,
    jobs: [roadChunk, junctionChunk, ferryChunk, scenery.chunk, facilities.chunk, (r, ctx) => passengers.chunk(r, ctx)] });
  if (weather) { weather.setRoute(route); weather.hud = hud; }
  if (rig) rig.route = route;
  if (traffic) { traffic.setRoute(route, facilities.gates); linkTraffic(); }
}
// what the AI traffic needs to know about the trip: the bus services and the counters they stop at
function linkTraffic() {
  traffic.svc = net.services(SERVICES);
  traffic.counters = passengers.counters;
  traffic.places = null;
}
// the player's own route placard
function playerBoard() {
  if (!player.bus) return;
  const A = net.zillas.get(settings.trip.from), B = net.zillas.get(settings.trip.to);
  setBusRouteBoard(player.bus, settings.mode === 'free' || !A || !B ? null : { bn: `${A.bn} ⇄ ${B.bn}`, en: `${A.en} – ${B.en}` });
}
// the trip's AI cameras and police checkpoints (made again whenever the corridor changes)
let tripRoot = null;
function buildTripObjects() {
  if (tripRoot) { corridorRoot.remove(tripRoot); disposeTree(tripRoot); }
  chunks.drop(undefined);
  // police obstacles: drop the old ones (they are tagged), the new checkpoints add theirs
  for (let i = facilities.obstacles.length - 1; i >= 0; i--) if (facilities.obstacles[i].police) facilities.obstacles.splice(i, 1);
  tripRoot = new THREE.Group();
  corridorRoot.add(tripRoot);
  aicams = buildAICams(route, tripRoot, chunks);
  const obs = { push: (...o) => { for (const x of o) x.police = true; facilities.obstacles.push(...o); } };
  police = new Police({ route, scene: tripRoot, chunks, obstacles: obs, counters: passengers.counters, hud, player });
}
// ---------- where the bus is (the next trip starts there) ----------
// at = { zilla } in a terminal yard, or { road, s, dir, near } out on the road (s: m from the road's `from` node,
// dir: +1 facing its `to` node, near: the nearest zilla, for names and stats)
function busPosition() {
  if (!route || !player.bus) return null;
  const t = player.inTerminal || route.terminalAt(player.s, player.d);
  if (t) return { zilla: net.nodes[t.node]?.zilla };
  const g = route.segAt(player.s), c = g.chain;
  if (c.def.link) return { zilla: net.nodes[c.def.from]?.zilla };              // on a terminal's own road
  if (c.def.ferry) return null;
  const u = THREE.MathUtils.clamp(g.u0 + (player.s - g.o), 0, c.length);
  const s = g.rev ? c.length - u : u;
  const ahead = player.side < 0;                                                // driving towards larger corridor s
  const dir = (ahead ? 1 : -1) * (g.rev ? -1 : 1);
  const place = [...route.places].filter((p) => p.zilla && p.kind !== 'roadside').sort((a, b) => Math.abs(a.s - player.s) - Math.abs(b.s - player.s))[0];
  return { road: c.id, s: Math.round(s), dir, near: place?.zilla || settings.trip.to };
}
function saveBusPosition() {
  const at = busPosition();
  if (!at) return;
  settings.at = at;
  settings.trip.from = at.zilla || '@here';
  if (settings.trip.from === settings.trip.to) settings.trip.to = at.zilla === 'Dhaka' ? 'Chattogram' : 'Dhaka';
  saveSettings();
}
addEventListener('beforeunload', () => { if (state === 'drive' || state === 'paused') saveBusPosition(); });
addEventListener('visibilitychange', () => { if (document.hidden && (state === 'drive' || state === 'paused')) saveBusPosition(); });

// a different trip chosen in the menu
function changeTrip() {
  buildWorld(tripPath());
  restartTrip();
  stream.buildNow(player.s, 1); netRoads.buildNow(player.phys.pos.x, player.phys.pos.z);
}

// ---------- turning at junctions (open map) ----------
// The trip corridor is one road (src/route.js); the other roads at a junction are built for ~900 m
// (world/junction.js). Drive onto one of them and the corridor is rebuilt: the same road up to the junction,
// then the road you took, then on to the destination (trip) or straight on (free drive).
function reroute(path, fromS, msg) {
  const keepS = player.s;
  route = new Route(net, path);
  route.rerouted = true;
  initJunctions(route, net);
  netRoads.setRoute(route);
  road = initRoad(route);
  scenery.setRoute(route);
  facilities.setRoute(route);
  stream.setRoute(route, fromS);
  hud.setRoute(route, road.water);
  passengers.setRoute(route);
  buildTripObjects();
  weather.setRoute(route); rig.route = route;
  traffic.setRoute(route, facilities.gates);
  linkTraffic();
  traffic.rebase(fromS, keepS);
  player.hint = -1;
  player.termHint = false;
  // which carriageway the bus is on, on the new road: after driving back the way it came and turning off, it is
  // on the new road's own left carriageway (the side only changes in median openings otherwise, so the median
  // wall would push it across to the other one)
  {
    const ph = player.phys, sp = player.bus.spec;
    const pr = route.project(ph.pos.x + Math.sin(ph.yaw) * sp.center, ph.pos.z + Math.cos(ph.yaw) * sp.center);
    player.s = pr.s; player.d = pr.d; player.hint = pr.index;
    player.side = pr.d > 0 ? 1 : -1;
  }
  if (msg) hud.toast(msg, 'good', 3500);
}
// the onward roads after a turn onto `step` at `node`
function onward(step, prefix = []) {
  const far = step.rev ? net.roads.get(step.road).from : net.roads.get(step.road).to;
  const avoid = pathNodes(prefix);
  // the road never just stops: where it leads nowhere useful it goes straight on (or into the town's terminal)
  const straight = () => {
    const s = net.straightOn(far, step, 160, avoid);
    if (s.length) return s;
    const link = (net.adj.get(far) || []).find((e) => net.roads.get(e.road).def.link);
    return link ? [{ road: link.road, rev: link.rev }] : [];
  };
  if (settings.mode === 'free') return straight();
  const goals = net.zillas.get(settings.trip.to)?.terminals || [];
  if (goals.includes(far)) return [];
  // carry on that way only if it is not much longer than turning round right here; otherwise it is the
  // wrong road (the road goes on straight ahead, and the driver is told to turn round)
  const on = net.path(far, goals, { avoid: new Set([step.road]) }), back = net.path(far, goals);
  const Lr = net.roads.get(step.road).km;
  if (on && (!back || net.pathKm(on) + 2 * Lr <= net.pathKm(back) + 30)) return on;
  const s = straight();
  s.wrong = true;
  return s;
}
// the nodes a path passes through (both ends of every road)
function pathNodes(path) {
  const out = new Set();
  for (const p of path) { const c = net.roads.get(p.road); out.add(c.from); out.add(c.to); }
  return out;
}
// is the bus on one of the side roads of a junction it is passing? then switch the trip onto it
function junctionLogic() {
  const ph = player.phys, sp = player.bus.spec;
  const cx = ph.pos.x + Math.sin(ph.yaw) * sp.center, cz = ph.pos.z + Math.cos(ph.yaw) * sp.center;
  const take = (j, b, fromS) => {
    const prefix = route.path.slice(0, j.k);        // the roads up to this junction stay as they are
    const step = { road: b.road, rev: b.rev };
    const rest = onward(step, prefix);
    const far = net.nodes[b.to];
    const nm = (x) => x.bn.split(' (')[0];
    const msg = settings.mode === 'free'
      ? `🧭 <span class="bn">${nm(far)}</span> — ${b.stub.segs[0].chain.ref || ''} ${far.en.split(' (')[0]}`
      : !rest.wrong && (rest.length || net.zillas.get(settings.trip.to)?.terminals.includes(b.to))
        ? `🔄 <span class="bn">রুট বদল</span> — new route to ${settings.trip.to} via ${far.en.split(' (')[0]}`
        : `⚠️ <span class="bn">ভুল রাস্তা</span> — this road does not go to ${settings.trip.to}. Turn around`;
    reroute([...prefix, step, ...rest], fromS, msg);
  };
  for (const j of route.junctions) {
    // an interchange: did the bus take another ramp than the trip's? (only while driving through it, forwards)
    if (j.ic) {
      if (player.side > 0 || player.s < j.ic.s0 - 5 || player.s > j.ic.s1) continue;
      const inRoad = route.path[j.k - 1]?.road, own = icMovePath(net, j.node, inRoad, route.path[j.k].road);
      if (!own || pathDist(own, cx, cz) < 4.5) continue;
      for (const b of j.branches) {
        const alt = icMovePath(net, j.node, inRoad, b.road);
        if (alt && pathDist(alt, cx, cz) < 3.2) { take(j, b, j.ic.s0); return; }
      }
      continue;
    }
    if (Math.abs(player.s - j.s) > j.R + 120) continue;
    for (const b of j.branches) {
      const pr = b.stub.project(cx, cz, b.hint ?? -1);
      b.hint = pr.index;
      if (pr.s < j.R + 10 || pr.s > b.len - 30 || Math.abs(pr.d) > b.stub.prof(pr.s).half + 1.5) continue;
      if (Math.abs(pr.d) > Math.abs(player.d)) continue;           // still nearer the trip's own road
      take(j, b, j.s);
      return;
    }
  }
}
// distance from (x, z) to a path (world/interchange.js PathRoad)
function pathDist(p, x, z) {
  let best = Infinity;
  for (let i = 0; i < p.N - 1; i += 2) {
    const j = Math.min(p.N - 1, i + 2), ax = p.px[i], az = p.pz[i], bx = p.px[j] - ax, bz = p.pz[j] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
    best = Math.min(best, Math.hypot(ax + bx * t - x, az + bz * t - z));
  }
  return best;
}
// free drive: keep the road going ahead of the bus
function extendFree() {
  if (player.s < route.length - 3500 || player.side > 0) return;
  if (settings.mode !== 'free' && destTerminal()) return;          // a trip that ends at its destination
  const last = route.path[route.path.length - 1];
  const end = last.rev ? net.roads.get(last.road).from : net.roads.get(last.road).to;
  // (in a trip after a wrong turn: back towards the destination if there is a way, else straight on)
  const goals = settings.mode === 'free' ? null : net.zillas.get(settings.trip.to)?.terminals;
  const more = (goals && net.path(end, goals, { avoid: new Set([last.road]) })) || net.straightOn(end, last, 120, pathNodes(route.path.slice(0, -1)));
  if (more.length) reroute([...route.path, ...more], route.length - 40, null);
}
function restartTrip() {
  if (route.rerouted) { buildWorld(tripPath()); stream.buildNow(startPoint()[0], 1); netRoads.buildNow(player.phys.pos.x, player.phys.pos.z); }
  resetPlayer(...startPoint());
  Object.assign(player, { elapsed: 0, odo: 0, fines: 0, crashes: 0, rating: 5, lastPlace: null, lastBridge: null, indL: false, indR: false, paidFlyovers: new Set(),
    fuel: TANK_LITRES * START_FUEL, fuelCost: 0, tollCost: 0, refuelling: false, fuelWarn: 0 });
  for (const g of facilities.gates) { g.holdPlayer = false; g.openT = 0; }
  playerBoard();
  traffic.init(player.s);
  setTime(settings.time);                       // clock back to the chosen start time
  Object.assign(player, { sinceBreak: 0, breaks: 0, breakWarned: false, resting: 0, restPrompt: false, termHint: false, arriveT: 0, inTerminal: route.terminalAt(player.s, player.d) });
  passengers?.reset();
  police?.reset();
  weather?.reset(sky.hour);
}

// rest stops: stop in the lot and press F for a 20-minute passenger break (clock moves on, passengers happier)
function restLogic(dt) {
  player.sinceBreak += dt / 5;
  if (player.sinceBreak > 180 && !player.breakWarned) {
    player.breakWarned = true;
    hud.toast('😴 3 hours on the road — passengers want a break. Stop at the next 🍛 rest stop', 'bad', 5000);
  }
  if (player.resting > 0) return;      // a break is running (src/passengers.js drives it, see onRestBreak)
  const r = route.restAt(player.s, player.d);
  const stopped = r && Math.abs(player.phys.v) < 0.5;
  if (stopped) {
    player.restPrompt = true;
    $('prompt').style.display = 'block';
    $('prompt').innerHTML = `🍛 <b>${r.en}</b> — press <kbd>F</kbd> for a ${REST_MINUTES}-minute break`;
    if (input.hit('KeyF') && passengers.startBreak(r)) {
      player.resting = 1;                // holds the bus (handbrake, no throttle) until everyone is back
      player.restPrompt = false;
      $('prompt').style.display = 'none';
    }
  } else if (player.restPrompt) { player.restPrompt = false; $('prompt').style.display = 'none'; }
}

// rest-break steps from src/passengers.js: everyone gets down → screen fades for the 20 minutes → back on board
function onRestBreak(ev) {
  if (ev === 'fade') {
    $('restfade').classList.add('on');
    player.clockMin += REST_MINUTES;
    player.sinceBreak = 0; player.breakWarned = false; player.breaks++;
    player.rating = Math.min(5, player.rating + 0.5);
  } else if (ev === 'back') {
    $('restfade').classList.remove('on');
  } else if (ev === 'done') {
    player.resting = 0;
    hud.toast(`Break over (${REST_MINUTES} min) — everyone is back on board ★`, 'good', 3000);
  }
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
    crashVoice();
  } else hud.toast(msg, 'bad');
}

// ---------- helper & passenger voices (src/voice.js) ----------
function crashVoice() { voice.say('pax.crash'); voice.say('helper.crash'); }
const vstate = { fast: 0, indL: false, indR: false };
function voiceLogic(dt) {
  const kmh = Math.abs(player.phys.v) * 3.6;
  // speeding for a few seconds: the helper or a passenger complains
  // (only real overspeed: 100 km/h or more, held for 3 s; the lines have their own long cooldowns)
  vstate.fast = kmh >= 100 ? vstate.fast + dt : Math.max(0, vstate.fast - dt * 2);
  if (vstate.fast > 3) { vstate.fast = 0; voice.say(Math.random() < 0.5 ? 'helper.slow' : 'pax.slow'); }
  // the helper watches the sides when you signal: right = pulling out to overtake, left = moving back in
  const ad = Math.abs(player.d);
  const near = (inner, back, ahead) => traffic.list.some((v) => Math.sign(v.d) === player.side &&
    (inner ? Math.abs(v.d) < ad - 1.5 : Math.abs(v.d) > ad + 1.5) && (v.s - player.s) * player.heading > -back && (v.s - player.s) * player.heading < ahead);
  if (player.indR && !vstate.indR && kmh > 25 && near(true, 25, 8)) voice.say('helper.overtake_wait');
  if (player.indL && !vstate.indL && kmh > 25 && ad < route.prof(player.s).median + route.prof(player.s).lane && !near(false, 14, 14) && Math.random() < 0.5) voice.say('helper.left_clear');
  vstate.indL = player.indL; vstate.indR = player.indR;
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
  // carriageway: free to cross only inside a U-turn opening (a 2-lane road has no median: cross anywhere)
  const P = route.prof(s);
  // (and the median is only on the road itself: off it — on a junction pad, a side road, the fields — there is
  // nothing to cross, e.g. after coming back the way you came and turning off to the far side at a junction)
  const offRoad = !bridge && Math.abs(d) > P.half + 2;
  const open = gap || P.two || offRoad;
  if (open) player.side = d > 0 ? 1 : -1;
  const sd = player.side;
  const inner = P.median + 0.1 + halfAcross;
  // (how far into the fields the bus may stray: near a junction, as far as its side roads go, which can leave at
  // a sharp angle and so lie far to the side of the trip's road before the trip switches over to them)
  const nearJ = !bridge && offRoad && route.junctions.some((j) => !j.ic && Math.hypot(cx - j.x, cz - j.z) < j.R + 260);
  const outer = bridge ? P.half - 0.1 - Math.min(halfAcross, 2) : nearJ ? 1e4 : P.toe + 45;
  let lo, hi;
  // inside an interchange the other ramps are on both sides of the trip's carriageway: no median wall (stay
  // within reach of them up high, where there is only air beyond)
  const inIC = route.icZones?.some((z) => s > z.s0 && s < z.s1);
  if (open) { lo = -outer; hi = outer; } else if (inIC) { const o = bridge ? P.half + 8 : P.toe + 45; lo = -o; hi = o; } else if (sd < 0) { lo = -outer; hi = -inner; } else { lo = inner; hi = outer; }
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
  // The bus is tested as a rotated box in (d, s) space. (An axis-aligned box around an angled bus is far
  // wider than the bus, so turning into a fuel-station lane used to catch pillars and pumps it never touched,
  // and the nose-on stop left the bus jammed with no speed to steer away.)
  for (const o of facilities.obstacles) {
    if (o.gate && o.gate.open > 0.55) continue;
    if (s + halfAlong < o.s0 || s - halfAlong > o.s1 || d + halfAcross < o.d0 || d - halfAcross > o.d1) continue;
    const n = obbOverlap({ x: d, z: s, yaw: -rel, hw: spec.W / 2, hl: spec.L / 2 },
      { x: (o.d0 + o.d1) / 2, z: (o.s0 + o.s1) / 2, yaw: 0, hw: (o.d1 - o.d0) / 2, hl: (o.s1 - o.s0) / 2 });
    if (!n) continue;
    const ds = n.depth * n.nz, dd = n.depth * n.nx;          // push the bus out along the contact normal
    phys.pos.x += tx * ds - tz * dd; phys.pos.z += tz * ds + tx * dd;
    s += ds; d += dd;
    // how much of the bus's heading points into the obstacle: nose-on stops it, a glancing touch only scrapes
    const fn = Math.cos(rel) * n.nz - Math.sin(rel) * n.nx;
    let impact = 0;
    if (phys.v * fn < 0) {
      impact = Math.abs(phys.v * fn);
      phys.v = Math.abs(fn) > 0.8 ? 0 : phys.v * (1 - Math.abs(fn));
    }
    wallHit(impact, o.gate ? 'Hit the toll barrier! Stop before the gate and wait.' : o.fence ? 'Hit the toll plaza wall — use a booth lane and pay the toll' : 'Crashed into a concrete island!');
  }
  // a ferry crossing: the road stops at the end of the pontoon (cross with F, see ferryLogic)
  const fr = route.ferryAt(s);
  if (fr && s > fr.s0 + 36 && s < fr.s1 - 36) {
    const lim = s - fr.s0 < fr.s1 - s ? fr.s0 + 36 : fr.s1 - 36, m = lim - s;
    phys.pos.x += tx * m; phys.pos.z += tz * m; s = lim;
    if (Math.abs(phys.v) > 2) wallHit(Math.abs(phys.v) * 0.6, 'End of the pontoon! Stop on it and press F to board the ferry');
    phys.v = 0;
  }
  // ends of the route
  if (s < 3) { phys.pos.x += tx * (3 - s); phys.pos.z += tz * (3 - s); s = 3; }
  if (s > route.length - 3) { const m = s - (route.length - 3); phys.pos.x -= tx * m; phys.pos.z -= tz * m; s = route.length - 3; }
  phys.offroad = Math.abs(d) > route.halfAt(s) + 0.6 && !route.paved(s, d) ? 1 : 0;
  player.s = s; player.d = d; player.v = phys.v;
  player.inTerminal = route.terminalAt(s, d);
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
      hud.toast(`<span class="bn">টোল প্লাজা</span> — stop at the barrier to pay ৳${g.fee || TOLL_FEE}`, '', 3000);
      voice.say('helper.toll');
      player.promptCool = 12;
    }
    if (ahead > 0 && ahead < player.len / 2 + 8 && Math.abs(ph.v) < 0.8) {
      player.tollWait += dt;
      if (player.tollWait > 1.2) {
        player.tollWait = 0;
        g.holdPlayer = true;
        player.tollCost += g.fee || TOLL_FEE;
        audio.tick(true);
        hud.toast(`Toll paid ৳${g.fee || TOLL_FEE} — <span class="bn">ধন্যবাদ</span>, gate opening`, 'good', 3000);
      }
    } else if (Math.abs(ph.v) > 1) player.tollWait = 0;
  }
}

// ferry ghats: stop on the pontoon and press F; the screen fades while the ferry crosses (fare and the
// crossing time are paid), and the bus drives off on the other bank
function ferryLogic() {
  if (player.crossing) return;
  for (const f of route.ferries) {
    const fwd = player.side < 0, dir = fwd ? 1 : -1, gs = fwd ? f.s0 : f.s1;
    const u = (player.s - gs) * dir;
    if (u < -60 || u > 45) continue;
    if (Math.abs(player.phys.v) < 0.5 && u > -30) {
      $('prompt').style.display = 'block';
      $('prompt').innerHTML = `⛴️ <b class="bn">${f.bn}</b> — press <kbd>F</kbd> to drive onto the ferry (fare ৳${f.fare.toLocaleString('en-IN')}, about ${f.minutes} min)`;
      if (input.hit('KeyF')) startCrossing(f, dir);
    } else if (u > -60 && u < -30 && player.promptCool <= 0) {
      player.promptCool = 10;
      hud.toast(`⛴️ <span class="bn">ফেরি ঘাট</span> — drive onto the pontoon and stop to board the ferry`, '', 3000);
    }
    return;
  }
}
function startCrossing(f, dir) {
  player.crossing = { f, dir };
  player.resting = 1;                      // holds the bus while the ferry crosses
  $('prompt').style.display = 'none';
  $('restfade').classList.add('on');
  player.tollCost += f.fare;
  hud.toast(`⛴️ Ferry fare ৳${f.fare.toLocaleString('en-IN')} paid — crossing the river…`, 'good', 3000);
  setTimeout(() => {
    player.clockMin += f.minutes;
    const ts = dir > 0 ? f.s1 + 50 : f.s0 - 50;
    const lane = route.prof(ts).laneCenters[0] * (dir > 0 ? 1 : -1);
    resetPlayer(ts, lane);
    stream.buildNow(ts, dir); netRoads.buildNow(player.phys.pos.x, player.phys.pos.z);
    traffic.init(ts);
    setTimeout(() => {
      $('restfade').classList.remove('on');
      player.crossing = null; player.resting = 0;
      const far = dir > 0 ? f.to : f.from;
      hud.toast(`⛴️ <span class="bn">${far.bn}</span> — off the ferry after ${f.minutes} minutes on the river`, 'good', 3500);
    }, 700);
  }, 1400);
}

// fuel use and refuelling at filling stations
function fuelLogic(dt) {
  const ph = player.phys;
  const realKm = (Math.abs(ph.v) * dt) * (route.totalKm / route.length);
  if (!player.refuelling) {
    player.fuel = Math.max(0, player.fuel - (realKm / BUS_KM_PER_LITRE) * (0.45 + 0.9 * ph.throttle) - dt * 0.0012);
  }
  const frac = player.fuel / TANK_LITRES;
  if (frac < 0.15 && player.fuelWarn < 1) { player.fuelWarn = 1; hud.toast('⛽ Fuel low (15%) — refuel at the next filling station', 'bad', 4500); voice.say('helper.fuel'); }
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
  // the wheel turns with how hard you steer: a real coach has a slower ratio at speed, but a tiny
  // wheel movement looks unresponsive, so the visual ratio grows with speed
  if (bus.steeringWheel) bus.steeringWheel.rotation.z = THREE.MathUtils.clamp(phys.steer * 18 * (1 + Math.abs(phys.v) / 12), -2.7, 2.7);
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

// ---------- AI cameras ----------
function aiCamVehicles(withPlayer) {
  const list = traffic.list.map((v) => ({ s: v.s, prevS: v.prevS ?? v.s, side: v.dir > 0 ? -1 : 1, kmh: v.v * 3.6, len: v.len }));
  if (withPlayer) list.push({ s: player.s, prevS: player.lastS, side: player.side, kmh: Math.abs(player.phys.v) * 3.6, len: player.len, isPlayer: true });
  return list;
}
function onAICam(cam, kmh) {
  audio.shutter?.();
  // the flash also catches your eye: a quick white double flash on screen
  const fl = $('camflash');
  fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  const place = route.placeAt(cam.s);
  const where = place ? place.en.split(' (')[0] : 'N1';
  if (kmh > SPEED_LIMIT + 5) {
    const fine = kmh > SPEED_LIMIT + 25 ? 2000 : 1000;
    player.fines += fine;
    player.rating = Math.max(1, player.rating - 0.3);
    hud.toast(`📸 AI camera (${where}): ${Math.round(kmh)} km/h in a ${SPEED_LIMIT} zone<br><b>Fine ৳ ${fine.toLocaleString('en-IN')}</b>`, 'bad', 4200);
  } else {
    // passing a camera under the limit: no message (keeps the screen clear)
  }
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
  // a toll taken at the deck (elevated expressway, or a bridge with no room for a plaza): once per trip
  const paid = (player.paidFlyovers ||= new Set());
  if (br && br.fee && !br.ferry && br !== player.lastBridge && !paid.has(br.en + br.sc)) {
    paid.add(br.en + br.sc);
    player.tollCost += br.fee;
    voice.say('helper.toll');
    hud.toast(`<span class="bn">${br.tollBn || br.bn}</span><br><small>${br.tollEn || br.en}: ৳${br.fee} paid electronically</small>`, 'good', 3500);
  } else if (br && br.elevated && br !== player.lastBridge) hud.toast(`<span class="bn">${br.bn}</span> · ${br.en}`, '', 3200);
  else if (br && !br.ferry && !br.elevated && br !== player.lastBridge) hud.toast(`<span class="bn">${br.bn} নদী</span> · ${br.en} River bridge`, '', 3200);
  player.lastBridge = br;
  // passenger comfort: handled by the mood in src/passengers.js (complaints, rating, tips)
  player.lastS = s;
  // arrival: stop inside the destination terminal (fallback: the very end of the road)
  const dest = destTerminal();
  const gate = dest ? (dest.exitS0 + dest.exitS1) / 2 : route.length;
  if (dest && !player.termHint && Math.abs(s - gate) < 450) {
    player.termHint = true;
    hud.toast(`🚌 <span class="bn">${dest.bn}</span><br><small>Cross at the median opening by the gate, drive into the yard, stop and press G to let the passengers off</small>`, 'good', 5500);
  }
  const atEnd = !!dest && s >= route.length - 4;
  // in the destination yard the trip ends once everyone has got down (G) and the door is shut
  const parked = !!dest && player.inTerminal === dest && Math.abs(player.phys.v) < 0.5;
  // (a race ends as soon as the bus stops in the yard: the passengers get down after the finish)
  const raceEnd = raceRun && race.racing;
  player.arriveT = parked && (raceEnd || !passengers || passengers.allOff()) ? (player.arriveT || 0) + dt : 0;
  if (player.arriveT > 0.8 || atEnd) {
    state = 'arrived';
    if (raceEnd) { race.finish(player); hud.toast(`🏁 Finished in ${fmtRace(race.raceTime())}!`, 'good', 4000); }
    passengers?.finishTrip();          // everyone still aboard gets down at the terminal
    hud.arrival(player, settings.op.en, route.endPlace, career.finishTrip(player, { dir: tripKey(), km: route.totalKm }));
    if (settings.mode !== 'free') {
      const back = settings.trip.from === '@here' ? (settings.at?.near || 'Dhaka') : settings.trip.from;
      settings.at = { zilla: settings.trip.to };
      settings.trip = { from: settings.trip.to, to: back === settings.trip.to ? 'Dhaka' : back };
      saveSettings();
      $('again').textContent = `Return trip ▸ ${net.zillas.get(settings.trip.to)?.en || ''}`;
    }
    renderCompany();
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
    if (import.meta.env?.DEV) (window.__crashes ||= []).push({ kind: v.K.kind, dir: v.dir, s: Math.round(v.s), d: +v.d.toFixed(2), targetD: +v.targetD.toFixed(2), v: +v.v.toFixed(1), ps: Math.round(player.s), pd: +player.d.toFixed(2), pv: +player.phys.v.toFixed(1), side: !!c.side, turn: !!v.turn, merge: !!v.merge, rest: v.rest?.phase || null });
    if (c.side) {
      // a bus turning off / coming in at a junction (off the corridor): push apart, both stop
      ph.pos.x += n.nx * n.depth; ph.pos.z += n.nz * n.depth;
      const kmh = Math.abs(ph.v) * 3.6;
      ph.v *= 0.3; v.v = 0;
      if (player.crashCool <= 0 && kmh > 8) {
        const dmg = Math.round(Math.min(25000, 300 * kmh) / 100) * 100;
        player.crashes++; player.crashCool = 1.5; player.fines += dmg;
        player.rating = Math.max(1, player.rating - Math.min(1.2, kmh / 40));
        audio.crash(kmh / 3.6); rig.shake = Math.min(1, kmh / 30);
        hud.toast(`Collision with a ${KIND_NAME[v.K.kind]} at ${Math.round(kmh)} km/h! Damage ৳ ${dmg.toLocaleString('en-IN')}`, 'bad');
        crashVoice();
      }
      continue;
    }
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
      // light scrape: the sound is enough, no message
    } else {
      const dmg = Math.round(Math.min(25000, 300 * kmh) / 100) * 100;
      player.crashes++;
      player.crashCool = 1.5;
      player.rating = Math.max(1, player.rating - Math.min(1.2, kmh / 40));
      player.fines += dmg;
      audio.crash(closing);
      rig.shake = Math.min(1, closing / 8);
      hud.toast(`Collision with a ${KIND_NAME[v.K.kind]} at ${Math.round(kmh)} km/h! Damage ৳ ${dmg.toLocaleString('en-IN')}`, 'bad');
      crashVoice();
    }
  }
}

// ---------- driver's seat adjustment (saved per bus type) ----------
const SEAT_LIM = { x: [-0.45, 0.45], y: [-0.3, 0.35], z: [-0.5, 0.45], fov: [50, 100] };
function seatOf() { return settings.seats[settings.type] || (settings.seats[settings.type] = { x: 0, y: 0, z: 0, fov: 78 }); }
function applySeat() {
  const st = seatOf();
  rig.seat.set(st.x, st.y, st.z);
  rig.seatFov = st.fov;
  for (const k of ['x', 'y', 'z', 'fov']) { const el = $('seat-' + k); if (el && document.activeElement !== el) el.value = st[k]; }
}
function nudgeSeat(k, d) {
  const st = seatOf();
  st[k] = THREE.MathUtils.clamp(+(st[k] + d).toFixed(3), ...SEAT_LIM[k]);
  applySeat();
  seatSaveSoon();
}
let seatTimer = 0;
function seatSaveSoon() { clearTimeout(seatTimer); seatTimer = setTimeout(saveSettings, 400); }
function toggleSeatPanel(force) {
  const el = $('seat');
  const on = force ?? el.style.display !== 'block';
  el.style.display = on ? 'block' : 'none';
  if (on && rig.mode !== 'cabin') rig.setMode('cabin');
}
function initSeatPanel() {
  for (const k of ['x', 'y', 'z', 'fov']) {
    const el = $('seat-' + k);
    el.addEventListener('input', (e) => { seatOf()[k] = +e.target.value; applySeat(); seatSaveSoon(); });
    // give the keyboard back to driving as soon as the slider is released
    el.addEventListener('change', () => el.blur());
    el.addEventListener('pointerup', () => el.blur());
  }
  $('seat-btn').onclick = () => toggleSeatPanel();
  $('gfx-btn').onclick = (e) => { e.currentTarget.blur(); if (state === 'drive') cycleGraphics(); };
  gfxLabel();
  $('seat-close').onclick = () => toggleSeatPanel(false);
  $('seat-reset').onclick = () => { settings.seats[settings.type] = { x: 0, y: 0, z: 0, fov: 78 }; applySeat(); saveSettings(); };
  document.getElementById('t-seat')?.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleSeatPanel(); });
  // phones: the trip panel is hidden to keep the view clear; tap the place name to show or hide it
  if (IS_TOUCH) $('place')?.addEventListener('pointerdown', () => document.body.classList.toggle('show-trip'));
}

// ---------- the full map (M) ----------
const bigmap = new BigMap();
bigmap.onClose = () => closeMap();
// phones: tap the minimap for the full map
document.getElementById('gpsbox')?.addEventListener('pointerdown', (e) => { if (state === 'drive') { e.preventDefault(); openMap(); } });
let mapPaused = false;
function mapCtx() {
  const ph = player.phys, nm = (p, k) => p[k].split(' (')[0];
  const dir = player.side < 0 ? 1 : -1;
  const stops = settings.mode === 'free' ? [] : passengers?.counters.filter((c) => c.side === -1) || [];
  const next = stops.find((c) => (c.s - player.s) * dir > 20);
  const left = Math.max(0, route.totalKm - route.realKm(player.s));
  const refs = [...new Set(route.segs.map((g) => g.chain.ref).filter((r) => r && !['DHK', 'CTG'].includes(r)))].join(', ');
  const free = settings.mode === 'free';
  return {
    hud, route, stops, st: { x: ph.pos.x, z: ph.pos.z, yaw: ph.yaw, s: player.s, side: player.side }, friends: race.friends(),
    title: free ? `🧭 Explore from <span class="bn">${nm(route.startPlace, 'bn')}</span><small>Take any road at a junction — the map follows you</small>`
      : `<span class="bn">${nm(route.startPlace, 'bn')} → ${nm(route.endPlace, 'bn')}</span><small>${nm(route.startPlace, 'en')} → ${nm(route.endPlace, 'en')} · ${Math.round(route.totalKm)} km via ${refs}</small>`,
    // (Explore: how far you have driven; no passengers, so no stops and no destination)
    info: (free ? `Driven <b>${(player.odo || 0).toFixed(0)} km</b>`
      : `Remaining <b>${left.toFixed(0)} km</b>${next ? ` · next stop <b class="bn">${next.bn}</b> (${Math.abs(route.realKm(next.s) - route.realKm(player.s)).toFixed(0)} km)` : ''}`)
      + (free ? `<br><span style="color:#3ddc84">●</span> start · <span style="color:#ff8a1c">●</span> your road ahead · <span style="color:#7d8a96">━</span> driven`
        : `<br><span style="color:#3ddc84">●</span> start · <span style="color:#ff8a1c">●</span> destination / your road · <span style="color:#2ecc71">●</span> stops · <span style="color:#7d8a96">━</span> driven`)
      + `${route.ferries.length ? ' · <span style="color:#4fc3f7">┅</span> ferry' : ''}`
      + `<br><span style="color:#4fae5a">━</span> expressway · <span style="color:#b06ad0">━</span> elevated expressway · <span style="color:#5d6b78">━</span> 4-lane · <span style="color:#3d4954">━</span> 2-lane`,
  };
}
function openMap() {
  if (bigmap.isOpen || !(state === 'drive' || state === 'paused')) return;
  if (state === 'drive') { state = 'paused'; mapPaused = true; audio.horn(false); audio.ctx?.suspend(); }
  bigmap.open(mapCtx());
}
function closeMap() {
  if (!bigmap.isOpen) return;
  bigmap.close();
  if (mapPaused) { mapPaused = false; state = 'drive'; audio.ctx?.resume(); }
}

// ---------- keys ----------
function handleKeys() {
  // M: the full map (the game waits while it is open); Z: sound on / off
  if (input.hit('KeyM') || input.hit('KeyO')) { if (bigmap.isOpen) closeMap(); else openMap(); return; }
  if (bigmap.isOpen) { if (input.hit('Escape')) closeMap(); return; }
  if (input.hit('KeyZ')) { audio.setMuted(!audio.muted); hud.toast(audio.muted ? '🔇 Sound off (Z)' : '🔊 Sound on (Z)', '', 1500); }
  if (input.hit('KeyK')) hud.toast(voice.toggle() ? '🗣️ Helper & passenger voices on (K)' : '🔇 Helper & passenger voices off (K)', '', 2000);
  if (input.hit('KeyB')) {
    if (!music.tracks.length) hud.toast('🎵 No songs yet: add your own in the menu → Music', '', 3000);
    else music.toggle();
  }
  if (input.hit('KeyN') && music.tracks.length) { if (input.has('ShiftLeft', 'ShiftRight')) music.prev(); else music.next(); }
  if (state === 'drive' || state === 'paused') {
    if (input.hit('KeyP') || input.hit('Escape')) togglePause();
  }
  if (state !== 'drive') return;
  if (input.hit('KeyC')) rig.next();
  // seat: Alt + arrows / PgUp / PgDn / [ ]
  if (input.alt && rig.mode === 'cabin') {
    const sp = 0.6 * (1 / 60);
    if (input.has('ArrowLeft')) nudgeSeat('x', -sp);
    if (input.has('ArrowRight')) nudgeSeat('x', sp);
    if (input.has('ArrowUp')) nudgeSeat('z', sp);
    if (input.has('ArrowDown')) nudgeSeat('z', -sp);
    if (input.has('PageUp')) nudgeSeat('y', sp);
    if (input.has('PageDown')) nudgeSeat('y', -sp);
    if (input.has('BracketLeft')) nudgeSeat('fov', -0.6);
    if (input.has('BracketRight')) nudgeSeat('fov', 0.6);
  }
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((k, i) => { if (input.hit(k)) rig.setMode(CAM_MODES[[1, 0, 2, 3][i]]); });
  if (input.hit('KeyL')) { player.lights = !player.lights; if (!player.lights) player.high = false; }
  // U: upper dipper (high beam); it needs the headlights, so it switches them on too
  if (input.hit('KeyU')) { player.high = !player.high; if (player.high) player.lights = true; }
  if (input.hit('KeyJ')) player.fog = !player.fog;     // J: fog lights
  if (input.hit('KeyI')) cycleGraphics();               // I: graphics High → Medium → Low
  if (input.hit('KeyV')) {
    const inCab = rig.mode === 'cabin';
    if (inCab) mirrors.hudCabin = !mirrors.hudCabin; else mirrors.hudOn = !mirrors.hudOn;
    hud.toast(`Screen mirrors ${(inCab ? mirrors.hudCabin : mirrors.hudOn) ? 'ON' : 'OFF'}${inCab ? ' in the cab' : ''}`);
  }
  if (input.hit('KeyQ')) { player.indL = !player.indL; player.indR = false; }
  if (input.hit('KeyE')) { player.indR = !player.indR; player.indL = false; }
  if (input.hit('KeyY')) weather?.cycle();
  if (input.hit('KeyT')) {
    const k = TIME_ORDER[(TIME_ORDER.indexOf(settings.time) + 1) % TIME_ORDER.length];
    setTime(k);
    hud.toast(`Time: ${TIMES[k].label} (${TIMES[k].clock}) — the clock keeps running as you drive`);
  }
  if (input.hit('KeyX')) {
    const ph = player.phys;
    if (ph.cruise == null && ph.v > 8) { ph.cruise = ph.v; hud.toast(`Cruise control ${Math.round(ph.v * 3.6)} km/h`); }
    else ph.cruise = null;
  }
  if (input.hit('KeyR')) {
    const lc = route.prof(player.s).laneCenters[0];
    resetPlayer(player.s, player.side > 0 ? -lc : lc);
    if (player.fuel <= 0) { player.fuel = 40; player.fuelCost += 40 * DIESEL_PRICE * 1.5; hud.toast('Supervisor brought 40 L of diesel in a jerrycan (৳ extra)'); }
    hud.toast('Bus reset to the road');
  }
  if (input.hit('KeyH')) traffic.nudge(player);
  if (input.hit('F1')) { const h = $('help'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; }
}

// ---------- music: menu list + in-game player ----------
let lastYTTitle = null;
function renderMusicList() {
  const el = $('music-list');
  el.innerHTML = music.tracks.length ? '' : '<div class="empty">No songs yet. Add MP3/M4A files from your phone or computer.</div>';
  music.tracks.forEach((t, k) => {
    const row = document.createElement('div');
    row.className = 'trk' + (k === music.i && music.playing ? ' on' : '');
    const size = t.kind === 'yt' ? (t.listId && !t.videoId ? 'YouTube playlist' : 'YouTube') : fmtSize(t.size);
    row.innerHTML = `<button title="Play">${k === music.i && music.playing ? '⏸' : '▶'}</button><span></span><small>${size}</small><button title="Remove">✕</button>`;
    row.querySelector('span').textContent = (t.kind === 'yt' ? '📺 ' : '') + t.name;
    const [pb, xb] = row.querySelectorAll('button');
    pb.onclick = () => { if (k === music.i) music.toggle(); else music.play(k); };
    xb.onclick = () => music.remove(t.id);
    el.appendChild(row);
  });
}
function updateMusicBox() {
  const has = music.tracks.length > 0;
  $('musicbox').style.display = has && state !== 'menu' ? 'block' : 'none';
  $('mus-title').textContent = music.current ? `${music.isYT ? '📺' : '🎵'} ${music.nowTitle || music.current.name}` : '🎵 Press ▶ to play your songs';
  $('mus-play').textContent = music.playing ? '⏸' : '▶';
}
function initMusicUI() {
  $('music-add').onclick = () => $('music-file').click();
  $('music-file').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const n = await music.add(files);
    hud.toast(n ? `🎵 Added ${n} song${n > 1 ? 's' : ''}` : 'Those files are not audio files', n ? 'good' : 'bad', 2500);
  };
  const addYT = async () => {
    const v = $('yt-url').value;
    if (!parseYouTube(v)) { hud.toast('That is not a YouTube song or playlist link', 'bad', 2800); return; }
    const rec = await music.addYouTube(v);
    $('yt-url').value = '';
    $('yt-url').blur();
    hud.toast(rec.listId && !rec.videoId ? '📺 YouTube playlist added' : '📺 YouTube song added', 'good', 2500);
  };
  $('yt-add-btn').onclick = addYT;
  $('yt-url').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') addYT(); });
  $('yt-close').onclick = () => music.ytStop();
  $('music-auto').checked = music.auto;
  $('music-auto').onchange = (e) => { music.auto = e.target.checked; music.save(); };
  $('music-shuffle').checked = music.shuffle;
  $('music-shuffle').onchange = (e) => { music.shuffle = e.target.checked; music.save(); };
  $('mus-prev').onclick = () => music.prev();
  $('mus-next').onclick = () => music.next();
  $('mus-play').onclick = () => music.toggle();
  $('mus-vol').value = music.vol;
  $('mus-vol').oninput = (e) => music.setVolume(+e.target.value);
  for (const id of ['mus-prev', 'mus-next', 'mus-play', 'mus-vol']) $(id).addEventListener('pointerup', (e) => e.currentTarget.blur());
  music.onChange((kind, m, info) => {
    renderMusicList(); updateMusicBox();
    if (kind === 'track' && state === 'drive' && !music.isYT) hud.toast(`🎵 ${music.current.name}`, '', 2200);
    if (kind === 'ytplay' && music.nowTitle !== lastYTTitle) { lastYTTitle = music.nowTitle; if (state === 'drive') hud.toast(`📺 ${music.nowTitle}`, '', 2500); }
    if (kind === 'error') hud.toast(`📺 ${info}`, 'bad', 4000);
  });
  renderMusicList();
}

function togglePause() {
  if (state === 'drive') { state = 'paused'; $('pause').style.display = 'flex'; audio.horn(false); audio.ctx?.suspend(); music.hold(true); }
  else if (state === 'paused') { state = 'drive'; $('pause').style.display = 'none'; audio.ctx?.resume(); music.hold(false); }
}

// ---------- menu ----------
function buildMenu() {
  renderOps();
  renderGarage();
  initSpeedCode();
  const times = $('times');
  TIME_ORDER.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = k === settings.time ? 'sel' : '';
    b.innerHTML = `${TIMES[k].label}<small>${TIMES[k].clock}</small>`;
    b.onclick = () => { selectSeg(times, b); setTime(k); saveSettings(); };
    times.appendChild(b);
  });
  // the trip picker: map of Bangladesh + From / To (rebuilding the world takes a moment, so wait for the clicks to stop)
  let tripT = 0;
  tripMenu = initTripMenu({ net, settings, onChange: () => {
    // in a race room only the host picks the route
    if (race.inRoom && race.room?.trip && !race.isHost) {
      settings.trip = { ...race.room.trip }; settings.mode = 'trip'; tripMenu.render();
      hud.toast('🏁 The race host picks the route', '', 2500);
    }
    if (race.inRoom && race.isHost && settings.mode !== 'free') race.setTrip(settings.trip);
    saveSettings(); clearTimeout(tripT); tripT = setTimeout(changeTrip, 250);
  } });
  for (const id of ['traffic', 'quality']) {
    const el = $(id);
    el.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('sel', String(id === 'traffic' ? settings.traffic : settings.quality) === b.dataset.v);
      b.onclick = () => {
        selectSeg(el, b);
        if (id === 'traffic') settings.traffic = +b.dataset.v;
        else { settings.quality = b.dataset.v; settings.qualityManual = true; applyQuality(); gfxLabel(); }
        saveSettings();
      };
    });
  }
  $('start').onclick = startDrive;
  // career: company bank, stats and feedback
  renderCompany();
  $('stats-open').onclick = () => { renderStats(); $('stats').style.display = 'flex'; };
  $('stats-close').onclick = () => ($('stats').style.display = 'none');
  $('stats-reset').onclick = () => {
    if (!confirm('Reset your company? Your bank balance, bought buses and all stats go back to the start. This cannot be undone.')) return;
    career.resetAll();
    if (!career.owns(settings.type)) { settings.type = career.ownedType(settings.type); createPlayerBus(); applySeat(); saveSettings(); }
    renderGarage(); renderCompany(); renderStats();
  };
  const feedback = () => window.open(feedbackURL({ type: BUS_TYPES[settings.type]?.name, route: `${settings.trip.from} → ${settings.trip.to}`, opName: settings.op.en,
    where: state === 'paused' ? `${route.realKm(player.s).toFixed(0)} km from ${settings.trip.from}` : '' }), '_blank', 'noopener');
  $('feedback-menu').onclick = feedback;
  $('feedback-pause').onclick = feedback;
  $('about-open').onclick = () => ($('about').style.display = 'flex');
  $('about-close').onclick = () => ($('about').style.display = 'none');
  $('resume').onclick = togglePause;
  $('to-menu').onclick = () => { togglePause(); toMenu(); };
  // after a trip the bus stays where it arrived: "Return trip" drives back from there
  $('again').onclick = () => { $('arrival').style.display = 'none'; changeTrip(); tripMenu?.render(); startDrive(); };
  $('arr-menu').onclick = () => { $('arrival').style.display = 'none'; toMenu(); };
}
// ---------- career: garage, company card, stats ----------
function renderGarage() {
  const types = $('types');
  types.innerHTML = '';
  const order = Object.keys(BUS_TYPES).sort((a, b) => (BUS_PRICES[a] ?? 0) - (BUS_PRICES[b] ?? 0));
  for (const k of order) {
    const t = BUS_TYPES[k], own = career.owns(k), price = BUS_PRICES[k] ?? 0;
    const b = document.createElement('button');
    b.className = `${k === settings.type ? 'sel' : ''} ${own ? '' : 'locked'} ${!own && career.balance < price ? 'poor' : ''}`;
    b.innerHTML = `${t.name}<small>${t.desc}</small><span class="price ${own ? 'own' : ''}">${own ? '✓ Available' : `🔒 ${taka(price)}`}</span>`;
    b.title = own ? '' : `Game price ${taka(price)} (a real one costs about ${REAL_PRICE[k] || '—'})`;
    b.onclick = () => {
      if (!own) {
        if (career.balance < price) { hud.toast(`🔒 ${t.name} costs ${taka(price)} — your company has ${taka(career.balance)}. Finish trips to earn more.`, 'bad', 3800); return; }
        if (!confirm(`Buy the ${t.name} for ${taka(price)}?\nYour bank: ${taka(career.balance)} → ${taka(career.balance - price)}`)) return;
        career.buy(k);
        hud.toast(`🚌 New bus! The ${t.name} is in your garage.`, 'good', 3500);
        renderCompany();
      }
      settings.type = k; createPlayerBus(); applySeat(); saveSettings();
      renderGarage();
      renderSpeedCode();
    };
    types.appendChild(b);
  }
}
function renderCompany() {
  const el = $('co-balance');
  if (el) { el.textContent = taka(career.balance); el.style.color = career.balance < 0 ? '#ff8a80' : ''; }
  if ($('types')?.children.length) renderGarage();
}
function renderStats() {
  const s = career.stats, row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
  $('stats-body').innerHTML = [
    row('Company bank', taka(career.balance)),
    row('Buses available', Object.keys(BUS_TYPES).filter((k) => career.owns(k)).map((k) => BUS_TYPES[k].name).join(', ')),
    row('Trips completed', s.trips),
    row('Kilometres driven', `${Math.round(s.km).toLocaleString('en-IN')} km`),
    row('Passengers carried', s.passengers.toLocaleString('en-IN')),
    row('Money earned (fares + tips)', taka(s.income)),
    row('Total profit', taka(s.profit)),
    row('Best trip profit', s.bestProfit == null ? '—' : taka(s.bestProfit)),
    row('Best passenger rating', s.trips ? `${'★'.repeat(Math.round(s.bestRating))}${'☆'.repeat(5 - Math.round(s.bestRating))}` : '—'),
    ...Object.entries(s.fastest).filter(([, v]) => v != null).map(([k, v]) => {
      const [a, b] = k === 'ctg' ? ['Dhaka', 'Chattogram'] : k === 'dhk' ? ['Chattogram', 'Dhaka'] : k.split('>');
      return row(`Fastest ${a} → ${b}`, fmtDuration(v));
    }),
    row('Crashes', s.crashes),
    row('Fines & damage paid', taka(s.fines)),
  ].join('');
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
      renderSpeedCode();
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
  // left mid-trip: the bus stays where it stopped, and the next trip starts from there
  const wasDriving = state === 'drive' || state === 'paused';
  if (wasDriving && !(player.arriveT > 0.8)) saveBusPosition();
  state = 'menu';
  raceRun = false;
  raceUI?.board(false);
  $('menu').style.display = 'block';
  hud.show(false);
  // in a race room: back to the room's route (the host's next pick is the next race)
  if (race.inRoom && race.room?.trip && !race.isHost) { settings.trip = { ...race.room.trip }; settings.mode = 'trip'; }
  if (race.inRoom && race.isHost && settings.mode !== 'free') race.setTrip(settings.trip);
  raceUI?.render();
  audio.horn(false);
  updateMusicBox();
  tripMenu?.render();
  changeTrip();
  rig.setMode('chase');
}

function startDrive(isRace = false) {
  if (isRace !== true) raceRun = false;          // the START button: a practice / solo trip
  audio.init();
  music.attach(audio.ctx);
  voice.init(audio.ctx, audio.master, () => audio.muted);
  audio.resume();
  saveSettings();
  if (IS_TOUCH) {
    // full screen + landscape on phones (ignored where the browser doesn't allow it)
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  applyQuality();
  if (traffic.list.length !== settings.traffic || traffic.opCount !== OPERATORS.length) {
    for (const v of traffic.list) scene.remove(v.wrap);
    traffic = new Traffic(route, scene, settings.traffic, settings.op.id, audio, facilities.gates); traffic.camera = camera;
    traffic.opCount = OPERATORS.length;
    linkTraffic();
  }
  restartTrip();
  camera.clearViewOffset();
  rig.setMode('chase');
  $('menu').style.display = 'none';
  hud.show(true);
  state = 'drive';
  if (music.auto && music.tracks.length && !music.playing) music.play();
  updateMusicBox();
  perf.t = 0; perf.n = 0; perf.warm = 0; perf.slow = 0;
  const nm = (p, k) => p[k].split(' (')[0];
  const via = [...new Set(route.segs.map((g) => g.chain.ref))].join(', ');
  hud.toast(`<span class="bn">${settings.op.bn}</span> · ${BUS_TYPES[settings.type].name}${speedUnlocked() ? ' · ⚡ 160 km/h' : ''}<br><small>${nm(route.startPlace, 'en')} → ${nm(route.endPlace, 'en')} via ${via}. Drive on the LEFT.${IS_TOUCH ? ' Turn the wheel, hold GAS / BRAKE.' : ' Mirrors: V · Refuel: F'}</small>`, 'good', 5000);
  voice.say('helper.depart', { place: nm(route.endPlace, 'bn').split(' ')[0], placeEn: nm(route.endPlace, 'en') });
}

// ---------- automatic graphics reduction on slow devices ----------
const perf = { t: 0, n: 0, steps: 0, warm: 0, slow: 0 };
function autoPerf(dt) {
  // only when the player hasn't picked a Graphics level, and not in the first seconds (shader compiling and loading stutter)
  if (settings.qualityManual) return;
  perf.warm += dt;
  if (perf.warm < 10) return;
  // (a single long frame — a turn at a junction rebuilding the road, a block of town loading — is not a slow
  // device: it is left out, so only steady slowness counts)
  // (the frame's real length: the game's dt is capped at 50 ms)
  const now = performance.now(), raw = perf.last ? (now - perf.last) / 1000 : dt;
  perf.last = now;
  if (raw > 0.15) return;
  perf.t += raw; perf.n++;
  if (perf.t < 4) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  // A steady ~30 fps is the browser's own cap (iPhone Low Power Mode and the like); lower graphics wouldn't help.
  // Only a device that stays well below that for 12 s gets lighter settings.
  perf.slow = fps < 26 ? perf.slow + 1 : 0;
  if (perf.slow < 3 || perf.steps >= 3) return;
  perf.slow = 0; perf.steps++;
  const floor = IS_TOUCH ? 1.0 : 0.75;
  if (renderer.getPixelRatio() > floor) {
    renderer.setPixelRatio(Math.max(floor, renderer.getPixelRatio() - 0.25));
    renderer.setSize(innerWidth, innerHeight);
  } else if (sky.sun.shadow.mapSize.x > 1024) {
    sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null;
  }
  if (perf.steps === 2 && mirrors.hudOn) { mirrors.hudOn = false; perf.mirrorsOff = true; }
  const gb = document.getElementById('gfx-btn');
  if (gb) gb.textContent = '🖥 Auto ↓';
  hud.toast(`Graphics lowered for smoother driving (${Math.round(fps)} fps) · press <b>I</b> (or 🖥) to pick your own`, '', 4000);
}

// ---------- racing with friends ----------
let raceT = 0, raceMapT = 0;
function raceRemainKm() { return route ? Math.max(0, route.totalKm - route.realKm(player.s)) : 0; }
function raceFrame(dt) {
  if (!race.code) { if (raceRun) raceRun = false; raceUI?.board(false); return; }
  const ph = player.phys, sending = raceRun && race.inRace && (state === 'drive' || state === 'paused' || state === 'arrived');
  race.update(dt, { bus: player.bus, phys: ph, remainKm: raceRemainKm(), night: sky.night, camera, send: sending,
    flags: { head: player.lights, high: player.high, fog: player.fog, brake: ph.brake > 0.1 || input.handbrake, indL: player.indL, indR: player.indR, reverse: ph.gear < 0 } });
  if (raceRun) raceUI.countdown(race.countdown(), {
    onBeep: (go) => { audio.tick(true); if (go) setTimeout(() => audio.tick(false), 120); },
    onGo: () => { player.elapsed = 0; },
  });
  raceT -= dt;
  if (raceT <= 0) { raceT = 0.5; raceUI.board(raceRun && race.inRace && state !== 'menu', raceRemainKm()); }
  // the big map pauses your bus, but your friends keep driving: keep their dots moving
  raceMapT -= dt;
  if (bigmap.isOpen && race.inRace && raceMapT <= 0) { raceMapT = 0.5; bigmap.update(mapCtx()); }
}
// the host started the race (or started it again): everyone in the room goes to the start terminal
function startRace(room) {
  if (!room?.trip || !room.grid?.includes(race.you)) return;
  for (const id of ['arrival', 'pause', 'stats', 'about']) $(id).style.display = 'none';
  if (bigmap.isOpen) closeMap();
  settings.trip = { from: room.trip.from, to: room.trip.to };
  settings.mode = 'trip';
  raceRun = true;
  tripMenu?.render();
  changeTrip();
  startDrive(true);
  const s = Math.max(0, Math.round(race.countdown() / 1000));
  hud.toast(`🏁 Race ${race.code}: <span class="bn">${net.zillas.get(room.trip.from)?.bn} → ${net.zillas.get(room.trip.to)?.bn}</span><br><small>Starts in ${s} s — first bus to stop in the destination terminal wins</small>`, 'good', 5000);
}
// the room's route, for everyone but the host (the host's own menu choice is the room's route)
function applyRoomTrip() {
  const t = race.room?.trip;
  if (!t || race.isHost || state !== 'menu') return;
  if (settings.trip.from === t.from && settings.trip.to === t.to && settings.mode !== 'free') return;
  settings.trip = { from: t.from, to: t.to };
  settings.mode = 'trip';
  saveSettings();
  tripMenu?.render();
  clearTimeout(applyRoomTrip.t);
  applyRoomTrip.t = setTimeout(changeTrip, 250);
}
function initRace() {
  raceUI = initRaceUI({ race, net, me: raceMe, tripOf: (t) => { const p = net.trip(t.from, t.to); return p && { km: net.pathKm(p) }; } });
  race.on('room', applyRoomTrip);
  race.on('change', () => {
    // a fresh room (or a new host): the host's route becomes the race route
    if (race.isHost && race.connected && race.room?.phase !== 'race' && settings.mode !== 'free' && settings.trip.from !== '@here'
      && (race.room?.trip?.from !== settings.trip.from || race.room?.trip?.to !== settings.trip.to)) race.setTrip(settings.trip);
  });
  race.on('start', startRace);
  race.on('results', () => raceUI.renderResults());
  // an invite link (?race=CODE)
  const code = new URLSearchParams(location.search).get('race');
  if (code) {
    raceUI.prefill(code);
    if (localStorage.getItem(SAVE('name'))) raceUI.join();
    else document.getElementById('race-name')?.focus();
    $('race-box')?.scrollIntoView({ block: 'center' });
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
  const night = sky.night;
  const ph = player.phys;

  if (state === 'drive') {
    player.elapsed += dt;
    // odometer, in real km (each road counts its own real length, like the route's km)
    { const c = route.segAt(player.s).chain; player.odo = (player.odo || 0) + Math.abs(ph.v) * dt * (c.km / c.length); }
    player.crashCool -= dt;
    // game clock: 12 minutes per real minute, so a full Dhaka–Chattogram run takes most of a day
    player.clockMin += dt / 5;
    const hr = player.clockMin / 60;
    if (Math.abs(((hr % 24) + 24) % 24 - sky.hour) > 0.02) { sky.setHour(hr); applyNight(); }
    // two physics substeps for stability
    const raceHold = raceRun && race.countdown() > 0;       // on the grid, waiting for the green light
    for (let k = 0; k < 2; k++) {
      ph.update(dt / 2, { throttle: player.fuel > 0 && !player.refuelling && !(player.resting > 0) && !raceHold ? input.throttle : 0, brake: input.brake, steer: input.steer, handbrake: input.handbrake || player.refuelling || player.resting > 0 || raceHold });
      constrain(dt / 2);
    }
    placeBusModel(dt);
    junctionLogic();
    extendFree();
    tollLogic(dt);
    fuelLogic(dt);
    ferryLogic();
    voiceLogic(dt);
    passengers.update(dt, input);
    police?.update(dt, input, sky.hour);
    restLogic(dt);
    indicatorLogic(dt);
    facilities.update(dt);
    updatePlayerBox();
    handleCrashes(traffic.update(dt, player, night, sky.hour > 17.4 || sky.hour < 6.4 || (player.weather?.fog ?? 0) > 0.45 || (player.weather?.rain ?? 0) > 0.6));   // lights on in fog / heavy rain
    audio.horn(input.horn);
    player.blinkT += dt;
    const blink = (player.blinkT % 0.8) < 0.4;
    if (blink !== player.blink && (player.indL || player.indR)) audio.tick(blink);
    player.blink = blink;
    setBusLights(player.bus, { head: player.lights, high: player.high, fog: player.fog, brake: ph.brake > 0.1 || input.handbrake, indL: player.indL && blink, indR: player.indR && blink, reverse: ph.gear < 0, night });
    beams();
    audio.update({ rpm: ph.rpm, throttle: ph.throttle, speed: Math.abs(ph.v), cabin: rig.mode === 'cabin', braking: ph.brake > 0.1 });
    aicams.update(dt, aiCamVehicles(true), onAICam);
    events(dt);
    rig.update(dt, player.bus, ph, input, player.s);
    player.bus.cabinLed.emissiveIntensity = night ? 1.2 : 0.3;
    player.bus.dashLight.intensity = night && rig.mode === 'cabin' ? 0.8 : 0;
    $('dashbox').style.display = rig.mode === 'cabin' ? 'none' : 'block';
    $('seat-btn').style.display = rig.mode === 'cabin' ? 'block' : 'none';
    if (rig.mode !== 'cabin' && $('seat').style.display === 'block') $('seat').style.display = 'none';
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 1 / 15;
      const kmh = Math.abs(ph.v) * 3.6;
      const clock = clockText(player.clockMin);
      const st = {
        s: player.s, x: ph.pos.x, z: ph.pos.z, yaw: ph.yaw, kmh, rpm: ph.rpm, gear: ph.gearLabel(),
        elapsed: player.elapsed, odo: player.odo || 0, fines: player.fines, crashes: player.crashes, rating: player.rating,
        place: route.placeAt(player.s), clock, camLabel: rig.label(), indL: player.indL, indR: player.indR, blink,
        lights: player.lights, high: player.high, fog: player.fog, cruise: ph.cruise != null, cruiseKmh: (ph.cruise || 0) * 3.6, traffic: traffic.list,
        side: player.side, heading: player.heading, fuel: player.fuel, tank: TANK_LITRES, costs: player.fuelCost + player.tollCost, mirrorsHud: mirrors.hudOn,
        friends: race.friends(),
      };
      hud.update(st);
      if (rig.mode === 'cabin') drawGauges(player.bus, { kmh, rpm: ph.rpm, gear: st.gear, cruise: st.cruise, lights: player.lights, high: player.high, fog: player.fog, indL: player.indL && blink, indR: player.indR && blink, limit: SPEED_LIMIT, odo: route.realKm(player.s), fuel: player.fuel / TANK_LITRES, temp: 0.45 + ph.throttle * 0.1, clock });
    }
  } else if (state === 'menu') {
    // showroom orbit with the bus on the right half of the screen
    menuT += dt;
    traffic.update(dt, player, night, sky.hour > 17.4 || sky.hour < 6.4);
    aicams.update(dt, aiCamVehicles(false));
    setBusLights(player.bus, { head: player.lights, high: player.high, fog: player.fog, night });
    beams();
    const c = player.bus.root.position.clone().add(new THREE.Vector3(Math.sin(ph.yaw) * player.bus.spec.center, 0, Math.cos(ph.yaw) * player.bus.spec.center));
    const a = ph.yaw - 2.4 - Math.sin(menuT * 0.12) * 0.9;     // from the road side of the bay, not through the terminal building
    camera.position.set(c.x + Math.sin(a) * 17, c.y + 3.2, c.z + Math.cos(a) * 17);
    camera.lookAt(c.x, c.y + 1.6, c.z);
    camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
  } else if (state === 'arrived' || state === 'paused') {
    if (state === 'arrived') rig.update(dt, player.bus, ph, input, player.s);
  }

  raceFrame(dt);
  const focus = player.bus.root.position;
  stream.update(player.s, player.side < 0 ? 1 : -1);
  netRoads.update(player.phys.pos.x, player.phys.pos.z, dt);
  chunks.update(player.s);
  weather?.update(dt, { camera, player, cabin: rig.mode === 'cabin' && state !== 'menu', hour: sky.hour, speed: Math.abs(player.phys.v), running: state !== 'paused' });
  sky.update(dt, focus, camera);
  scenery.update(dt, focus);
  const driving = state === 'drive' || state === 'arrived';
  const cabin = rig.mode === 'cabin';
  if (driving) {
    player.bus.root.updateMatrixWorld(true);
    const eye = player.bus.driver.clone().add(rig.seatLocal()).applyMatrix4(player.bus.body.matrixWorld);
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
  await msg('Loading your music…');
  await music.load();
  await msg('Tracing the roads from real coordinates…');
  net = new Network();
  net.services(SERVICES);
  chunks = new Chunks();
  applyQualityBase();
  await msg('Lighting the sky…');
  sky = new SkySystem(renderer, scene, QUALITY[settings.quality] || QUALITY.high);
  mirrors = new Mirrors(renderer, scene);
  if (mirrors_defaultOff) { mirrors.hudOn = false; mirrors.lowRes = true; }
  await msg('Laying out the trip…');
  buildWorld(tripPath());
  weather = new Weather({ scene, sky, route, audio, hud, road, quality: settings.quality, isTouch: IS_TOUCH });
  rig = new CameraRig(camera, route);
  initSeatPanel();
  initMusicUI();
  applySeat();
  await msg('Painting the buses…');
  createPlayerBus();
  traffic = new Traffic(route, scene, settings.traffic, settings.op.id, audio, facilities.gates); traffic.camera = camera;
  traffic.opCount = OPERATORS.length;
  linkTraffic();
  traffic.init(player.s);
  await msg('Paving the road, planting paddy, palms and villages…');
  stream.buildNow(player.s, 1); netRoads.buildNow(player.phys.pos.x, player.phys.pos.z);
  mirrors.layoutHUD(innerWidth, innerHeight);
  setTime(settings.time);
  buildMenu();
  initRace();
  // warm up: compile shaders before showing the menu
  renderer.compile(scene, camera);
  $('loading').style.display = 'none';
  $('menu').style.display = 'block';
  state = 'menu';
  requestAnimationFrame(frame);
  console.info(`[mohasorok] route ${(route.length / 1000).toFixed(1)} km game, ${route.places.length} places, ${route.bridges.length} bridges`);
  window.__game = { get route() { return route; }, player, get traffic() { return traffic; }, scene, renderer, settings, toBn, setTime,
    teleport(s, d = ROAD.laneCenters[0]) { resetPlayer(s, d); stream.buildNow(s, d < 0 ? 1 : -1); netRoads.buildNow(player.phys.pos.x, player.phys.pos.z); traffic.init(s); }, get stream() { return stream; }, get netRoads() { return netRoads; }, get net() { return net; }, get facilities() { return facilities; }, get mirrors() { return mirrors; }, get rig() { return rig; }, get aicams() { return aicams; }, get passengers() { return passengers; },
    // debug: which meshes are under screen pixel (px, py)
    pick(px, py) {
      const rc = new THREE.Raycaster(), cam = rig.camera;
      rc.setFromCamera(new THREE.Vector2(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1), cam);
      return rc.intersectObject(scene, true).filter((h) => h.object.isMesh || h.object.isLine).slice(0, 4).map((h) => {
        const o = h.object, gp = o.geometry.parameters || {};
        return `${h.distance.toFixed(2)} ${o.geometry.type}${JSON.stringify(gp).slice(0, 60)} col=${o.material.color?.getHexString()} side=${o.material.side} vis=${o.visible} parent=${o.parent === player.bus.interior ? 'interior' : o.parent?.type} type=${o.type} name=${o.name}`;
      });
    } };
}
let mirrors_defaultOff = false;
function applyQualityBase() {
  const q0 = QUALITY[settings.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? q0.touchPR : q0.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
}

boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = 'Error: ' + e.message;
});
