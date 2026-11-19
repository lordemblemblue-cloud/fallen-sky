// A story mission played in the browser, as a "source" for the game view (the same shape as a local match or
// an online one). The crew is you (friends join through the server); the depot's people are seats too, so
// the renderer gives them bodies, sidearms and name tags as they appear.
import { createMission, stepMission, missionView } from '../sim/mission.mjs';
import { BODY_IDS } from '../net/protocol.mjs';
import { KITS } from './guardKit.mjs';

const STEP = 1 / 60;
const GUARD_BODIES = ['male', 'female'];
// the depot's people wear a kit by their job (client/guardKit.mjs); the three ringleaders each have their own
const BODY_OF = Object.freeze({ dask: 'male', perrin: 'female', rooke: 'male' });
export const CREW_COLOR = 0x7dffb0; // a crewmate's blade
const TEACHER_COLOR = 0xc4a3ff;

/** One of the depot's people as a seat the renderer can dress. playerBody: the body the player chose. */
export function enemySeat(enemy, index, playerBody) {
  const willUser = enemy.type.kind === 'duelist';
  const kit = willUser ? null : KITS[enemy.tag] || KITS[enemy.typeId] || KITS.gunner;
  // the teacher is whichever of the owner's two fighters you are not
  const body = willUser ? (playerBody === 'maskedWarrior' ? 'huntress' : 'maskedWarrior') : BODY_OF[enemy.tag] || GUARD_BODIES[index % GUARD_BODIES.length];
  return { id: enemy.id, name: enemy.name, team: 'depot', kind: 'enemy', body, weapon: enemy.type.weapon, named: enemy.named, tag: enemy.tag || null,
    willUser, kit, color: kit ? kit.glow : TEACHER_COLOR };
}

export function createMissionSource({ id = 'contraband', seed = 1, youBody = BODY_IDS[0] } = {}) {
  const mission = createMission({ id, seed, players: [{ id: 'you', name: 'You' }] });
  let accumulator = 0;
  let seats = [];
  let version = 0;
  let known = '';
  const refresh = () => {
    const key = [...mission.seats.keys(), ...mission.enemies.keys()].join(',');
    if (key === known) return;
    known = key;
    version += 1;
    seats = [
      ...[...mission.seats.values()].map((s) => ({ id: s.id, name: s.name, team: 'crew', kind: 'player', body: youBody, weapon: 'sword', color: s.id === 'you' ? null : CREW_COLOR })),
      ...[...mission.enemies.values()].map((e, i) => enemySeat(e, i, youBody)),
    ];
  };
  refresh();
  return {
    kind: 'mission',
    mission,
    world: mission.world,
    level: mission.level,
    def: mission.def,
    meId: 'you',
    mode: 'story',
    status: 'ready',
    get seatsVersion() { return version; },
    seats: () => seats,
    view: () => missionView(mission, 'you'),
    flags: () => null,
    step(dt, readInput) {
      accumulator += dt;
      const out = { effects: [], events: [] };
      let first = true;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const input = readInput();
        if (!first) input.presses = [];
        first = false;
        const r = stepMission(mission, STEP, { you: input });
        if (r.effects.length) out.effects.push(...r.effects);
        if (r.events.length) out.events.push(...r.events);
      }
      refresh();
      return out;
    },
    leave() {},
    dispose() {},
  };
}
