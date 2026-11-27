// In-game music player for the player's own songs. Files are stored in this browser (IndexedDB)
// and never uploaded. Plays through the game's audio context so the volume works on phones too.
import { SAVE } from './saves.js';
import { getAll, put, del } from './store.js';

const PREFS = SAVE('music');

// ---- YouTube links (official IFrame player; it has to stay visible, at least 200x200) ----
export function parseYouTube(text) {
  const t = (text || '').trim();
  if (!t) return null;
  let u;
  try { u = new URL(/^https?:/i.test(t) ? t : `https://${t}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let videoId = null, listId = u.searchParams.get('list');
  if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') videoId = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/); if (m) videoId = m[2]; }
  } else return null;
  if (videoId && !/^[\w-]{6,}$/.test(videoId)) videoId = null;
  if (listId && !/^[\w-]{10,}$/.test(listId)) listId = null;
  if (listId && /^RD/.test(listId) && videoId) listId = null;          // auto "mix" lists can't be embedded; play the song
  if (!videoId && !listId) return null;
  return { videoId, listId };
}

let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) apiPromise = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { apiPromise = null; rej(new Error('YouTube could not be reached')); };
    document.head.appendChild(sc);
  });
  return apiPromise;
}
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
    this.yt = null;           // YT.Player once created
    this.ytBox = document.getElementById('yt-box');
  }
  get isYT() { return this.current?.kind === 'yt'; }

  async addYouTube(text) {
    const p = parseYouTube(text);
    if (!p) return null;
    const rec = { id: `yt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: 'yt', ...p, size: 0, added: Date.now(),
      name: p.listId && !p.videoId ? 'YouTube playlist' : p.listId ? 'YouTube song + playlist' : 'YouTube song', named: false };
    await put('music', rec);
    this.tracks.push(rec);
    this.emit('list');
    return rec;
  }

  async ytPlay(rec) {
    this.ytBox.style.display = 'block';
    document.body.classList.add('yt-on');
    this.emit('state');
    let YT;
    try { YT = await loadYouTubeApi(); } catch (e) { this.emit('error', e.message); this.ytStop(); return; }
    const start = () => {
      if (this.current !== rec) return;
      this.yt.setVolume(Math.round(this.vol * 100));
      if (rec.listId) {
        this.yt.loadPlaylist({ list: rec.listId, listType: 'playlist', index: 0 });
        setTimeout(() => this.yt?.setShuffle?.(this.shuffle), 1500);
      } else this.yt.loadVideoById(rec.videoId);
    };
    if (this.yt) { start(); return; }
    this.yt = new YT.Player('yt-player', {
      width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, origin: location.origin },
      events: {
        onReady: start,
        onStateChange: (e) => {
          if (!this.isYT) return;
          if (e.data === 1) {                       // playing
            this.playing = true;
            const d = this.yt.getVideoData?.();
            if (d?.title) { this.nowTitle = d.title; if (!this.current.named) { this.current.name = this.current.listId && !this.current.videoId ? `▶ ${d.title} (playlist)` : d.title; this.current.named = true; put('music', this.current).catch(() => {}); } }
            this.emit('ytplay');
          } else if (e.data === 2) { this.playing = false; this.emit(); }
          else if (e.data === 0) {                  // ended: next song in the playlist, else next item in our list
            const pl = this.yt.getPlaylist?.(), k = this.yt.getPlaylistIndex?.();
            if (!pl || k >= pl.length - 1) this.next();
          }
        },
        onError: (e) => {
          this.emit('error', e.data === 101 || e.data === 150 ? 'This video can\'t be played outside YouTube (owner disabled embedding)' : 'YouTube could not play this link');
          if (this.tracks.length > 1) setTimeout(() => this.next(), 1200); else this.ytStop();
        },
      },
    });
  }
  ytStop() {
    this.yt?.stopVideo?.();
    this.ytBox.style.display = 'none';
    document.body.classList.remove('yt-on');
    if (this.isYT) this.playing = false;
    this.emit();
  }

  onChange(fn) { this.subs.add(fn); }
  emit(kind = 'state', info = null) { for (const f of this.subs) f(kind, this, info); }
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
    if (wasCurrent) { this.stop(); if (this.yt) { this.ytBox.style.display = 'none'; document.body.classList.remove('yt-on'); } this.i = -1; } else if (k < this.i) this.i--;
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
    this.nowTitle = null;
    if (this.isYT) { this.el.pause(); this.playing = true; this.ytPlay(this.current); this.emit('track'); return; }
    if (this.yt) { this.yt.stopVideo?.(); this.ytBox.style.display = 'none'; document.body.classList.remove('yt-on'); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(this.current.blob);
    this.el.src = this.url;
    this.playing = true;
    this.el.play().catch(() => { this.playing = false; this.emit(); });
    this.emit('track');
  }
  toggle() {
    if (!this.tracks.length) return;
    if (this.isYT && this.yt && this.ytBox.style.display !== 'none') {
      if (this.playing) this.yt.pauseVideo(); else this.yt.playVideo();
      this.playing = !this.playing; this.emit(); return;
    }
    if (this.playing) { this.el.pause(); this.playing = false; this.emit(); }
    else if (this.el.src && this.current) { this.playing = true; this.el.play().catch(() => { this.playing = false; this.emit(); }); this.emit(); }
    else this.play();
  }
  next(skipList = false) {
    const n = this.tracks.length;
    if (!n) return;
    if (!skipList && this.isYT && this.current.listId && this.yt?.getPlaylist) {
      const pl = this.yt.getPlaylist(), k = this.yt.getPlaylistIndex();
      if (pl && k < pl.length - 1) { this.yt.nextVideo(); return; }
    }
    if (this.shuffle && n > 1) { let j; do j = Math.floor(Math.random() * n); while (j === this.i); this.play(j); }
    else this.play(this.i + 1);
  }
  prev() {
    if (this.isYT && this.yt?.getPlaylist) {
      const k = this.yt.getPlaylistIndex?.();
      if (this.current.listId && k > 0) { this.yt.previousVideo(); return; }
      if ((this.yt.getCurrentTime?.() || 0) > 3) { this.yt.seekTo(0); return; }
    } else if (this.el.currentTime > 3) { this.el.currentTime = 0; return; }
    this.play(this.i - 1);
  }
  stop() { this.el.pause(); if (this.yt) this.yt.pauseVideo?.(); this.playing = false; this.emit(); }
  setVolume(v) {
    this.vol = v;
    if (this.gain) this.gain.gain.value = v; else this.el.volume = v;
    this.yt?.setVolume?.(Math.round(v * 100));
    this.save();
  }
  // game paused: hold the song, carry on afterwards
  hold(on) {
    if (on && this.playing) { if (this.isYT) this.yt?.pauseVideo?.(); else this.el.pause(); this.held = true; }
    else if (!on && this.held) { this.held = false; if (this.isYT) this.yt?.playVideo?.(); else this.el.play().catch(() => {}); }
  }
}

export const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
