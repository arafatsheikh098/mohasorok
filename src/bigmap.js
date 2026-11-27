// The full map (M): the country's roads and zilla towns, your trip drawn along the real road, the part already
// driven greyed out, the stops on the way and the bus. It opens zoomed to the trip; mouse wheel / + − zoom,
// drag to move, "Trip" and "Bangladesh" buttons, M or Esc closes it. The game is paused while it is open.
import { project, unproject } from './net.js';
import { BN_FONT, EN_FONT } from './textures.js';

const $ = (id) => document.getElementById(id);

export class BigMap {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'bigmap';
    this.el.innerHTML = `
      <div class="bm-card">
        <canvas></canvas>
        <div class="bm-top"><div class="bm-title"></div>
          <div class="bm-btns"><button data-a="trip">🧭 Trip</button><button data-a="all">🇧🇩 Bangladesh</button><button data-a="in">＋</button><button data-a="out">－</button><button data-a="close">✕</button></div></div>
        <div class="bm-info"></div>
        <div class="bm-help">Wheel / ＋ － zoom · drag to move · <b>M</b> or <b>Esc</b> close</div>
      </div>`;
    document.body.appendChild(this.el);
    const css = document.createElement('style');
    css.textContent = `
      #bigmap { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(4,7,10,.78); z-index: 30; }
      #bigmap .bm-card { position: relative; width: min(96vw, 1500px); height: min(92vh, 960px); background: #0e151c; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; overflow: hidden; }
      #bigmap canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
      #bigmap canvas.drag { cursor: grabbing; }
      #bigmap .bm-top { position: absolute; left: 14px; right: 14px; top: 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; pointer-events: none; }
      #bigmap .bm-title { background: rgba(12,17,22,.85); border: 1px solid rgba(255,255,255,.1); border-radius: 9px; padding: 8px 14px; font-weight: 800; font-size: 17px; color: #e9eef2; }
      #bigmap .bm-title small { display: block; color: #93a1ad; font-weight: 600; font-size: 12px; margin-top: 2px; }
      #bigmap .bm-btns { display: flex; gap: 6px; pointer-events: auto; }
      #bigmap .bm-btns button { background: rgba(12,17,22,.9); color: #e9eef2; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 700; cursor: pointer; }
      #bigmap .bm-btns button:hover { border-color: #ff8a1c; }
      #bigmap .bm-info { position: absolute; left: 14px; bottom: 12px; background: rgba(12,17,22,.88); border: 1px solid rgba(255,255,255,.1); border-radius: 9px; padding: 10px 14px; color: #c9d3dc; font-size: 13px; line-height: 1.6; max-width: 420px; }
      #bigmap .bm-info b { color: #fff; } #bigmap .bm-info .bn { color: #ff8a1c; font-weight: 700; }
      #bigmap .bm-help { position: absolute; right: 14px; bottom: 12px; color: #93a1ad; font-size: 12px; background: rgba(12,17,22,.7); padding: 6px 10px; border-radius: 7px; }
      @media (max-width: 760px) { #bigmap .bm-card { width: 100vw; height: 100vh; border-radius: 0; } #bigmap .bm-help { display: none; } }`;
    document.head.appendChild(css);
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.view = { cx: 0, cz: 0, scale: 0.02 };      // world point at the centre, canvas px per world m
    this.el.querySelector('.bm-btns').onclick = (e) => {
      const a = e.target.dataset?.a;
      if (a === 'trip') this.fitTrip(); else if (a === 'all') this.fitAll();
      else if (a === 'in') this.zoom(1.5); else if (a === 'out') this.zoom(1 / 1.5);
      else if (a === 'close') this.onClose?.();
      this.draw();
    };
    // zoom with the wheel around the mouse, drag to pan (mouse or one finger), pinch with two fingers
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.25 : 0.8, e); this.draw(); }, { passive: false });
    const ptrs = new Map();
    let pinch = 0;
    this.canvas.addEventListener('pointerdown', (e) => { this.canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); this.canvas.classList.add('drag'); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const [px, py] = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.zoom(dist / pinch);
        pinch = dist;
      } else {
        const k = this.canvas.width / this.canvas.clientWidth;
        this.view.cx -= ((e.clientX - px) * k) / this.view.scale;
        this.view.cz -= ((e.clientY - py) * k) / this.view.scale;
      }
      this.draw();
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) this.canvas.classList.remove('drag'); };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    addEventListener('resize', () => { if (this.isOpen) { this._size(); this.draw(); } });
  }

  get isOpen() { return this.el.style.display === 'flex'; }

  // hud: the HUD (roads, the network); route: the trip corridor; st: { x, z, yaw, s, side }; trip: { stops, title }
  open(ctx) {
    Object.assign(this, ctx);
    this.el.style.display = 'flex';
    this._size();
    this._prep();
    this.fitTrip();
    this.draw();
  }
  close() { this.el.style.display = 'none'; }
  update(ctx) { if (this.isOpen) { Object.assign(this, ctx); this.draw(); } }

  _size() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
  }
  // the trip along the real road (every 40 m) and the towns
  _prep() {
    if (this.prepFor === this.route) return;
    this.prepFor = this.route;
    const R = this.route;
    this.trip = [];
    for (let s = 0; s <= R.length; s += 40) { const p = R.pointAt(s, 0); this.trip.push([p.x, p.z, s]); }
    const e = R.pointAt(R.length, 0);
    this.trip.push([e.x, e.z, R.length]);
    this.towns = [...R.net.zillas.values()].map((z) => { const v = project(z.lat, z.lon); return { x: v.x, z: v.y, bn: z.bn, en: z.en }; });
  }
  _fit(pts, pad = 0.12) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const W = this.canvas.width, H = this.canvas.height;
    this.view.cx = (x0 + x1) / 2; this.view.cz = (z0 + z1) / 2;
    this.view.scale = Math.min(W / ((x1 - x0) * (1 + 2 * pad) || 1), H / ((z1 - z0) * (1 + 2 * pad) || 1));
  }
  fitTrip() { this._fit(this.trip.map(([x, z]) => [x, z]), 0.15); }
  fitAll() { this._fit(this.towns.map((t) => [t.x, t.z]), 0.05); }
  zoom(k, e) {
    const v = this.view;
    if (e) {
      // keep the point under the mouse where it is
      const r = this.canvas.getBoundingClientRect(), dpr = this.dpr || 1;
      const mx = (e.clientX - r.left) * dpr, my = (e.clientY - r.top) * dpr;
      const wx = v.cx + (mx - this.canvas.width / 2) / v.scale, wz = v.cz + (my - this.canvas.height / 2) / v.scale;
      v.scale = Math.min(0.6, Math.max(0.004, v.scale * k));
      v.cx = wx - (mx - this.canvas.width / 2) / v.scale; v.cz = wz - (my - this.canvas.height / 2) / v.scale;
    } else v.scale = Math.min(0.6, Math.max(0.004, v.scale * k));
  }

  draw() {
    if (!this.isOpen) return;
    const g = this.g, W = this.canvas.width, H = this.canvas.height, v = this.view, dpr = this.dpr || 1;
    const X = (x) => W / 2 + (x - v.cx) * v.scale, Y = (z) => H / 2 + (z - v.cz) * v.scale;
    const px = (n) => n * dpr;
    g.fillStyle = '#0e151c'; g.fillRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // every road of the network
    for (const r of this.hud.roads) {
      const two = r.c.lanes < 4, ex = r.c.def.expressway, el = r.c.def.elevated?.to === 1;
      g.setLineDash(r.c.def.ferry ? [px(8), px(8)] : []);
      g.strokeStyle = r.c.def.ferry ? '#3f7fa8' : el ? '#b06ad0' : ex ? '#4fae5a' : two ? '#3d4954' : '#5d6b78';
      g.lineWidth = px(ex || el ? 5 : two ? 2.5 : 4);
      g.beginPath();
      r.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      g.stroke();
    }
    g.setLineDash([]);
    // the trip: dark casing, driven part grey, the rest orange
    const s = this.st?.s ?? 0;
    const path = (from, to) => {
      g.beginPath();
      let first = true;
      for (const [x, z, ss] of this.trip) {
        if (ss < from || ss > to) continue;
        if (first) { g.moveTo(X(x), Y(z)); first = false; } else g.lineTo(X(x), Y(z));
      }
      g.stroke();
    };
    g.strokeStyle = '#0b0f13'; g.lineWidth = px(11); path(0, Infinity);
    g.strokeStyle = '#7d8a96'; g.lineWidth = px(6); path(0, s);
    g.strokeStyle = '#ff8a1c'; g.lineWidth = px(7); path(s, Infinity);
    // towns
    const big = v.scale > 0.03;
    for (const t of this.towns) {
      const x = X(t.x), y = Y(t.z);
      if (x < -50 || y < -20 || x > W + 50 || y > H + 20) continue;
      g.fillStyle = '#e8eef3'; g.beginPath(); g.arc(x, y, px(4.5), 0, Math.PI * 2); g.fill();
      g.font = `600 ${px(big ? 15 : 13)}px ${BN_FONT}`; g.fillStyle = '#b8c4cf'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(t.bn, x + px(8), y - px(1));
      if (big) { g.font = `500 ${px(11)}px ${EN_FONT}`; g.fillStyle = '#7d8a96'; g.fillText(t.en, x + px(8), y + px(13)); }
    }
    // the stops on the trip, start and destination
    for (const st of this.stops || []) {
      const p = this.route.pointAt(st.s, 0), x = X(p.x), y = Y(p.z);
      g.fillStyle = st.s < s ? '#556270' : '#2ecc71';
      g.strokeStyle = '#0b0f13'; g.lineWidth = px(2);
      g.beginPath(); g.arc(x, y, px(6.5), 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const R = this.route;
    const flag = (sv, col, label) => {
      const p = R.pointAt(sv, 0), x = X(p.x), y = Y(p.z);
      g.fillStyle = col; g.strokeStyle = '#0b0f13'; g.lineWidth = px(3);
      g.beginPath(); g.arc(x, y, px(10), 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = `800 ${px(17)}px ${BN_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.lineWidth = px(4); g.strokeStyle = '#0b0f13'; g.strokeText(label, x + px(14), y);
      g.fillStyle = '#fff'; g.fillText(label, x + px(14), y);
    };
    flag(0, '#3ddc84', R.startPlace.bn.split(' (')[0]);
    flag(R.length, '#ff8a1c', R.endPlace.bn.split(' (')[0]);
    // the bus
    if (this.st) {
      const x = X(this.st.x), y = Y(this.st.z);
      g.save(); g.translate(x, y); g.rotate(Math.PI - this.st.yaw);
      g.fillStyle = '#fff'; g.strokeStyle = '#0b1117'; g.lineWidth = px(3);
      g.beginPath(); g.moveTo(0, px(-16)); g.lineTo(px(11), px(13)); g.lineTo(0, px(6)); g.lineTo(px(-11), px(13)); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // scale bar (real km)
    const kmPerM = R.totalKm / R.length, barKm = [5, 10, 25, 50, 100, 200].find((k) => (k / kmPerM) * v.scale > px(90)) || 200;
    const bw = (barKm / kmPerM) * v.scale, bx = px(18), by = H - px(130);
    g.strokeStyle = '#c9d3dc'; g.lineWidth = px(2);
    g.beginPath(); g.moveTo(bx, by - px(5)); g.lineTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by - px(5)); g.stroke();
    g.font = `600 ${px(12)}px ${EN_FONT}`; g.fillStyle = '#c9d3dc'; g.textAlign = 'left'; g.fillText(`${barKm} km`, bx + px(4), by - px(10));
    // title and the trip box
    this.el.querySelector('.bm-title').innerHTML = this.title || '';
    this.el.querySelector('.bm-info').innerHTML = this.info || '';
  }
}

export { unproject };
