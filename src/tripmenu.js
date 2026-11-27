// The trip picker in the menu: a map of Bangladesh's highways with every zilla town on it, From / To lists
// grouped by division, popular trips, and a short summary of the chosen trip.
import { DIVISIONS } from './data/bd_network.js';
import { BN_FONT, EN_FONT } from './textures.js';
import { MAP_SCALE } from './config.js';
import { unproject } from './net.js';

const $ = (id) => document.getElementById(id);
const POPULAR = [
  ['Dhaka', 'Chattogram'], ['Chattogram', 'Dhaka'], ['Dhaka', 'Sylhet'], ['Dhaka', "Cox's Bazar"], ['Dhaka', 'Rajshahi'],
  ['Dhaka', 'Khulna'], ['Dhaka', 'Barishal'], ['Dhaka', 'Rangpur'], ['Dhaka', 'Mymensingh'], ['Chattogram', 'Sylhet'], ['Dhaka', 'Benapole'], ['Dhaka', 'Kuakata'],
];
// map frame (lat / lon of the canvas edges)
const LON0 = 87.95, LAT1 = 26.75, K = 177, CX = 0.916;

// at: where the bus is (settings.at), used when from === '@here'
export function tripSummary(net, from, to, at) {
  const path = from === '@here' ? at?.road && net.pathFromRoad(at, to) : net.trip(from, to);
  if (!path) return null;
  let km = 0, tolls = 0;
  const refs = [];
  for (const st of path) {
    const c = net.roads.get(st.road);
    km += c.km * (st.cut ? Math.max(0, 1 - st.cut / (c.build().length || 1)) : 1);
    for (const v of c.def.via || []) if (v.toll) tolls += v.toll.fee || 0;
    tolls += c.def.elevated?.fee || 0;
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
  // where the bus is now (it starts the next trip from there)
  const busAt = () => {
    const at = settings.at;
    if (at?.road) {
      const c = net.road(at.road);
      if (c) { const i = Math.round(Math.min(c.length, Math.max(0, at.s)) / 2); return { x: c.px[i], z: c.pz[i], road: true, near: at.near }; }
    }
    const z = net.zillas.get(at?.zilla || settings.trip.from);
    if (!z) return null;
    const v = net.nodes[z.terminals[0]];
    return { lat: v.lat, lon: v.lon, zilla: z.key };
  };
  const fill = (sel) => {
    sel.innerHTML = '';
    if (sel.id === 'trip-from' && settings.at?.road) {
      const o = document.createElement('option');
      o.value = '@here';
      o.textContent = `📍 Where your bus is (on the road near ${settings.at.near || '…'})`;
      sel.appendChild(o);
    }
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

  const ok = (from, to) => (from === '@here' ? !!(settings.at?.road && net.pathFromRoad(settings.at, to)) : !!net.trip(from, to));
  const set = (from, to) => {
    if (from === to) to = from === settings.trip.from ? settings.trip.to : settings.trip.from;     // picked the other end: swap
    if (to === '@here' || from === to || !ok(from, to)) return false;
    // choosing another start zilla moves the bus there
    if (from !== '@here' && from !== settings.trip.from) settings.at = { zilla: from };
    settings.trip = { from, to };
    render();
    onChange(from, to);
    return true;
  };
  $('trip-from').onchange = (e) => { if (!set(e.target.value, settings.trip.to)) render(); e.target.blur(); };
  $('trip-to').onchange = (e) => { if (!set(settings.trip.from, e.target.value)) render(); e.target.blur(); };
  $('trip-swap').onclick = () => set(settings.trip.to, settings.trip.from);
  // explore (free drive): start where the bus is and take whatever road you like; trip: zilla to zilla
  const modeSeg = $('play-mode');
  modeSeg.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { settings.mode = b.dataset.v; b.blur(); render(); onChange(settings.trip.from, settings.trip.to); };
  });
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
    if (mode === 'from' || settings.mode === 'free') { if (!set(best.key, best.key === to ? from : to)) set(best.key, from); }
    else if (!set(from, best.key)) set(to, best.key);
  };

  function render() {
    // (the "where your bus is" option comes and goes with the bus's position)
    fill($('trip-from'));
    const { from, to } = settings.trip;
    const isFree = settings.mode === 'free';
    $('play-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', (b.dataset.v === 'free') === isFree));
    document.querySelector('#trip-pick .trip-sel label:last-of-type').style.display = isFree ? 'none' : '';
    $('trip-swap').style.display = isFree ? 'none' : '';
    $('route').style.display = isFree ? 'none' : '';
    $('tap-mode').style.display = isFree ? 'none' : '';
    $('trip-from').value = from; $('trip-to').value = to;
    $('trip-to').disabled = isFree; $('trip-swap').disabled = isFree;
    if (isFree) {
      const zf = from === '@here' ? { bn: '📍' } : net.zillas.get(from);
      $('start-route').textContent = `${zf.bn} → 🧭 Explore`;
      $('trip-sum').innerHTML = `🧭 <b>Explore</b> from <span class="bn">${from === '@here' ? `📍 the road near ${settings.at?.near || ''}` : zf.bn}</span>: no passengers and no destination. `
        + 'The road goes on straight ahead; at every junction the green boards show where each road goes — drive onto any of them and the world follows you. '
        + 'Turn round anywhere on a 2-lane road (or at a U-turn on a highway). <b>M</b> shows the whole map.';
      draw(null);
      return;
    }
    chips.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.from === from && b.dataset.to === to));
    const sum = tripSummary(net, from, to, settings.at);
    const here = from === '@here';
    const zf = here ? { bn: '📍', en: `the road near ${settings.at?.near || ''}` } : net.zillas.get(from), zt = net.zillas.get(to);
    $('start-route').textContent = `${zf.bn} → ${zt.bn}`;
    $('trip-sum').innerHTML = sum
      ? `${here ? `📍 Your bus is on the road near <b>${settings.at?.near || ''}</b> — the trip starts right there<br>` : `<small>🚌 Your bus is at the ${zf.en} terminal</small><br>`}`
        + `<span class="bn">${zf.bn} → ${zt.bn}</span> · <b>${Math.round(sum.km)} km</b> via ${sum.refs.join(', ') || 'local roads'}<br>`
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
      g.strokeStyle = c.def.ferry ? '#3f7fa8' : c.def.elevated?.to === 1 ? '#b06ad0' : c.def.expressway ? '#4fae5a' : c.lanes >= 4 ? '#5d6b78' : '#3d4954';
      g.lineWidth = c.def.expressway || c.def.elevated?.to === 1 ? 5 : c.lanes >= 4 ? 4 : 2.5;
      line(c);
    }
    g.setLineDash([]);
    // the chosen trip
    if (sum) {
      g.strokeStyle = '#ff8a1c'; g.lineWidth = 7;
      for (const st of sum.path) { const c = net.roads.get(st.road); if (!c.def.link) line(c); }
    }
    // where the bus is
    const b = busAt();
    if (b) {
      let x, y;
      if (b.road) { const ll = unproject(b.x, b.z); x = X(ll.lon); y = Y(ll.lat); } else { x = X(b.lon); y = Y(b.lat); }
      g.font = `32px ${EN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🚌', x, y - 22);
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
