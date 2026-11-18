// Fleet Assault matchmaking: a player goes to the first match with a free seat (rules MATCH.maxPlayers humans each),
// a new match opens when every match is full. Transport-neutral: a connection is any object with send(message,
// reliable); arena.mjs passes WebSocket wrappers, the browser's practice mode passes callbacks, tests pass recorders.
import { createFleetMatch } from './match.mjs';

export function createFleetHub({ now = Date.now, rng = Math.random, config = {}, maxMatches = 16 } = {}) {
  const matches = new Map();
  const members = new Map(); // connection -> { match, pid, profile }
  let made = 0;

  function open() {
    for (const mt of matches.values()) {
      if (mt.state.phase !== 'ended' && mt.humans() < mt.cfg.maxPlayers) return mt;
    }
    if (matches.size >= maxMatches) return null;
    const id = 'fleet-' + (++made).toString(36) + Math.floor(rng() * 36 ** 4).toString(36).padStart(4, '0');
    const mt = createFleetMatch({ id, now, rng, config });
    matches.set(id, mt);
    return mt;
  }
  function join(conn, profile = {}) {
    if (!conn || typeof conn.send !== 'function') return { ok: false, reason: 'Invalid connection' };
    if (members.has(conn)) return { ok: false, reason: 'Already in a Fleet Assault match' };
    const id = String(profile.id || '');
    if (!id) return { ok: false, reason: 'Missing player id' };
    for (const mt of matches.values()) if (mt.state.players.has(id)) return { ok: false, reason: 'This session is already in a match' };
    const mt = open();
    if (!mt) return { ok: false, reason: 'Every Fleet Assault match is full' };
    const r = mt.addHuman({ id, name: profile.name, conn, role: profile.role, side: profile.side });
    if (!r.ok) return r;
    members.set(conn, { match: mt, pid: id, profile: { ...profile, id } });
    return { ok: true, match: mt.id, eid: r.player.eid, side: r.player.side };
  }
  function leave(conn) {
    const mem = members.get(conn);
    if (!mem) return;
    members.delete(conn);
    mem.match.removePlayer(mem.pid);
  }
  function message(conn, data) {
    const mem = members.get(conn);
    if (!mem || !data || typeof data !== 'object') return false;
    if (data.c === 'requeue') { // after a match ends: straight into the next one
      if (mem.match.state.phase !== 'ended') return false;
      leave(conn);
      const r = join(conn, mem.profile);
      if (!r.ok) conn.send({ t: 'fx', reason: r.reason }, true);
      return r.ok;
    }
    return mem.match.handle(mem.pid, data);
  }
  function tick() {
    for (const [id, mt] of matches) {
      mt.tick();
      const s = mt.state;
      const over = s.phase === 'ended' && now() - s.endedAt >= mt.cfg.endLingerMs;
      if (!over && mt.humans()) continue;
      for (const [conn, mem] of [...members]) {
        if (mem.match !== mt) continue;
        members.delete(conn);
        try { conn.send({ t: 'fx', reason: 'Match over' }, true); } catch { /* gone */ }
      }
      matches.delete(id); // nobody left, or the result has been shown long enough
    }
  }
  const report = () => ({
    matches: [...matches.values()].map(mt => mt.summary()),
    humans: [...matches.values()].reduce((n, mt) => n + mt.humans(), 0),
  });
  return { join, leave, message, tick, report, matches, members };
}
