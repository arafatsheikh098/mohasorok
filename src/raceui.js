// The screens for racing with friends: the menu box (create / join, then the lobby), the countdown, the live
// standings while driving, and the results on the arrival card. The game logic is in main.js, the network in race.js.
import { SAVE } from './saves.js';
import { newCode } from './race.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtRace = (sec) => {
  if (sec == null) return '—';
  const t = Math.max(0, sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

export function initRaceUI({ race, net, me, tripOf, onCreate }) {
  const nameIn = $('race-name'), codeIn = $('race-code');
  nameIn.value = localStorage.getItem(SAVE('name')) || '';
  // typing must not drive the bus (M, Z, … are game keys)
  for (const el of [nameIn, codeIn]) {
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { el.blur(); if (el === codeIn) join(); } });
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }
  nameIn.addEventListener('change', () => {
    localStorage.setItem(SAVE('name'), nameIn.value.trim());
    if (race.inRoom) race.hello(me());
  });
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  const msg = (t, bad) => {
    const el = race.joined ? $('race-msg2') : $('race-msg'), other = race.joined ? $('race-msg') : $('race-msg2');
    el.textContent = t || ''; el.className = 'race-msg' + (bad ? ' bad' : '');
    other.textContent = '';
  };
  const needName = () => {
    if (nameIn.value.trim()) return true;
    msg('Type your name first, so your friends know which bus is you', true);
    nameIn.focus();
    return false;
  };
  const join = () => {
    const code = codeIn.value.trim().toUpperCase();
    if (!race.available) { msg('The race server is not set up yet', true); return; }
    if (code.length < 4) { msg('Type the race code your friend sent you', true); return; }
    if (!needName()) return;
    localStorage.setItem(SAVE('name'), nameIn.value.trim());
    msg('Joining…');
    race.connect(code, false, me());
  };
  $('race-join-btn').onclick = join;
  $('race-create').onclick = () => {
    if (!race.available) { msg('The race server is not set up yet', true); return; }
    if (!needName()) return;
    localStorage.setItem(SAVE('name'), nameIn.value.trim());
    msg('Creating a race…');
    race.connect(newCode(), true, me());
    onCreate?.();
  };
  $('race-leave').onclick = () => { if (confirm('Leave this race?')) { race.leave(); msg(''); } };
  $('race-go').onclick = () => {
    if (!race.isHost) return;
    const notReady = race.players.filter((p) => p.id !== race.you && !p.ready).length;
    if (notReady && !confirm(`${notReady} player${notReady > 1 ? 's are' : ' is'} not ready yet. Start anyway?`)) return;
    race.start();
  };
  let ready = false;
  $('race-ready').onclick = () => { ready = !ready; race.ready(ready); };
  $('race-copy').onclick = async () => {
    const link = `${location.origin}${location.pathname}?race=${race.code}`;
    const text = `Race me in Mohasorok 🚌 — code ${race.code}\n${link}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Mohasorok race', text, url: link });
      else { await navigator.clipboard.writeText(text); msg('Invite copied — paste it to your friends'); }
    } catch { prompt('Copy this invite:', text); }
  };

  race.on('error', (t, code) => {
    // a freshly made code that happens to be in use: just make another one
    if (code === 'taken') { race.connect(newCode(), true, me()); return; }
    render(); msg(t, true);
  });
  race.on('status', (t) => msg(t));
  race.on('change', () => { if (race.connected) msg(''); render(); });

  function render() {
    const inRoom = race.joined;
    $('race-box').classList.toggle('off', !race.available);
    $('race-join').style.display = inRoom ? 'none' : '';
    $('race-lobby').style.display = inRoom ? '' : 'none';
    if (!race.available) { $('race-msg').textContent = 'Racing needs the race server — see race-server/README.md'; return; }
    if (!inRoom) return;
    $('race-code-show').textContent = race.code;
    const trip = race.room?.trip;
    const A = trip && net.zillas.get(trip.from), B = trip && net.zillas.get(trip.to);
    const km = trip && tripOf(trip)?.km;
    $('race-trip').innerHTML = A && B
      ? `🏁 <b class="bn">${A.bn} → ${B.bn}</b> <small>${A.en} → ${B.en}${km ? ` · ${Math.round(km)} km` : ''}</small>${race.isHost ? '<small class="race-hint">You are the host: pick the route above (From / To), everyone gets it</small>' : '<small class="race-hint">The host picks the route</small>'}`
      : race.isHost ? '<small class="race-hint">Pick the route on the map above — it is the race for everyone</small>' : '<small class="race-hint">Waiting for the host to pick the route…</small>';
    const phase = race.room?.phase;
    const rows = race.players.map((p) => {
      const res = race.results[p.id];
      const state = phase === 'race' || phase === 'done'
        ? (res ? `🏁 ${fmtRace(res.time)}` : race.room.grid?.includes(p.id) ? '🚌 racing' : 'watching')
        : p.ready || p.id === race.host ? '✓ ready' : 'not ready';
      return `<div class="race-p${p.id === race.you ? ' me' : ''}"><i style="background:${race.color(p.id)}"></i><b>${esc(p.name)}${p.id === race.you ? ' (you)' : ''}</b>${p.id === race.host ? ' 👑' : ''}<small>${esc(p.opName || p.op)} · ${esc(p.type)}</small><span>${state}</span></div>`;
    }).join('');
    $('race-players').innerHTML = rows || '<small class="race-hint">Connecting…</small>';
    $('race-go').style.display = race.isHost ? '' : 'none';
    $('race-go').disabled = !trip;
    $('race-go').textContent = phase === 'race' ? '🔁 Restart the race' : phase === 'done' ? '🏁 Race again' : '🏁 Start the race';
    $('race-ready').style.display = race.isHost || phase === 'race' ? 'none' : '';
    const meP = race.players.find((p) => p.id === race.you);
    ready = !!meP?.ready;
    $('race-ready').textContent = ready ? '✓ Ready (tap to cancel)' : '✋ I am ready';
    $('race-ready').classList.toggle('on', ready);
    renderResults();
  }

  // ---------- countdown ----------
  let lastN = null;
  function countdown(ms, { onBeep, onGo } = {}) {
    const el = $('race-count');
    if (ms > 9500 || ms < -1200 || !Number.isFinite(ms)) { if (lastN !== null) { el.style.display = 'none'; lastN = null; } return; }
    const n = ms > 0 ? Math.ceil(ms / 1000) : 0;
    if (n === lastN) return;
    if (lastN === null) el.style.display = 'flex';
    const go = n === 0;
    if (go) onGo?.();
    lastN = n;
    el.innerHTML = go ? '<b class="go">GO!</b><small class="bn">চলো!</small>' : n > 3 ? `<b class="wait">${n}</b><small>Get ready · race starts</small>` : `<b>${n}</b>`;
    el.classList.toggle('go', go);
    if (n <= 3) onBeep?.(go);
  }

  // ---------- standings while driving ----------
  function board(show, myKm) {
    const el = $('race-board');
    el.style.display = show ? 'block' : 'none';
    if (!show) return;
    const rows = race.standings(myKm);
    const t = race.countdown() > 0 ? 'starting…' : fmtRace(race.raceTime());
    el.innerHTML = `<div class="rb-h"><span>🏁 Race ${race.code}</span><b>${t}</b></div>` + rows.map((r, k) => {
      const right = r.res ? `🏁 ${fmtRace(r.res.time)}` : r.gone ? 'left' : r.km == null ? '…' : `${r.km.toFixed(r.km < 10 ? 1 : 0)} km`;
      return `<div class="rb-r${r.me ? ' me' : ''}${r.gone ? ' gone' : ''}"><em>${k + 1}</em><i style="background:${r.color}"></i><span>${esc(r.name)}</span><b>${right}</b></div>`;
    }).join('');
  }

  // ---------- results (arrival card + menu lobby) ----------
  function renderResults() {
    const html = resultsHTML();
    $('race-results').innerHTML = html;
    $('race-results').style.display = html ? 'block' : 'none';
  }
  function resultsHTML() {
    if (!race.inRace || !Object.keys(race.results).length) return '';
    const rows = race.standings(null);
    const mine = rows.findIndex((r) => r.me);
    const head = race.results[race.you] ? `<div class="rr-me">You finished <b>${ordinal(mine + 1)}</b> of ${rows.length}</div>` : '';
    return `${head}<div class="arr-h">🏁 Race ${race.code} results</div>` + rows.map((r, k) => `<div class="row${r.me ? ' me' : ''}"><span><i class="dot" style="background:${r.color}"></i> ${k + 1}. ${esc(r.name)} <small>${esc(r.op)}</small></span><b>${r.res ? `${fmtRace(r.res.time)}${r.res.fines ? ` · fines ৳${Math.round(r.res.fines).toLocaleString('en-IN')}` : ''}` : r.gone ? 'left the race' : 'still driving…'}</b></div>`).join('');
  }

  render();
  return { render, countdown, board, renderResults, prefill(code) { codeIn.value = code.toUpperCase(); render(); }, join };
}
