import { ROAD, SPEED_LIMIT } from './config.js';
import { BN_FONT, EN_FONT } from './textures.js';

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
    this.markers = [
      ...route.stations.map((st) => ({ p: route.pointAt(st.sc, st.side * 16), icon: '⛽', col: '#ffb300' })),
      ...route.uturns.map((u) => ({ p: route.pointAt(u.s, 0), icon: 'U', col: '#4aa3ff' })),
      ...(route.tollS > 0 ? [{ p: route.pointAt(route.tollS, 0), icon: '৳', col: '#ff5252' }] : []),
    ];
  }

  toast(html, cls = '', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = html;
    this.toasts.appendChild(el);
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
    document.querySelector('#trip .route').innerHTML = back ? '<span class="bn">চট্টগ্রাম → ঢাকা</span> · N1' : '<span class="bn">ঢাকা → চট্টগ্রাম</span> · N1';
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
    $('place-now').innerHTML = st.place ? `<span class="bn">${st.place.bn}</span><small>${st.place.en}</small>` : '<small>N1 Dhaka–Chattogram Highway</small>';
    $('clock').textContent = st.clock;
    $('cam-label').textContent = st.camLabel;
    $('speed-big').textContent = Math.round(st.kmh);
    $('speed-big').classList.toggle('over', st.kmh > SPEED_LIMIT + 3);
    $('gear').textContent = st.gear;
    $('ind-l').classList.toggle('on', st.indL && st.blink);
    $('ind-r').classList.toggle('on', st.indR && st.blink);
    $('ind-lights').classList.toggle('on', st.lights);
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

  arrival(st, opName, dest = 'Chattogram') {
    const el = $('arrival');
    el.style.display = 'flex';
    $('arr-title').textContent = `Arrived in ${dest}`;
    $('arr-bn').textContent = dest === 'Dhaka' ? 'ঢাকায় স্বাগতম!' : 'চট্টগ্রামে স্বাগতম!';
    const avg = st.elapsed > 1 ? this.route.realKm(this.route.length) / (st.elapsed / 3600) : 0;
    $('arrival-body').innerHTML = `
      <div class="row"><span>Operator</span><b>${opName}</b></div>
      <div class="row"><span>Route</span><b>${dest === 'Dhaka' ? 'Chattogram → Dhaka' : 'Dhaka → Chattogram'} (N1)</b></div>
      <div class="row"><span>Toll + diesel</span><b>৳ ${Math.round(st.fuelCost + st.tollCost).toLocaleString('en-IN')}</b></div>
      <div class="row"><span>Drive time</span><b>${fmtTime(st.elapsed)}</b></div>
      <div class="row"><span>Average (map) speed</span><b>${avg.toFixed(0)} km/h</b></div>
      <div class="row"><span>Collisions</span><b>${st.crashes}</b></div>
      <div class="row"><span>Fines</span><b>৳ ${st.fines.toLocaleString('en-IN')}</b></div>
      <div class="row"><span>Passenger rating</span><b class="stars">${'★'.repeat(Math.round(st.rating))}${'☆'.repeat(5 - Math.round(st.rating))}</b></div>`;
  }
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
void ROAD;
