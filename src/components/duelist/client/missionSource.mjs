// A story mission played in the browser, as a "source" for the game view (the same shape as a local match or
// an online one). The crew is you (friends play through the match server: net/client.mjs); the depot's
// people are seats too, so the renderer gives them bodies, kits and name tags as they appear.
import { createMission, stepMission, missionView, claimStorySupply } from '../sim/mission.mjs';
import { BODY_IDS } from '../net/protocol.mjs';
import { enemySeat, allySeat, crewSeat, teacherBodyFor } from './missionSeats.mjs';

const STEP = 1 / 60;

export function createMissionSource({ id = 'contraband', seed = 1, youBody = BODY_IDS[0] } = {}) {
  const mission = createMission({ id, seed, players: [{ id: 'you', name: 'You' }] });
  const teacherBody = teacherBodyFor(youBody);
  let accumulator = 0;
  let seats = [];
  let version = 0;
  let known = '';
  let storySupplyAnswer = null;
  const refresh = () => {
    const key = [...mission.seats.keys(), '|', ...mission.allies.keys(), '|', ...mission.enemies.keys()].join(',');
    if (key === known) return;
    known = key;
    version += 1;
    seats = [
      ...[...mission.seats.values()].map((s) => crewSeat({ id: s.id, name: s.name, body: youBody }, 'you')),
      ...[...mission.allies.values()].map((a) => allySeat(a, { teacherBody })),
      ...[...mission.enemies.values()].map((e) => enemySeat(e, { teacherBody })),
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
    get storySupplyAnswer() { return storySupplyAnswer; },
    claimStorySupply(id) { storySupplyAnswer = claimStorySupply(mission, 'you', id); return storySupplyAnswer; },
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
