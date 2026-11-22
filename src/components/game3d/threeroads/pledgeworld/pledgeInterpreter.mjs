// The pledge interpreter: reads the quest store's state and the script's
// staging and decides, for every sworn pledge, which step is current, which
// cues to run when a step starts or ends, and what the step is waiting for.
// Pure: no Three.js, no DOM, no store. It reaches the world only through the
// functions it is handed, so a test can record everything it did:
//   world.bus(type, detail)   a Three Roads bus event (cast:*, enemies:*, pledge:*)
//   world.say(lineId)         speak a line of the script
//   world.sound(name)         play a named sound
//   world.setFlag(flag)       set a story flag
//   world.report(detail)      an engine event (the window event axePledgeEvent)
//   world.notice(kind)        tell the player a step has to be started again
//   world.speechBusy()        true while a line is still being spoken
//
// One timeline per pledge. When a step is finished its `done` cues run in
// order (a `wait` holds the timeline for real seconds), then the next step's
// `start` cues, and only then is the next step watched. So a scene plays out
// before the player is asked for the next thing.
//
// Entering a scene with a pledge already under way (a reload, an area change):
// the current step's `start` cues run again and its `done` cues never do. What
// earlier steps left standing in the world (people brought in, people
// following, monster groups not yet beaten) is put back first, silently.
import { getPledgeActiveGroup } from '../../pledges/pledgeProgress.mjs';
import { localToWorld } from '../coords.mjs';
import { pledgePersonName, pledgePointLocal, pledgeStaging } from './pledgeScript.mjs';
import { TALK_RANGE, asList, createStepWatcher, groupDetail } from './pledgeWatchers.mjs';

// What a step remembers while it is open and the scene is rebuilt around it:
// which of several people or points are already done, and how many of the
// lines spoken on the way have been said. Kept for the life of the page.
const STEP_MEMORY = new Map();
const memoryKey = (pledgeId, stepId) => pledgeId + ':' + stepId;
function stepMemory(pledgeId, stepId, progress) {
  const key = memoryKey(pledgeId, stepId);
  let memory = STEP_MEMORY.get(key);
  if (!memory) { memory = { done: new Set(), alongSpoken: 0 }; STEP_MEMORY.set(key, memory); }
  // A step at zero starts clean; one with more recorded than the engine has
  // counted is out of date.
  if (!progress || memory.done.size > progress) { memory.done.clear(); if (!progress) memory.alongSpoken = 0; }
  return memory;
}
export function resetPledgeStepMemory() { STEP_MEMORY.clear(); }

const WORLD_POINTS = new Map();
export function pledgePointWorld(name) {
  if (WORLD_POINTS.has(name)) return WORLD_POINTS.get(name);
  const local = pledgePointLocal(name);
  const world = local ? Object.freeze(localToWorld(local.x, local.z)) : null;
  WORLD_POINTS.set(name, world);
  return world;
}

const stagingStep = (staging, stepId) => staging?.steps?.[stepId] || {};

// What the steps before `index` left standing: who was brought in and where
// they are now, who follows whom, who was sent walking, which monster groups
// are still out. Read from the cues in the order they would have run.
export function standingState(pledge, staging, index, progress = {}) {
  const people = new Map();   // id -> { at, facing, follow }   (brought in by this pledge)
  const moved = new Map();    // id -> { to, speed }            (people who live in the scene)
  const follows = new Map();  // id -> { target, distance }
  const groups = new Map();   // groupId -> spawn spec
  const steps = pledge.pledge.steps;
  const last = Math.min(index, steps.length);
  for (let i = 0; i < last; i++) {
    const entry = stagingStep(staging, steps[i].id);
    for (const cue of [...asList(entry.start), ...asList(entry.done)]) {
      if (cue.castSpawn) people.set(cue.castSpawn, { at: cue.at, facing: cue.facing ?? 0 });
      else if (cue.castDespawn) { people.delete(cue.castDespawn); moved.delete(cue.castDespawn); follows.delete(cue.castDespawn); }
      else if (cue.castMove) {
        if (people.has(cue.castMove)) people.get(cue.castMove).at = cue.to;
        else moved.set(cue.castMove, { to: cue.to, speed: cue.speed });
      } else if (cue.castFollow) {
        if (cue.target) follows.set(cue.castFollow, { target: cue.target, distance: cue.distance });
        else follows.delete(cue.castFollow);
      } else if (cue.spawnGroup) groups.set(cue.spawnGroup.groupId, cue.spawnGroup);
      else if (cue.despawnGroup) groups.delete(cue.despawnGroup);
    }
    // A finished fight leaves nobody; a finished escort leaves its people where they were taken.
    if (steps[i].kind === 'defeat' && entry.watch?.groupId) groups.delete(entry.watch.groupId);
    if (steps[i].kind === 'escort' && entry.watch?.to) {
      for (const id of asList(entry.watch.people)) if (people.has(id)) people.get(id).at = entry.watch.to;
    }
  }
  // The fight that is under way keeps only those not yet beaten.
  if (index < steps.length && steps[index].kind === 'defeat') {
    const groupId = stagingStep(staging, steps[index].id).watch?.groupId;
    const spec = groupId ? groups.get(groupId) : null;
    if (spec) {
      const left = spec.count - Number(progress?.[steps[index].id] || 0);
      if (left > 0) groups.set(groupId, { ...spec, count: left });
      else groups.delete(groupId);
    }
  }
  return { people, moved, follows, groups };
}

// The cues that put that standing state back.
export function standingCues(pledge, staging, index, progress = {}) {
  const { people, moved, follows, groups } = standingState(pledge, staging, index, progress);
  const cues = [];
  for (const [id, entry] of people) cues.push({ castSpawn: id, at: entry.at, facing: entry.facing });
  for (const [id, entry] of moved) cues.push({ castMove: id, to: entry.to, speed: entry.speed });
  for (const [id, entry] of follows) cues.push({ castFollow: id, target: entry.target, distance: entry.distance });
  for (const spec of groups.values()) cues.push({ spawnGroup: spec });
  return cues;
}

// Where the script first puts a monster group, for the trail on the ground.
function groupSpawnPoint(staging, groupId, point) {
  for (const entry of Object.values(staging?.steps || {})) {
    for (const cue of [...asList(entry.start), ...asList(entry.done)]) {
      if (cue.spawnGroup?.groupId === groupId) return point(cue.spawnGroup.at);
    }
  }
  return null;
}

export function createPledgeInterpreter({
  pledges = [],
  world = {},
  stagingOf = pledgeStaging,
  point = pledgePointWorld,
  personName = id => pledgePersonName(id) || id,
  // A person's place when they are not in the scene: where they normally stand.
  homeOf = () => null,
  getEmpire = () => 'none',
} = {}) {
  const runtimes = new Map();
  let order = [];
  let lastFrame = null;

  const call = (name, ...args) => (typeof world[name] === 'function' ? world[name](...args) : undefined);
  const watcherWorld = {
    report: detail => call('report', detail),
    say: lineId => call('say', lineId),
    bus: (type, detail) => call('bus', type, detail),
    notice: kind => call('notice', kind),
  };
  const whereIs = id => lastFrame?.locate?.(id) || homeOf(id) || null;

  const byEmpire = map => {
    const empire = getEmpire() || 'none';
    return map?.[empire] ?? map?.none ?? null;
  };

  function runCue(rt, cue) {
    if (cue._started) call('bus', 'pledge:stepStarted', { pledgeId: rt.pledge.id, stepId: cue._started });
    else if (cue._done) call('bus', 'pledge:stepDone', { pledgeId: rt.pledge.id, stepId: cue._done });
    else if (cue.say) call('say', cue.say);
    else if (cue.sound) call('sound', cue.sound);
    else if (cue.sayByEmpire) { const lineId = byEmpire(cue.sayByEmpire); if (lineId) call('say', lineId); }
    else if (cue.flagByEmpire) { const flag = byEmpire(cue.flagByEmpire); if (flag) call('setFlag', flag); }
    else if (cue.castSpawn) {
      const at = point(cue.at);
      if (at) call('bus', 'cast:spawn', { id: cue.castSpawn, x: at.x, z: at.z, facing: cue.facing ?? 0 });
    } else if (cue.castDespawn) call('bus', 'cast:despawn', { id: cue.castDespawn });
    else if (cue.castMove) {
      const to = point(cue.to);
      if (to) call('bus', 'cast:moveTo', { id: cue.castMove, x: to.x, z: to.z, speed: cue.speed ?? 1.6 });
    } else if (cue.castFollow) {
      call('bus', 'cast:follow', { id: cue.castFollow, target: cue.target ?? null, distance: cue.distance ?? 3 });
    } else if (cue.spawnGroup) call('bus', 'enemies:spawnGroup', groupDetail(cue.spawnGroup, point));
    else if (cue.despawnGroup) call('bus', 'enemies:despawnGroup', { groupId: cue.despawnGroup });
  }

  function makeWatcher(rt, index) {
    const step = rt.pledge.pledge.steps[index];
    const entry = stagingStep(rt.staging, step.id);
    const progress = Number(rt.progress?.[step.id] || 0);
    return createStepWatcher({
      pledge: rt.pledge, index, step,
      watch: entry.watch || {}, along: entry.along || null,
      progress,
      memory: stepMemory(rt.pledge.id, step.id, progress),
      world: watcherWorld, point, personName, whereIs,
      groupPoint: groupId => groupSpawnPoint(rt.staging, groupId, point),
    });
  }

  const enqueueEnter = (rt, index) => {
    const step = rt.pledge.pledge.steps[index];
    rt.queue.push({ _started: step.id });
    for (const cue of asList(stagingStep(rt.staging, step.id).start)) rt.queue.push(cue);
    rt.queue.push({ _watch: index });
  };
  const enqueueDone = (rt, index) => {
    const step = rt.pledge.pledge.steps[index];
    rt.queue.push({ _done: step.id });
    for (const cue of asList(stagingStep(rt.staging, step.id).done)) rt.queue.push(cue);
    STEP_MEMORY.delete(memoryKey(rt.pledge.id, step.id));
  };

  function dropWatcher(rt) {
    const watcher = rt.watcher;
    rt.watcher = null;
    watcher?.dispose();
  }

  function begin(pledge, progress, index) {
    const rt = {
      pledge, staging: stagingOf(pledge.id), progress, stepIndex: index,
      queue: [], waitUntil: 0, watcher: null, dead: false,
    };
    const steps = pledge.pledge.steps;
    for (const cue of standingCues(pledge, rt.staging, index < 0 ? steps.length : index, progress)) rt.queue.push(cue);
    if (index >= 0) enqueueEnter(rt, index);
    return rt;
  }

  // Abandoned: take out what the pledge had standing in the world.
  // Everything its cues so far brought in is sent away; a subsystem ignores
  // an id it no longer has. People who live in the scene only stop following.
  function clearWorld(rt) {
    const steps = rt.pledge.pledge.steps;
    const upTo = rt.stepIndex < 0 ? steps.length : rt.stepIndex + 1;
    const people = new Set();
    const followers = new Set();
    const groups = new Set();
    for (let i = 0; i < upTo; i++) {
      const entry = stagingStep(rt.staging, steps[i].id);
      for (const cue of [...asList(entry.start), ...asList(entry.done)]) {
        if (cue.castSpawn) people.add(cue.castSpawn);
        else if (cue.castFollow) followers.add(cue.castFollow);
        else if (cue.spawnGroup) groups.add(cue.spawnGroup.groupId);
      }
    }
    for (const id of followers) if (!people.has(id)) call('bus', 'cast:follow', { id, target: null, distance: 0 });
    for (const id of people) call('bus', 'cast:despawn', { id });
    for (const groupId of groups) call('bus', 'enemies:despawnGroup', { groupId });
  }

  function sync(state) {
    const accepted = Array.isArray(state?.acceptedIds) ? state.acceptedIds : [];
    const completed = Array.isArray(state?.completedIds) ? state.completedIds : [];
    let changed = false;
    for (const pledge of pledges) {
      let rt = runtimes.get(pledge.id);
      if (!accepted.includes(pledge.id)) {
        if (!rt) continue;
        rt.dead = true;
        dropWatcher(rt);
        if (!completed.includes(pledge.id)) clearWorld(rt);
        runtimes.delete(pledge.id);
        changed = true;
        continue;
      }
      const progress = state.objectiveProgress?.[pledge.id] || {};
      const group = getPledgeActiveGroup(pledge, progress);
      const index = group ? group.index : -1;
      const steps = pledge.pledge.steps;
      const from = rt ? (rt.stepIndex < 0 ? steps.length : rt.stepIndex) : 0;
      const to = index < 0 ? steps.length : index;
      if (!rt || to < from) {
        // Just sworn, just arrived in this scene, or sworn again from the start.
        if (rt) { rt.dead = true; dropWatcher(rt); }
        rt = begin(pledge, progress, index);
        runtimes.set(pledge.id, rt);
        changed = true;
        continue;
      }
      rt.progress = progress;
      if (to > from) {
        dropWatcher(rt);
        // Drop a watch that was queued for a step now behind us.
        rt.queue = rt.queue.filter(cue => cue._watch === undefined);
        for (let i = from; i < to; i++) {
          enqueueDone(rt, i);
          if (i + 1 < to) { // a step the engine passed over in the same breath
            rt.queue.push({ _started: steps[i + 1].id });
            for (const cue of asList(stagingStep(rt.staging, steps[i + 1].id).start)) rt.queue.push(cue);
          }
        }
        rt.stepIndex = index;
        if (index >= 0) enqueueEnter(rt, index);
      } else if (rt.watcher && index >= 0) {
        rt.watcher.setProgress(Number(progress[steps[index].id] || 0));
      }
    }
    if (changed) order = [...runtimes.values()];
  }

  function tick(now) {
    const list = order;
    for (let i = 0; i < list.length; i++) {
      const rt = list[i];
      while (!rt.dead && rt.queue.length && now >= rt.waitUntil) {
        const cue = rt.queue[0];
        if (cue._watch !== undefined) {
          // A choice waits until the line that asks for it has been said.
          if (rt.pledge.pledge.steps[cue._watch].kind === 'choose' && call('speechBusy')) break;
          rt.queue.shift();
          if (!rt.watcher && rt.stepIndex === cue._watch) rt.watcher = makeWatcher(rt, cue._watch);
          continue;
        }
        rt.queue.shift();
        if (cue.wait !== undefined) { rt.waitUntil = now + Math.max(0, Number(cue.wait) || 0); continue; }
        runCue(rt, cue);
      }
    }
  }

  return {
    sync,
    // Once a frame: frame = { now, player: { x, z }, eDown, blocked, locate(id) }.
    update(frame) {
      lastFrame = frame;
      tick(frame.now);
      const list = order;
      for (let i = 0; i < list.length; i++) {
        const watcher = list[i].dead ? null : list[i].watcher;
        if (watcher) watcher.update(frame);
      }
    },
    // The player pressed E. 'consume': a pledge deed used the key and the game
    // must not see it. 'pass': a pledge step heard it, and the game should
    // still open its dialogue (the last step was speaking with the giver).
    // null: not a pledge matter.
    interact(frame) {
      lastFrame = frame;
      if (frame.blocked) return null;
      let used = false;
      let pass = false;
      const list = order;
      for (let i = 0; i < list.length; i++) {
        const rt = list[i];
        const watcher = rt.dead ? null : rt.watcher;
        if (!watcher) continue;
        const result = watcher.interact(frame);
        if (!result) continue;
        used = true;
        // report() has already reached the store and sync() has run again.
        if (result.person && result.person === rt.pledge.npcId && rt.stepIndex < 0) pass = true;
      }
      if (used) return pass ? 'pass' : 'consume';
      // A giver who is in the middle of a scene for a sworn pledge, or is
      // holding out its choice, is not free to talk: the game's own box
      // ("Keep going") must not open over the scene or the choice.
      for (let i = 0; i < list.length; i++) {
        const rt = list[i];
        if (rt.dead || rt.stepIndex < 0 || !rt.pledge.npcId) continue;
        const busy = rt.pledge.pledge.steps[rt.stepIndex].kind === 'choose' || (!rt.watcher && rt.queue.length > 0);
        if (!busy) continue;
        const at = frame.locate?.(rt.pledge.npcId);
        if (at && Math.hypot(at.x - frame.player.x, at.z - frame.player.z) <= TALK_RANGE) return 'consume';
      }
      return null;
    },
    // What to show: { prompt: { key, hold, label, progress } | null, choice | null }.
    view(frame, out = { prompt: null, choice: null }) {
      out.prompt = null;
      out.choice = null;
      if (frame.blocked) return out;
      const list = order;
      for (let i = 0; i < list.length; i++) {
        const watcher = list[i].dead ? null : list[i].watcher;
        if (watcher) watcher.view(frame, out);
      }
      if (out.choice) out.prompt = null;
      return out;
    },
    choose(pledgeId, choiceId) {
      return runtimes.get(pledgeId)?.watcher?.choose?.(choiceId) === true;
    },
    dismissChoice(pledgeId, now) { runtimes.get(pledgeId)?.watcher?.dismiss?.(now); },
    // Where the trail on the ground should lead for this pledge, in world metres.
    navTarget(pledgeId, player = { x: 0, z: 0 }) {
      const rt = runtimes.get(pledgeId);
      if (!rt) return null;
      if (rt.watcher) return rt.watcher.target(player);
      if (rt.stepIndex < 0 && rt.pledge.npcId) {
        const at = whereIs(rt.pledge.npcId);
        return at ? { x: at.x, z: at.z, label: personName(rt.pledge.npcId) } : null;
      }
      return null;
    },
    // For tests and the debug hook: where each sworn pledge stands.
    status() {
      return order.map(rt => ({
        pledgeId: rt.pledge.id,
        stepId: rt.stepIndex < 0 ? null : rt.pledge.pledge.steps[rt.stepIndex].id,
        watching: !!rt.watcher,
        queued: rt.queue.length,
      }));
    },
    // Leaving the scene: stop watching, keep the world as the next scene will rebuild it.
    dispose() {
      for (const rt of order) { rt.dead = true; dropWatcher(rt); }
      runtimes.clear();
      order = [];
      lastFrame = null;
    },
  };
}
