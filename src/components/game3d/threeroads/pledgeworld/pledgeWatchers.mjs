// What finishes a pledge step, as small state machines. Pure: no Three.js, no
// DOM, no store. Each watcher is fed a frame
//   { now, player: { x, z }, eDown, blocked, down, locate(id) }
// (`down`: the player has just died or is riding; it drops what they carry)
// (seconds, world metres; locate gives a person's live position or null) and
// talks to the world through the functions it was made with:
//   world.report(detail)  one engine event, as PLEDGE_STEP_KINDS expects it
//   world.say(lineId)     speak a line of the script
//   world.bus(type, d)    a Three Roads bus event
//   world.notice(kind)    tell the player a step has to be started again
// The watch vocabulary is the one at the top of script/band1.mjs.
import { PLEDGE_STEP_KINDS } from '../../pledges/pledgeModel.mjs';

export const TALK_RANGE = 3.5;            // the game's own NPC_INTERACT_RANGE
export const CHOICE_RANGE = 6;
export const DEFAULT_HOLD_SECONDS = 1.5;
export const ESCORT_LOST_METRES = 60;
export const ESCORT_LOST_SECONDS = 10;
// A follower stops some metres behind the player, so "everyone has arrived"
// allows them that much beyond the radius the player has to be inside.
export const ESCORT_FOLLOWER_SLACK = 6;
export const DEFEND_AWAY_SECONDS = 8;
export const CHOICE_REOPEN_SECONDS = 10;
const TELEPORT_METRES = 30;

export const asList = value => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const within = (a, b, radius) => !!a && !!b && distance(a, b) <= radius;

// The one event that advances this step.
export function stepEvent(pledge, index, extra = null) {
  const objective = pledge.objectives[index];
  const row = PLEDGE_STEP_KINDS[objective.stepKind];
  const detail = { type: row.eventType, pledgeId: pledge.id, count: 1 };
  if (objective[row.idField] !== undefined) detail[row.idField] = objective[row.idField];
  if (objective.placeId !== undefined) detail.placeId = objective.placeId;
  return extra ? Object.assign(detail, extra) : detail;
}

// The event that sends this step back to zero, if the step listens for it.
export function stepFailEvent(pledge, index, type) {
  const objective = pledge.objectives[index];
  if (!objective.failsOn.includes(type)) return null;
  return { type, pledgeId: pledge.id, targetId: objective.targetId ?? objective.itemId };
}

// What a spawn cue or a wave becomes on the bus. Points are named in the
// script; `point` turns a name into world metres.
export function groupDetail(group, point) {
  const at = point(group.at) || { x: 0, z: 0 };
  const detail = {
    groupId: group.groupId, kind: group.kind, count: group.count,
    x: at.x, z: at.z, radius: group.radius ?? 6, level: 'player', tier: group.tier || 'normal',
  };
  if (group.placeId !== undefined) detail.placeId = group.placeId;
  if (group.passive !== undefined) detail.passive = group.passive;
  return detail;
}

// Lines spoken on the way: one each time another `every` metres are covered.
function alongLines(spec) {
  const every = Number(spec.along?.every) || 0;
  const lines = asList(spec.along?.lines);
  const memory = spec.memory;
  let last = null;
  let covered = 0;
  return {
    update(frame) {
      if (!every || memory.alongSpoken >= lines.length) return;
      if (last) {
        const step = Math.hypot(frame.player.x - last.x, frame.player.z - last.z);
        if (step < TELEPORT_METRES) covered += step;
        last.x = frame.player.x; last.z = frame.player.z;
      } else last = { x: frame.player.x, z: frame.player.z };
      if (covered >= every) {
        covered -= every;
        spec.world.say(lines[memory.alongSpoken++]);
      }
    },
    reset() { covered = 0; last = null; },
  };
}

function talkWatcher(spec) {
  const people = asList(spec.watch.anyOf || spec.watch.npc);
  const distinct = spec.watch.distinct === true;
  const done = spec.memory.done;
  let progress = spec.progress;
  let own = false;
  const nearest = (frame, range = TALK_RANGE) => {
    let best = null;
    let bestDistance = range;
    for (const id of people) {
      if (distinct && done.has(id)) continue;
      const at = frame.locate(id);
      if (!at) continue;
      const d = distance(at, frame.player);
      if (d <= bestDistance) { bestDistance = d; best = id; own = at.own === true; }
    }
    return best;
  };
  return {
    update() {},
    setProgress(count) { progress = count; },
    interact(frame) {
      if (progress >= spec.step.count) return null;
      const id = nearest(frame);
      if (!id) return null;
      if (distinct) done.add(id);
      progress++;
      for (const lineId of asList(spec.watch.sayAt?.[id])) spec.world.say(lineId);
      spec.world.report(stepEvent(spec.pledge, spec.index));
      return { person: id };
    },
    view(frame, out) {
      if (out.prompt || progress >= spec.step.count) return;
      const id = nearest(frame);
      // The game shows its own "Speak with" prompt for the givers in its list.
      if (!id || own) return;
      out.prompt = { key: 'E', hold: false, label: 'Speak with ' + spec.personName(id), progress: -1 };
    },
    target(player) {
      let best = null;
      let bestDistance = Infinity;
      for (const id of people) {
        if (distinct && done.has(id)) continue;
        const at = spec.whereIs(id);
        if (!at) continue;
        const d = distance(at, player);
        if (d < bestDistance) { bestDistance = d; best = { x: at.x, z: at.z, label: spec.personName(id) }; }
      }
      return best;
    },
    dispose() {},
  };
}

function goToWatcher(spec) {
  const radius = spec.watch.radius ?? 5;
  if (!spec.watch.trail) {
    const at = spec.point(spec.watch.point);
    let sent = false;
    return {
      update(frame) {
        if (sent || !within(frame.player, at, radius)) return;
        sent = true;
        spec.world.report(stepEvent(spec.pledge, spec.index));
      },
      setProgress(count) { if (!count) sent = false; },
      interact() { return null; },
      view() {},
      target() { return at ? { x: at.x, z: at.z, label: spec.step.text } : null; },
      dispose() {},
    };
  }
  const trail = spec.watch.trail.map(spec.point);
  const legSeconds = Number(spec.watch.legSeconds) || 0;
  const along = alongLines(spec);
  let index = Math.min(spec.progress, trail.length);
  let legStart = null;
  // After the trail is lost, the way back to its first waypoint is not timed.
  let timed = true;
  return {
    update(frame) {
      if (legStart === null) legStart = frame.now;
      along.update(frame);
      if (index >= trail.length) return;
      if (within(frame.player, trail[index], radius)) {
        index++;
        legStart = frame.now;
        timed = true;
        spec.world.report(stepEvent(spec.pledge, spec.index));
        return;
      }
      if (timed && legSeconds && frame.now - legStart > legSeconds) {
        index = 0;
        timed = false;
        legStart = frame.now;
        along.reset();
        spec.world.notice('trail_lost');
        const fail = stepFailEvent(spec.pledge, spec.index, 'trail_lost');
        if (fail) spec.world.report(fail);
      }
    },
    setProgress(count) { index = Math.min(count, trail.length); },
    interact() { return null; },
    view() {},
    target() {
      const at = trail[Math.min(index, trail.length - 1)];
      return at ? { x: at.x, z: at.z, label: spec.step.text } : null;
    },
    legIndex: () => index,
    dispose() {},
  };
}

// `use` (hold E for the step's seconds) and `pick_up` (one press).
function deedWatcher(spec, hold) {
  const names = asList(spec.watch.points || spec.watch.point);
  const points = names.map(spec.point);
  const distinct = spec.watch.distinct === true;
  const radius = spec.watch.radius ?? 3;
  const seconds = hold ? (spec.step.seconds ?? DEFAULT_HOLD_SECONDS) : 0;
  const done = spec.memory.done;
  const label = spec.watch.prompt || spec.step.text;
  let progress = spec.progress;
  let holding = -1;
  let holdStart = 0;
  const nearest = player => {
    let best = -1;
    let bestDistance = radius;
    for (let i = 0; i < points.length; i++) {
      if (!points[i] || (distinct && done.has(names[i]))) continue;
      const d = distance(points[i], player);
      if (d <= bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  };
  const complete = i => {
    const before = progress;
    if (distinct) done.add(names[i]);
    progress++;
    for (const lineId of asList(spec.watch.sayAt?.[names[i]])) spec.world.say(lineId);
    const each = asList(spec.watch.sayEach)[before];
    if (each) spec.world.say(each);
    spec.world.report(stepEvent(spec.pledge, spec.index));
  };
  return {
    update(frame) {
      if (holding < 0) return;
      // Letting go, walking off or a menu opening cancels the deed.
      if (!frame.eDown || frame.blocked || !within(frame.player, points[holding], radius + 0.5)) { holding = -1; return; }
      if (frame.now - holdStart >= seconds) {
        const i = holding;
        holding = -1;
        complete(i);
      }
    },
    setProgress(count) { progress = count; },
    interact(frame) {
      if (progress >= spec.step.count) return null;
      const i = nearest(frame.player);
      if (i < 0) return null;
      if (!hold) { complete(i); return { point: names[i] }; }
      holding = i;
      holdStart = frame.now;
      return { point: names[i] };
    },
    view(frame, out) {
      if (out.prompt || progress >= spec.step.count) return;
      const i = holding >= 0 ? holding : nearest(frame.player);
      if (i < 0) return;
      out.prompt = {
        key: 'E', hold, label,
        progress: holding >= 0 ? Math.min(1, (frame.now - holdStart) / seconds) : (hold ? 0 : -1),
      };
    },
    target(player) {
      let best = null;
      let bestDistance = Infinity;
      for (let i = 0; i < points.length; i++) {
        if (!points[i] || (distinct && done.has(names[i]))) continue;
        const d = distance(points[i], player);
        if (d < bestDistance) { bestDistance = d; best = points[i]; }
      }
      return best ? { x: best.x, z: best.z, label: spec.step.text } : null;
    },
    dispose() {},
  };
}

function escortWatcher(spec) {
  const people = asList(spec.watch.people);
  const to = spec.point(spec.watch.to);
  const radius = spec.watch.radius ?? 8;
  const along = alongLines(spec);
  let lostSince = null;
  let sent = false;
  return {
    update(frame) {
      along.update(frame);
      if (sent) return;
      let arrived = within(frame.player, to, radius);
      let lost = false;
      for (const id of people) {
        // A follower nobody can place is taken to be at the player's side.
        const at = frame.locate(id);
        if (!at) continue;
        if (!within(at, to, radius + ESCORT_FOLLOWER_SLACK)) arrived = false;
        if (distance(at, frame.player) > ESCORT_LOST_METRES) lost = true;
      }
      if (arrived) {
        sent = true;
        spec.world.report(stepEvent(spec.pledge, spec.index));
        return;
      }
      if (!lost) { lostSince = null; return; }
      if (lostSince === null) { lostSince = frame.now; return; }
      if (frame.now - lostSince >= ESCORT_LOST_SECONDS) {
        lostSince = null;
        along.reset();
        spec.world.notice('escort_failed');
        const fail = stepFailEvent(spec.pledge, spec.index, 'escort_failed');
        if (fail) spec.world.report(fail);
      }
    },
    setProgress(count) { if (!count) sent = false; },
    interact() { return null; },
    view() {},
    target() { return to ? { x: to.x, z: to.z, label: spec.step.text } : null; },
    dispose() {},
  };
}

function defendWatcher(spec) {
  const centre = spec.point(spec.watch.point);
  const radius = spec.watch.radius ?? 15;
  const seconds = spec.step.seconds ?? 30;
  const waves = [...asList(spec.watch.waves)].sort((a, b) => a.at - b.at);
  let started = null;
  let awaySince = null;
  let nextWave = 0;
  let sent = false;
  const clearWaves = () => {
    for (let i = 0; i < nextWave; i++) spec.world.bus('enemies:despawnGroup', { groupId: waves[i].group.groupId });
    nextWave = 0;
  };
  return {
    update(frame) {
      if (sent) return;
      const inside = within(frame.player, centre, radius);
      if (started === null) {
        if (!inside) return;
        started = frame.now;
        awaySince = null;
        nextWave = 0;
      }
      const elapsed = frame.now - started;
      while (nextWave < waves.length && elapsed >= waves[nextWave].at) {
        spec.world.bus('enemies:spawnGroup', groupDetail(waves[nextWave].group, spec.point));
        nextWave++;
      }
      if (inside) awaySince = null;
      else if (awaySince === null) awaySince = frame.now;
      else if (frame.now - awaySince > DEFEND_AWAY_SECONDS) {
        clearWaves();
        started = null;
        awaySince = null;
        spec.world.notice('defend_failed');
        const fail = stepFailEvent(spec.pledge, spec.index, 'defend_failed');
        if (fail) spec.world.report(fail);
        return;
      }
      if (elapsed >= seconds) {
        sent = true;
        spec.world.report(stepEvent(spec.pledge, spec.index));
      }
    },
    setProgress(count) { if (!count) sent = false; },
    interact() { return null; },
    view(frame, out) {
      if (out.prompt || sent || started === null) return;
      out.prompt = { key: null, hold: false, label: spec.step.text, progress: Math.min(1, (frame.now - started) / seconds) };
    },
    target() { return centre ? { x: centre.x, z: centre.z, label: spec.step.text } : null; },
    // Leaving the scene or abandoning the pledge takes the waves with it.
    dispose() { if (!sent) clearWaves(); },
  };
}

// `carry`: E at `from` takes the thing up; walking it to `to` is one report.
// Dying or mounting while carrying drops it (frame.down) and sends
// 'carry_dropped', which takes the step back to zero when it lists it. The
// lines spoken on the way (`along`) run only while something is carried.
function carryWatcher(spec) {
  const from = spec.point(spec.watch.from);
  const to = spec.point(spec.watch.to);
  const radius = spec.watch.radius ?? 4;
  const label = spec.watch.prompt || spec.step.text;
  const along = alongLines(spec);
  let progress = spec.progress;
  let carrying = false;
  return {
    update(frame) {
      if (!carrying) return;
      if (frame.down) {
        carrying = false;
        along.reset();
        spec.world.notice('carry_dropped');
        const fail = stepFailEvent(spec.pledge, spec.index, 'carry_dropped');
        if (fail) spec.world.report(fail);
        return;
      }
      along.update(frame);
      if (!within(frame.player, to, radius)) return;
      carrying = false;
      along.reset();
      const each = asList(spec.watch.sayEach)[progress];
      progress++;
      if (each) spec.world.say(each);
      spec.world.report(stepEvent(spec.pledge, spec.index));
    },
    setProgress(count) { progress = count; if (!count) carrying = false; },
    interact(frame) {
      if (carrying || frame.down || progress >= spec.step.count || !within(frame.player, from, radius)) return null;
      carrying = true;
      return { point: spec.watch.from };
    },
    view(frame, out) {
      if (out.prompt || progress >= spec.step.count) return;
      if (carrying) { out.prompt = { key: null, hold: false, label: spec.step.text, progress: -1 }; return; }
      if (within(frame.player, from, radius) && !frame.down) out.prompt = { key: 'E', hold: false, label, progress: -1 };
    },
    target() {
      const at = carrying ? to : from;
      return at ? { x: at.x, z: at.z, label: spec.step.text } : null;
    },
    carrying: () => carrying,
    dispose() {},
  };
}

function defeatWatcher(spec) {
  const at = spec.groupPoint(spec.watch.groupId);
  return {
    update() {}, setProgress() {}, interact() { return null; }, view() {},
    target() { return at ? { x: at.x, z: at.z, label: spec.step.text } : null; },
    dispose() {},
  };
}

function chooseWatcher(spec) {
  const choice = spec.pledge.pledge.choices[spec.step.id];
  // Held out by whoever the player has just been speaking with (spec.holder),
  // or by the one who asked for the pledge.
  const giver = spec.holder || spec.pledge.npcId;
  const shown = Object.freeze({
    pledgeId: spec.pledge.id, stepId: spec.step.id,
    prompt: choice?.prompt || spec.step.text,
    options: Object.freeze((choice?.options || []).map(option => Object.freeze({ id: option.id, text: option.text }))),
  });
  let sent = false;
  let dismissed = false;
  let dismissedAt = 0;
  let wentAway = false;
  // true / false when the giver can be placed, null when nobody knows where they are.
  const near = frame => {
    const at = giver ? frame.locate(giver) : null;
    return at ? distance(at, frame.player) <= CHOICE_RANGE : null;
  };
  return {
    update(frame) {
      if (!dismissed) return;
      const isNear = near(frame);
      if (isNear === null) { if (frame.now - dismissedAt >= CHOICE_REOPEN_SECONDS) dismissed = false; }
      else if (!isNear) wentAway = true;
      else if (wentAway) dismissed = false;
    },
    setProgress(count) { if (!count) sent = false; },
    // E beside the giver brings a choice that was put aside back up.
    interact(frame) {
      if (sent || !dismissed || near(frame) === false) return null;
      dismissed = false;
      return {};
    },
    view(frame, out) {
      if (sent || dismissed || near(frame) === false) return;
      out.choice = shown;
    },
    choose(choiceId) {
      if (sent || !shown.options.some(option => option.id === choiceId)) return false;
      sent = true;
      spec.world.report(stepEvent(spec.pledge, spec.index, { choiceId }));
      return true;
    },
    dismiss(now) { dismissed = true; dismissedAt = now; wentAway = false; },
    target() {
      const at = giver ? spec.whereIs(giver) : null;
      return at ? { x: at.x, z: at.z, label: spec.step.text } : null;
    },
    dispose() {},
  };
}

// spec: { pledge, index, step, watch, along, progress, memory: { done:Set, alongSpoken },
//         world, point(name), personName(id), whereIs(id), groupPoint(groupId) }
export function createStepWatcher(spec) {
  switch (spec.step.kind) {
    case 'talk':
    case 'deliver': return talkWatcher(spec);
    case 'go_to': return goToWatcher(spec);
    case 'use': return deedWatcher(spec, true);
    case 'pick_up': return deedWatcher(spec, false);
    case 'escort': return escortWatcher(spec);
    case 'carry': return carryWatcher(spec);
    case 'defend': return defendWatcher(spec);
    case 'choose': return chooseWatcher(spec);
    case 'defeat': return defeatWatcher(spec);
    default: return null; // a kind the opening does not use
  }
}
