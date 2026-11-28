// Mohasorok race server (Cloudflare Worker + one Durable Object per room).
//
// A browser opens  wss://<worker>/room/<CODE>?id=<player id>[&create=1]  and talks JSON:
//   client → server  hello {name, op, type} · trip {trip} (host) · ready {v} · start (host) · lobby (host)
//                    p {…position…} · finish {time, fines, crashes, rating} · ping {c}
//   server → client  welcome {you, room, players} · players {players, host} · room {room}
//                    start {room} · p {id, …} · results {results} · pong {c, s} · error {msg}
// The room keeps only the lobby state (host, trip, phase, start time, results); positions are relayed, not stored.
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 8;
const COUNTDOWN_MS = 10000;   // long enough for a slow phone to build the start terminal
const CODE = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('Mohasorok race server is running');
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
    if (!m || !CODE.test(m[1].toUpperCase())) return new Response('not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
    if (!originAllowed(req.headers.get('Origin'), env.ALLOWED_HOSTS)) return new Response('origin not allowed', { status: 403 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
    return room.fetch(req);
  },
};

function originAllowed(origin, list = '*') {
  if (list.trim() === '*') return true;
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  // phones and laptops on the same Wi-Fi testing the dev server
  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) return true;
  return list.split(',').map((s) => s.trim()).includes(host);
}

const cleanName = (s) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 18) || 'Driver';
const short = (s, n = 24) => String(s || '').slice(0, n);

export class RaceRoom extends DurableObject {
  async load() {
    this.room ??= (await this.ctx.storage.get('room')) || { host: null, trip: null, phase: 'lobby', startAt: 0, grid: [], results: {}, made: 0 };
    return this.room;
  }
  async save() { await this.ctx.storage.put('room', this.room); }

  // the connected players (one socket each; a reconnect replaces the old one)
  sockets() { return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1 && ws.deserializeAttachment()?.hello); }
  players() { return this.sockets().map((ws) => ws.deserializeAttachment()).sort((a, b) => a.joined - b.joined); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* gone */ } }
  broadcast(msg, except) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except && ws.readyState === 1) this.send(ws, s);
  }
  // the host left: the player who joined first takes over
  fixHost() {
    const ps = this.players();
    if (!ps.some((p) => p.id === this.room.host)) this.room.host = ps[0]?.id || null;
  }
  roster() { return { t: 'players', host: this.room.host, players: this.players() }; }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    const id = short(url.searchParams.get('id'), 16).replace(/[^A-Za-z0-9]/g, '') || crypto.randomUUID().slice(0, 8);
    const create = url.searchParams.get('create') === '1';
    const others = this.sockets().filter((ws) => ws.deserializeAttachment().id !== id);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [id]);
    // a new room code that someone is already using: tell the creator to pick another one
    if (create && others.length) { this.send(server, { t: 'error', code: 'taken', msg: 'That race code is in use' }); server.close(4001, 'taken'); return new Response(null, { status: 101, webSocket: client }); }
    if (!create && !others.length && !this.room.made) { this.send(server, { t: 'error', code: 'nosuch', msg: 'No race with that code. Check the code, or create a new race.' }); server.close(4002, 'nosuch'); return new Response(null, { status: 101, webSocket: client }); }
    if (others.length >= MAX_PLAYERS) { this.send(server, { t: 'error', code: 'full', msg: `This race is full (${MAX_PLAYERS} players)` }); server.close(4003, 'full'); return new Response(null, { status: 101, webSocket: client }); }
    // the same player again (a dropped connection): the old socket goes
    for (const ws of this.ctx.getWebSockets(id)) if (ws !== server) { try { ws.serializeAttachment({ ...ws.deserializeAttachment(), hello: false }); ws.close(4000, 'replaced'); } catch { /* closed */ } }
    if (create && !others.length) this.room = { host: id, trip: null, phase: 'lobby', startAt: 0, grid: [], results: {}, made: Date.now() };
    server.serializeAttachment({ id, hello: false, joined: Date.now() });
    await this.save();
    await this.ctx.storage.deleteAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 8000) return;      // (a position carries the shared traffic too: ~2 KB)
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;
    // positions: relayed straight on (the hot path, no storage)
    if (m.t === 'p') {
      if (!me.hello) return;
      m.id = me.id;
      this.broadcast(m, ws);
      return;
    }
    if (m.t === 'ping') { this.send(ws, { t: 'pong', c: m.c, s: Date.now() }); return; }
    const room = await this.load();
    const host = room.host === me.id;
    switch (m.t) {
      case 'hello': {
        const prev = me.joined;
        Object.assign(me, { hello: true, name: cleanName(m.name), op: short(m.op), opName: short(m.opName, 32), type: short(m.type), ready: !!me.ready, joined: prev });
        ws.serializeAttachment(me);
        this.fixHost();
        if (!room.host) room.host = me.id;
        await this.save();
        this.send(ws, { t: 'welcome', you: me.id, room, now: Date.now() });
        this.broadcast(this.roster());
        break;
      }
      case 'trip':
        if (!host || room.phase === 'race' || !m.trip?.from || !m.trip?.to) return;
        room.trip = { from: short(m.trip.from, 40), to: short(m.trip.to, 40) };
        await this.save();
        this.broadcast({ t: 'room', room });
        break;
      case 'ready':
        me.ready = !!m.v; ws.serializeAttachment(me);
        this.broadcast(this.roster());
        break;
      case 'start':
        if (!host || !room.trip) return;
        room.phase = 'race';
        room.startAt = Date.now() + COUNTDOWN_MS;
        room.grid = this.players().map((p) => p.id);
        room.results = {};
        await this.save();
        for (const s of this.sockets()) { const a = s.deserializeAttachment(); a.ready = false; s.serializeAttachment(a); }
        this.broadcast({ t: 'start', room, now: Date.now() });
        this.broadcast(this.roster());
        break;
      case 'lobby':
        if (!host) return;
        room.phase = 'lobby';
        await this.save();
        this.broadcast({ t: 'room', room });
        break;
      case 'finish': {
        if (room.phase !== 'race' || room.results[me.id]) return;
        const num = (x, max) => Math.max(0, Math.min(max, Number(x) || 0));
        room.results[me.id] = { name: me.name, op: me.op, time: num(m.time, 1e8), fines: num(m.fines, 1e9), crashes: num(m.crashes, 1e5), rating: num(m.rating, 5), at: Date.now() };
        // everyone still connected has finished: the race is over
        if (this.players().every((p) => room.results[p.id] || !room.grid.includes(p.id))) room.phase = 'done';
        await this.save();
        this.broadcast({ t: 'results', results: room.results, phase: room.phase });
        break;
      }
      default:
    }
  }

  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }
  async left(ws) {
    const me = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch { /* already closed */ }
    if (!me?.hello) return;
    await this.load();
    this.fixHost();
    await this.save();
    this.broadcast({ t: 'left', id: me.id });
    this.broadcast(this.roster());
    // an empty room is forgotten after 15 minutes
    if (!this.sockets().length) await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
  }
  async alarm() {
    if (this.sockets().length) return;
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}
