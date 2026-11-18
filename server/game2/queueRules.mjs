// Server and client share the real queueable multiplayer mode contract.
// Online CTF uses the server-owned objective state in ctfMatch.mjs rather
// than the offline AI-only Game2TeamMatch instance.
export const GAME2_QUEUE_RULES = Object.freeze({
  ffa: Object.freeze({ label: 'Free-for-all', minPlayers: 2, maxPlayers: 2, team: false }),
  teams: Object.freeze({ label: 'Team Deathmatch', minPlayers: 4, maxPlayers: 4, team: true }),
  duel: Object.freeze({ label: 'Duel', minPlayers: 2, maxPlayers: 2, team: false }),
  team_duel: Object.freeze({ label: 'Team Duel · 2v2', minPlayers: 4, maxPlayers: 4, team: true }),
  ctf: Object.freeze({ label: 'Capture the Flag', minPlayers: 4, maxPlayers: 4, team: true }),
});
export const GAME2_QUEUE_MODES = Object.freeze(Object.keys(GAME2_QUEUE_RULES));
export function isGame2TeamMode(mode) {
  return mode === 'teams' || mode === 'team_duel' || mode === 'ctf';
}
export function requestedGame2QueueModes(mode, rng = Math.random) {
  if (mode === 'all') return [...GAME2_QUEUE_MODES];
  if (mode === 'random') {
    const value = Math.max(0, Math.min(.999999999, Number(rng()) || 0));
    return [GAME2_QUEUE_MODES[Math.floor(value * GAME2_QUEUE_MODES.length)]];
  }
  return GAME2_QUEUE_MODES.includes(mode) ? [mode] : [];
}
export function normalizeGame2QueueModes(modes) {
  if (!Array.isArray(modes) || !modes.length || modes.length > GAME2_QUEUE_MODES.length ||
      modes.some(mode => typeof mode !== 'string' || !GAME2_QUEUE_MODES.includes(mode)) ||
      new Set(modes).size !== modes.length) return null;
  return [...modes];
}
