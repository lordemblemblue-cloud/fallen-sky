// A crew member played by the game: it follows the mission's objective marker through the rooms, fights
// whoever it has a line to (the duel bot's brain), and holds the interact key at whatever needs doing.
// It only sends a player's commands, so it proves a mission can be finished by the rules (tests) and can
// stand in for an absent friend later.
import { bodyOf } from './world.mjs';
import { clearLine, nextStep } from './level.mjs';
import { createBot, think as duelThink } from './bots.mjs';
import { INTERACT_RADIUS, missionView } from './mission.mjs';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ENGAGE = 17; // metres: anyone hostile this close, with a clear line, is fought first

export function createAutopilot(id, { level = 'master', seed = 5 } = {}) {
  return { id, bot: createBot(id, { level, seed }), route: null, routeAt: -Infinity };
}

/** This step's input for the piloted crew member. */
export function thinkAutopilot(mission, pilot) {
  const { world, level } = mission;
  const now = world.time;
  const me = world.fighters.get(pilot.id);
  if (!me || me.vitals.dead) return {};
  const mine = bodyOf(world, pilot.id);
  // the nearest enemy it can see
  let foe = null;
  for (const e of mission.enemies.values()) {
    const f = world.fighters.get(e.id);
    if (!f || f.vitals.dead || e.yielded) continue;
    const b = bodyOf(world, e.id);
    const d = dist(mine, b);
    if (d <= ENGAGE && clearLine(level, mine, b) && (!foe || d < foe.d)) foe = { id: e.id, d, b };
  }
  if (foe) return duelThink(world, pilot.bot, { goal: { x: foe.b.x, z: foe.b.z, hunt: foe.id, urgent: true } });

  const view = missionView(mission, pilot.id);
  const input = { move: { x: 0, z: 0 }, run: true, presses: [], face: null };
  if (me.guard) input.presses.push('blockUp');
  if (view.prompt) return { ...input, interact: true };
  const goal = view.markers[0];
  if (!goal) return input;
  const d = dist(mine, goal);
  if (d < 1.2) return input;
  // something to use at the marker: walk right up to it
  if (d < INTERACT_RADIUS * 0.9 && view.interactables.some((it) => dist(it, goal) < 0.1)) return { ...input, interact: true };
  if (!pilot.route || now - pilot.routeAt > 0.25) { pilot.route = nextStep(level, mine, goal); pilot.routeAt = now; }
  const step = pilot.route || goal;
  const a = Math.atan2(step.x - mine.x, step.z - mine.z);
  input.move = { x: Math.sin(a), z: Math.cos(a) };
  input.face = a;
  input.sprint = d > 8 && me.vitals.stamina > 45;
  return input;
}
