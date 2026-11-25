// Career mode: a small bus company. The bank balance, the buses you own and your all-time stats are saved
// in this browser (localStorage). Each finished trip pays fares + tips and costs diesel, tolls, fines/damage
// and the crew's wages; the profit goes into the bank, and the bank buys bigger buses in the garage.
import pkg from '../package.json';

const KEY = 'mohasorok.career';
export const VERSION = pkg.version || '1.0.0';

// Game prices, scaled so a better bus takes a handful of good trips (real ones cost ৳70 lakh – ৳2.5 crore).
// Cheapest first; the AK1J Non-AC is the company's first bus.
export const BUS_PRICES = { local: 0, ak1j: 60000, coach: 150000, highdeck: 300000 };
export const BUS_ORDER = ['local', 'ak1j', 'coach', 'highdeck'];
export const REAL_PRICE = { local: '৳ 45 lakh', ak1j: '৳ 75 lakh', coach: '৳ 1.5 crore', highdeck: '৳ 2.6 crore' };
export const START_BALANCE = 20000;
export const WAGES = { driver: 1500, helper: 800 };      // ৳ per full Dhaka–Chattogram trip

const blankStats = () => ({
  trips: 0, km: 0, passengers: 0, income: 0, profit: 0, bestProfit: null, bestRating: 0, crashes: 0, fines: 0,
  fastest: { ctg: null, dhk: null },     // seconds of driving, Dhaka→Ctg and Ctg→Dhaka
});

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.v === 1) return d; } catch { /* broken save */ }
  return null;
}

class Career {
  constructor() {
    const d = load();
    if (d) {
      this.balance = d.balance; this.owned = new Set(d.owned); this.stats = { ...blankStats(), ...d.stats, fastest: { ...blankStats().fastest, ...d.stats?.fastest } };
    } else {
      // a brand-new company owns the Non-AC AK1J; a player who already drove before the career existed keeps
      // the bus they were driving, so nobody loses their favourite
      this.balance = START_BALANCE;
      this.owned = new Set(['local']);
      try {
        const old = JSON.parse(localStorage.getItem('mohasorok.settings') || 'null');
        if (old?.type && BUS_PRICES[old.type] !== undefined) this.owned.add(old.type);
      } catch { /* no old settings */ }
      this.stats = blankStats();
      this.save();
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, balance: this.balance, owned: [...this.owned], stats: this.stats })); } catch { /* private mode */ }
  }

  owns(type) { return this.owned.has(type) || BUS_PRICES[type] === 0; }
  price(type) { return BUS_PRICES[type] ?? 0; }
  canBuy(type) { return !this.owns(type) && this.balance >= this.price(type); }
  buy(type) {
    if (!this.canBuy(type)) return false;
    this.balance -= this.price(type);
    this.owned.add(type);
    this.save();
    return true;
  }
  // the bus to drive: the chosen one if owned, otherwise the best one owned
  ownedType(type) {
    if (this.owns(type)) return type;
    return [...BUS_ORDER].reverse().find((t) => this.owns(t)) || 'local';
  }

  // Settle a finished trip. p = the player state (fares on p.pax), dir 'ctg' | 'dhk', km = real km driven.
  finishTrip(p, { dir, km = 245 } = {}) {
    const fares = Math.round(p.pax?.fares || 0), tips = Math.round(p.pax?.tips || 0);
    const diesel = Math.round(p.fuelCost || 0), tolls = Math.round(p.tollCost || 0), fines = Math.round(p.fines || 0);
    const wages = Math.round((WAGES.driver + WAGES.helper) * Math.min(1, km / 245));
    const income = fares + tips, costs = diesel + tolls + fines + wages, profit = income - costs;
    const before = this.balance;
    this.balance += profit;
    const s = this.stats;
    s.trips++; s.km += km; s.passengers += p.pax?.carried || 0;
    s.income += income; s.profit += profit; s.crashes += p.crashes || 0; s.fines += fines;
    s.bestRating = Math.max(s.bestRating, Math.round((p.rating || 0) * 10) / 10);
    if (s.bestProfit === null || profit > s.bestProfit) s.bestProfit = profit;
    const prevBest = s.fastest[dir];
    const record = p.elapsed > 30 && (prevBest === null || p.elapsed < prevBest);
    if (record) s.fastest[dir] = Math.round(p.elapsed);
    this.save();
    return { fares, tips, diesel, tolls, fines, wages, income, costs, profit, before, balance: this.balance, record, prevBest };
  }

  resetAll() {
    this.balance = START_BALANCE;
    this.owned = new Set(['local']);
    this.stats = blankStats();
    this.save();
  }
}

export const career = new Career();
window.__career = career;      // handy for testing; the save is in localStorage anyway

export const taka = (n) => `${n < 0 ? '−' : ''}৳ ${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
export const fmtDuration = (sec) => {
  if (sec == null) return '—';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
};

// a pre-filled "new issue" page on the public repo: game version, bus, route, browser (no personal data)
export function feedbackURL({ type, dir, opName, where = '' } = {}) {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const touch = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse/keyboard';
  const body = [
    '**What happened?**', '', '', '**What did you expect?**', '', '', '**Steps to reproduce** (where on the road, what you pressed)', '', '',
    '---', `Game version: ${VERSION}`, `Bus: ${type || '?'} · Operator: ${opName || '?'}`,
    `Route: ${dir === 'dhk' ? 'Chattogram → Dhaka' : 'Dhaka → Chattogram'}${where ? ` · ${where}` : ''}`,
    `Browser: ${browser} on ${os} (${touch}), screen ${screen.width}×${screen.height}`,
  ].join('\n');
  return `https://github.com/arafatsheikh098/mohasorok/issues/new?title=${encodeURIComponent('[Feedback] ')}&body=${encodeURIComponent(body)}`;
}
