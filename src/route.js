import * as THREE from 'three';
import { WAYPOINTS, MAP_SCALE, ROAD, REAL_ROUTE_KM, FUEL_STATIONS, UTURN_SPACING, UTURN_GAP } from './config.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The N1 centreline as a uniformly sampled polyline (one sample every DS metres).
export class Route {
  constructor() {
    const lat0 = WAYPOINTS.reduce((a, w) => a + w.lat, 0) / WAYPOINTS.length;
    const lon0 = WAYPOINTS.reduce((a, w) => a + w.lon, 0) / WAYPOINTS.length;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320 * MAP_SCALE;
    const kz = 110540 * MAP_SCALE;
    const wp = WAYPOINTS.map((w) => new THREE.Vector2((w.lon - lon0) * kx, -(w.lat - lat0) * kz));

    // add gentle real-road-like bends between waypoints
    const ctrl = [];
    let acc = 0;
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i], b = wp[i + 1];
      const seg = a.distanceTo(b);
      const n = Math.max(2, Math.round(seg / 320));
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector2(-dir.y, dir.x);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const g = acc + seg * t;
        const wig = (Math.sin(g / 610) * 38 + Math.sin(g / 233 + 1.3) * 12 + Math.sin(g / 1370 + 0.4) * 55) * Math.sin(Math.PI * t);
        const p = a.clone().lerp(b, t).addScaledVector(perp, wig);
        ctrl.push(new THREE.Vector3(p.x, 0, p.y));
      }
      acc += seg;
    }
    const last = wp[wp.length - 1];
    ctrl.push(new THREE.Vector3(last.x, 0, last.y));

    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const dense = curve.getPoints(ctrl.length * 60);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
    this.length = cum[cum.length - 1];
    this.DS = 2;
    const N = Math.floor(this.length / this.DS) + 1;
    this.N = N;
    this.px = new Float64Array(N);
    this.pz = new Float64Array(N);
    this.tx = new Float64Array(N);
    this.tz = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.DS;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      this.px[i] = dense[j].x + (dense[j + 1].x - dense[j].x) * f;
      this.pz[i] = dense[j].z + (dense[j + 1].z - dense[j].z) * f;
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    this.length = (N - 1) * this.DS;

    // places along the road
    this.bridges = [];
    this.places = WAYPOINTS.map((w, i) => ({ ...w, index: i, s: this.project(wp[i].x, wp[i].y).s }));
    this.places[0].s = 0;
    this.places[this.places.length - 1].s = this.length;

    // bridges
    this.bridges = [];
    for (const p of this.places) {
      if (!p.river) continue;
      const sc = THREE.MathUtils.clamp(p.s + p.river.offset, 600, this.length - 600);
      const half = p.river.width / 2 + 30;
      this.bridges.push({ ...p.river, sc, s0: sc - half, s1: sc + half });
    }
    const toll = this.places.find((p) => p.toll);
    this.tollS = toll ? toll.s : -1e9;

    // fuel stations: a paved forecourt beside the road at road height
    this.stations = FUEL_STATIONS.map((f) => {
      let sc = f.f * this.length;
      while (this.bridgeAt(sc) || this.bridgeAt(sc - 80) || this.bridgeAt(sc + 80) || Math.abs(sc - this.tollS) < 200) sc += 120;
      return { ...f, sc, s0: sc - 45, s1: sc + 45, dIn: ROAD.half, dOut: ROAD.half + 30 };
    });
    // U-turn openings in the median
    this.uturns = [];
    for (let s = 1500; s < this.length - 800; s += UTURN_SPACING) {
      let u = s;
      while (this.bridgeAt(u) || this.bridgeAt(u + 200) || this.bridgeAt(u - 200) || Math.abs(u - this.tollS) < 300) u += 150;
      this.uturns.push({ s: u, s0: u - UTURN_GAP / 2, s1: u + UTURN_GAP / 2 });
    }

    // hills / sea ranges
    const hillStart = this.places.find((p) => p.hills);
    this.hillS0 = hillStart ? hillStart.s - 1500 : this.length + 1;
    const seaP = this.places.filter((p) => p.sea);
    this.seaS0 = seaP.length ? seaP[0].s - 2500 : this.length + 1;
    this.seaS1 = seaP.length ? seaP[seaP.length - 1].s + 1200 : -1;
  }

  // Sample index helpers
  _interp(s) {
    const t = THREE.MathUtils.clamp(s, 0, this.length) / this.DS;
    const i = Math.min(this.N - 2, Math.floor(t));
    return [i, t - i];
  }

  pointAt(s, d = 0, out = new THREE.Vector3()) {
    const [i, f] = this._interp(s);
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * f;
    const z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * f;
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * f;
    let tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * f;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    // extrapolate beyond the ends
    const ext = s < 0 ? s : s > this.length ? s - this.length : 0;
    // right = (-tz, tx)
    out.set(x - tz * d + tx * ext, this.heightAt(s, d), z + tx * d + tz * ext);
    return out;
  }

  tangentAt(s) {
    const [i, f] = this._interp(s);
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * f;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * f;
    const l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }

  yawAt(s) {
    const [tx, tz] = this.tangentAt(s);
    return Math.atan2(tx, tz);
  }

  // Closest point on the centreline. hint = previous sample index for a fast local search.
  project(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.N; i += 8) {
        const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
      hint = best;
    }
    const a = Math.max(0, hint - 60), b = Math.min(this.N - 1, hint + 60);
    bd = Infinity;
    for (let i = a; i <= b; i++) {
      const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    // refine on neighbouring segment
    let i0 = Math.max(0, Math.min(this.N - 2, best));
    const fx = x - this.px[i0], fz = z - this.pz[i0];
    let along = fx * this.tx[i0] + fz * this.tz[i0];
    if (along < 0 && i0 > 0) { i0--; along += this.DS; }
    const s = THREE.MathUtils.clamp(i0 * this.DS + along, -50, this.length + 50);
    const [tx, tz] = this.tangentAt(s);
    const p = this.pointAt(THREE.MathUtils.clamp(s, 0, this.length));
    const d = (x - p.x) * -tz + (z - p.z) * tx;
    return { s, d, index: best };
  }

  uturnAt(s) {
    for (const u of this.uturns) if (s > u.s0 && s < u.s1) return u;
    return null;
  }

  stationAt(s, d) {
    for (const st of this.stations) {
      if (s > st.s0 && s < st.s1 && Math.sign(d) === Math.sign(st.side) && Math.abs(d) > ROAD.half - 1 && Math.abs(d) < st.dOut) return st;
    }
    return null;
  }

  bridgeAt(s) {
    for (const b of this.bridges) if (s > b.s0 && s < b.s1) return b;
    return null;
  }

  // road surface height (centreline, with bridge ramps)
  roadHeight(s) {
    let h = ROAD.baseHeight;
    for (const b of this.bridges) {
      const up = smooth((s - (b.s0 - ROAD.rampLen)) / ROAD.rampLen);
      const down = smooth(((b.s1 + ROAD.rampLen) - s) / ROAD.rampLen);
      h = Math.max(h, ROAD.baseHeight + (ROAD.bridgeHeight - ROAD.baseHeight) * Math.min(up, down));
    }
    return h;
  }

  // height of the ground/road surface at (s, d)
  heightAt(s, d) {
    const h = this.roadHeight(s);
    const ad = Math.abs(d);
    if (ad <= ROAD.half) return h;
    if (this.bridgeAt(s)) return h; // off the deck there is nothing, the walls keep you on
    if (this.stationAt(s, d)) return h; // paved forecourt
    const t = (ad - ROAD.half) / ROAD.embank;
    return t >= 1 ? 0 : h * (1 - t);
  }

  realKm(s) {
    return (THREE.MathUtils.clamp(s, 0, this.length) / this.length) * REAL_ROUTE_KM;
  }

  // +1 if the right-hand side of the road is towards east at s, else -1
  eastSide(s) {
    // right = (-tz, tx) -> its x (east) component is -tz
    const [, tz] = this.tangentAt(s);
    return -tz >= 0 ? 1 : -1;
  }

  nextPlace(s) {
    return this.places.find((p) => p.s > s + 20) || this.places[this.places.length - 1];
  }

  placeAt(s) {
    for (const p of this.places) if (p.town && Math.abs(s - p.s) < p.town / 2 + 50) return p;
    return null;
  }
}
