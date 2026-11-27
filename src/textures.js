import * as THREE from 'three';
import { ROAD, PROFILE } from './config.js';

export const BN_FONT = "'Noto Sans Bengali','Kohinoor Bangla','Bangla Sangam MN','Nirmala UI','Vrinda',sans-serif";
export const EN_FONT = "'Helvetica Neue',Arial,sans-serif";

export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBn = (v) => String(v).replace(/[0-9]/g, (d) => BN_DIGITS[d]);

let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function canvasTexture(canvas, { repeat = true, srgb = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, n, colors, r, sizeMin = 1, sizeMax = 3) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    const s = sizeMin + r() * (sizeMax - sizeMin);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

// ---------- Road ----------
// u: 0 at median curb -> 1 at asphalt edge (ROAD.half - ROAD.median metres). v: one tile = 18 m.
export const ASPHALT_TILE = 18;
// one carriageway of a divided road (u 0 = the median edge, 1 = the outer edge); P = a lane profile (config PROFILE)
export function asphaltTexture(P = ROAD) {
  const W = 512, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(7);
  const span = P.half - P.median;
  const U = (d) => ((d - P.median) / span) * W;
  const V = (m) => (m / ASPHALT_TILE) * H;
  ctx.fillStyle = '#56575a';
  ctx.fillRect(0, 0, W, H);
  // worn shoulder
  ctx.fillStyle = '#66625c';
  ctx.fillRect(U(P.edge), 0, W, H);
  speckle(ctx, W, H, 26000, ['#4b4c4f', '#616265', '#6b6b6d', '#444547', '#5c5a57'], r, 1, 3);
  // patches & cracks
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(40,40,42,0.25)' : 'rgba(110,108,104,0.18)';
    ctx.fillRect(r() * W, r() * H, 20 + r() * 120, 20 + r() * 160);
  }
  // tyre tracks (darker, oily)
  for (let k = 0; k < (P.lanes || 2); k++) {
    const lc = P.median + P.lane * (k + 0.5);
    for (const o of [-0.9, 0.9]) {
      const g = ctx.createLinearGradient(U(lc + o - 0.45), 0, U(lc + o + 0.45), 0);
      g.addColorStop(0, 'rgba(30,30,32,0)');
      g.addColorStop(0.5, 'rgba(30,30,32,0.28)');
      g.addColorStop(1, 'rgba(30,30,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(U(lc + o - 0.45), 0, U(lc + o + 0.45) - U(lc + o - 0.45), H);
    }
  }
  const line = (d, wM, color, dash) => {
    ctx.fillStyle = color;
    const x = U(d - wM / 2), w = U(d + wM / 2) - x;
    if (!dash) ctx.fillRect(x, 0, w, H);
    else for (let m = 0; m < ASPHALT_TILE; m += 9) ctx.fillRect(x, V(m), w, V(3));
  };
  line(P.median + 0.25, 0.15, '#d9b43a', false);              // yellow inner edge
  for (let k = 1; k < (P.lanes || 2); k++) line(P.median + P.lane * k, 0.15, '#e9e9e4', true);   // lane dividers (dashed)
  line(P.edge, 0.2, '#ecece6', false);                        // outer edge
  // grime over the paint
  speckle(ctx, W, H, 5000, ['rgba(60,60,60,0.5)', 'rgba(90,90,90,0.4)'], r, 1, 2);
  const t = canvasTexture(c);
  return t;
}

export function grassTexture(seed = 3, base = '#5f7a34') {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 30000, ['#6f8a3c', '#506a2b', '#7b8f45', '#8a7f4d', '#45602a'], r, 1, 4);
  return canvasTexture(c);
}

// Patchwork of paddy fields. One tile covers PADDY_TILE metres.
export const PADDY_TILE = 240;
export function paddyTexture() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(11);
  ctx.fillStyle = '#7d7a45';
  ctx.fillRect(0, 0, S, S);
  const greens = ['#6f9a3a', '#7fa63f', '#8fae44', '#a2b34c', '#5e8a34', '#b7b55a', '#c2b260', '#6c8f3d', '#86a23f'];
  // irregular strips of plots
  let y = 0;
  while (y < S) {
    const h = 50 + r() * 110;
    let x = 0;
    while (x < S) {
      const w = 40 + r() * 140;
      const roll = r();
      let col = greens[(r() * greens.length) | 0];
      if (roll < 0.07) col = '#8f7c55';          // fallow / ploughed
      else if (roll < 0.12) col = '#6f8a86';     // flooded
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
      // rice rows
      ctx.strokeStyle = 'rgba(40,70,20,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = x + 3; k < x + w; k += 4) { ctx.moveTo(k, y); ctx.lineTo(k, y + h); }
      ctx.stroke();
      // bund (aisle)
      ctx.strokeStyle = 'rgba(140,120,80,0.85)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);
      x += w;
    }
    y += h;
  }
  speckle(ctx, S, S, 22000, ['rgba(60,90,30,0.25)', 'rgba(180,170,90,0.18)', 'rgba(40,60,20,0.2)'], r, 1, 3);
  const t = canvasTexture(c);
  return t;
}

// ---------- Buildings ----------
export const FACADE_BAY = 3.2;      // metres per texture repeat (u)
export const FACADE_HEIGHT = 25.6;  // metres covered by texture (v), 8 floors
const FLOOR_H = FACADE_HEIGHT / 8;
export function facadeTexture(seed) {
  const W = 256, H = 2048;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed * 97 + 5);
  const walls = ['#e8dcc2', '#d9c7a4', '#f1e6d4', '#c9d6d8', '#e7c9c0', '#d8d3c0', '#efe0a8', '#bcc7b0', '#d6b9a3', '#f0f0ea'];
  const wall = walls[seed % walls.length];
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  const fh = H / 8;
  for (let f = 0; f < 8; f++) {
    const y0 = H - (f + 1) * fh;
    if (f === 0) {
      // ground floor: shop with shutter or open front
      ctx.fillStyle = '#585a5c';
      ctx.fillRect(0, y0 + fh * 0.08, W, fh * 0.92);
      if (r() < 0.6) {
        ctx.fillStyle = '#2a2622';
        ctx.fillRect(10, y0 + fh * 0.18, W - 20, fh * 0.82);
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = `hsl(${r() * 360},60%,${35 + r() * 30}%)`;
          ctx.fillRect(14 + r() * (W - 40), y0 + fh * (0.25 + r() * 0.6), 6 + r() * 14, 6 + r() * 16);
        }
      } else {
        ctx.fillStyle = '#7b7f84';
        ctx.fillRect(10, y0 + fh * 0.18, W - 20, fh * 0.82);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let k = y0 + fh * 0.2; k < y0 + fh; k += 6) ctx.fillRect(10, k, W - 20, 2);
      }
      continue;
    }
    // window with grill
    const wx = W * 0.18, ww = W * 0.64, wy = y0 + fh * 0.28, wh = fh * 0.5;
    ctx.fillStyle = r() < 0.15 ? '#c8a050' : '#26303a';
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = 'rgba(160,190,210,0.25)';
    ctx.fillRect(wx, wy, ww, wh * 0.45);
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = 3;
    for (let k = wx; k <= wx + ww; k += ww / 6) { ctx.beginPath(); ctx.moveTo(k, wy); ctx.lineTo(k, wy + wh); ctx.stroke(); }
    ctx.strokeRect(wx, wy, ww, wh);
    // sunshade slab
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(wx - 12, wy - 14, ww + 24, 10);
    // balcony / laundry
    if (r() < 0.3) {
      ctx.fillStyle = '#9a9a92';
      ctx.fillRect(0, y0 + fh * 0.72, W, 8);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = `hsl(${r() * 360},55%,50%)`;
        ctx.fillRect(20 + r() * (W - 60), y0 + fh * 0.6, 18, 26);
      }
    }
  }
  // monsoon stains
  for (let k = 0; k < 14; k++) {
    const x = r() * W;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(40,40,30,0.0)');
    g.addColorStop(r(), 'rgba(40,40,30,0.22)');
    g.addColorStop(1, 'rgba(40,40,30,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 6 + r() * 20, H);
  }
  return canvasTexture(c);
}
export { FLOOR_H };

export function roofTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(21);
  ctx.fillStyle = '#8d8a83';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 8000, ['#7a776f', '#9c9890', '#6e6a62'], r, 1, 4);
  return canvasTexture(c);
}

export function tinTexture() {
  const W = 256, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(31);
  for (let x = 0; x < W; x += 8) {
    const g = ctx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, '#8c9094'); g.addColorStop(0.5, '#c2c5c8'); g.addColorStop(1, '#7c8084');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 8, H);
  }
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(${120 + r() * 60},${60 + r() * 30},20,${0.15 + r() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(r() * W, r() * H, 6 + r() * 30, 4 + r() * 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c);
}

// ---------- Signs ----------
const SHOP_NAMES = [
  ['মায়ের দোয়া ট্রেডার্স', "Mayer Doa Traders"],
  ['বিসমিল্লাহ হোটেল', 'Bismillah Hotel & Restaurant'],
  ['ভাই ভাই এন্টারপ্রাইজ', 'Bhai Bhai Enterprise'],
  ['নিউ মডেল ফার্মেসী', 'New Model Pharmacy'],
  ['মা টেলিকম', 'Ma Telecom'],
  ['আল-আমিন ষ্টোর', 'Al-Amin Store'],
  ['জনতা হার্ডওয়্যার', 'Janata Hardware'],
  ['সোনার বাংলা বস্ত্রালয়', 'Sonar Bangla Bostraloy'],
  ['রহমানিয়া মিষ্টি ঘর', 'Rahmania Sweets'],
  ['নিউ অটো পার্টস', 'New Auto Parts'],
  ['হাজী বিরিয়ানী হাউস', 'Haji Biryani House'],
  ['বাবা-মায়ের দোয়া টায়ার', 'Tyre Centre'],
];
export const SHOP_COUNT = SHOP_NAMES.length;
export function shopSignTexture(i) {
  const W = 1024, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(i * 13 + 2);
  const bgs = ['#c4161c', '#0b5ea8', '#0f7a3a', '#f2c200', '#6a1b9a', '#e65100', '#ffffff', '#00695c'];
  const bg = bgs[i % bgs.length];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const dark = bg === '#ffffff' || bg === '#f2c200';
  ctx.fillStyle = dark ? '#b71c1c' : '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 120px ${BN_FONT}`;
  ctx.fillText(SHOP_NAMES[i][0], W / 2, H * 0.42, W - 40);
  ctx.font = `bold 40px ${EN_FONT}`;
  ctx.fillStyle = dark ? '#222' : '#ffe082';
  ctx.fillText(SHOP_NAMES[i][1] + '  •  01' + (700000000 + ((r() * 99999999) | 0)), W / 2, H * 0.84, W - 40);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  return canvasTexture(c, { repeat: false });
}

const BILLBOARDS = [
  { bg: '#e30613', bn: 'নিরাপদ সড়ক চাই', en: 'Drive safe — your family is waiting', fg: '#fff' },
  { bg: '#ffd400', bn: 'গতি নিয়ন্ত্রণে রাখুন', en: 'Speed limit 80 km/h', fg: '#111' },
  { bg: '#00843d', bn: 'দেশী চা — প্রতিদিন সতেজ', en: 'Fresh tea, every day', fg: '#fff' },
  { bg: '#0052a5', bn: 'মোবাইলে টাকা পাঠান সহজে', en: 'Send money in seconds', fg: '#fff' },
  { bg: '#5b2c83', bn: 'ঢেউটিন — বহু বছরের ভরসা', en: 'Strong roofs for every home', fg: '#fff' },
];
export const BILLBOARD_COUNT = BILLBOARDS.length;
export function billboardTexture(i) {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const b = BILLBOARDS[i % BILLBOARDS.length];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, b.bg); g.addColorStop(1, shade(b.bg, -40));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.3, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b.fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 110px ${BN_FONT}`;
  ctx.fillText(b.bn, 50, H * 0.42, W - 100);
  ctx.font = `600 46px ${EN_FONT}`;
  ctx.fillText(b.en, 54, H * 0.75, W - 100);
  return canvasTexture(c, { repeat: false });
}

// Green direction sign: lines = [[bn, en, km], ...]
// green highway sign: lines [bn, en, km, arrow?]; header = the road number and name
export function directionSignTexture(lines, ref = 'N1', roadBn = 'ঢাকা–চট্টগ্রাম মহাসড়ক') {
  const W = 1024, H = 160 + lines.length * 150;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#0b6b3a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 44px ${EN_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(ref || '', 48, 90);
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(ref && ref.length > 3 ? 170 : 130, 50, 6, 56);
  ctx.fillStyle = '#fff';
  ctx.font = `600 34px ${BN_FONT}`;
  ctx.fillText(roadBn || '', ref && ref.length > 3 ? 200 : 160, 90, W - 220);
  lines.forEach(([bn, en, km, arrow], k) => {
    const y = 180 + k * 150;
    ctx.font = `bold 70px ${BN_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(bn, 48, y + 20, 640);
    ctx.font = `500 38px ${EN_FONT}`;
    ctx.fillText(en, 52, y + 76, 640);
    ctx.textAlign = 'right';
    ctx.font = `bold 80px ${EN_FONT}`;
    ctx.fillText(`${km}`, W - 150, y + 44);
    ctx.font = `500 36px ${EN_FONT}`;
    ctx.fillText('km', W - 48, y + 44);
    if (arrow) {
      ctx.textAlign = 'center';
      ctx.font = `bold 96px ${EN_FONT}`;
      ctx.fillText(arrow, W - 330, y + 50);
    }
  });
  return canvasTexture(c, { repeat: false });
}

export function placeSignTexture(bn, en) {
  const W = 1024, H = 384;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#0d47a1';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `bold 120px ${BN_FONT}`;
  ctx.fillText(bn, W / 2, H * 0.5, W - 80);
  ctx.font = `600 54px ${EN_FONT}`;
  ctx.fillText(en, W / 2, H * 0.83, W - 80);
  return canvasTexture(c, { repeat: false });
}

export function speedSignTexture(limit = 80) {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d10000';
  ctx.lineWidth = 30;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 20, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 110px ${EN_FONT}`;
  ctx.fillText(String(limit), S / 2, S / 2 + 6);
  return canvasTexture(c, { repeat: false });
}

export function kmPostTexture(km) {
  const W = 128, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(0, 0, W, H * 0.35);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${EN_FONT}`;
  ctx.fillText('N1', W / 2, H * 0.24);
  ctx.font = `bold 58px ${EN_FONT}`;
  ctx.fillText(String(km), W / 2, H * 0.62);
  ctx.font = `bold 34px ${BN_FONT}`;
  ctx.fillText('চট্টগ্রাম', W / 2, H * 0.86);
  return canvasTexture(c, { repeat: false });
}

// an undivided 2-lane road, the whole width (u 0 = left edge of the shoulder, 1 = right edge): dashed white
// centre line (solid yellow where overtaking is not allowed is left out), white edge lines, worn shoulders
export function asphaltTexture2(lines = true) {
  const P = PROFILE[2];
  const W = 512, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(8);
  const U = (d) => ((d + P.half) / (2 * P.half)) * W;
  const V = (m) => (m / ASPHALT_TILE) * H;
  ctx.fillStyle = '#58585a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#69655e';
  ctx.fillRect(0, 0, U(-P.edge), H);
  ctx.fillRect(U(P.edge), 0, W, H);
  speckle(ctx, W, H, 26000, ['#4b4c4f', '#616265', '#6b6b6d', '#444547', '#5c5a57'], r, 1, 3);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(40,40,42,0.25)' : 'rgba(110,108,104,0.2)';
    ctx.fillRect(r() * W, r() * H, 20 + r() * 120, 20 + r() * 160);
  }
  for (const lc of [-P.lane / 2, P.lane / 2]) {
    for (const o of [-0.9, 0.9]) {
      const g = ctx.createLinearGradient(U(lc + o - 0.45), 0, U(lc + o + 0.45), 0);
      g.addColorStop(0, 'rgba(30,30,32,0)'); g.addColorStop(0.5, 'rgba(30,30,32,0.3)'); g.addColorStop(1, 'rgba(30,30,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(U(lc + o - 0.45), 0, U(lc + o + 0.45) - U(lc + o - 0.45), H);
    }
  }
  const line = (d, wM, color, dash) => {
    ctx.fillStyle = color;
    const x = U(d - wM / 2), w = U(d + wM / 2) - x;
    if (!dash) ctx.fillRect(x, 0, w, H);
    else for (let m = 0; m < ASPHALT_TILE; m += 9) ctx.fillRect(x, V(m), w, V(4));
  };
  if (lines) {
    line(0, 0.15, '#ecece6', true);            // centre line (dashed)
    line(-P.edge, 0.18, '#ecece6', false);      // edge lines
    line(P.edge, 0.18, '#ecece6', false);
  }
  speckle(ctx, W, H, 5000, ['rgba(60,60,60,0.5)', 'rgba(90,90,90,0.4)'], r, 1, 2);
  return canvasTexture(c);
}

export function curbTexture() {
  // stripes run along v (road direction): 4 bands per tile
  const W = 32, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#1b1b1b' : '#e8e4d8';
    ctx.fillRect(0, (i * H) / 4, W, H / 4);
  }
  return canvasTexture(c);
}

export function concreteTexture(seed = 5, base = '#a9a69e') {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 9000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)', 'rgba(60,50,40,0.1)'], r, 1, 3);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = 'rgba(40,40,30,0.12)';
    ctx.fillRect(r() * S, 0, 3 + r() * 10, S);
  }
  return canvasTexture(c);
}

export function waterNormalTexture() {
  const S = 256;
  const h = new Float32Array(S * S);
  const r = rng(77);
  const waves = Array.from({ length: 12 }, () => ({ kx: (r() - 0.5) * 0.35, ky: (r() - 0.5) * 0.35, p: r() * 6.28, a: 0.3 + r() }));
  // integer wave numbers make it tile
  for (const w of waves) { w.kx = Math.round(w.kx * S / 6.283) * 6.283 / S; w.ky = Math.round(w.ky * S / 6.283) * 6.283 / S; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const w of waves) v += Math.sin(x * w.kx + y * w.ky + w.p) * w.a;
    h[y * S + x] = v;
  }
  const [c, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
    const o = (y * S + x) * 4;
    img.data[o] = (n.x * 0.5 + 0.5) * 255;
    img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { srgb: false });
}

export function smokeTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(90,85,80,0.55)');
  g.addColorStop(0.6, 'rgba(110,105,100,0.25)');
  g.addColorStop(1, 'rgba(120,115,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { repeat: false });
}

export function glowTexture() {
  const S = 64;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { repeat: false });
}

// colourful hand-painted BD truck body
export function truckBodyTexture(seed) {
  const W = 1024, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed * 31 + 9);
  const bases = ['#f4a300', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ff7043'];
  const base = bases[seed % bases.length];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // wooden planks
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (let y = 0; y < H; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // painted bands & flowers
  const band = bases[(seed + 3) % bases.length];
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.08, W, 24);
  ctx.fillRect(0, H * 0.82, W, 24);
  for (let k = 0; k < 14; k++) {
    const x = 40 + k * 72, y = H * 0.5;
    ctx.fillStyle = `hsl(${r() * 360},80%,55%)`;
    for (let p = 0; p < 6; p++) {
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(p) * 14, y + Math.sin(p) * 14, 12, 7, p, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#111';
  ctx.font = `bold 46px ${BN_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(['মায়ের দোয়া', 'আল্লাহর দান', 'সাবধানে চালান', 'হর্ন দিন'][seed % 4], W / 2, H * 0.3);
  return canvasTexture(c, { repeat: false });
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, v));
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
