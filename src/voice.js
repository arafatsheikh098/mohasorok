// Bangla voices: the bus helper (হেলপার) and the passengers.
// Clips are whole sentences pre-made with tools/gen_voice.mjs (Microsoft neural voices) in public/voice/.
// Lines are queued one at a time with per-line cooldowns, and each one shows a subtitle.
// Fallbacks: no clip → speechSynthesis with a Bengali voice if the browser has one → subtitle only.
import { SAVE } from './saves.js';
import { LINES, VOICES, placeKey, clipKey } from './voiceLines.js';
import { WAYPOINTS } from './config.js';
import { NODES } from './data/bd_network.js';

const BASE = `${import.meta.env.BASE_URL}voice/`;
const STORE = SAVE('voice');
const KEEP_DECODED = 24;     // decoded clips kept in memory (a decoded clip is ~0.6 MB)
// English names for the subtitle gloss
const EN = { 'সায়েদাবাদ': 'Sayedabad', 'চট্টগ্রাম': 'Chattogram', 'ঢাকা': 'Dhaka', 'এ কে খান': 'A.K. Khan', 'মহিপাল': 'Mohipal' };
for (const w of WAYPOINTS) EN[placeKey(w.bn)] ??= w.en.split(' (')[0];
for (const n of Object.values(NODES)) EN[placeKey(n.bn)] ??= n.en.split(' (')[0];
const LABEL = { helper: ['🧑‍🔧', 'হেলপার'], pax: ['🧳', 'যাত্রী'], police: ['👮', 'পুলিশ'] };

class Voice {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem(STORE) !== '0';
    this.volume = 1;
    this.queue = [];
    this.playing = null;
    this.lastAt = {};
    this.lastVariant = {};
    this.buffers = new Map();     // file -> Promise<AudioBuffer|null>
    this.manifest = null;
    this.isMuted = () => false;
    this.el = null;
  }

  // ctx: the game's AudioContext; dest: node to play into (the game's master gain, so M mutes voices too)
  init(ctx, dest = ctx?.destination, isMuted) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    if (isMuted) this.isMuted = isMuted;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? this.volume : 0;
    this.out.connect(dest);
    // clarity first: only a light cabin EQ (cut the rumble, a touch of presence so it cuts through the engine)
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2500; pres.Q.value = 0.7; pres.gain.value = 2;
    const g = ctx.createGain(); g.gain.value = 1.4;
    hp.connect(pres).connect(g).connect(this.out);
    this.input = hp;
    this.ready = fetch(`${BASE}manifest.json`).then((r) => (r.ok ? r.json() : null)).then((m) => {
      this.manifest = m;
      // pre-fetch the files (into the browser cache, not decoded) so the first lines start without a delay
      if (m) setTimeout(() => { for (const c of Object.values(m.clips)) fetch(BASE + c.f).catch(() => {}); }, 4000);
    }).catch(() => {});
  }

  setEnabled(on) {
    this.enabled = !!on;
    localStorage.setItem(STORE, on ? '1' : '0');
    if (this.out) this.out.gain.value = on ? this.volume : 0;
    if (!on) { this.queue.length = 0; this.stop(); }
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }
  setVolume(v) { this.volume = v; if (this.out && this.enabled) this.out.gain.value = v; }

  // say('pax.stop_request', { place: 'কুমিল্লা' })
  say(id, vars = {}) {
    const line = LINES[id];
    if (!line || !this.enabled) return false;
    if (this.noPax && id.startsWith('pax.')) return false;     // a race: no passengers aboard
    const now = performance.now() / 1000;
    if (now - (this.lastAt[id] ?? -1e9) < line.cool) return false;
    if (this.playing?.id === id || this.queue.some((q) => q.id === id)) return false;
    // a busy queue only takes lines that matter more than what is waiting
    if (this.queue.length >= 2) {
      const low = this.queue.reduce((a, q) => (q.prio < a.prio ? q : a));
      if (line.prio <= low.prio) return false;
      this.queue.splice(this.queue.indexOf(low), 1);
    }
    let k = Math.floor(Math.random() * line.v.length);
    if (line.v.length > 1 && k === this.lastVariant[id]) k = (k + 1) % line.v.length;
    this.lastVariant[id] = k;
    this.lastAt[id] = now;
    const [bnT, enT] = line.v[k];
    const place = vars.place ? String(vars.place) : '';
    const shortPlace = placeKey(place) || place;
    const item = {
      id, prio: line.prio, speaker: line.speaker, place: shortPlace,
      bn: bnT.replaceAll('{place}', shortPlace), en: enT.replaceAll('{place}', vars.placeEn || EN[shortPlace] || shortPlace),
      k, voice: VOICES[line.speaker][Math.floor(Math.random() * VOICES[line.speaker].length)].id, at: now,
    };
    const i = this.queue.findIndex((q) => q.prio < item.prio);
    if (i < 0) this.queue.push(item); else this.queue.splice(i, 0, item);
    this.pump();
    return true;
  }

  stop() {
    if (this.playing?.sources) for (const s of this.playing.sources) try { s.stop(); } catch { /* already stopped */ }
    if (window.speechSynthesis?.speaking) speechSynthesis.cancel();
    this.playing = null;
    this.hideSub();
  }

  pump() {
    if (this.playing || !this.queue.length) return;
    const item = this.queue.shift();
    // stale lines (e.g. queued behind a long one) are no longer worth saying
    if (performance.now() / 1000 - item.at > 6) { this.pump(); return; }
    this.playing = item;
    this.play(item).catch(() => {}).finally(() => {
      if (this.playing !== item) return;
      setTimeout(() => { if (this.playing === item) { this.playing = null; this.hideSub(); this.pump(); } }, 350);
    });
  }

  async play(item) {
    if (!this.manifest && this.ready) await Promise.race([this.ready, wait(2000)]);
    const clip = this.resolve(item);
    if (clip && this.ctx && this.ctx.state !== 'closed') {
      const buf = await this.load(clip.f);
      if (buf && this.playing === item) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.input);
        src.start(this.ctx.currentTime + 0.03);
        item.sources = [src];
        this.showSub(item, buf.duration + 0.6);
        await wait(buf.duration * 1000 + 30);
        return;
      }
    }
    // no clip for this line/place: browser speech if it has a Bengali voice, else just the subtitle
    const v = !this.isMuted() && bnVoice();
    if (v) {
      this.showSub(item, 4);
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(item.bn);
        u.voice = v; u.lang = v.lang;
        u.rate = item.speaker === 'helper' ? 1.08 : 1;
        u.volume = this.volume;
        u.onend = u.onerror = res;
        speechSynthesis.speak(u);
        setTimeout(res, 9000);
      });
      return;
    }
    const dur = 1.2 + item.bn.length * 0.07;
    this.showSub(item, dur);
    await wait(dur * 1000);
  }

  // the pre-made sentence for this line, variant and place (any voice of the speaker if the picked one is missing)
  resolve(item) {
    const m = this.manifest?.clips;
    if (!m) return null;
    const place = LINES[item.id].places ? item.place : '';
    const ids = [item.voice, ...VOICES[item.speaker].map((v) => v.id).filter((x) => x !== item.voice)];
    for (const vid of ids) { const c = m[clipKey(item.id, item.k, vid, place)]; if (c) return c; }
    // another variant of the line for this place (the newer zilla towns have one variant each)
    if (place) {
      const L = LINES[item.id];
      for (let k = 0; k < L.v.length; k++) {
        for (const vid of ids) {
          const c = m[clipKey(item.id, k, vid, place)];
          if (c) { item.bn = L.v[k][0].replaceAll('{place}', place); item.en = L.v[k][1].replaceAll('{place}', EN[place] || place); return c; }
        }
      }
    }
    // no clip for this place (e.g. a counter added since the clips were made): say a sentence without the name
    const gen = LINES[item.id].generic;
    if (gen?.length) {
      const g = Math.floor(Math.random() * gen.length);
      for (const vid of ids) {
        const c = m[clipKey(item.id, `g${g}`, vid, '')];
        if (c) { [item.bn, item.en] = gen[g]; return c; }
      }
    }
    return null;
  }

  // decoded clips, the most recent KEEP_DECODED kept in memory
  load(f) {
    let p = this.buffers.get(f);
    if (p) { this.buffers.delete(f); this.buffers.set(f, p); return p; }
    p = fetch(BASE + f).then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? this.ctx.decodeAudioData(ab) : null)).catch(() => null);
    this.buffers.set(f, p);
    while (this.buffers.size > KEEP_DECODED) this.buffers.delete(this.buffers.keys().next().value);
    return p;
  }

  // ---- subtitle ----
  showSub(item, secs) {
    if (!this.el) {
      const st = document.createElement('style');
      st.textContent = `#voice-sub{position:absolute;left:50%;bottom:178px;transform:translateX(-50%);max-width:min(640px,88vw);
        background:rgba(12,16,22,.78);border:1px solid rgba(255,255,255,.14);border-left:4px solid #ffb300;border-radius:9px;
        padding:8px 14px;color:#fff;font-size:16px;line-height:1.35;pointer-events:none;opacity:0;transition:opacity .25s;z-index:5;text-align:left}
        #voice-sub.on{opacity:1}#voice-sub.pax{border-left-color:#4aa3ff}#voice-sub b{font-weight:700;margin-right:6px;color:#ffd54f}
        #voice-sub.pax b{color:#9fd0ff}#voice-sub.police{border-left-color:#ef5350}#voice-sub.police b{color:#ffab91}#voice-sub small{display:block;color:#b8c2cc;font-size:12px;margin-top:2px}
        @media (max-width:820px){#voice-sub{font-size:14px}}`;
      document.head.appendChild(st);
      this.el = document.createElement('div');
      this.el.id = 'voice-sub';
      this.el.className = 'bn';
      (document.getElementById('hud') || document.body).appendChild(this.el);
    }
    const [icon, who] = LABEL[item.speaker];
    this.el.innerHTML = `<b>${icon} ${who}:</b>${esc(item.bn)}<small>${esc(item.en)}</small>`;
    this.el.classList.toggle('pax', item.speaker === 'pax');
    this.el.classList.toggle('police', item.speaker === 'police');
    this.el.classList.add('on');
    this.placeSub();
    clearInterval(this.subI);
    this.subI = setInterval(() => this.placeSub(), 250);    // the prompt can appear or go while we speak
    clearTimeout(this.subT);
    this.subT = setTimeout(() => this.hideSub(), secs * 1000);
  }
  // sit just above the game's prompt bars (refuel/rest prompt, passenger prompt) when they show
  placeSub() {
    let b = innerWidth <= 820 ? 250 : 178;
    for (const id of ['prompt', 'paxprompt']) {
      const pr = document.getElementById(id);
      if (!pr || getComputedStyle(pr).display === 'none') continue;
      const r = pr.getBoundingClientRect();
      if (r.height) b = Math.max(b, innerHeight - r.top + 10);
    }
    this.el.style.bottom = `${Math.round(b)}px`;
  }
  hideSub() { this.el?.classList.remove('on'); clearInterval(this.subI); }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function bnVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => v.lang === 'bn-BD') || vs.find((v) => /^bn/i.test(v.lang)) || null;
}

export const voice = new Voice();
if (import.meta.env.DEV) window.__voice = voice;
