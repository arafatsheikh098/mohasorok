import { ROAD, SPEED_LIMIT } from './config.js';
import { BN_FONT, EN_FONT } from './textures.js';
import { project, unproject } from './net.js';
import { taka, fmtDuration } from './career.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(route, water) {
    this.route = route;
    this.gps = $('gps');
    this.gx = this.gps.getContext('2d');
    this.dash = $('dash');
    this.dx = this.dash.getContext('2d');
    this.toasts = $('toasts');
    // GPS polyline every 10 m
    this.pts = [];
    for (let s = 0; s <= route.length; s += 10) {
      const p = route.pointAt(s, 0);
      this.pts.push([p.x, p.z]);
    }
    this.rivers = water.rivers.map((r) => ({ pts: r.pts.map((p) => [p.x, p.z]), w: r.width }));
    // the other roads of the network (rough lines through their towns), for the minimap and the big map
    this.net = route.net;
    this.roads = [...route.net.roads.values()].filter((c) => !c.def.link).map((c) => {
      const pts = c._stops.map((p) => { const v = project(p.lat, p.lon); return [v.x, v.y]; });
      const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
      return { c, pts, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
    });
    this.onTrip = new Set(route.path.map((p) => p.road));
    this.markers = [
      ...route.stations.map((st) => ({ p: route.pointAt(st.sc, st.side * 16), icon: '⛽', col: '#ffb300' })),
      ...route.rests.map((r) => ({ p: route.pointAt(r.sc, r.side * 20), icon: '🍛', col: '#ff7043' })),
      ...route.uturns.map((u) => ({ p: route.pointAt(u.s, 0), icon: 'U', col: '#4aa3ff' })),
      ...route.tolls.map((t) => ({ p: route.pointAt(t.s, 0), icon: '৳', col: '#ff5252' })),
    ];
  }

  // extra minimap markers (bus counters etc.): [{ p: Vector3, icon, col }]
  addMarkers(list) { this.markers.push(...list); }

  // On-screen messages stay out of the driver's way: at most 2 at once (the oldest goes first),
  // the same message is never stacked twice, and none stays longer than 3 s.
  toast(html, cls = '', ms = 3200) {
    const live = [...this.toasts.children].filter((t) => !t.classList.contains('out'));
    if (live.some((t) => t.dataset.html === html)) return;
    while (live.length >= 2) { const old = live.shift(); old.classList.add('out'); setTimeout(() => old.remove(), 500); }
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = html;
    el.dataset.html = html;
    this.toasts.appendChild(el);
    ms = Math.min(ms, 3000);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  show(on) { $('hud').style.display = on ? 'block' : 'none'; }

  update(st) {
    const { route } = this;
    const back = st.side > 0;
    const km = back ? route.realKm(st.s) : route.realKm(route.length) - route.realKm(st.s);
    const next = back ? ([...route.places].reverse().find((p) => p.s < st.s - 20) || route.places[0]) : route.nextPlace(st.s);
    const nextKm = Math.abs(route.realKm(next.s) - route.realKm(st.s));
    const road = route.segAt(st.s).chain, nm = (p) => p.bn.split(' (')[0];
    const [A, B] = back ? [route.endPlace, route.startPlace] : [route.startPlace, route.endPlace];
    const label = `<span class="bn">${nm(A)} → ${nm(B)}</span>${road.ref ? ` · ${road.ref}` : ''}`;
    if (label !== this._label) { this._label = label; document.querySelector('#trip .route').innerHTML = label; }
    const ff = st.fuel / st.tank;
    $('trip-fuel').textContent = `${Math.round(ff * 100)}% · ${Math.round(st.fuel)} L`;
    $('trip-fuel').style.color = ff < 0.15 ? '#ff5252' : '';
    $('trip-costs').textContent = `৳ ${Math.round(st.costs).toLocaleString('en-IN')}`;
    $('fuel-fill').style.width = `${ff * 100}%`;
    $('fuel-fill').style.background = ff < 0.15 ? '#ff5252' : '#ffb300';
    $('hud-il').classList.toggle('on', st.indL && st.blink);
    $('hud-ir').classList.toggle('on', st.indR && st.blink);
    $('trip-remaining').textContent = `${km.toFixed(1)} km`;
    $('trip-next').innerHTML = `<span class="bn">${next.bn}</span> · ${nextKm.toFixed(0)} km`;
    $('trip-time').textContent = fmtTime(st.elapsed);
    const avg = st.elapsed > 1 ? route.realKm(st.s) / (st.elapsed / 3600) : 0;
    $('trip-eta').textContent = st.kmh > 5 ? fmtTime((back ? st.s : route.length - st.s) / Math.max(8, st.kmh / 3.6)) : '--:--';
    $('trip-fines').textContent = `৳ ${st.fines.toLocaleString('en-IN')}`;
    $('trip-crashes').textContent = String(st.crashes);
    $('trip-rating').textContent = '★'.repeat(Math.round(st.rating)) + '☆'.repeat(5 - Math.round(st.rating));
    $('place-now').innerHTML = st.place ? `<span class="bn">${st.place.bn}</span><small>${st.place.en}</small>` : `<small>${road.ref} ${road.en || ''}</small>`;
    $('clock').textContent = st.clock;
    $('cam-label').textContent = st.camLabel;
    $('speed-big').textContent = Math.round(st.kmh);
    $('speed-big').classList.toggle('over', st.kmh > SPEED_LIMIT + 3);
    $('gear').textContent = st.gear;
    $('ind-l').classList.toggle('on', st.indL && st.blink);
    $('ind-r').classList.toggle('on', st.indR && st.blink);
    $('ind-lights').classList.toggle('on', st.lights);
    $('ind-lights').classList.toggle('high', st.lights && st.high);
    $('ind-lights').textContent = st.lights && st.high ? 'HIGH' : 'LIGHTS';
    $('ind-fog').classList.toggle('on', st.fog);
    $('ind-cruise').classList.toggle('on', st.cruise);
    $('ind-cruise').textContent = st.cruise ? `CRUISE ${Math.round(st.cruiseKmh)}` : 'CRUISE';
    void avg;
    this.drawGPS(st);
    this.drawDash(st);
  }

  drawGPS(st) {
    const c = this.gps, g = this.gx;
    const W = c.width, H = c.height;
    const scale = 0.32 + Math.min(0.3, 6 / Math.max(6, st.kmh)) * 0.6; // zoom out at speed
    const cx = W / 2, cy = H * 0.68;
    const cos = Math.cos(st.yaw), sin = Math.sin(st.yaw);
    // world -> screen, heading up
    const T = (x, z) => {
      const dx = x - st.x, dz = z - st.z;
      // rotate so that forward (sin yaw, cos yaw) points up
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [cx - rx * scale, cy - rz * scale];
    };
    g.fillStyle = '#121a22';
    g.fillRect(0, 0, W, H);
    // other roads nearby
    const reach = (W / scale) * 1.2;
    g.strokeStyle = '#2c3640'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.roads) {
      if (this.onTrip.has(r.c.id)) continue;
      const [x0, z0, x1, z1] = r.box;
      if (st.x < x0 - reach || st.x > x1 + reach || st.z < z0 - reach || st.z > z1 + reach) continue;
      g.beginPath();
      r.pts.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.stroke();
    }
    // rivers
    g.strokeStyle = '#1f4a66';
    g.lineCap = 'round';
    for (const r of this.rivers) {
      g.lineWidth = Math.max(3, r.w * scale);
      g.beginPath();
      r.pts.forEach(([x, z], i) => { const [a, b] = T(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.stroke();
    }
    const i0 = Math.max(0, Math.floor(st.s / 10) - 120), i1 = Math.min(this.pts.length, Math.floor(st.s / 10) + 260);
    const pi = Math.floor(st.s / 10);
    g.lineJoin = 'round';
    // road base
    g.strokeStyle = '#3a4652';
    g.lineWidth = 9;
    g.beginPath();
    for (let i = i0; i < i1; i++) { const [a, b] = T(...this.pts[i]); i === i0 ? g.moveTo(a, b) : g.lineTo(a, b); }
    g.stroke();
    // planned route ahead
    g.strokeStyle = '#ff8a1c';
    g.lineWidth = 5;
    g.beginPath();
    if (st.side > 0) {
      for (let i = pi; i >= i0; i--) { const [a, b] = T(...this.pts[i]); i === pi ? g.moveTo(a, b) : g.lineTo(a, b); }
    } else {
      for (let i = Math.max(i0, pi); i < i1; i++) { const [a, b] = T(...this.pts[i]); i === Math.max(i0, pi) ? g.moveTo(a, b) : g.lineTo(a, b); }
    }
    g.stroke();
    g.font = `bold 12px ${EN_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of this.markers) {
      const [a, b] = T(m.p.x, m.p.z);
      if (a < -10 || b < -10 || a > W + 10 || b > H + 10) continue;
      g.fillStyle = '#0b1117'; g.beginPath(); g.arc(a, b, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = m.col; g.lineWidth = 2; g.stroke();
      g.fillStyle = m.col; g.fillText(m.icon, a, b + 1);
    }
    g.textBaseline = 'alphabetic';
    // traffic
    for (const v of st.traffic) {
      const [a, b] = T(v.wrap.position.x, v.wrap.position.z);
      if (a < 0 || b < 0 || a > W || b > H) continue;
      g.fillStyle = v.dir > 0 ? '#c9d3dc' : '#7c8a96';
      g.fillRect(a - 1.5, b - 1.5, 3, 3);
    }
    // town labels
    g.font = `600 13px ${BN_FONT}`;
    g.textAlign = 'center';
    for (const p of this.route.places) {
      const pt = this.route.pointAt(p.s, 0);
      const [a, b] = T(pt.x, pt.z);
      if (a < -40 || b < -20 || a > W + 40 || b > H + 20) continue;
      g.fillStyle = '#ffd27a';
      g.beginPath(); g.arc(a, b, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8eef3';
      g.fillText(p.bn.split(' (')[0], a, b - 8);
    }
    // player arrow
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#fff';
    g.strokeStyle = '#0b1117';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // vignette frame
    const grd = g.createRadialGradient(cx, H / 2, H * 0.3, cx, H / 2, W * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }

  drawDash(st) {
    const c = this.dash, g = this.dx;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const dial = (cx, cy, R, v, max, step, label, red) => {
      g.fillStyle = 'rgba(10,14,18,0.78)';
      g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.fill();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      if (red) {
        g.strokeStyle = '#c0392b'; g.lineWidth = 5;
        g.beginPath(); g.arc(cx, cy, R - 3, a0 + (red / max) * (a1 - a0), a1); g.stroke();
      }
      g.strokeStyle = '#dfe6ec';
      g.fillStyle = '#dfe6ec';
      g.font = `600 11px ${EN_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let k = 0; k <= max; k += step) {
        const a = a0 + (k / max) * (a1 - a0);
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
        g.fillText(String(max > 500 ? k / 1000 : k), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      }
      const a = a0 + Math.min(1.02, v / max) * (a1 - a0);
      g.strokeStyle = '#ff6a00'; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9aa6b0'; g.font = `600 10px ${EN_FONT}`;
      g.fillText(label, cx, cy + R * 0.5);
    };
    dial(78, 80, 66, st.kmh, 160, 20, 'km/h', SPEED_LIMIT);
    dial(222, 80, 66, st.rpm, 3000, 500, 'x1000 rpm', 2300);
  }

  // the big map (O): the whole country, the trip in orange, the bus as an arrow
  toggleBigMap(st) {
    let el = $('bigmap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bigmap';
      Object.assign(el.style, { position: 'fixed', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,8,11,.72)', zIndex: 15, pointerEvents: 'none' });
      el.innerHTML = '<canvas width="920" height="1100" style="height:min(92vh,1100px);background:#0e151c;border:1px solid rgba(255,255,255,.1);border-radius:12px"></canvas>';
      document.body.appendChild(el);
    }
    const on = el.style.display !== 'flex';
    el.style.display = on ? 'flex' : 'none';
    if (on) this.drawBigMap(st);
    return on;
  }
  drawBigMap(st) {
    const el = $('bigmap');
    if (!el || el.style.display !== 'flex') return;
    const c = el.querySelector('canvas'), g = c.getContext('2d'), W = c.width, H = c.height;
    const X = (lon) => 30 + (lon - 87.95) * 0.916 * 177 * 1.12, Y = (lat) => 24 + (26.75 - lat) * 177;
    g.fillStyle = '#0e151c'; g.fillRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (ch) => { g.beginPath(); ch._stops.forEach((p, i) => (i ? g.lineTo(X(p.lon), Y(p.lat)) : g.moveTo(X(p.lon), Y(p.lat)))); g.stroke(); };
    for (const r of this.roads) {
      g.setLineDash(r.c.def.ferry ? [8, 8] : []);
      g.strokeStyle = this.onTrip.has(r.c.id) ? '#ff8a1c' : r.c.lanes >= 4 ? '#5d6b78' : '#3d4954';
      g.lineWidth = this.onTrip.has(r.c.id) ? 7 : r.c.lanes >= 4 ? 4 : 2.5;
      line(r.c);
    }
    g.setLineDash([]);
    for (const z of this.net.zillas.values()) {
      const x = X(z.lon), y = Y(z.lat);
      g.fillStyle = '#e8eef3'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.font = `500 17px ${BN_FONT}`; g.fillStyle = '#a9b6c1'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(z.bn, x + 8, y - 1);
    }
    // the bus
    const ll = unproject(st.x, st.z), bx = X(ll.lon), by = Y(ll.lat);
    g.save(); g.translate(bx, by); g.rotate(Math.PI - st.yaw);
    g.fillStyle = '#fff'; g.strokeStyle = '#0b1117'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -18); g.lineTo(12, 14); g.lineTo(0, 7); g.lineTo(-12, 14); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.font = `700 22px ${EN_FONT}`; g.fillStyle = '#9aa6b0'; g.textAlign = 'left';
    g.fillText('O: close map', 30, H - 24);
  }

  // money = the career settlement for this trip (career.finishTrip), shown as a profit breakdown
  arrival(st, opName, dest = this.route.endPlace, money = null) {
    const el = $('arrival');
    el.style.display = 'flex';
    const nm = (p, k) => p[k].split(' (')[0];
    $('arr-title').textContent = `Arrived in ${nm(dest, 'en')}`;
    $('arr-bn').textContent = `${nm(dest, 'bn')} — স্বাগতম!`;
    const avg = st.elapsed > 1 ? this.route.realKm(this.route.length) / (st.elapsed / 3600) : 0;
    const row = (k, v, cls = '') => `<div class="row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    const stars = `<b class="stars">${'★'.repeat(Math.round(st.rating))}${'☆'.repeat(5 - Math.round(st.rating))}</b>`;
    let html = `<div class="arr-cols"><div class="arr-col">
      <div class="arr-h">Trip</div>
      ${row('Operator', opName)}
      ${row('Route', `${nm(this.route.startPlace, 'en')} → ${nm(dest, 'en')}`)}
      ${row('Drive time', `${fmtTime(st.elapsed)}${money?.record && money.prevBest != null ? ' <span class="rec">★ new record</span>' : ''}`)}
      ${row('Average (map) speed', `${avg.toFixed(0)} km/h`)}
      ${row('Collisions', st.crashes)}
      ${st.pax ? row('Passengers carried', `${st.pax.carried}${st.pax.missed ? ` · ${st.pax.missed} missed` : ''}`) : ''}
      <div class="row"><span>Passenger rating</span>${stars}</div>
    </div>`;
    if (money) {
      html += `<div class="arr-col">
      <div class="arr-h">Money</div>
      ${row('Fares', taka(money.fares), 'in')}
      ${money.tips ? row('Tips', taka(money.tips), 'in') : ''}
      ${row('Diesel', taka(-money.diesel), 'out')}
      ${row('Toll', taka(-money.tolls), 'out')}
      ${money.fines ? row('Fines & damage', taka(-money.fines), 'out') : ''}
      ${row('Driver + helper wages', taka(-money.wages), 'out')}
      ${row('Trip profit', taka(money.profit), `total ${money.profit >= 0 ? 'in' : 'out'}`)}
      ${row('Company bank', taka(money.balance), 'bank')}
    </div>`;
    } else {
      html += `<div class="arr-col"><div class="arr-h">Money</div>
      ${row('Toll + diesel', taka(st.fuelCost + st.tollCost))}${row('Fines', taka(st.fines))}
      ${st.pax ? row('Fares collected', taka(st.pax.fares)) : ''}</div>`;
    }
    $('arrival-body').innerHTML = html + '</div>';
    void fmtDuration;
  }
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
void ROAD;
