// The pledge-world subsystem itself, driven through a fake window (events and
// keys), the real Three Roads bus and a small quest store built from the
// engine's pure functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRegisteredPledges } from '../src/components/game3d/pledges/pledgeRegistry.mjs';
import {
  pledgeStateOnAccept, pledgeStateOnComplete, pledgeStateOnEvent,
} from '../src/components/game3d/pledges/pledgeState.mjs';
import { createThreeRoadsBus } from '../src/components/game3d/threeroads/ThreeRoadsWorld.mjs';
import { threeRoadsPledge, threeRoadsPledges } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import { pledgePointWorld, resetPledgeStepMemory } from '../src/components/game3d/threeroads/pledgeworld/pledgeInterpreter.mjs';
import { getPledgeNavigationTarget } from '../src/components/game3d/threeroads/pledgeworld/pledgeNavigation.mjs';
import { createPledgeWorldSubsystem } from '../src/components/game3d/threeroads/pledgeworld/pledgeWorldSubsystem.mjs';
import { emptyQuestState, LYRA_SPOT } from './game3d-three-roads-pledge-harness.mjs';

const M01 = 'tr_m01_sworn_at_the_gate';

function makeWindow() {
  const listeners = new Map();
  const sent = [];
  const win = {
    sent,
    location: { search: '?threeRoads=1' },
    localStorage: { getItem: () => null },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== fn)); },
    dispatchEvent(event) {
      sent.push({ type: event.type, detail: event.detail });
      for (const fn of [...(listeners.get(event.type) || [])]) fn(event);
      return true;
    },
    listenerCount: type => (listeners.get(type) || []).length,
  };
  return win;
}

// The quest store, as far as a pledge needs it: it hears the window event the
// real store hears and tells its subscribers.
function makeStore(win, state = emptyQuestState()) {
  let current = state;
  const subscribers = new Set();
  const tell = () => { for (const fn of [...subscribers]) fn(current); };
  win.addEventListener('axePledgeEvent', event => {
    let changed = false;
    for (const pledge of threeRoadsPledges()) {
      if (!current.acceptedIds.includes(pledge.id)) continue;
      const staged = pledgeStateOnEvent(current, pledge, event.detail);
      if (staged.changed) { current = { ...current, ...staged.patch }; changed = true; }
    }
    if (changed) tell();
  });
  return {
    get state() { return current; },
    bindings: {
      quests: [],
      getQuestState: () => current,
      subscribeQuests(fn) { subscribers.add(fn); fn(current); return () => subscribers.delete(fn); },
      setQuestStoryFlag(flag, value = true) { current = { ...current, storyFlags: { ...current.storyFlags, [flag]: !!value } }; tell(); return true; },
      getFactionId: () => 'AXE_Faction_3',
    },
    accept(pledgeId) {
      const pledge = threeRoadsPledge(pledgeId);
      current = { ...current, acceptedIds: [...current.acceptedIds, pledgeId], lastAcceptedId: pledgeId };
      current = { ...current, ...pledgeStateOnAccept(current, pledge) };
      tell();
    },
    complete(pledgeId) {
      const pledge = threeRoadsPledge(pledgeId);
      current = {
        ...current,
        acceptedIds: current.acceptedIds.filter(id => id !== pledgeId),
        completedIds: [...current.completedIds, pledgeId],
        completionCounts: { ...current.completionCounts, [pledgeId]: Number(current.completionCounts[pledgeId] || 0) + 1 },
      };
      current = { ...current, ...pledgeStateOnComplete(current, pledge) };
      tell();
    },
  };
}

function setup({ state, worldArea = 'town', region = 'wolfveil' } = {}) {
  clearRegisteredPledges();
  resetPledgeStepMemory();
  const win = makeWindow();
  const store = makeStore(win, state);
  const bus = createThreeRoadsBus();
  const heard = [];
  for (const type of ['cast:spawn', 'cast:follow', 'cast:say', 'cast:moveTo', 'cast:despawn', 'enemies:spawnGroup',
    'enemies:despawnGroup', 'pledge:stepStarted', 'pledge:stepDone'])
    bus.on(type, detail => heard.push({ type, ...detail }));
  let now = 0;
  const player = { x: 0, y: 0, z: 0 };
  const questNPCs = [{ id: 'archer_lyra', name: 'Lyra the Seeker', group: { position: { ...LYRA_SPOT, y: 0 } } }];
  const subsystem = createPledgeWorldSubsystem(
    { region, worldArea, areaScenes: true, bus, questNPCs },
    { win, bindings: store.bindings, clock: () => now, warn: () => {} });
  const run = (seconds, tick = 0.1) => {
    for (let i = 0; i < Math.round(seconds / tick); i++) { now += tick; subsystem.update(tick, player); }
  };
  const at = target => {
    const point = typeof target === 'string' ? pledgePointWorld(target) : target;
    player.x = point.x; player.z = point.z;
    run(0.1);
  };
  const key = (type, extra = {}) => {
    const event = {
      type, key: 'e', code: 'KeyE', repeat: false, target: null, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra,
    };
    win.dispatchEvent(event);
    return event;
  };
  const kill = (groupId, placeId, times) => {
    for (let i = 0; i < times; i++)
      win.dispatchEvent(new globalThis.CustomEvent('axePledgeEvent', { detail: { type: 'enemy_killed', targetId: groupId, placeId, kind: 'ink_shade', count: 1 } }));
    run(0.1);
  };
  return { win, store, bus, heard, subsystem, player, run, at, key, kill, of: type => heard.filter(entry => entry.type === type) };
}

test('Sworn at the Gate through the subsystem: keys, captions, the bus, the claim', () => {
  const t = setup();
  assert.equal(t.store.bindings.quests.length, 4, 'the pledges are in the game\'s quest list');
  t.run(0.2);
  assert.deepEqual(t.subsystem.status(), [], 'nothing sworn, nothing watched');
  assert.equal(t.key('keydown').stopped, false, 'E is the game\'s when no pledge wants it');
  t.key('keyup');

  t.store.accept(M01);
  t.run(0.2);
  assert.deepEqual(t.subsystem.status(), [{ pledgeId: M01, stepId: 'oath', watching: true, queued: 0 }]);
  assert.deepEqual(getPledgeNavigationTarget(threeRoadsPledge(M01), t.player),
    { ...pledgePointWorld('oath_tree'), label: 'Tie your ribbon to the Oath Tree.' });

  // The oath: E held at the tree is the pledge's, not the game's.
  t.at('oath_tree');
  assert.deepEqual(t.subsystem.view().prompt, { key: 'E', hold: true, label: 'Tie your ribbon', progress: 0 });
  const down = t.key('keydown');
  assert.equal(down.stopped && down.prevented, true);
  assert.equal(t.key('keydown', { repeat: true }).stopped, true, 'nor are its repeats');
  t.run(1);
  assert.ok(t.subsystem.view().prompt.progress > 0.4);
  t.run(1.2);
  t.key('keyup');
  assert.equal(t.store.state.objectiveProgress[M01].oath, 1);
  assert.equal(t.win.sent.filter(e => e.type === 'axePledgeEvent').length, 1);

  // Nobody has been announced by the cast, so every line is a caption; the
  // bell has no sound file yet and is shown as a stage direction.
  t.run(12);
  assert.deepEqual(t.subsystem.lines(), [
    { lineId: 'lyra_m01_04', mode: 'caption' }, { lineId: null, mode: 'caption' }, { lineId: 'lyra_m01_05', mode: 'caption' },
  ]);
  assert.deepEqual(t.win.sent.filter(e => e.type === 'threeRoadsSound').map(e => e.detail), [{ name: 'gate_bell' }]);
  assert.deepEqual(t.of('cast:spawn').map(e => e.id), ['traveller_tome', 'traveller_henut', 'traveller_livilla']);
  assert.equal(t.of('enemies:spawnGroup')[0].placeId, 'P04');

  t.at('gate_arch');
  t.kill('tr_m01_gate_shades', 'P04', 6);
  assert.equal(t.subsystem.status()[0].stepId, 'free');

  // A cast that answers: the travellers are placed and announced, so their lines go over their heads.
  const where = new Map([
    ['traveller_tome', pledgePointWorld('yard_wagon_akitsu')],
    ['traveller_henut', pledgePointWorld('yard_wagon_tameri')],
    ['traveller_livilla', pledgePointWorld('yard_wagon_remoria')],
  ]);
  let following = false;
  t.bus.on('cast:locate', q => {
    const spot = following ? { x: t.player.x + 3, z: t.player.z } : where.get(q.id);
    if (spot && where.has(q.id)) { q.x = spot.x; q.z = spot.z; q.found = true; }
  });
  t.bus.on('cast:follow', detail => { following = detail.target === 'player'; });
  for (const id of where.keys()) t.bus.emit('cast:ready', { id });
  for (const wagon of ['yard_wagon_akitsu', 'yard_wagon_tameri', 'yard_wagon_remoria']) {
    t.at(wagon);
    assert.equal(t.key('keydown').stopped, true);
    t.run(2.2);
    t.key('keyup');
  }
  t.run(25);
  // Once a cast has shown itself, every line goes to it, the warden's two
  // still waiting in the queue included; the cast decides over-head or subtitle.
  assert.deepEqual(t.of('cast:say').map(e => [e.id, e.lineId]), [
    ['watch_warden_south', 'warden_m01_01'], ['watch_warden_south', 'warden_m01_02'],
    ['traveller_tome', 'tome_m01_01'], ['traveller_henut', 'henut_m01_01'], ['traveller_livilla', 'livilla_m01_01'],
  ]);
  assert.ok(t.of('cast:say').every(e => e.seconds > 2 && typeof e.text === 'string'));
  assert.equal(t.of('cast:follow').length, 3);
  assert.equal(t.subsystem.status()[0].stepId, 'walk');

  t.at('oath_tree');
  t.run(0.3);
  assert.equal(t.subsystem.status()[0].stepId, 'lyra');

  // Lyra is in the game's own list. The step hears the press and the key is
  // left to the game, which opens its dialogue for the ending.
  t.at(LYRA_SPOT);
  const press = t.key('keydown');
  assert.equal(press.stopped, false, 'the game must see this E');
  t.key('keyup');
  assert.equal(t.store.state.objectiveProgress[M01].lyra, 1);
  t.run(0.3);
  assert.equal(t.store.state.storyFlags.tr_keepsake_remoria, true, 'a player of Tameri is given the pebble from Remoria');
  assert.deepEqual(getPledgeNavigationTarget(threeRoadsPledge(M01), t.player), { ...LYRA_SPOT, label: 'Lyra the Seeker' });

  // The game's dialogue completes the pledge; the claim is sent, nothing else.
  assert.deepEqual(t.subsystem.claims(), []);
  t.store.complete(M01);
  const claims = t.subsystem.claims();
  assert.equal(claims.length, 1);
  assert.equal(claims[0].kind, 'pledge_completion_claim');
  assert.equal(claims[0].pledgeId, M01);
  assert.equal(claims[0].ready, true);
  assert.equal(claims[0].outcome, 'kept');
  assert.equal(claims[0].steps.every(step => step.done), true);
  assert.deepEqual(t.win.sent.filter(e => e.type === 'threeRoadsPledgeClaim').map(e => e.detail.pledgeId), [M01]);
  assert.equal('reward' in claims[0], false);

  // Everything went to the pledges alone: the older quests hear nothing of it.
  assert.equal(t.win.sent.filter(e => e.type === 'axeQuestEvent').length, 0);
  assert.ok(t.win.sent.filter(e => e.type === 'axePledgeEvent').length >= 12);

  t.subsystem.dispose();
  assert.equal(t.win.listenerCount('keydown'), 0);
  assert.equal(getPledgeNavigationTarget(threeRoadsPledge(M01), t.player), null);
  assert.equal(t.store.bindings.quests.length, 4, 'still registered for the next scene');
});

test('a choice is a dialogue: the game stops reading keys, a number answers, Esc puts it aside', () => {
  const state = emptyQuestState();
  const pledge = threeRoadsPledge('tr_v16_three_fields');
  state.acceptedIds = [pledge.id];
  state.completedIds = [M01, 'tr_m02_three_arrows'];
  state.objectiveProgress = { [pledge.id]: { cedar: 2, salt: 1, coins: 1, bring: 1, guard: 1, last: 0 } };
  const t = setup({ state, worldArea: 'south' });
  t.at('graves_dalla');
  t.run(0.3);
  assert.equal(t.subsystem.view().choice.prompt, 'Dalla holds out the spade.');
  assert.equal(t.win.__axeDialogueOpen, true);
  assert.equal(t.win.sent.some(e => e.type === 'axeDialogueOpened'), true);
  const esc = t.key('keydown', { key: 'Escape', code: 'Escape' });
  assert.equal(esc.stopped, true);
  t.run(0.2);
  assert.equal(t.subsystem.view().choice, null);
  assert.equal(t.win.__axeDialogueOpen, false, 'put aside: the keys are the game\'s again');
  t.run(10.5);
  assert.ok(t.subsystem.view().choice, 'with nobody to stand beside it comes back by itself');
  assert.equal(t.key('keydown', { key: '9', code: 'Digit9' }).stopped, false, 'there is no ninth answer');
  assert.equal(t.key('keydown', { key: '2', code: 'Digit2' }).stopped, true);
  t.run(0.2);
  assert.equal(t.store.state.choices[pledge.id + ':last'], 'all');
  assert.equal(t.store.state.storyFlags.tr_v16_all_three, true);
  assert.equal(t.subsystem.view().choice, null);
  assert.equal(t.win.__axeDialogueOpen, false);
  t.subsystem.dispose();
});

test('people and monsters are asked for only in the area that is loaded; a cave watches nothing', () => {
  // The defence of the Three Fields is in the south. Sworn and standing in the town, nothing is spawned there.
  const state = emptyQuestState();
  const pledge = threeRoadsPledge('tr_v16_three_fields');
  state.acceptedIds = [M01];
  state.objectiveProgress = { [M01]: { oath: 1, gate: 0 } };
  const south = setup({ state, worldArea: 'south' });
  south.run(0.3);
  assert.equal(south.of('cast:spawn').length, 0, 'the wagon yard is in the town area');
  assert.equal(south.of('enemies:spawnGroup').length, 0);
  assert.deepEqual(south.of('pledge:stepStarted').map(e => e.stepId), ['gate']);
  south.subsystem.dispose();
  const town = setup({ state, worldArea: 'town' });
  town.run(0.3);
  assert.equal(town.of('cast:spawn').length, 3);
  assert.equal(town.of('enemies:spawnGroup').length, 1);
  town.subsystem.dispose();

  const cave = setup({ state, region: 'lunar-cave', worldArea: null });
  cave.run(0.3);
  assert.equal(cave.store.bindings.quests.length, 4, 'registered, so the tracker still shows the pledge');
  assert.deepEqual(cave.subsystem.status(), []);
  assert.equal(cave.win.listenerCount('keydown'), 0);
  assert.equal(getPledgeNavigationTarget(pledge, { x: 0, z: 0 }), null);
  cave.subsystem.dispose();
});

test('a menu of the game\'s own hides the prompt and gives the key back', () => {
  const t = setup();
  t.store.accept(M01);
  t.at('oath_tree');
  assert.ok(t.subsystem.view().prompt);
  t.win.__axeUiModalOpen = true;
  t.run(0.2);
  assert.equal(t.subsystem.view().prompt, null);
  assert.equal(t.key('keydown').stopped, false);
  t.key('keyup');
  t.win.__axeUiModalOpen = false;
  t.run(0.2);
  assert.ok(t.subsystem.view().prompt);
  t.subsystem.dispose();
});
