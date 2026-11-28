// A recorded world for the pledge interpreter: a small quest store built from
// the engine's own pure functions, a player who can walk, press and hold E, a
// fake cast and fake enemies that answer the bus, and a log of everything the
// interpreter did. Not a test file itself.
import './fixtures/three-roads-sample/install.mjs';
import { pledgePrerequisitesMet } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { isPledgeReadyToComplete } from '../src/components/game3d/pledges/pledgeProgress.mjs';
import {
  pledgeStateOnAbandon, pledgeStateOnAccept, pledgeStateOnComplete, pledgeStateOnEvent,
} from '../src/components/game3d/pledges/pledgeState.mjs';
import { localToWorld } from '../src/components/game3d/threeroads/coords.mjs';
import { THREE_ROADS_CAST } from '../src/components/game3d/threeroads/script/cast.mjs';
import { pledgeHome, threeRoadsPledges } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import {
  createPledgeInterpreter, pledgePointWorld,
} from '../src/components/game3d/threeroads/pledgeworld/pledgeInterpreter.mjs';

export const LYRA_SPOT = Object.freeze({ x: -4, z: 10 }); // WOLFVEIL_TOWN_QUEST_NPC_SPOTS, world metres

export const emptyQuestState = () => ({
  acceptedIds: [], completedIds: [], progress: {}, objectiveProgress: {},
  storyFlags: {}, choices: {}, abandonedIds: [], completionCounts: {}, lastAcceptedId: null,
});

// `area`: which of the five areas is loaded; people stand at the home they
// have there (cast.mjs `alsoAt`) when they have one, otherwise at their main home.
export function createHarness({ empire = 'none', state = emptyQuestState(), pledges = threeRoadsPledges(), speechBusy = () => false, area = null } = {}) {
  const log = [];
  const people = new Map();     // id -> { x, z } live positions
  const followers = new Map();  // id -> distance behind the player
  const groups = new Map();     // groupId -> { count, placeId }
  const player = { x: 0, z: 0 };
  let now = 0;
  let current = state;
  const frame = { now: 0, player, eDown: false, blocked: false, down: false, locate: id => people.get(id) || null };

  const placeAtHome = () => {
    for (const person of THREE_ROADS_CAST) {
      const home = pledgeHome(person.id, current.storyFlags, area);
      if (home) people.set(person.id, localToWorld(home.x, home.z));
      else if (!person.existing && person.home) people.delete(person.id);
    }
    people.set('archer_lyra', { ...LYRA_SPOT });
  };
  placeAtHome();

  const world = {
    bus(type, detail) {
      log.push({ bus: type, ...detail });
      if (type === 'cast:spawn') people.set(detail.id, { x: detail.x, z: detail.z });
      else if (type === 'cast:despawn') { people.delete(detail.id); followers.delete(detail.id); }
      else if (type === 'cast:moveTo') { if (people.has(detail.id)) people.set(detail.id, { x: detail.x, z: detail.z }); }
      else if (type === 'cast:follow') {
        if (detail.target === 'player') followers.set(detail.id, detail.distance);
        else followers.delete(detail.id);
      } else if (type === 'enemies:spawnGroup') {
        if (!groups.has(detail.groupId)) groups.set(detail.groupId, { count: detail.count, placeId: detail.placeId });
      } else if (type === 'enemies:despawnGroup') groups.delete(detail.groupId);
    },
    say: lineId => log.push({ say: lineId }),
    sound: name => log.push({ sound: name }),
    setFlag: flag => {
      log.push({ flag });
      current = { ...current, storyFlags: { ...current.storyFlags, [flag]: true } };
    },
    report: detail => {
      log.push({ report: detail.type, detail });
      let changed = false;
      for (const pledge of pledges) {
        if (!current.acceptedIds.includes(pledge.id)) continue;
        const staged = pledgeStateOnEvent(current, pledge, detail);
        if (staged.changed) { current = { ...current, ...staged.patch }; changed = true; }
      }
      if (changed) interpreter.sync(current);
    },
    notice: kind => log.push({ notice: kind }),
    speechBusy,
  };

  const interpreter = createPledgeInterpreter({ pledges, world, getEmpire: () => empire });
  interpreter.sync(current);

  const byId = id => pledges.find(pledge => pledge.id === id);
  const step = () => {
    frame.now = now;
    for (const [id, behind] of followers) people.set(id, { x: player.x + behind, z: player.z });
    interpreter.update(frame);
  };

  const harness = {
    log, people, groups, player, frame, interpreter,
    get state() { return current; },
    get now() { return now; },
    says: () => log.filter(entry => entry.say).map(entry => entry.say),
    bus: type => log.filter(entry => entry.bus === type),
    reports: type => log.filter(entry => entry.report === type),
    notices: () => log.filter(entry => entry.notice).map(entry => entry.notice),
    progress: (pledgeId, stepId) => Number(current.objectiveProgress?.[pledgeId]?.[stepId] || 0),
    stepOf: pledgeId => interpreter.status().find(entry => entry.pledgeId === pledgeId)?.stepId ?? null,
    view: () => { frame.now = now; return interpreter.view(frame); },

    accept(pledgeId) {
      const pledge = byId(pledgeId);
      const check = pledgePrerequisitesMet(pledge, current, { level: 1 });
      if (!check.ok) return check;
      current = { ...current, acceptedIds: [...current.acceptedIds, pledgeId], lastAcceptedId: pledgeId };
      current = { ...current, ...pledgeStateOnAccept(current, pledge) };
      interpreter.sync(current);
      return check;
    },
    complete(pledgeId) {
      const pledge = byId(pledgeId);
      if (!current.acceptedIds.includes(pledgeId)) return false;
      if (!isPledgeReadyToComplete(pledge, current.objectiveProgress[pledgeId])) return false;
      const storyFlags = { ...current.storyFlags };
      for (const flag of pledge.storyFlagsOnComplete) storyFlags[flag] = true;
      current = {
        ...current, storyFlags,
        acceptedIds: current.acceptedIds.filter(id => id !== pledgeId),
        completedIds: [...current.completedIds, pledgeId],
      };
      current = { ...current, ...pledgeStateOnComplete(current, pledge) };
      interpreter.sync(current);
      placeAtHome();
      return true;
    },
    abandon(pledgeId) {
      const pledge = byId(pledgeId);
      current = {
        ...current,
        acceptedIds: current.acceptedIds.filter(id => id !== pledgeId),
        objectiveProgress: { ...current.objectiveProgress, [pledgeId]: {} },
      };
      current = { ...current, ...pledgeStateOnAbandon(current, pledge) };
      interpreter.sync(current);
    },

    // Let real seconds pass, a tenth of a second at a time.
    wait(seconds, tick = 0.1) {
      const steps = Math.max(1, Math.round(seconds / tick));
      for (let i = 0; i < steps; i++) { now += tick; step(); }
    },
    // Stand somewhere at once (no ground covered).
    place(target) {
      const at = typeof target === 'string' ? (pledgePointWorld(target) || people.get(target)) : target;
      player.x = at.x; player.z = at.z;
      now += 0.1; step();
    },
    // Walk there in a straight line at `speed` metres a second.
    walk(target, speed = 6, tick = 0.1) {
      const at = typeof target === 'string' ? (pledgePointWorld(target) || people.get(target)) : target;
      for (let guard = 0; guard < 100000; guard++) {
        const dx = at.x - player.x;
        const dz = at.z - player.z;
        const left = Math.hypot(dx, dz);
        const stride = speed * tick;
        if (left <= stride) { player.x = at.x; player.z = at.z; now += tick; step(); return; }
        player.x += dx / left * stride; player.z += dz / left * stride;
        now += tick; step();
      }
    },
    // One press of E: what the interpreter made of it ('consume', 'pass' or null).
    press() {
      frame.now = now;
      frame.eDown = true;
      const result = interpreter.interact(frame);
      now += 0.1; step();
      frame.eDown = false;
      now += 0.1; step();
      return result;
    },
    // Press E and keep it down for `seconds`, then let go.
    hold(seconds) {
      frame.now = now;
      frame.eDown = true;
      const result = interpreter.interact(frame);
      harness.wait(seconds);
      frame.eDown = false;
      now += 0.1; step();
      return result;
    },
    // One of a group's monsters dies, as the enemies subsystem reports it.
    kill(groupId, times = 1) {
      for (let i = 0; i < times; i++) {
        const group = groups.get(groupId);
        if (!group || group.count <= 0) return false;
        group.count--;
        const detail = { type: 'enemy_killed', targetId: groupId, kind: 'ink_shade', tier: 'normal', count: 1 };
        if (group.placeId) detail.placeId = group.placeId;
        world.report(detail);
        if (!group.count) groups.delete(groupId);
      }
      now += 0.1; step();
      return true;
    },
    choose(pledgeId, choiceId) {
      const done = interpreter.choose(pledgeId, choiceId);
      now += 0.1; step();
      return done;
    },
    // The same quest state in a scene built from nothing (a reload, an area change).
    reload(options = {}) {
      interpreter.dispose();
      const next = createHarness({ empire, pledges, speechBusy, area, state: current, ...options });
      next.player.x = player.x; next.player.z = player.z;
      return next;
    },
  };
  return harness;
}
