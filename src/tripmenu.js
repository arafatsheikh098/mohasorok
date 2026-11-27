// The trip picker in the menu: a map of Bangladesh's highways with every zilla town on it, From / To lists
// grouped by division, popular trips, and a short summary of the chosen trip.
import { DIVISIONS } from './data/bd_network.js';
import { BN_FONT, EN_FONT } from './textures.js';
import { MAP_SCALE } from './config.js';

const $ = (id) => document.getElementById(id);
const POPULAR = [
  ['Dhaka', 'Chattogram'], ['Chattogram', 'Dhaka'], ['Dhaka', 'Sylhet'], ['Dhaka', "Cox's Bazar"], ['Dhaka', 'Rajshahi'],
  ['Dhaka', 'Khulna'], ['Dhaka', 'Barishal'], ['Dhaka', 'Rangpur'], ['Dhaka', 'Mymensingh'], ['Chattogram', 'Sylhet'], ['Dhaka', 'Benapole'], ['Dhaka', 'Kuakata'],
];
// map frame (lat / lon of the canvas edges)
const LON0 = 87.95, LAT1 = 26.75, K = 177, CX = 0.916;

export function tripSummary(net, from, to) {
  const path = net.trip(from, to);
  if (!path) return null;
  let km = 0, tolls = 0;
  const refs = [];
  for (const st of path) {
    const c = net.roads.get(st.road);
    km += c.km;
    for (const v of c.def.via || []) if (v.toll) tolls += v.toll.fee || 0;
    if (c.ref && !['DHK', 'CTG', 'FERRY'].includes(c.ref) && !refs.includes(c.ref)) refs.push(c.ref);
  }
  const gameKm = (km * 1000 * MAP_SCALE) / 1.12 / 1000;
  return { path, km, tolls, refs, gameKm, minutes: (gameKm * 1000) / 21 / 60 };
}

export function initTripMenu({ net, settings, onChange }) {
  const canvas = $('bdmap'), g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const X = (lon) => 30 + (lon - LON0) * CX * K * 1.12, Y = (lat) => 24 + (LAT1 - lat) * K;
  const zillas = [...net.zillas.values()];
  const reachable = new Set(zillas.filter((z) => z.key === 'Dhaka' || net.trip('Dhaka', z.key)).map((z) => z.key));
  let mode = 'to';

  // ---- From / To lists, grouped by division
  const fill = (sel) => {
    sel.innerHTML = '';
    for (const [div, [bn, en]] of Object.entries(DIVISIONS)) {
      const og = document.createElement('optgroup');
      og.label = `${en} · ${bn}`;
      zillas.filter((z) => z.div === div).sort((a, b) => a.en.localeCompare(b.en)).forEach((z) => {
        const o = document.createElement('option');
        o.value = z.key;
        o.textContent = `${z.bn} — ${z.en}${reachable.has(z.key) ? '' : ' (ferry, coming soon)'}`;
        o.disabled = !reachable.has(z.key);
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
  };
  fill($('trip-from')); fill($('trip-to'));

  const set = (from, to) => {
    if (from === to) to = from === settings.trip.from ? settings.trip.to : settings.trip.from;     // picked the other end: swap
    if (from === to || !net.trip(from, to)) return false;
    settings.trip = { from, to };
    render();
    onChange(from, to);
    return true;
  };
  $('trip-from').onchange = (e) => { if (!set(e.target.value, settings.trip.to)) render(); e.target.blur(); };
  $('trip-to').onchange = (e) => { if (!set(settings.trip.from, e.target.value)) render(); e.target.blur(); };
  $('trip-swap').onclick = () => set(settings.trip.to, settings.trip.from);
  $('tap-mode').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { mode = b.dataset.v; $('tap-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); };
  });
  // popular trips
  const chips = $('route');
  chips.innerHTML = '';
  for (const [a, b] of POPULAR) {
    const za = net.zillas.get(a), zb = net.zillas.get(b);
    if (!za || !zb) continue;
    const btn = document.createElement('button');
    btn.dataset.from = a; btn.dataset.to = b;
    btn.innerHTML = `<span class="bn">${za.bn} → ${zb.bn}</span>`;
    btn.onclick = () => set(a, b);
    chips.appendChild(btn);
  }
  // tap the map: the nearest town becomes From or To
  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect();
    // the canvas keeps its aspect ratio inside its box (object-fit: contain)
    const sc = Math.min(r.width / W, r.height / H), ox = (r.width - W * sc) / 2, oy = (r.height - H * sc) / 2;
    const x = (e.clientX - r.left - ox) / sc, y = (e.clientY - r.top - oy) / sc;
    let best = null, bd = 40;
    for (const z of zillas) { const d = Math.hypot(X(z.lon) - x, Y(z.lat) - y); if (d < bd && reachable.has(z.key)) { bd = d; best = z; } }
    if (!best) return;
    const { from, to } = settings.trip;
    if (mode === 'from') { if (!set(best.key, best.key === to ? from : to)) set(best.key, from); }
    else if (!set(from, best.key)) set(to, best.key);
  };

  function render() {
    const { from, to } = settings.trip;
    $('trip-from').value = from; $('trip-to').value = to;
    chips.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.from === from && b.dataset.to === to));
    const sum = tripSummary(net, from, to);
    const zf = net.zillas.get(from), zt = net.zillas.get(to);
    $('start-route').textContent = `${zf.bn} → ${zt.bn}`;
    $('trip-sum').innerHTML = sum
      ? `<span class="bn">${zf.bn} → ${zt.bn}</span> · <b>${Math.round(sum.km)} km</b> via ${sum.refs.join(', ') || 'local roads'}<br>`
        + `about <b>${Math.max(1, Math.round(sum.minutes))} min</b> of driving at 80 km/h · tolls <b>৳${sum.tolls.toLocaleString('en-IN')}</b>`
      : 'No road between these two yet.';
    draw(sum);
  }

  function draw(sum) {
    g.fillStyle = '#0e151c';
    g.fillRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (c) => {
      g.beginPath();
      c._stops.forEach((p, i) => (i ? g.lineTo(X(p.lon), Y(p.lat)) : g.moveTo(X(p.lon), Y(p.lat))));
      g.stroke();
    };
    // all roads
    for (const c of net.roads.values()) {
      if (c.def.link) continue;
      g.setLineDash(c.def.ferry ? [8, 8] : []);
      g.strokeStyle = c.def.ferry ? '#3f7fa8' : c.lanes >= 4 ? '#5d6b78' : '#3d4954';
      g.lineWidth = c.lanes >= 4 ? 4 : 2.5;
      line(c);
    }
    g.setLineDash([]);
    // the chosen trip
    if (sum) {
      g.strokeStyle = '#ff8a1c'; g.lineWidth = 7;
      for (const st of sum.path) { const c = net.roads.get(st.road); if (!c.def.link) line(c); }
    }
    // towns
    const { from, to } = settings.trip;
    for (const z of zillas) {
      const x = X(z.lon), y = Y(z.lat), sel = z.key === from || z.key === to;
      g.fillStyle = z.key === from ? '#3ddc84' : z.key === to ? '#ff8a1c' : reachable.has(z.key) ? '#e8eef3' : '#6b7782';
      g.beginPath(); g.arc(x, y, sel ? 10 : 5.5, 0, Math.PI * 2); g.fill();
      if (sel) { g.strokeStyle = '#0e151c'; g.lineWidth = 3; g.stroke(); }
      g.font = sel ? `700 26px ${BN_FONT}` : `500 17px ${BN_FONT}`;
      g.fillStyle = sel ? '#fff' : '#a9b6c1';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(z.bn, x + (sel ? 14 : 8), y - 1);
    }
    g.font = `600 20px ${EN_FONT}`; g.fillStyle = '#5d6b78'; g.textAlign = 'left';
    g.fillText('Bay of Bengal', X(89.9), Y(21.2));
  }

  render();
  return { render };
}
