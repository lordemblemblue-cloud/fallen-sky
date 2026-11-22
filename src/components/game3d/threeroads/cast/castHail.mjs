// Sentries hailing a traveller who comes near. Pure: the subsystem hands in who
// could hail and where the player is; this decides who (if anyone) speaks now.
//
// Rules (from the lead, 2026-11-22):
// - A person with a `hail` line says it, unasked, when the player comes within
//   HAIL_RADIUS while they are at home, standing still and drawn.
// - Once per approach: armed again only after the player has been beyond
//   HAIL_REARM; and never twice within HAIL_COOLDOWN seconds for the same person.
// - Never over a pledge's scene: not while any line is on screen or queued, and
//   not while that person is being moved or followed by a pledge (`cued`).
// - Two sentries side by side never speak at once: the nearer speaks; the other
//   waits until that line is off the screen (any line up makes everyone wait) and
//   speaks then if the player is still near and it is still armed.
// - Presentation only: nothing here sets a flag, sends a pledge event or grants anything.

export const HAIL_RADIUS = 7;
export const HAIL_REARM = 20;
export const HAIL_COOLDOWN = 45;

/** Per-person memory: { armed, lastAt }. Everyone starts armed. */
export function createHailMemory() {
  return new Map();
}

const memoryOf = (memory, id) => {
  let entry = memory.get(id);
  if (!entry) { entry = { armed: true, lastAt: -Infinity }; memory.set(id, entry); }
  return entry;
};

/**
 * Who hails now, or null. `candidates` is a list of
 * { id, x, z, atHome, still, drawn, cued } for people who have a hail line;
 * `busy` is true while any line is on screen or queued. The one chosen is marked
 * (disarmed, time noted) before it is returned.
 */
export function chooseHail({ now, player, candidates, busy, memory }) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  let best = null, bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const entry = memoryOf(memory, c.id);
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d > HAIL_REARM) entry.armed = true;
    if (busy || d > HAIL_RADIUS || !entry.armed || now - entry.lastAt < HAIL_COOLDOWN) continue;
    if (!c.atHome || !c.still || !c.drawn || c.cued) continue;
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  if (!best) return null;
  const entry = memoryOf(memory, best.id);
  entry.armed = false;
  entry.lastAt = now;
  return best.id;
}

/**
 * A fraction in [0, 1) fixed by a person's id, so their idle starts at the same
 * place in the clip every visit and neighbours do not sway in step.
 */
export function idlePhaseOf(id) {
  let h = 2166136261;
  const text = String(id ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The idle's playback rate for a person, 0.94 to 1.06, also fixed by their id:
 * two people whose starting points happen to fall close together still drift
 * apart within a few cycles instead of swaying in step for ever.
 */
export const idleRateOf = id => 0.94 + 0.12 * idlePhaseOf(String(id ?? '') + '|rate');
