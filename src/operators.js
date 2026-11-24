// Bangladeshi bus operators and their liveries — repainted from reference photos
// (Wikimedia Commons, see REFERENCES.md). Painted procedurally: no photos or skins are copied.
// Operators without a reference photo (Soudia, Unique, Shohagh) are approximations.
import { BN_FONT, EN_FONT, shade, toBn } from './textures.js';

const SERIF = "'Times New Roman', Georgia, serif";
const SCRIPT = "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive";
const ROUND = "'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";

export const OPERATORS = [
  {
    id: 'hanif', en: 'HANIF ENTERPRISE', bn: 'হানিফ এন্টারপ্রাইজ', ref: true,
    // coach = AC (silver with maroon/orange swooshes); local = non-AC blue; high-deck = olive Volvo (photo)
    base: '#cfd2d4', roof: '#c9ccce', lower: '#cfd2d4', c1: '#8b1a2b', c2: '#e8452c', c3: '#b9bcbe', text: '#8b1a2b',
    style: 'hanifac', curtain: '#5c1621', garland: true, decal: 'HANIF', decal2: 'Economy Class', mirror: '#e53935',
    header: 'HANIF', headerFont: SERIF, headerColor: '#ffd54f', frontLower: '#e53935', frontStripe: '#8b1a2b',
    names: [{ text: 'HANIF', font: SERIF, weight: 'bold', color: '#8b1a2b', t: 0.62, y: -0.3, size: 0.36, spacing: 0.08 }],
    byType: {
      local: {
        base: '#1f55d6', roof: '#1f55d6', lower: '#1f55d6', c1: '#c9ced3', c2: '#53b6ea', c3: '#173f9e', style: 'hanifblue', mirror: '#1f55d6',
        frontLower: '#53b6ea', frontStripe: '#c9ced3', headerColor: '#ffffff', decal: 'HANIF ENTERPRISE', decal2: null, curtain: '#3b3f48',
        names: [{ text: 'HANIF', font: SERIF, weight: 'bold', color: '#e0262c', t: 0.5, y: -0.5, size: 0.4, spacing: 0.08 }],
      },
      highdeck: {
        base: '#4e5b3d', roof: '#6c7a52', lower: '#1d2117', c1: '#e8dcbc', c2: '#8b1e2e', c3: '#c9bc98', style: 'hanif', mirror: '#151515',
        frontLower: '#2a3021', frontStripe: '#e8dcbc', headerColor: '#ffffff', decal2: null,
        names: [{ text: 'HANIF', font: SERIF, weight: 'bold', color: '#8b1e2e', outline: '#f1e6cc', t: 0.45, y: -0.55, size: 0.5, spacing: 0.12 }],
      },
    },
  },
  {
    id: 'greenline', en: 'GREEN LINE', bn: 'গ্রীন লাইন পরিবহন', ref: true,
    base: '#f6f6f3', roof: '#eeeeea', lower: '#f6f6f3', c1: '#43a047', c2: '#4a5560', c3: '#8cc63f', text: '#3d4752',
    style: 'greenline', curtain: '#5f8fb0', decal: 'GREEN LINE', mirror: '#f2f2f2', mirrorTip: '#43a047',
    header: 'GREEN LINE', headerFont: SANS, frontLower: '#f6f6f3', frontStripe: '#43a047',
    names: [{ text: 'GREEN LINE', font: SANS, weight: '800', color: '#3d4752', t: 0.66, y: -0.62, size: 0.34, align: 'left' }],
    byType: {
      local: {
        base: '#86c440', roof: '#86c440', lower: '#86c440', style: 'plain', frontLower: '#86c440', frontStripe: '#5b8f22', mirror: '#86c440',
        names: [{ text: 'GREEN LINE', font: SANS, weight: 'italic 900', color: '#ffffff', outline: '#4c7a1c', t: 0.3, y: -0.45, size: 0.32 }],
      },
    },
  },
  {
    id: 'ena', en: 'ENA TRANSPORT', bn: 'এনা ট্রান্সপোর্ট', ref: true,
    base: '#9d6c50', roof: '#9a6a4e', lower: '#25304a', c1: '#25304a', c2: '#6b2230', c3: '#b98a6c', text: '#ffffff',
    style: 'ena', curtain: '#2b2b33', mirror: '#141414',
    header: 'Ena', headerFont: ROUND, frontLower: '#25304a', frontStripe: '#9d6c50',
    names: [{ text: 'Ena', font: ROUND, weight: 'bold', color: '#ffffff', t: 0.47, y: -0.62, size: 0.52 }],
  },
  {
    id: 'shyamoli', en: 'SHYAMOLI PARIBAHAN', bn: 'শ্যামলী পরিবহন', ref: true,
    base: '#f7f6f1', roof: '#f2f1ec', lower: '#d0262c', c1: '#d0262c', c2: '#ffffff', c3: '#1f7a3a', text: '#111111',
    style: 'redlower', curtain: '#7a1f2b', garland: true, decal: 'SHYAMOLI', mirror: '#e8e6e0', mirrorTip: '#d0262c',
    header: '★ SHYAMOLI ★', headerFont: SERIF, headerSub: 'Business Class', frontLower: '#d0262c', frontStripe: '#ffffff',
    names: [{ text: 'SHYAMOLI PARIBAHAN', font: SERIF, weight: 'bold', color: '#111111', t: 0.5, y: -0.42, size: 0.26, spacing: 0.04 }],
    byType: { highdeck: { lower: '#1f7a3a', c1: '#1f7a3a', mirrorTip: '#1f7a3a', frontLower: '#1f7a3a' } },
  },
  {
    id: 'soudia', en: 'SOUDIA X', bn: 'সৌদিয়া', ref: true,
    base: '#f6d40c', roof: '#f2d00c', lower: '#8e9399', c1: '#8e9399', c2: '#f6d40c', c3: '#e8e8e2', text: '#111111',
    style: 'soudia', curtain: '#2a2a2a', mirror: '#f6d40c',
    header: 'SOUDIA', headerFont: SANS, frontLower: '#f6d40c', frontStripe: '#d32f2f',
    names: [{ parts: [['SOUDIA', '#111111'], [' X', '#d32f2f']], text: 'SOUDIA X', font: SANS, weight: 'italic 900', t: 0.42, y: -0.42, size: 0.3 }],
    logo: 'runner',
  },
  {
    id: 'marsa', en: 'MARSA', bn: 'মারসা পরিবহন', ref: true,
    base: '#2aa3dc', roof: '#2aa3dc', lower: '#2aa3dc', c1: '#ffffff', c2: '#1d3e8f', c3: '#7fd0f2', text: '#1d3e8f',
    style: 'marsa', curtain: '#3b4a5c', mirror: '#2aa3dc',
    header: 'MARSA', headerFont: SANS, headerBg: '#f4f4f2', headerColor: '#1d4fa8',
    frontUpper: '#f4f4f2', frontLower: '#1d3e8f', frontBumper: '#2aa3dc', frontStripe: '#ffffff',
    names: [{ text: 'MARSA', font: SANS, weight: '600', color: '#1d3e8f', t: 0.535, y: -0.5, size: 0.34, spacing: 0.06, align: 'left' }],
    logo: 'swirl',
  },
  {
    id: 'nabil', en: 'NABIL CLASSIC', bn: 'নাবিল পরিবহন', ref: true,
    base: '#d81e24', roof: '#d81e24', lower: '#ffffff', c1: '#ffffff', c2: '#d81e24', c3: '#1f2f7a', text: '#ffffff',
    style: 'nabil', curtain: '#5c3a2e', decal: 'NABIL', decal2: 'CLASSIC', mirror: '#d81e24',
    header: 'NABIL', headerFont: SANS, headerSub: 'Classic', frontLower: '#d81e24', frontStripe: '#ffffff',
    names: [{ parts: [['NABIL ', '#ffffff'], ['CLASSIC', '#ffffff']], text: 'NABIL CLASSIC', font: SERIF, weight: 'bold', t: 0.38, y: -0.5, size: 0.3 }],
    logo: 'nc',
  },
  {
    id: 'shohagh', en: 'SHOHAGH PARIBAHAN', bn: 'সোহাগ পরিবহন', ref: true,
    base: '#b3aca2', roof: '#b0a99f', lower: '#b3aca2', c1: '#141414', c2: '#8f8a84', c3: '#1e3fd0', text: '#cfcac3',
    style: 'shohagh', curtain: '#1a1a1a', decal: 'VOLVO', decal2: 'Shohagh', decalFont: SANS, mirror: '#141414',
    header: 'Shohagh', headerFont: SANS, headerSub: 'Alhamdulillah', frontLower: '#141414', frontStripe: '#1e3fd0',
    names: [{ text: 'Shohagh', font: SANS, weight: 'italic 800', color: '#b3aca2', outline: '#2b2b2b', t: 0.55, y: -0.12, size: 0.3 }],
    logo: 'bolt',
  },
  {
    id: 'unique', en: 'UNIQUE SERVICE', bn: 'ইউনিক', ref: true,
    base: '#f2281a', roof: '#ee2618', lower: '#f2281a', c1: '#ffc20e', c2: '#2d3a8c', c3: '#1f9a3a', text: '#e0201a',
    style: 'unique', curtain: '#3a2a2a', mirror: '#f2281a',
    header: 'ইউনিক', headerFont: BN_FONT, headerBadge: true, headerSub: 'ঢাকা ⇄ সিলেট', frontLower: '#2d3a8c', frontStripe: '#ffc20e',
    names: [], logo: 'uniquebadge',
  },
  {
    id: 'desh', en: 'DESH TRAVELS', bn: 'দেশ ট্রাভেলস', ref: true,
    base: '#ebe5d1', roof: '#e6e0cb', lower: '#5b6067', c1: '#5b6067', c2: '#c62828', c3: '#2e7d32', text: '#c62828',
    style: 'desh', curtain: '#6b2a1e', garland: true, mirror: '#1a1a1a',
    header: 'Desh Travels', headerFont: SCRIPT, frontLower: '#5b6067', frontStripe: '#ebe5d1',
    names: [{ parts: [['Desh ', '#c62828'], ['Travels', '#2e7d32']], text: 'Desh Travels', font: SCRIPT, weight: 'bold', t: 0.12, y: -0.38, size: 0.36 }],
  },
  {
    id: 'shahfatehali', en: 'SHAH FATEH ALI', bn: 'শাহ ফতেহ আলী', ref: true,
    base: '#f3f3f1', roof: '#c9cbcc', lower: '#f3f3f1', c1: '#121212', c2: '#8f9497', c3: '#5b5f62', text: '#ffffff',
    style: 'blackswoosh', curtain: '#1a1a1a', decal: 'Shah Foteh Ali', decal2: 'Business Class', decalFont: SCRIPT, mirror: '#f0f0f0',
    header: 'শাহ ফতেহ আলী', headerFont: BN_FONT, frontLower: '#d9dbdc', frontStripe: '#121212',
    names: [{ text: 'শাহ ফতেহ আলী', font: BN_FONT, weight: 'bold', color: '#ffffff', t: 0.5, y: -0.25, size: 0.34 }],
  },
  {
    id: 'ekushey', en: 'EKUSHEY AIR CON', bn: 'একুশে', ref: true,
    base: '#f1f0ea', roof: '#ecebe4', lower: '#f1f0ea', c1: '#f2c500', c2: '#d4a900', c3: '#333333', text: '#f2c500',
    style: 'yellowsweep', curtain: '#20262c', decal: 'EKUSHEY AIR CON', decalFont: SANS, windowBn: 'একুশে', mirror: '#ecebe4',
    header: 'EKUSHEY', headerFont: SANS, frontLower: '#f1f0ea', frontStripe: '#f2c500',
    names: [],
  },
];

// Operator colours/style for a given bus type (some operators run different liveries per model)
export function liveryFor(op, type) {
  const v = op.byType?.[type];
  return v ? { ...op, ...v } : op;
}

export function randomPlate(r, city = 'ঢাকা') {
  return `${city} মেট্রো-ব ${toBn(11 + ((r() * 9) | 0))}-${toBn(1000 + ((r() * 8999) | 0))}`;
}

function rr(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// t = 0 front .. 1 rear, y = metres above ground
function sideFrame(W, H, spec, frontAtLeft) {
  const z0 = spec.front - spec.r, z1 = spec.rear + spec.r;
  const y0 = spec.floor + spec.r, y1 = spec.H - spec.r;
  const tz = (z) => (z0 - z) / (z0 - z1);
  const X = (t) => (frontAtLeft ? t : 1 - t) * W;
  const Y = (y) => ((y1 - y) / (y1 - y0)) * H;
  const XZ = (z) => X(tz(z));
  return { X, Y, XZ, tz, W, H, frontAtLeft, pxPerM: W / (z0 - z1), pyPerM: H / (y1 - y0) };
}

// smooth closed shape through [t, y] points
function blob(ctx, f, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const P = pts.map(([t, y]) => [f.X(t), f.Y(y)]);
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
    ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my);
  }
  ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  ctx.closePath();
  ctx.fill();
}
// smooth open stroke through [t, y] points, width in metres
function line(ctx, f, pts, color, wM) {
  ctx.strokeStyle = color;
  ctx.lineWidth = wM * f.pyPerM;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const P = pts.map(([t, y]) => [f.X(t), f.Y(y)]);
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
    ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my);
  }
  ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  ctx.stroke();
}
const band = (ctx, f, y0, y1, c) => { ctx.fillStyle = c; ctx.fillRect(0, f.Y(y1), f.W, f.Y(y0) - f.Y(y1)); };

// text with true proportions on the (non-square) side canvas
function text(ctx, f, str, t, y, sizeM, { font = SANS, weight = 'bold', color = '#000', outline = null, align = 'center', spacing = 0, maxT = 0.6 } = {}) {
  const k = f.pxPerM / f.pyPerM;
  const px = sizeM * f.pyPerM;
  ctx.save();
  ctx.translate(f.X(t), f.Y(y));
  ctx.scale(k, 1);
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * px}px`;
  const maxW = (maxT * f.W) / k;
  if (outline) { ctx.lineWidth = px * 0.14; ctx.strokeStyle = outline; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, 0, maxW); }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0, maxW);
  ctx.restore();
}

function drawLogo(ctx, f, op, s) {
  if (!op.logo) return;
  const k = f.pxPerM / f.pyPerM;
  const at = (t, y, fn) => { ctx.save(); ctx.translate(f.X(t), f.Y(y)); ctx.scale(k, 1); fn(f.pyPerM); ctx.restore(); };
  const fl = s.floor, lh = s.winBot - fl;
  if (op.logo === 'runner') at(0.8, fl + lh * 0.72, (m) => {
    ctx.fillStyle = '#111'; ctx.strokeStyle = '#111'; ctx.lineWidth = m * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(m * 0.1, -m * 0.2, m * 0.05, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(m * 0.06, -m * 0.12); ctx.lineTo(-m * 0.04, m * 0.04); ctx.lineTo(-m * 0.16, m * 0.1);
    ctx.moveTo(-m * 0.04, m * 0.04); ctx.lineTo(m * 0.06, m * 0.16); ctx.moveTo(m * 0.02, -m * 0.06); ctx.lineTo(m * 0.16, -m * 0.02);
    ctx.moveTo(m * 0.02, -m * 0.06); ctx.lineTo(-m * 0.12, -m * 0.08); ctx.stroke();
  });
  if (op.logo === 'swirl') at(0.465, fl + lh * 0.67, (m) => {
    ctx.lineWidth = m * 0.035;
    for (const [r, c, a0] of [[0.17, '#1d3e8f', 0.3], [0.13, '#2aa3dc', 3.4], [0.09, '#1d3e8f', 1.2]]) { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(0, 0, m * r, a0, a0 + 4.2); ctx.stroke(); }
  });
  if (op.logo === 'nc') at(0.5, fl + lh * 0.25, (m) => {
    ctx.fillStyle = '#d81e24'; ctx.font = `bold ${m * 0.34}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', -m * 0.07, 0); ctx.font = `bold ${m * 0.24}px ${SERIF}`; ctx.fillText('C', m * 0.11, m * 0.05);
  });
  if (op.logo === 'bolt') at(0.3, fl + lh * 0.55, (m) => {
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = m * 0.03;
    ctx.beginPath(); ctx.arc(0, 0, m * 0.36, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath(); ctx.moveTo(m * 0.3, -m * 0.34); ctx.lineTo(-m * 0.08, m * 0.02); ctx.lineTo(m * 0.06, m * 0.02); ctx.lineTo(-m * 0.3, m * 0.3);
    ctx.lineTo(m * 0.18, -m * 0.06); ctx.lineTo(m * 0.02, -m * 0.06); ctx.closePath(); ctx.fill();
  });
  if (op.logo === 'uniquebadge') for (const t of [0.12, 0.82]) at(t, s.winBot - 0.28, (m) => {
    ctx.fillStyle = '#ffffff'; rr(ctx, -m * 0.55, -m * 0.13, m * 1.1, m * 0.26, m * 0.05); ctx.fill();
    ctx.fillStyle = '#2d3a8c'; ctx.beginPath(); ctx.moveTo(-m * 0.53, m * 0.1); ctx.lineTo(-m * 0.2, -m * 0.11); ctx.lineTo(-m * 0.25, m * 0.1); ctx.fill();
    ctx.fillStyle = '#e0201a'; ctx.font = `bold ${m * 0.2}px ${BN_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ইউনিক', m * 0.15, m * 0.01);
  });
}

// several coloured words in one left-to-right run, anchored at the end nearest the bus front
function multiText(ctx, f, nm, y) {
  const k = f.pxPerM / f.pyPerM, px = nm.size * f.pyPerM;
  ctx.save();
  ctx.font = `${nm.weight || 'bold'} ${px}px ${nm.font}`;
  const widths = nm.parts.map(([t]) => ctx.measureText(t).width * k);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = f.frontAtLeft ? f.X(nm.t) : f.X(nm.t) - total;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  nm.parts.forEach(([t, c], i) => {
    ctx.save(); ctx.translate(x, f.Y(y)); ctx.scale(k, 1);
    ctx.fillStyle = c; ctx.fillText(t, 0, 0);
    ctx.restore();
    x += widths[i];
  });
  ctx.restore();
}

const STYLES = {
  plain() {},
  hanif(ctx, f, op, s) {
    // olive fading to near-black below, cream swoosh and swirl near the rear
    const g = ctx.createLinearGradient(0, f.Y(s.H), 0, f.Y(s.floor));
    g.addColorStop(0, op.roof); g.addColorStop(0.45, op.base); g.addColorStop(1, op.lower);
    ctx.fillStyle = g; ctx.fillRect(0, 0, f.W, f.H);
    const wb = s.winBot;
    line(ctx, f, [[-0.02, s.floor + 0.55], [0.35, s.floor + 0.62], [0.65, wb - 0.35], [0.92, wb + 0.02], [1.03, wb + 0.1]], op.c1, 0.05);
    line(ctx, f, [[0.1, s.floor + 0.42], [0.45, s.floor + 0.5], [0.75, wb - 0.55], [1.03, wb - 0.2]], op.c3, 0.02);
    blob(ctx, f, [[0.7, wb - 0.2], [0.82, wb + 0.05], [0.95, wb - 0.1], [0.99, wb - 0.55], [0.92, wb - 0.35], [0.84, wb - 0.12]], op.c1);
    blob(ctx, f, [[0.76, wb - 0.32], [0.86, wb - 0.12], [0.95, wb - 0.4], [0.9, wb - 0.33], [0.84, wb - 0.22]], op.lower);
  },
  greenline(ctx, f, op, s) {
    const cy = (s.floor + s.winBot) / 2 + 0.05, R = (s.winBot - s.floor) * 0.46;
    const cx = f.X(0.56), ry = R * f.pyPerM, rx = R * f.pxPerM;
    const ell = (k, col, fill = true, w = 0) => {
      ctx.beginPath(); ctx.ellipse(cx, f.Y(cy), rx * k, ry * k, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.lineWidth = w * f.pyPerM; ctx.stroke(); }
    };
    ell(1.0, op.c2, false, 0.05);
    ell(0.9, op.c2, false, 0.02);
    ell(0.8, op.c1);
    band(ctx, f, s.floor + 0.08, s.floor + 0.13, op.c1);
  },
  ena(ctx, f, op, s) {
    const wb = s.winBot;
    ctx.fillStyle = op.base; ctx.fillRect(0, 0, f.W, f.H);
    // navy lower body with copper waves cutting in
    blob(ctx, f, [[-0.05, 0], [-0.05, wb - 0.08], [0.12, wb - 0.1], [0.3, s.floor + 0.95], [0.45, s.floor + 0.6], [0.6, wb - 0.35],
      [0.78, wb - 0.05], [1.05, wb - 0.02], [1.05, 0]], op.c1);
    blob(ctx, f, [[0.36, 0], [0.38, s.floor + 0.45], [0.5, s.floor + 0.85], [0.6, s.floor + 0.6], [0.66, 0]], op.base);
    line(ctx, f, [[0.62, s.floor + 0.25], [0.7, s.floor + 0.75], [0.84, wb - 0.1], [1.02, wb + 0.25]], op.c2, 0.06);
    line(ctx, f, [[0.86, wb - 0.05], [0.94, wb + 0.15], [1.02, wb + 0.4]], op.c2, 0.08);
    line(ctx, f, [[-0.02, wb - 0.04], [1.02, wb - 0.04]], '#e9e2d8', 0.015);
  },
  redlower(ctx, f, op, s) {
    const wb = s.winBot;
    blob(ctx, f, [[-0.05, 0], [-0.05, s.floor + 0.78], [0.3, s.floor + 0.72], [0.62, s.floor + 0.85], [0.85, wb - 0.4], [1.05, wb - 0.15], [1.05, 0]], op.c1);
    line(ctx, f, [[-0.02, s.floor + 0.58], [0.3, s.floor + 0.52], [0.62, s.floor + 0.65], [0.85, wb - 0.6], [1.03, wb - 0.35]], op.c2, 0.03);
    line(ctx, f, [[-0.02, s.floor + 0.48], [0.3, s.floor + 0.42], [0.62, s.floor + 0.55], [0.85, wb - 0.7], [1.03, wb - 0.45]], op.c2, 0.015);
  },
  desh(ctx, f, op, s) {
    const by = s.floor + (s.winBot - s.floor) * 0.42;
    band(ctx, f, 0, by, op.c1);
    band(ctx, f, by, by + 0.03, shade(op.c1, -25));
    ctx.fillStyle = shade(op.c1, -10);
    ctx.fillRect(Math.min(f.X(0.97), f.X(1.05)), 0, Math.abs(f.X(1.05) - f.X(0.97)), f.H);
  },
  blackswoosh(ctx, f, op, s) {
    const wb = s.winBot;
    blob(ctx, f, [[0.08, s.winTop + 0.08], [0.08, wb - 0.1], [0.22, wb - 0.35], [0.38, s.floor + 0.35], [0.6, s.floor + 0.25], [0.75, s.floor + 0.6], [0.9, wb - 0.3], [0.98, wb - 0.05], [0.98, s.winTop + 0.08]], op.c1);
    for (const [o, c, w] of [[0, op.c2, 0.1], [0.15, op.c3, 0.05], [-0.12, op.c2, 0.04]]) {
      line(ctx, f, [[0.2, wb - 0.5 + o], [0.38, s.floor + 0.6 + o], [0.55, s.floor + 0.55 + o], [0.72, s.floor + 0.85 + o], [0.86, wb - 0.35 + o]], c, w);
    }
  },
  yellowsweep(ctx, f, op, s) {
    blob(ctx, f, [[-0.05, 0], [-0.05, s.floor + 0.08], [0.4, s.floor + 0.12], [0.75, s.floor + 0.35], [1.05, s.floor + 0.62], [1.05, 0]], op.c1);
  },
  hanifac(ctx, f, op, s) {
    // silver body, long maroon + orange-red blades sweeping up towards the rear
    const fl = s.floor, wb = s.winBot;
    for (const [o, c, w] of [[0, op.c1, 0.16], [0.2, op.c2, 0.06], [0.33, op.c1, 0.05], [-0.18, op.c2, 0.05]]) {
      line(ctx, f, [[0.08, fl + 0.4 + o * 0.4], [0.35, fl + 0.48 + o * 0.6], [0.62, fl + 0.72 + o], [0.86, wb - 0.38 + o], [1.03, wb - 0.1 + o]], c, w);
    }
    band(ctx, f, wb + 0.0, wb + 0.04, op.c1);
  },
  hanifblue(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    blob(ctx, f, [[-0.05, fl + 0.45], [0.2, wb - 0.05], [0.5, wb - 0.08], [0.8, wb - 0.1], [1.05, wb - 0.05], [1.05, fl + 0.55], [0.8, fl + 0.75], [0.5, fl + 0.6], [0.25, fl + 0.55]], op.c1);
    line(ctx, f, [[-0.02, fl + 0.4], [0.2, wb - 0.1], [0.4, wb - 0.05]], op.c2, 0.08);
    line(ctx, f, [[0.6, fl + 0.05], [0.72, fl + 0.6], [0.95, wb - 0.1], [1.03, wb]], op.c2, 0.1);
    line(ctx, f, [[0.08, fl + 0.05], [0.22, fl + 0.35], [0.4, fl + 0.55]], op.c2, 0.06);
    band(ctx, f, wb - 0.02, wb + 0.02, '#e8ecef');
  },
  soudia(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    // grey lower body with diagonal panels at both ends
    blob(ctx, f, [[-0.05, 0], [-0.05, fl + 0.55], [0.5, fl + 0.55], [0.8, fl + 0.6], [1.05, fl + 0.7], [1.05, 0]], op.c1);
    blob(ctx, f, [[0.82, s.H], [0.9, wb + 0.2], [1.05, wb - 0.2], [1.05, s.H]], op.c1);
    blob(ctx, f, [[-0.05, s.H], [-0.05, wb + 0.1], [0.06, s.H]], op.c1);
    for (let k = 0; k < 4; k++) line(ctx, f, [[0.18, fl + 0.14 + k * 0.1], [0.7, fl + 0.14 + k * 0.1], [0.98, fl + 0.24 + k * 0.1]], k % 2 ? op.c3 : op.c2, 0.03);
  },
  marsa(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    blob(ctx, f, [[-0.05, wb - 0.05], [0.25, wb - 0.08], [0.6, fl + 0.85], [0.85, fl + 0.35], [1.05, fl + 0.3], [1.05, fl + 0.05], [0.7, fl + 0.3], [0.4, fl + 0.65], [-0.05, fl + 0.8]], op.c1);
    line(ctx, f, [[0.12, wb - 0.05], [0.45, wb - 0.25], [0.72, fl + 0.55], [0.92, fl + 0.25], [1.03, fl + 0.2]], op.c2, 0.09);
  },
  nabil(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    // red upper, white lower with red ribbon stripes
    blob(ctx, f, [[-0.05, 0], [-0.05, fl + 0.75], [0.3, fl + 0.6], [0.6, fl + 0.62], [0.85, fl + 0.72], [1.05, fl + 0.8], [1.05, 0]], op.c1);
    for (let k = 0; k < 3; k++) line(ctx, f, [[-0.02, fl + 0.6 - k * 0.12], [0.3, fl + 0.48 - k * 0.12], [0.6, fl + 0.5 - k * 0.1], [1.03, fl + 0.68 - k * 0.12]], op.c2, 0.03 - k * 0.006);
  },
  shohagh(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    // black window band that sweeps down to the rear wheels
    blob(ctx, f, [[0.06, s.winTop + 0.1], [0.06, wb - 0.12], [0.3, wb - 0.15], [0.55, wb - 0.2], [0.72, fl + 0.65], [0.85, fl + 0.3], [1.0, fl + 0.25], [1.0, s.winTop + 0.1]], op.c1);
    band(ctx, f, s.winTop + 0.1, s.winTop + 0.14, op.c3);
  },
  unique(ctx, f, op, s) {
    const fl = s.floor, wb = s.winBot;
    const arc = (t0, c, w, rise) => line(ctx, f, [[t0, fl + 0.02], [t0 + 0.08, fl + rise * 0.6], [t0 + 0.2, wb - 0.1], [t0 + 0.34, wb + 0.05]], c, w);
    for (const [t, c, w, r] of [[-0.1, op.c1, 0.2, 1.2], [0.25, op.c1, 0.22, 1.0], [0.62, op.c1, 0.2, 1.1], [0.0, op.c2, 0.05, 1.3], [0.4, op.c3, 0.05, 1.2], [0.7, op.c2, 0.06, 1.0], [0.18, op.c3, 0.04, 1.1]]) arc(t, c, w, r);
    line(ctx, f, [[-0.02, fl + 0.2], [0.4, fl + 0.4], [0.7, fl + 0.25], [1.02, fl + 0.45]], op.c1, 0.12);
  },
  swoosh(ctx, f, op, s) {
    const wb = s.winBot;
    blob(ctx, f, [[-0.05, 0.2], [0.2, 0.2], [0.55, wb * 0.55], [0.85, wb + 0.4], [1.05, s.H], [1.05, 0.2]], op.c1);
    blob(ctx, f, [[0.1, 0.2], [0.4, 0.3], [0.7, wb * 0.75], [0.95, s.H], [1.05, s.H], [1.05, wb + 0.1], [0.75, wb * 0.45], [0.45, 0.2]], op.c2);
    blob(ctx, f, [[0.3, 0.2], [0.55, 0.32], [0.8, wb * 0.7], [1.0, s.H * 0.98], [1.04, s.H], [0.88, wb * 0.75], [0.62, 0.2]], op.c3);
  },
  split(ctx, f, op, s) {
    const wb = s.winBot;
    band(ctx, f, 0, s.floor + 0.55, op.c1);
    blob(ctx, f, [[-0.05, wb - 0.25], [0.3, wb - 0.35], [0.7, wb - 0.05], [1.05, wb + 0.3], [1.05, wb + 0.15], [0.7, wb - 0.2], [0.3, wb - 0.5], [-0.05, wb - 0.42]], op.c2);
  },
  bands(ctx, f, op, s) {
    const wb = s.winBot;
    band(ctx, f, wb - 0.32, wb - 0.12, op.c1);
    band(ctx, f, wb - 0.5, wb - 0.4, op.c2);
    band(ctx, f, 0.35, 0.62, op.c1);
    band(ctx, f, 0.66, 0.74, op.c3);
  },
};

export function paintSide(ctx, W, H, spec, op, frontAtLeft) {
  const f = sideFrame(W, H, spec, frontAtLeft);
  ctx.fillStyle = op.base;
  ctx.fillRect(0, 0, W, H);
  (STYLES[op.style] || STYLES.plain)(ctx, f, op, spec);

  // luggage bay doors + engine grille (coaches)
  if (spec.bays) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, f.pxPerM * 0.018);
    const zA = spec.wheelbase - 0.9, zB = 0.9, nb = 3;
    for (let k = 0; k < nb; k++) {
      const za = zA - ((zA - zB) / nb) * k, zb = zA - ((zA - zB) / nb) * (k + 1);
      ctx.strokeRect(Math.min(f.XZ(za), f.XZ(zb)) + 3, f.Y(spec.floor + 1.1), Math.abs(f.XZ(za) - f.XZ(zb)) - 6, f.Y(spec.floor + 0.12) - f.Y(spec.floor + 1.1));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let k = 0; k < 7; k++) ctx.fillRect(Math.min(f.X(0.9), f.X(0.97)), f.Y(spec.floor + 0.95 - k * 0.1), Math.abs(f.X(0.97) - f.X(0.9)), Math.max(2, f.pyPerM * 0.03));
  }

  // ---- windows: tinted glass, pillars, curtains and garlands ----
  const wy = f.Y(spec.winTop), wh = f.Y(spec.winBot) - f.Y(spec.winTop);
  const zFront = spec.front - 0.15, zRear = spec.rear + 0.35;
  const leftSide = frontAtLeft;
  const doorZ0 = spec.front - 0.25, doorZ1 = spec.front - 1.2;
  const glass = (x, y, w, h, rad) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2c3d49'); g.addColorStop(0.5, '#141d24'); g.addColorStop(1, '#0b1116');
    ctx.fillStyle = g;
    rr(ctx, x, y, w, h, rad); ctx.fill();
  };
  const panes = [];
  const n = spec.pillars, span = zFront - 1.25 - zRear;
  for (let k = 0; k < n; k++) panes.push([zFront - 1.25 - (span / n) * k, zFront - 1.25 - (span / n) * (k + 1)]);
  if (!spec.framed) {
    const x = Math.min(f.XZ(zFront - 1.2), f.XZ(zRear)), w = Math.abs(f.XZ(zFront - 1.2) - f.XZ(zRear));
    glass(x, wy, w, wh, f.pxPerM * 0.1);
  }
  const curtain = op.curtain || '#5c1621';
  panes.forEach(([za, zb], k) => {
    const x = Math.min(f.XZ(za), f.XZ(zb)) + 3, w = Math.abs(f.XZ(za) - f.XZ(zb)) - 6;
    if (spec.framed) { ctx.fillStyle = '#c9cfd4'; rr(ctx, x - 5, wy - 5, w + 10, wh + 10, 8); ctx.fill(); glass(x, wy, w, wh, 6); }
    const cw = w * 0.16;
    for (const cx of [x, x + w - cw]) {
      const g = ctx.createLinearGradient(cx, 0, cx + cw, 0);
      g.addColorStop(0, shade(curtain, -20)); g.addColorStop(0.5, shade(curtain, 25)); g.addColorStop(1, shade(curtain, -20));
      ctx.fillStyle = g; ctx.globalAlpha = 0.85;
      ctx.fillRect(cx, wy + wh * 0.06, cw, wh * 0.9);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = shade(curtain, 10);
    ctx.globalAlpha = 0.8; ctx.fillRect(x, wy + wh * 0.04, w, wh * 0.08); ctx.globalAlpha = 1;
    if (op.garland) {
      for (let i = 0; i < 14; i++) {
        const gx = x + (i + 0.5) * (w / 14), gy = wy + wh * (0.16 + 0.07 * Math.sin((i / 13) * Math.PI));
        ctx.fillStyle = i % 2 ? '#ffb300' : '#ff7043';
        ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, wh * 0.03), 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!spec.framed) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(f.XZ(zb) - f.pxPerM * 0.035, wy, f.pxPerM * 0.07, wh); }
    const dec = op.decal2 && k % 2 ? op.decal2 : op.decal;
    if (dec) text(ctx, f, dec, f.tz((za + zb) / 2), spec.winTop - 0.12, 0.1, { font: op.decalFont || SERIF, weight: 'bold', color: '#f5f5f5', maxT: 0.09 });
  });
  if (op.windowBn) text(ctx, f, op.windowBn, 0.5, (spec.winTop + spec.winBot) / 2 - 0.05, 0.38, { font: BN_FONT, color: op.c1, maxT: 0.3 });
  ctx.fillStyle = 'rgba(200,220,235,0.07)';
  for (let k = 0; k < 4; k++) {
    const x = f.X(0.1 + k * 0.25);
    ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x + f.pxPerM * 0.6, wy); ctx.lineTo(x + f.pxPerM * 0.2, wy + wh); ctx.lineTo(x - f.pxPerM * 0.4, wy + wh); ctx.fill();
  }

  // driver window (right) / entrance door (left)
  if (leftSide) {
    const x = Math.min(f.XZ(doorZ0), f.XZ(doorZ1)), w = Math.abs(f.XZ(doorZ0) - f.XZ(doorZ1));
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 4, f.Y(spec.winTop + 0.05), w + 8, f.Y(spec.floor + 0.05) - f.Y(spec.winTop + 0.05));
    glass(x, f.Y(spec.winTop), w, f.Y(spec.floor + 0.4) - f.Y(spec.winTop), 6);
    ctx.fillStyle = '#cfd3d6';
    ctx.fillRect(x + w * 0.48, f.Y(spec.winTop), Math.max(2, w * 0.04), f.Y(spec.floor + 0.4) - f.Y(spec.winTop));
  } else {
    const za = spec.front - 0.2, zb = spec.front - 1.1;
    const x = Math.min(f.XZ(za), f.XZ(zb)), w = Math.abs(f.XZ(za) - f.XZ(zb));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, f.Y(spec.winTop + 0.04), w + 8, f.Y(spec.winBot - 0.3) - f.Y(spec.winTop + 0.04));
    glass(x, f.Y(spec.winTop), w, f.Y(spec.winBot - 0.3) - f.Y(spec.winTop), 8);
  }

  // wheel arches
  for (const z of spec.wheelZ) {
    ctx.fillStyle = '#101010';
    ctx.beginPath();
    ctx.ellipse(f.XZ(z), f.Y(spec.wheelR), f.pxPerM * (spec.wheelR + 0.1), f.pyPerM * (spec.wheelR + 0.12), 0, Math.PI, 0);
    ctx.fill();
  }

  // operator names
  const lowerH = spec.winBot - spec.floor, kk = Math.min(1, lowerH / 1.52);
  const nameY = (y) => spec.floor + lowerH * (1 + y / 1.52);
  for (const nm0 of op.names || []) {
    const nm = { ...nm0, size: nm0.size * kk };
    if (nm.parts) { multiText(ctx, f, nm, nameY(nm.y)); continue; }
    text(ctx, f, nm.text, nm.t, nameY(nm.y), nm.size, { font: nm.font, weight: nm.weight, color: nm.color, outline: nm.outline, align: nm.align === 'left' ? (frontAtLeft ? 'left' : 'right') : 'center', spacing: nm.spacing || 0, maxT: 0.5 });
  }
  drawLogo(ctx, f, op, spec);
  if (op.style === 'hanif') text(ctx, f, 'VOLVO', 0.86, spec.floor + 0.78, 0.12, { font: SERIF, color: '#e9e2cf', maxT: 0.1 });
  // small Bangla name near the front when the main name is in English
  if (!/[ঀ-৿]/.test(op.names?.[0]?.text || '') && !op.windowBn) {
    const dark = ['hanif', 'ena'].includes(op.style);
    const tw = 0.9;   // small Bangla name above the engine grille, clear of the main names
    if (op.logo !== 'uniquebadge') text(ctx, f, op.bn, tw, Math.min(spec.winBot - 0.14, spec.floor + spec.wheelR * 2 + 0.1), 0.11, { font: BN_FONT, color: dark ? '#f2f2f2' : '#222', maxT: 0.12 });
  }

  // side marker lamps
  ctx.fillStyle = '#ff9800';
  for (const t of [0.04, 0.5, 0.96]) ctx.fillRect(f.X(t) - 6, f.Y(spec.floor + 0.3) - 4, 12, 8);
  // road grime
  const gr = ctx.createLinearGradient(0, f.Y(spec.floor + 0.8), 0, H);
  gr.addColorStop(0, 'rgba(90,75,55,0)');
  gr.addColorStop(1, 'rgba(90,75,55,0.3)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, f.Y(spec.floor + 0.8), W, H);
  return f;
}

// Front: only the part below the windshield is visible on the model (glass + name sticker are meshes)
export function paintFront(ctx, W, H, spec, op, plate) {
  const hw = spec.W / 2 - spec.r;
  const y0 = spec.floor + spec.r, y1 = spec.H - spec.r;
  const X = (x) => ((x + hw) / (2 * hw)) * W;
  const Y = (y) => ((y1 - y) / (y1 - y0)) * H;
  const ws = spec.wsBot;
  ctx.fillStyle = op.base;
  ctx.fillRect(0, 0, W, H);
  if (spec.cockpit === 'ak') {
    // Hino AK1J nose: upper panel, a lamp/grille band, then the bumper
    const bandTop = Math.min(spec.floor + 0.88, ws - 0.38), bandBot = spec.floor + 0.36;
    ctx.fillStyle = op.frontUpper || op.base; ctx.fillRect(0, 0, W, Y(bandTop));
    ctx.fillStyle = op.frontLower || op.c1; ctx.fillRect(0, Y(bandTop), W, Y(bandBot) - Y(bandTop));
    ctx.fillStyle = op.frontStripe || '#ffffff'; ctx.fillRect(0, Y(bandTop) - 4, W, 6);
    ctx.fillStyle = op.frontBumper || shade(op.frontLower || op.c1, 30); ctx.fillRect(0, Y(bandBot), W, H - Y(bandBot));
  } else {
  ctx.fillStyle = op.frontLower || op.c1;
  ctx.beginPath();
  ctx.moveTo(0, Y(spec.floor + 0.75));
  ctx.quadraticCurveTo(W / 2, Y(spec.floor + 0.5), W, Y(spec.floor + 0.75));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = op.frontStripe || op.c2;
  ctx.lineWidth = H * 0.012;
  ctx.beginPath();
  ctx.moveTo(0, Y(spec.floor + 0.82));
  ctx.quadraticCurveTo(W / 2, Y(spec.floor + 0.57), W, Y(spec.floor + 0.82));
  ctx.stroke();
  }
  // thin rubber seal under the windshield
  ctx.fillStyle = '#2a2d30';
  ctx.fillRect(0, Y(ws + 0.02), W, Y(ws - 0.02) - Y(ws + 0.02));
  // grille (kept clear of the windshield on short-nosed AK bodies)
  const ak = spec.cockpit === 'ak';
  const akTop = Math.min(spec.floor + 0.88, ws - 0.38);
  const gT = ak ? akTop - 0.06 : Math.min(spec.floor + 0.98, ws - 0.26), gB = ak ? spec.floor + 0.44 : gT - 0.36;
  const gw = ak ? 0.5 : 0.5;
  ctx.fillStyle = '#16181a';
  rr(ctx, X(-gw), Y(gT), X(gw) - X(-gw), Y(gB) - Y(gT), 14);
  ctx.fill();
  ctx.fillStyle = '#c3c9ce';
  const bars = ak ? 5 : 4;
  for (let k = 0; k < bars; k++) ctx.fillRect(X(-gw + 0.04), Y(gT - 0.05 - k * ((gT - gB - 0.08) / (bars - 1))), X(gw - 0.04) - X(-gw + 0.04), 5);
  if (ak) {
    // chrome winged badge with a red oval above the grille
    const by = Y(akTop + 0.13), bw = X(0.42) - X(0);
    ctx.fillStyle = '#d8dde1';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + sx * bw * 0.18, by - 6);
      ctx.lineTo(W / 2 + sx * bw, by - 2);
      ctx.lineTo(W / 2 + sx * bw * 0.9, by + 6);
      ctx.lineTo(W / 2 + sx * bw * 0.18, by + 8);
      ctx.fill();
      for (let k = 1; k < 4; k++) { ctx.fillStyle = 'rgba(80,90,100,0.6)'; ctx.fillRect(W / 2 + sx * bw * (0.25 + k * 0.17) - (sx < 0 ? 2 : 0), by - 4, 2, 10); ctx.fillStyle = '#d8dde1'; }
    }
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.ellipse(W / 2, by + 1, bw * 0.2, (Y(0) - Y(0.07)), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8ecef'; ctx.lineWidth = 3; ctx.stroke();
  } else {
    ctx.strokeStyle = '#d9dde0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(W / 2, Y((gT + gB) / 2), W * 0.04, W * 0.025, 0, 0, Math.PI * 2); ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#1b1d20';
      rr(ctx, X(sx > 0 ? hw - 0.62 : -hw + 0.04), Y(spec.floor + 1.0), X(-hw + 0.62) - X(-hw + 0.04), Y(spec.floor + 0.66) - Y(spec.floor + 1.0), 16);
      ctx.fill();
    }
  }
  // bumper + green private-vehicle plate
  if (!ak) { ctx.fillStyle = '#26282b'; ctx.fillRect(0, Y(spec.floor + 0.35), W, H); }
  const pw = 0.6, ph = 0.2;
  ctx.fillStyle = '#18a558';
  ctx.fillRect(X(-pw / 2), Y(spec.floor + 0.32), X(pw / 2) - X(-pw / 2), Y(spec.floor + 0.32 - ph) - Y(spec.floor + 0.32));
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${(Y(0) - Y(ph)) * 0.38}px ${BN_FONT}`;
  const [l1, l2] = plate.split(' ব ');
  ctx.fillText(l1 + ' ব', W / 2, Y(spec.floor + 0.27), X(pw / 2) - X(-pw / 2));
  ctx.fillText(l2 || '', W / 2, Y(spec.floor + 0.17), X(pw / 2) - X(-pw / 2));
}

export function paintRear(ctx, W, H, spec, op, plate) {
  const hw = spec.W / 2 - spec.r;
  const y0 = spec.floor + spec.r, y1 = spec.H - spec.r;
  const X = (x) => ((x + hw) / (2 * hw)) * W;
  const Y = (y) => ((y1 - y) / (y1 - y0)) * H;
  ctx.fillStyle = op.base;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = op.frontLower || op.c1;
  ctx.fillRect(0, Y(spec.floor + 0.7), W, H);
  const g = ctx.createLinearGradient(0, Y(spec.winTop), 0, Y(spec.winBot));
  g.addColorStop(0, '#2c3d49'); g.addColorStop(1, '#0b1116');
  ctx.fillStyle = g;
  rr(ctx, X(-hw + 0.12), Y(spec.winTop), X(hw - 0.12) - X(-hw + 0.12), Y(spec.winBot + 0.05) - Y(spec.winTop), 16);
  ctx.fill();
  if (op.headerBg) { ctx.fillStyle = op.headerBg; ctx.fillRect(X(-hw + 0.12), Y(spec.winTop), X(hw - 0.12) - X(-hw + 0.12), Y(spec.winTop - 0.5) - Y(spec.winTop)); }
  ctx.fillStyle = op.headerBg ? (op.headerColor || '#111') : '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${W * 0.085}px ${op.headerFont || SERIF}`;
  ctx.fillText((op.header || op.en).replace(/★/g, '').trim(), W / 2, Y(spec.winTop - 0.25), W * 0.8);
  // row of round lamps under the rear window (amber / red), chrome badge in the middle
  for (const [k, col] of [[-3, '#ffb300'], [-2, '#e53935'], [-1, '#ffb300'], [1, '#ffb300'], [2, '#e53935'], [3, '#ffb300']]) {
    ctx.fillStyle = '#d0d4d8'; ctx.beginPath(); ctx.arc(X(k * 0.17), Y(spec.winBot - 0.14), W * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(k * 0.17), Y(spec.winBot - 0.14), W * 0.016, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#d0d4d8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(W / 2, Y(spec.winBot - 0.14), W * 0.035, W * 0.022, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let k = 0; k < 6; k++) ctx.fillRect(X(-0.7), Y(spec.floor + 1.3 - k * 0.1), X(0.7) - X(-0.7), 6);
  ctx.fillStyle = ['hanif', 'ena'].includes(op.style) ? '#f2f2f2' : op.text;
  ctx.font = `bold ${W * 0.06}px ${BN_FONT}`;
  ctx.fillText(op.bn, W / 2, Y(spec.winBot - 0.32), W * 0.85);
  ctx.font = `bold ${W * 0.034}px ${EN_FONT}`;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillText('হর্ন দিন  •  HORN PLEASE', W / 2, Y(spec.floor + 0.52), W * 0.6);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#4a0a0a';
    rr(ctx, sx < 0 ? X(-hw + 0.02) : X(hw - 0.24), Y(spec.floor + 1.35), X(-hw + 0.24) - X(-hw + 0.02), Y(spec.floor + 0.45) - Y(spec.floor + 1.35), 8);
    ctx.fill();
  }
  ctx.fillStyle = '#26282b';
  ctx.fillRect(0, Y(spec.floor + 0.3), W, H);
  ctx.fillStyle = '#18a558';
  ctx.fillRect(X(-0.31), Y(spec.floor + 0.98), X(0.31) - X(-0.31), Y(spec.floor + 0.78) - Y(spec.floor + 0.98));
  ctx.fillStyle = '#f5f5f5';
  ctx.font = `bold ${(Y(0) - Y(0.2)) * 0.36}px ${BN_FONT}`;
  ctx.fillText(plate, W / 2, Y(spec.floor + 0.88), X(0.3) - X(-0.3));
}

// big white operator name across the top of the windshield (as on real BD coaches)
export function paintHeader(ctx, W, H, op, inside = false) {
  ctx.clearRect(0, 0, W, H);
  if (inside) {
    // seen from the cab: the vinyl band is a dark see-through tint with the letters showing as colour
    ctx.fillStyle = 'rgba(14,26,26,0.5)'; ctx.fillRect(0, 0, W, H * 0.86);
  } else if (op.headerBg) {
    // solid printed band (e.g. Marsa: white band, blue letters)
    ctx.fillStyle = op.headerBg; ctx.fillRect(0, 0, W, H * 0.86);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,12,14,0.92)'); g.addColorStop(0.8, 'rgba(8,12,14,0.75)'); g.addColorStop(1, 'rgba(8,12,14,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const main = op.header || op.en;
  const hasSub = !!op.headerSub;
  ctx.font = `bold ${H * (hasSub ? 0.5 : 0.6)}px ${op.headerFont || SERIF}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${H * 0.03}px`;
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  if (op.headerBadge) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; rr(ctx, W * 0.2, H * 0.06, W * 0.6, H * 0.58, H * 0.12); ctx.fill();
    ctx.fillStyle = '#2d3a8c'; ctx.beginPath(); ctx.moveTo(W * 0.21, H * 0.6); ctx.lineTo(W * 0.33, H * 0.1); ctx.lineTo(W * 0.31, H * 0.6); ctx.fill();
  }
  ctx.fillStyle = inside ? 'rgba(40,120,110,0.85)' : op.headerBadge ? '#e0201a' : (op.headerColor || '#ffffff');
  const parts = main.split('★');
  const y = H * (hasSub ? 0.36 : 0.45);
  if (parts.length === 3) {
    const word = parts[1].trim();
    ctx.fillText(word, W / 2, y, W * 0.8);
    const tw = Math.min(W * 0.8, ctx.measureText(word).width);
    ctx.fillStyle = '#e53935';
    ctx.font = `${H * 0.28}px ${SANS}`;
    ctx.fillText('★', W / 2 - tw / 2 - H * 0.25, H * 0.3);
    ctx.fillText('★', W / 2 + tw / 2 + H * 0.25, H * 0.3);
  } else ctx.fillText(main, W / 2, y, W * 0.86);
  if (hasSub) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = op.headerBadge ? '#ffffff' : '#e8b44c';
    ctx.font = `bold italic ${H * 0.28}px ${/[\u0980-\u09FF]/.test(op.headerSub) ? BN_FONT : SERIF}`;
    ctx.fillText(op.headerSub, W / 2, H * 0.76, W * 0.6);
  }
}
