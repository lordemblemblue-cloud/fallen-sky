// Fleet Assault connections. Both speak the same protocol (docs/game2/FLEET_ASSAULT_PLAN.md):
// - LocalFleetTransport runs the real server code (server/game2/fleet) in this page, with AI pilots, for practice and
//   for testing without Railway. Messages are copied both ways, as a network would, so the client can never touch
//   the server's state.
// - RailwayFleetTransport joins a match on the Game 2 Railway server over the same socket path as the arena.
import { createFleetHub } from '../../../../../server/game2/fleet/hub.mjs';
import { FLEET_PROTOCOL } from '../../../../../server/game2/fleet/rules.mjs';
import { GAME2_RAILWAY_PROTOCOL, game2RailwayStatus, game2RailwayUrl } from '../../net/railway.js';

const copy = m => JSON.parse(JSON.stringify(m));

export class LocalFleetTransport {
  // drill 'boarding' (practice only): when the battle starts, the enemy cruisers' shield generators are already knocked
  // out, so a boarding craft can dock without waiting for the AI pilots to strip the shields
  constructor({ name = 'Pilot', role = 'pilot', side, config = {}, lagMs = 0, now, rng, autoTick = true, drill = null } = {}) {
    this.o = { name, role, side, config, lagMs: Math.max(0, Number(lagMs) || 0), now, rng, autoTick, drill };
    this.onMessage = () => {};
    this.onClose = () => {};
    this.state = 'idle';
    this.kind = 'local';
  }
  start() {
    const { name, role, side, config, now, rng } = this.o;
    this.hub = createFleetHub({ now, rng, config: { warmupMs: 5000, forfeit: false, ...config } });
    this.conn = { send: msg => this._later(() => this.onMessage(copy(msg))) };
    const joined = this.hub.join(this.conn, { id: 'local~' + Math.random().toString(36).slice(2, 10), name, role, side });
    if (!joined.ok) { this.state = 'closed'; this.onClose(joined.reason); return Promise.resolve(); }
    this.state = 'live';
    if (this.o.autoTick) this.timer = setInterval(() => this.tick(), 1000 / 60);
    return Promise.resolve();
  }
  tick() {
    this.hub.tick();
    if (this.o.drill !== 'boarding' || this.drilled) return;
    for (const mt of this.hub.matches.values()) {
      if (mt.state.phase !== 'battle') continue;
      const me = [...mt.state.players.values()].find(p => p.human);
      for (const c of mt.state.cruisers) if (me && c.side !== me.side) mt.debug.damageSubsystem(c, 'shields', c.subs.shields, null);
      this.drilled = true;
    }
  }
  _later(fn) { if (this.o.lagMs) setTimeout(() => { if (this.state === 'live') fn(); }, this.o.lagMs); else fn(); }
  send(msg) {
    if (this.state !== 'live' || msg?.t !== 'fleet') return false;
    const m = copy(msg);
    this._later(() => this.hub.message(this.conn, m));
    return true;
  }
  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    clearInterval(this.timer);
    this.hub?.leave(this.conn);
  }
}

export class RailwayFleetTransport {
  constructor({ token, selfId, name, role, side, url, WebSocketImpl, fetchImpl } = {}) {
    this.o = { token, selfId, name, role, side, url, WebSocketImpl, fetchImpl };
    this.onMessage = () => {};
    this.onClose = () => {};
    this.state = 'idle';
    this.kind = 'railway';
  }
  async start() {
    this.state = 'connecting';
    let url;
    try { url = this.o.url || game2RailwayUrl(); } catch (e) { return this._end(e.message); }
    try {
      const status = await game2RailwayStatus({ url, fetchImpl: this.o.fetchImpl || fetch });
      // a server from before Fleet Assault would seat us in a duel arena: stop here instead
      if (!status.fleet) return this._end('The Game 2 server has not been updated for Fleet Assault yet. Practice against AI pilots works without it.');
    } catch (e) { return this._end('Cannot reach the Game 2 server: ' + e.message); }
    const WS = this.o.WebSocketImpl || globalThis.WebSocket;
    if (!WS) return this._end('This browser does not support WebSockets');
    const ws = this.ws = new WS(url);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', version: GAME2_RAILWAY_PROTOCOL, mode: 'fleet', fleet: FLEET_PROTOCOL, token: this.o.token,
        peer: this.o.selfId, name: this.o.name, role: this.o.role, side: this.o.side }));
      this.o.token = null; // admission only; never kept
      this.state = 'live';
    };
    ws.onmessage = ev => { let m; try { m = JSON.parse(String(ev.data)); } catch { return; } this.onMessage(m); };
    ws.onerror = () => { if (this.state !== 'live') this._end('Cannot reach the Game 2 server'); };
    ws.onclose = ev => this._end('Connection closed' + (ev?.reason ? ': ' + ev.reason : ''));
  }
  _end(reason) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    try { this.ws?.close(); } catch { /* already closed */ }
    this.onClose(reason);
  }
  send(msg) {
    if (this.state !== 'live' || this.ws?.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }
  close() {
    if (this.state === 'closed') return;
    this.send({ t: 'leave' });
    this.state = 'closed';
    try { this.ws?.close(); } catch { /* already closed */ }
  }
}
