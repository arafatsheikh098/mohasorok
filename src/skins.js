// Custom skin import: load any skin image (BUSSID/ETS2 template, or a side photo of a bus),
// mark where the left side, right side, front and rear are, and the game paints it onto the bus.
// Skins are stored only in this browser (IndexedDB) — nothing is uploaded anywhere.
import { shade } from './textures.js';

const DB = 'mohasorok', STORE = 'skins';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
const getAll = () => tx('readonly', (s) => s.getAll());
const put = (rec) => tx('readwrite', (s) => s.put(rec));
export const deleteSkin = (id) => tx('readwrite', (s) => s.delete(id));

function loadImage(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(blob);
  });
}

// average colour of a region -> used for the synthetic operator colours (front/rear fallback, counters…)
function avgColor(img, r) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 16;
  const x = c.getContext('2d');
  x.drawImage(img, r.x, r.y + r.h * 0.55, r.w, r.h * 0.45, 0, 0, 32, 16);
  const d = x.getImageData(0, 0, 32, 16).data;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
  const n = d.length / 4;
  const h = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${h(R)}${h(G)}${h(B)}`;
}

export function skinToOperator(rec, img) {
  const base = avgColor(img, rec.regions.left);
  const lum = parseInt(base.slice(1, 3), 16) * 0.3 + parseInt(base.slice(3, 5), 16) * 0.59 + parseInt(base.slice(5, 7), 16) * 0.11;
  return {
    id: `custom-${rec.id}`, en: rec.name.toUpperCase(), bn: rec.name, base,
    c1: shade(base, -70), c2: shade(base, 50), c3: shade(base, -30), text: lum > 140 ? '#1b1b1b' : '#ffffff',
    style: 'bands', tag: 'CUSTOM SKIN', ver: Date.now() + Math.random(), custom: { img, regions: rec.regions, rec },
  };
}

export async function loadCustomSkins() {
  const out = [];
  try {
    for (const rec of await getAll()) {
      const img = await loadImage(rec.blob);
      out.push(skinToOperator(rec, img));
    }
  } catch (e) { console.warn('skins: IndexedDB unavailable', e); }
  // optional: skins in public/skins/skins.json (your own local files, kept out of git, so dev server only)
  if (import.meta.env.DEV) try {
    const r = await fetch(`${import.meta.env.BASE_URL}skins/skins.json`, { cache: 'no-store' });
    if (r.ok) {
      for (const s of await r.json()) {
        const blob = await (await fetch(`${import.meta.env.BASE_URL}skins/${s.image}`)).blob();
        const img = await loadImage(blob);
        out.push(skinToOperator({ id: `file-${s.image}`, name: s.name, regions: s.regions, blob }, img));
      }
    }
  } catch { /* no folder skins */ }
  return out;
}

// Copy one region of the skin into a canvas of size W x H. Missing regions fall back to the
// mirrored opposite side. Returns false when nothing usable exists.
export function drawRegion(ctx, W, H, custom, key) {
  const regs = custom.regions;
  let r = regs[key], mirror = false;
  if (!r?.on && key === 'right' && regs.left?.on) { r = regs.left; mirror = true; }
  if (!r?.on && key === 'left' && regs.right?.on) { r = regs.right; mirror = true; }
  if (!r?.on) return false;
  ctx.save();
  if (r.flip !== mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(custom.img, r.x, r.y, r.w, r.h, 0, 0, W, H);
  ctx.restore();
  return true;
}

// ------------------------------------------------------------------ editor UI
const REGION_META = [
  ['left', 'Left side', '#2ecc71', 'bus front ◀ on the LEFT of the box (door side)'],
  ['right', 'Right side', '#3498db', 'bus front ▶ on the RIGHT of the box (driver side)'],
  ['front', 'Front', '#ff8a1c', 'windshield at the top'],
  ['rear', 'Rear', '#e74c3c', 'rear window at the top'],
];

export function openSkinEditor(onSaved, existing = null) {
  const wrap = document.getElementById('skin-editor');
  wrap.style.display = 'flex';
  const cv = document.getElementById('se-canvas');
  const ctx = cv.getContext('2d');
  const file = document.getElementById('se-file');
  const nameIn = document.getElementById('se-name');
  const list = document.getElementById('se-regions');
  const drop = document.getElementById('se-drop');
  let img = null, blob = null, scale = 1, active = 'left', drag = null;
  let regions = existing ? structuredClone(existing.regions) : null;
  nameIn.value = existing?.name || '';

  const defaults = (w, h) => ({
    left: { on: true, x: 0, y: 0, w, h: h / 2, flip: false },
    right: { on: true, x: 0, y: h / 2, w, h: h / 2, flip: false },
    front: { on: false, x: 0, y: 0, w: w * 0.25, h: h * 0.3, flip: false },
    rear: { on: false, x: w * 0.75, y: 0, w: w * 0.25, h: h * 0.3, flip: false },
  });

  function renderList() {
    list.innerHTML = '';
    for (const [k, label, col, hint] of REGION_META) {
      const r = regions[k];
      const row = document.createElement('div');
      row.className = 'se-row' + (k === active ? ' act' : '');
      row.innerHTML = `<span class="sw" style="background:${col}"></span>
        <label><input type="checkbox" data-k="${k}" data-f="on" ${r.on ? 'checked' : ''}> <b>${label}</b></label>
        <label class="fl"><input type="checkbox" data-k="${k}" data-f="flip" ${r.flip ? 'checked' : ''}> flip</label>
        <small>${hint}</small><canvas width="150" height="${k === 'left' || k === 'right' ? 40 : 70}"></canvas>`;
      row.onclick = (e) => { if (e.target.tagName !== 'INPUT') { active = k; renderList(); draw(); } };
      row.querySelectorAll('input').forEach((inp) => (inp.onchange = () => { regions[k][inp.dataset.f] = inp.checked; draw(); renderList(); }));
      list.appendChild(row);
      const pc = row.querySelector('canvas');
      if (img && r.on) drawRegion(pc.getContext('2d'), pc.width, pc.height, { img, regions: { [k]: r } }, k);
    }
  }

  function draw() {
    if (!img) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const [k, label, col] of REGION_META) {
      const r = regions[k];
      if (!r.on) continue;
      ctx.strokeStyle = col; ctx.lineWidth = k === active ? 3 : 1.5;
      ctx.setLineDash(k === active ? [] : [6, 4]);
      ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
      ctx.fillStyle = col;
      ctx.fillRect(r.x * scale, r.y * scale, 70, 18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(label, r.x * scale + 4, r.y * scale + 13);
      if (k === active) { ctx.fillStyle = col; ctx.fillRect((r.x + r.w) * scale - 7, (r.y + r.h) * scale - 7, 14, 14); }
    }
    ctx.setLineDash([]);
  }

  async function setImage(b) {
    blob = b;
    img = await loadImage(b);
    const maxW = 760, maxH = 430;
    scale = Math.min(maxW / img.width, maxH / img.height);
    cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
    if (!regions) regions = defaults(img.width, img.height);
    drop.style.display = 'none';
    if (!nameIn.value && b.name) nameIn.value = b.name.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 28);
    renderList(); draw();
  }
  if (existing) setImage(existing.blob); else { img = null; regions = null; drop.style.display = 'flex'; cv.width = 760; cv.height = 300; ctx.clearRect(0, 0, 760, 300); list.innerHTML = ''; }

  file.value = '';
  file.onchange = () => file.files[0] && setImage(file.files[0]);
  wrap.ondragover = (e) => { e.preventDefault(); };
  wrap.ondrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) setImage(f); };

  const pos = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / scale * (cv.width / b.width), (e.clientY - b.top) / scale * (cv.height / b.height)]; };
  cv.onmousedown = (e) => {
    if (!img) return;
    const [x, y] = pos(e);
    const r = regions[active];
    const near = Math.abs(x - (r.x + r.w)) < 14 / scale && Math.abs(y - (r.y + r.h)) < 14 / scale;
    if (near) drag = { mode: 'size' };
    else if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) drag = { mode: 'move', dx: x - r.x, dy: y - r.y };
    else { r.on = true; r.x = x; r.y = y; r.w = 1; r.h = 1; drag = { mode: 'size' }; }
  };
  cv.onmousemove = (e) => {
    if (!drag) return;
    const [x, y] = pos(e);
    const r = regions[active];
    if (drag.mode === 'move') { r.x = Math.max(0, Math.min(img.width - r.w, x - drag.dx)); r.y = Math.max(0, Math.min(img.height - r.h, y - drag.dy)); }
    else { r.w = Math.max(8, Math.min(img.width - r.x, x - r.x)); r.h = Math.max(8, Math.min(img.height - r.y, y - r.y)); }
    draw();
  };
  window.onmouseup = () => { if (drag) { drag = null; renderList(); } };

  const close = () => { wrap.style.display = 'none'; window.onmouseup = null; };
  document.getElementById('se-cancel').onclick = close;
  document.getElementById('se-save').onclick = async () => {
    if (!img) return;
    const rec = { id: existing?.id || Date.now().toString(36), name: nameIn.value.trim() || 'My skin', regions, blob };
    await put(rec);
    close();
    onSaved(skinToOperator(rec, img));
  };
}
