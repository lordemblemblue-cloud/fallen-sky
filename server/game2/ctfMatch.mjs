// Game 2 online CTF: shared spatial objective rules, independent of rendering.
// The relay owns flag state, hand-offs and scores. Player transforms still
// use the existing client-owned combat transport; these checks prevent a
// client from sending "capture" or "score" claims directly.
export const ONLINE_CTF_MAPS = Object.freeze(['skybridge', 'sumi_stronghold']);
export const ONLINE_CTF_HOMES = Object.freeze({
  skybridge: Object.freeze({ light: [-55, .3, 0], dark: [55, .3, 0] }),
  // Same authored coordinates as src/components/game2/engine/levels/sumiStronghold.js
  sumi_stronghold: Object.freeze({ light: [0, .12, -78], dark: [17, 4.2, 196] }),
});
export const CTF_CAPTURE_TARGET = 3;
export const CTF_DROP_RETURN_MS = 20000;
const other = side => side === 'light' ? 'dark' : 'light';
const clone = p => p.slice();
const near = (a, b, radius) => Array.isArray(a) && Array.isArray(b) &&
  a.every(Number.isFinite) && b.every(Number.isFinite) &&
  Math.hypot(a[0]-b[0], a[2]-b[2]) <= radius &&
  Math.abs(a[1]-b[1]) <= 2.25;
const valid = player => player?.alive && ['light','dark'].includes(player.side) &&
  Array.isArray(player.pos) && player.pos.length === 3 && player.pos.every(Number.isFinite);
function reset(flag) { flag.state = 'base'; flag.pos = clone(flag.home); flag.carrier = null; flag.dropAt = 0; }
function drop(flag, position, at) {
  flag.state = 'dropped';
  flag.pos = valid({alive:true,side:'light',pos:position}) ? clone(position) : clone(flag.home);
  flag.carrier = null;
  flag.dropAt = at;
}
export function createOnlineCtf(mapId) {
  const homes = ONLINE_CTF_HOMES[mapId];
  if (!homes) throw new Error('Online CTF needs an authored arena with two real flag bases');
  const flags = Object.fromEntries(['light','dark'].map(side => [side, {
    state: 'base', home: clone(homes[side]), pos: clone(homes[side]),
    carrier: null, dropAt: 0, passAt: -Infinity,
  }]));
  return { mapId, flags, score: {light:0,dark:0}, winner: null, revision:0 };
}
export function publicOnlineCtf(ctf) {
  if (!ctf) return null;
  return {
    revision: ctf.revision,
    mapId: ctf.mapId,
    score: { ...ctf.score },
    winner: ctf.winner,
    flags: Object.fromEntries(Object.entries(ctf.flags).map(([side, flag]) => [side, {
      state: flag.state, home: clone(flag.home), pos: clone(flag.pos),
      carrier: flag.carrier,
    }])),
  };
}
export function dropOnlineCtfCarrier(ctf, playerId, lastPosition, at) {
  if (!ctf || ctf.winner) return false;
  let changed = false;
  for (const flag of Object.values(ctf.flags)) {
    if (flag.state === 'carried' && flag.carrier === playerId) {
      drop(flag, lastPosition || flag.pos, at); changed = true;
    }
  }
  if (changed) ctf.revision++;
  return changed;
}
export function passOnlineCtfFlag(ctf, from, to, at) {
  if (!ctf || ctf.winner || !valid(from) || !valid(to) || from.side !== to.side ||
      from.id === to.id || !near(from.pos, to.pos, 16)) return false;
  const flag = ctf.flags[other(from.side)];
  if (flag.state !== 'carried' || flag.carrier !== from.id ||
      at - flag.passAt < 550) return false;
  flag.state = 'carried'; flag.carrier = to.id; flag.pos = clone(to.pos);
  flag.passAt = at; ctf.revision++;
  return true;
}
export function advanceOnlineCtf(ctf, players, at) {
  if (!ctf || ctf.winner) return false;
  const active = [...players].filter(valid);
  let changed = false;
  for (const [side, flag] of Object.entries(ctf.flags)) {
    if (flag.state === 'carried') {
      const carrier = active.find(p => p.id === flag.carrier);
      if (!carrier || carrier.side === side) {
        drop(flag, players.find(p => p.id === flag.carrier)?.pos || flag.pos, at);
        changed = true;
      } else {
        flag.pos = clone(carrier.pos);
      }
    }
    if (flag.state === 'dropped' && at - flag.dropAt >= CTF_DROP_RETURN_MS) {
      reset(flag); changed = true;
    }
    if (flag.state === 'dropped' && active.some(p => p.side === side && near(p.pos, flag.pos, 1.6))) {
      reset(flag); changed = true;
    }
    if (flag.state !== 'carried') {
      const taker = active.find(p => p.side === other(side) && near(p.pos, flag.pos, 1.65));
      if (taker) {
        flag.state = 'carried'; flag.carrier = taker.id; flag.pos = clone(taker.pos);
        changed = true;
      }
    }
  }
  for (const side of ['light','dark']) {
    const enemy = ctf.flags[other(side)], own = ctf.flags[side];
    if (enemy.state !== 'carried' || own.state !== 'base') continue;
    const carrier = active.find(p => p.side === side && p.id === enemy.carrier);
    if (carrier && near(carrier.pos, own.home, 2.2)) {
      ctf.score[side]++;
      reset(enemy); reset(own); changed = true;
      if (ctf.score[side] >= CTF_CAPTURE_TARGET) ctf.winner = side;
    }
  }
  if (changed) ctf.revision++;
  return changed;
}
