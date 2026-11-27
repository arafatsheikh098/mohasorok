// Weather: monsoon rain and winter fog over the N1 trip.
//   kinds: clear / overcast / rain / heavy (rain) / fog. In 'auto' the weather changes by itself every few
//   minutes, weighted by the season (the real month: monsoon Jun–Sep, winter Nov–Feb); Y cycles auto → fixed kinds.
//   The look eases in and out: cloud cover darkens the sky and light (sky.setWeather), fog thickens the scene fog
//   (thickest at winter dawn and on the low Meghna–Daudkandi stretch), rain falls as GPU streaks around the camera,
//   the road gets wet (darker, glossier, less grip), drops gather on the windshield and the wipers clear them.
//   State for other systems: player.weather = { kind, rain, fog, wet, cloud, season, mode }.
import * as THREE from 'three';
import { setWipers } from '../busModel.js';
import { voice } from '../voice.js';

export const WEATHER_KINDS = ['clear', 'overcast', 'rain', 'heavy', 'fog'];
const MODES = ['auto', ...WEATHER_KINDS];
const STORE = 'mohasorok.weather';
// what each kind eases towards
const TARGET = {
  clear: { cloud: 0, rain: 0, fog: 0 },
  overcast: { cloud: 0.7, rain: 0, fog: 0.05 },
  rain: { cloud: 0.88, rain: 0.5, fog: 0.12 },
  heavy: { cloud: 1, rain: 1, fog: 0.25 },
  fog: { cloud: 0.35, rain: 0, fog: 0.85 },
};
const LABEL = {
  clear: ['☀️', 'রোদ', 'Clear'], overcast: ['☁️', 'মেঘলা', 'Overcast'], rain: ['🌧️', 'বৃষ্টি', 'Rain'],
  heavy: ['⛈️', 'ভারী বৃষ্টি', 'Heavy rain'], fog: ['🌫️', 'কুয়াশা', 'Fog'], auto: ['🔄', 'আবহাওয়া', 'Auto weather'],
};
// how likely each kind is in auto mode
const SEASON_W = {
  monsoon: { clear: 2, overcast: 3, rain: 4, heavy: 2.5, fog: 0.2 },
  winter: { clear: 5, overcast: 2, rain: 0.3, heavy: 0, fog: 3 },
  dry: { clear: 6, overcast: 2, rain: 1, heavy: 0.3, fog: 0.8 },
};
const RAIN_N = { high: 7000, medium: 4200, low: 2000 };
const BOX = new THREE.Vector3(46, 26, 46);      // rain box around the camera (m)
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (v, to, rate) => v + THREE.MathUtils.clamp(to - v, -rate, rate);

export class Weather {
  constructor({ scene, sky, route, audio, hud, road, quality = 'high', isTouch = false }) {
    this.scene = scene; this.sky = sky; this.route = route; this.audio = audio; this.hud = hud;
    this.mode = MODES.includes(localStorage.getItem(STORE)) ? localStorage.getItem(STORE) : 'auto';
    this.kind = 'clear'; this.shown = 'clear';
    this.cloud = 0; this.rain = 0; this.fog = 0; this.fogEff = 0; this.wet = 0;
    this.season = 'dry';
    this.timer = 0; this.flash = 0; this.flashT = 20; this.flashSeq = [];
    this.wiperPhase = 0; this.wiperPause = 0; this.wiperRun = false;
    this.setRoute(route);
    // wet road: the materials we darken and make glossy
    this.wetMats = ['asphalt', 'plaza', 'bridgeConcrete'].map((k) => road?.mats?.[k]).filter(Boolean)
      .map((m) => ({ m, rough: m.roughness, col: m.color.clone() }));
    this._buildRain(Math.round((RAIN_N[quality] || RAIN_N.high) * (isTouch ? 0.6 : 1)));
    this._buildDropSprite();
    this.reset(12);
    window.__weather = this;      // debug handle, like window.__game
  }

  // a new trip corridor: find its river-fog stretch again
  setRoute(route) {
    this.route = route;
    // the low stretch between the Meghna bridge and Daudkandi: river fog
    const meghna = route.places.find((p) => p.en === 'Meghna Bridge'), daud = route.places.find((p) => p.en === 'Daudkandi');
    this.zone = meghna && daud ? [Math.min(meghna.s, daud.s) - 700, Math.max(meghna.s, daud.s) + 300] : null;
  }

  // ------------------------------------------------------------ rain streaks (all motion on the GPU)
  _buildRain(n) {
    this.rainN = n;
    const seed = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      seed.set([x, y, z, 0, x, y, z, 1], i * 8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));   // unused, the shader places them
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setDrawRange(0, 0);
    this.rainU = {
      time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: BOX.clone() }, speed: { value: 9 },
      wind: { value: new THREE.Vector2(1.2, 0.4) }, len: { value: 0.75 }, bright: { value: 0.8 }, opacity: { value: 0.45 },
      busA: { value: new THREE.Vector4(0, 0, 0, 1) }, busB: { value: new THREE.Vector3(0, 0, -1e6) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
        attribute vec4 seed;
        uniform float time, speed, len; uniform vec3 cam, box; uniform vec2 wind; uniform vec4 busA; uniform vec3 busB;
        varying float vA;
        void main() {
          float sp = speed * (0.85 + 0.3 * seed.x);
          vec3 p;
          p.x = cam.x + mod(seed.x * box.x - cam.x + time * wind.x, box.x) - box.x * 0.5;
          p.z = cam.z + mod(seed.z * box.z - cam.z + time * wind.y, box.z) - box.z * 0.5;
          p.y = cam.y + mod(seed.y * box.y - time * sp, box.y) - box.y * 0.35;
          vec3 vel = normalize(vec3(wind.x, -sp, wind.y));
          p -= vel * seed.w * len;                       // the top end of the streak trails behind
          // no rain inside the bus
          vec2 rel = p.xz - busA.xy;
          float along = dot(rel, busA.zw), across = dot(rel, vec2(busA.w, -busA.z));
          float inside = step(abs(along), busB.y) * step(abs(across), busB.x) * step(p.y, busB.z);
          float d = length(p - cam);
          vA = (1.0 - seed.w * 0.85) * (1.0 - smoothstep(14.0, 23.0, d)) * smoothstep(0.6, 2.0, d) * (1.0 - inside);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float bright, opacity; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.72, 0.78, 0.84) * bright, vA * opacity); }`,
    });
    this.rainMesh = new THREE.LineSegments(g, mat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 6;
    this.scene.add(this.rainMesh);
  }

  // ------------------------------------------------------------ windshield drops
  _buildDropSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.55, 'rgba(205,220,230,0.20)');
    g.addColorStop(0.82, 'rgba(25,35,45,0.50)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.arc(25, 23, 6, 0, Math.PI * 2); x.fill();
    this.sprite = c;
    this.drops = [];
  }

  // lay a drop canvas over this bus's windshield glass (same geometry, our own UVs)
  _attachGlass(bus) {
    if (this.glassBus === bus) return;
    this.glassBus = bus;
    if (this.glassMesh) { this.glassMesh.parent?.remove(this.glassMesh); this.glassMesh.geometry.dispose(); this.glassMesh = null; }
    let glass = null;
    bus?.exterior.traverse((o) => { if (o.userData.windshield) glass = o; });
    if (!glass) return;
    glass.updateMatrix();
    const geo = glass.geometry.clone(), pos = geo.attributes.position, v = new THREE.Vector3();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const pts = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(glass.matrix);
      pts.push(v.x, v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pts[i * 2] - minX) / (maxX - minX); uv[i * 2 + 1] = (pts[i * 2 + 1] - minY) / (maxY - minY); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const W = 512, H = Math.max(128, Math.round(512 * (maxY - minY) / (maxX - minX)));
    if (!this.dropCanvas || this.dropCanvas.height !== H) {
      this.dropCanvas = document.createElement('canvas'); this.dropCanvas.width = W; this.dropCanvas.height = H;
      this.dropCtx = this.dropCanvas.getContext('2d');
      this.dropTex?.dispose();
      this.dropTex = new THREE.CanvasTexture(this.dropCanvas);
      this.dropTex.colorSpace = THREE.SRGBColorSpace;
    }
    const mat = new THREE.MeshBasicMaterial({ map: this.dropTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(glass.position); m.quaternion.copy(glass.quaternion); m.scale.copy(glass.scale);
    m.renderOrder = 5;
    m.visible = false;
    glass.parent.add(m);
    this.glassMesh = m;
    this.gl = { minX, maxX, minY, maxY, W, H };
    this.drops = [];
  }

  _updateDrops(dt, bus, speed, cabin) {
    const gl = this.gl;
    if (!gl || !this.glassMesh) return;
    const { W, H } = gl;
    // new drops: more when it rains harder and when driving into it
    const spawn = this.rain * dt * (70 + speed * 7);
    let n = Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0);
    while (n-- > 0 && this.drops.length < 420) {
      this.drops.push({ x: Math.random() * W, y: Math.random() * H, r: 2.5 + Math.random() * (this.rain > 0.6 ? 7 : 5), slide: Math.random() });
    }
    for (const d of this.drops) {
      if (speed > 9) d.y -= (speed - 9) * dt * 9 * (0.5 + d.slide);            // the wind pushes them up the glass
      else if (d.r > 5.5) d.y += dt * 14 * d.slide;                             // big ones run down when parked
    }
    // wipers wipe what their blades pass over since the last frame
    const sx = (gl.maxX - gl.minX) / W, sy = (gl.maxY - gl.minY) / H;
    for (const w of bus.wipers || []) {
      const info = w.userData.wiper, th = w.rotation.z, th0 = w.userData.prevTh ?? th;
      w.userData.prevTh = th;
      if (Math.abs(th - th0) < 1e-4) continue;
      const lo = Math.min(th, th0) - 0.05, hi = Math.max(th, th0) + 0.05, reach = info.len * w.scale.y + 0.05;
      this.drops = this.drops.filter((d) => {
        const dx = gl.minX + d.x * sx - info.px, dy = gl.maxY - d.y * sy - info.py;
        const r = Math.hypot(dx, dy);
        if (r < 0.05 || r > reach) return true;
        const phi = Math.atan2(-dx, dy);
        return phi < lo || phi > hi;
      });
    }
    this.drops = this.drops.filter((d) => d.y > -10 && d.y < H + 10);
    // drying: without rain the small drops slowly go
    if (this.rain < 0.02 && this.drops.length && Math.random() < dt * 2) this.drops.splice(Math.floor(Math.random() * this.drops.length), 1);
    this.glassMesh.visible = this.drops.length > 0 && cabin;
    this.dropAcc = (this.dropAcc || 0) + dt;
    if (!this.glassMesh.visible || this.dropAcc < 1 / 24) return;
    this.dropAcc = 0;
    const x = this.dropCtx;
    x.clearRect(0, 0, W, H);
    for (const d of this.drops) x.drawImage(this.sprite, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    this.dropTex.needsUpdate = true;
  }

  // wipers: fast in heavy rain, slower in rain, intermittent in a drizzle; they park when it stops
  _updateWipers(dt, bus) {
    const r = this.rain, wantOn = r > 0.03 || (this.drops.length > 25 && r > 0);
    const hz = r > 0.6 ? 0.95 : r > 0.2 ? 0.65 : 0.55;
    if (this.wiperPause > 0) { this.wiperPause -= dt; if (!wantOn) this.wiperPause = 0; return; }
    if (!wantOn && !this.wiperRun) { setWipers(bus, 0); return; }
    this.wiperRun = true;
    const before = this.wiperPhase;
    this.wiperPhase += dt * hz;
    if (Math.floor(this.wiperPhase) !== Math.floor(before)) {        // a full sweep and back
      this.wiperPhase = Math.floor(this.wiperPhase);
      if (!wantOn) { this.wiperRun = false; setWipers(bus, 0); return; }
      if (r < 0.2) this.wiperPause = 2.6;                            // intermittent
    }
    setWipers(bus, Math.sin(this.wiperPhase * Math.PI * 2));
  }

  // ------------------------------------------------------------ state
  _pickSeason() {
    const m = new Date().getMonth();
    const real = m >= 5 && m <= 8 ? 'monsoon' : m >= 10 || m <= 1 ? 'winter' : 'dry';
    const all = Object.keys(SEASON_W);
    return Math.random() < 0.7 ? real : all[Math.floor(Math.random() * all.length)];
  }
  _pickKind() {
    const w = SEASON_W[this.season];
    let sum = 0; for (const k of WEATHER_KINDS) sum += w[k];
    let x = Math.random() * sum;
    for (const k of WEATHER_KINDS) { x -= w[k]; if (x <= 0) return k; }
    return 'clear';
  }

  // a new trip: new season draw, weather starts settled (no slow fade-in)
  reset(hour) {
    this.season = this._pickSeason();
    this.kind = this.mode === 'auto' ? this._pickKind() : this.mode;
    this.timer = 120 + Math.random() * 180;
    const t = TARGET[this.kind];
    this.cloud = t.cloud; this.rain = t.rain; this.fog = t.fog;
    this.wet = t.rain > 0.1 ? 0.8 : 0;
    this.drops = [];
    this.announced = null;
    this.hour = hour;
    this._apply(0, hour, null);
  }

  // Y: auto → clear → overcast → rain → heavy → fog → auto
  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    localStorage.setItem(STORE, this.mode);
    if (this.mode === 'auto') { this.kind = this._pickKind(); this.timer = 120 + Math.random() * 180; } else this.kind = this.mode;
    const [ic, bn, en] = LABEL[this.mode];
    this.hud?.toast(`${ic} <span class="bn">${bn}</span> — ${en}${this.mode === 'auto' ? ` (${this.season})` : ''} <small>(Y: weather)</small>`, '', 2600);
    return this.mode;
  }

  // fog that the place and the hour add: winter dawn, and the river stretch by the Meghna
  _fogAt(s, hour) {
    const dawn = smooth(4.3, 6.0, hour) * (1 - smooth(8.0, 9.8, hour));
    let f = Math.max(this.fog, dawn * (this.season === 'winter' ? 0.8 : this.cloud > 0.3 ? 0.25 : 0.1));
    if (this.zone) {
      const z = smooth(this.zone[0] - 300, this.zone[0], s) * (1 - smooth(this.zone[1], this.zone[1] + 300, s));
      f = f * (1 + 0.7 * z) + z * (this.season === 'winter' ? 0.25 : 0.08) * (dawn > 0.2 || this.fog > 0.2 ? 1 : 0.4);
    }
    return Math.min(1, f);
  }

  _apply(dt, hour, s) {
    this.fogEff = this._fogAt(s ?? 0, hour);
    this.sky.setWeather({ cloud: this.cloud, fog: this.fogEff });
    for (const w of this.wetMats) {
      w.m.roughness = w.rough * (1 - 0.62 * this.wet);
      w.m.color.copy(w.col).multiplyScalar(1 - 0.38 * this.wet);
    }
  }

  // ctx: { camera, player, cabin, hour, speed, running }
  update(dt, { camera, player, cabin = false, hour = 12, speed = 0, running = true }) {
    if (!running) dt = 0;
    // auto weather moves on every few minutes
    if (this.mode === 'auto' && dt > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.kind = this._pickKind(); this.timer = 150 + Math.random() * 210; }
    }
    const t = TARGET[this.kind];
    this.cloud = ease(this.cloud, t.cloud, dt / 40);
    // rain waits for the clouds; it stops faster than it starts
    const rainTo = this.cloud > t.cloud - 0.15 ? t.rain : 0;
    this.rain = ease(this.rain, rainTo, dt / (rainTo > this.rain ? 25 : 15));
    this.fog = ease(this.fog, t.fog, dt / 35);
    this.wet = THREE.MathUtils.clamp(this.wet + (this.rain > 0.08 ? this.rain * dt / 30 : -dt / 240), 0, 1);
    const s = player?.s ?? 0;
    this._apply(dt, hour, s);

    // lightning in heavy rain
    if (this.rain > 0.7 && dt > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 12 + Math.random() * 25;
        const power = 0.6 + Math.random() * 0.4;
        this.flashSeq = [[0, power], [0.09, 0], [0.16, power * 0.7], [0.32, 0]];
        this.flashClock = 0;
        this.audio?.thunder(0.6 + Math.random() * 2.4, power);
      }
    }
    if (this.flashSeq.length) {
      this.flashClock += dt;
      while (this.flashSeq.length && this.flashSeq[0][0] <= this.flashClock) this.flash = this.flashSeq.shift()[1];
    } else this.flash = Math.max(0, this.flash - dt * 6);
    this.sky.wx.flash = this.flash;

    // rain streaks
    const u = this.rainU;
    u.time.value += dt;
    if (camera) u.cam.value.copy(camera.position);
    u.speed.value = 8 + this.rain * 3;
    u.wind.value.set(1 + this.rain * 2.5, 0.4 + this.rain);
    u.len.value = 0.55 + this.rain * 0.45;
    u.opacity.value = 0.32 + this.rain * 0.22;
    const P = this.sky.preset;
    u.bright.value = THREE.MathUtils.clamp((P?.hemi ?? 0.4) * 1.6 + (P?.sun ?? 1) * 0.08, 0.18, 1) + this.flash * 0.8;
    const bus = player?.bus;
    if (bus) {
      const ph = player.phys, sp = bus.spec;
      const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw);
      u.busA.value.set(ph.pos.x + fx * sp.center, ph.pos.z + fz * sp.center, fx, fz);
      u.busB.value.set(sp.W / 2 + 0.15, sp.L / 2 + 0.2, bus.root.position.y + sp.H + 0.3);
    }
    this.rainMesh.geometry.setDrawRange(0, 2 * Math.round(this.rainN * Math.min(1, this.rain * 1.1)));
    this.rainMesh.visible = this.rain > 0.005;

    // windshield, wipers, sound
    if (bus) {
      this._attachGlass(bus);
      this._updateWipers(dt, bus);
      this._updateDrops(dt, bus, speed, cabin);
      if (player.phys) player.phys.grip = 1 - 0.25 * this.wet;
    }
    this.audio?.rain(running ? this.rain : 0, cabin);

    // what it looks like now, for the HUD / other systems, with a heads-up when it turns
    const shown = this.rain > 0.6 ? 'heavy' : this.rain > 0.12 ? 'rain' : this.fogEff > 0.45 ? 'fog' : this.cloud > 0.5 ? 'overcast' : 'clear';
    if (shown !== this.shown && dt > 0) {
      const was = this.shown;
      this.shown = shown;
      if ((shown === 'rain' || shown === 'heavy') && was !== 'rain' && was !== 'heavy') {
        voice.say('helper.rain');
        this.hud?.toast(`${LABEL[shown][0]} <span class="bn">${LABEL[shown][1]}</span> — wet road: brake earlier, keep your distance`, 'bad', 3800);
      } else if (shown === 'fog') {
        voice.say('helper.fog');
        this.hud?.toast('🌫️ <span class="bn">কুয়াশা</span> — fog ahead: headlights on (L), slow down', 'bad', 3800);
      }
    }
    if (player) {
      player.weather = { kind: shown, rain: +this.rain.toFixed(3), fog: +this.fogEff.toFixed(3), wet: +this.wet.toFixed(3), cloud: +this.cloud.toFixed(3), season: this.season, mode: this.mode };
    }
  }
}
