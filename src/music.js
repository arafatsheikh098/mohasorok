// In-game music player for the player's own songs. Files are stored in this browser (IndexedDB)
// and never uploaded. Plays through the game's audio context so the volume works on phones too.
import { getAll, put, del } from './store.js';

const PREFS = 'mohasorok.music';
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;

export class MusicPlayer {
  constructor() {
    const p = (() => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } })();
    this.vol = p.vol ?? 0.6;
    this.auto = p.auto ?? true;           // start playing when a trip starts
    this.shuffle = p.shuffle ?? false;
    this.tracks = [];
    this.i = -1;
    this.playing = false;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.volume = this.vol;
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => { if (this.playing && this.tracks.length > 1) this.next(); else this.stop(); });
    this.subs = new Set();
  }

  onChange(fn) { this.subs.add(fn); }
  emit(kind = 'state') { for (const f of this.subs) f(kind, this); }
  save() { try { localStorage.setItem(PREFS, JSON.stringify({ vol: this.vol, auto: this.auto, shuffle: this.shuffle })); } catch { /* private mode */ } }
  get current() { return this.tracks[this.i] || null; }

  async load() {
    try { this.tracks = (await getAll('music')).sort((a, b) => a.added - b.added); } catch { this.tracks = []; }
    this.emit('list');
  }

  async add(files) {
    let n = 0;
    for (const f of files) {
      if (!(f.type || '').startsWith('audio/') && !AUDIO_EXT.test(f.name)) continue;
      const rec = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: f.name.replace(/\.[^.]+$/, ''), size: f.size, added: Date.now(), blob: f };
      try { await put('music', rec); this.tracks.push(rec); n++; } catch (e) { console.warn('music: could not save', f.name, e); }
    }
    this.emit('list');
    return n;
  }

  async remove(id) {
    const k = this.tracks.findIndex((t) => t.id === id);
    if (k < 0) return;
    const wasCurrent = k === this.i;
    this.tracks.splice(k, 1);
    try { await del('music', id); } catch { /* ignore */ }
    if (wasCurrent) { this.stop(); this.i = -1; } else if (k < this.i) this.i--;
    this.emit('list');
  }

  // route through the game's AudioContext (call once it exists)
  attach(ctx) {
    if (this.node || !ctx) return;
    try {
      this.node = ctx.createMediaElementSource(this.el);
      this.gain = ctx.createGain();
      this.gain.gain.value = this.vol;
      this.node.connect(this.gain).connect(ctx.destination);
      this.el.volume = 1;
    } catch (e) { console.warn('music: direct playback', e); }
  }

  play(i = this.i < 0 ? 0 : this.i) {
    const n = this.tracks.length;
    if (!n) return;
    this.i = ((i % n) + n) % n;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(this.current.blob);
    this.el.src = this.url;
    this.playing = true;
    this.el.play().catch(() => { this.playing = false; this.emit(); });
    this.emit('track');
  }
  toggle() {
    if (!this.tracks.length) return;
    if (this.playing) { this.el.pause(); this.playing = false; this.emit(); }
    else if (this.el.src && this.current) { this.playing = true; this.el.play().catch(() => { this.playing = false; this.emit(); }); this.emit(); }
    else this.play();
  }
  next() {
    const n = this.tracks.length;
    if (!n) return;
    if (this.shuffle && n > 1) { let j; do j = Math.floor(Math.random() * n); while (j === this.i); this.play(j); }
    else this.play(this.i + 1);
  }
  prev() {
    if (this.el.currentTime > 3) { this.el.currentTime = 0; return; }
    this.play(this.i - 1);
  }
  stop() { this.el.pause(); this.playing = false; this.emit(); }
  setVolume(v) {
    this.vol = v;
    if (this.gain) this.gain.gain.value = v; else this.el.volume = v;
    this.save();
  }
  // game paused: hold the song, carry on afterwards
  hold(on) {
    if (on && this.playing) { this.el.pause(); this.held = true; }
    else if (!on && this.held) { this.held = false; this.el.play().catch(() => {}); }
  }
}

export const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
