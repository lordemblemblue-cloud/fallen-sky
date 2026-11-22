// Pledge world: makes the pledges of the opening playable. It registers them
// with the game, watches the steps of the pledges the player has sworn, runs
// the staging the script gives each step, and reports what happened in the
// world to the quest store. See docs/game3d/three-empires/BUILD_RULES.md.
//
// The thinking is in pure modules beside this file (pledgeInterpreter.mjs,
// pledgeWatchers.mjs, pledgeSpeech.mjs); this one is the glue to the scene:
// the bus, the E key, the quest store, the overlays.
//
// Nothing here grants anything. A finished pledge becomes a completion claim
// (pledges/pledgeClaim.mjs) sent as the window event 'threeRoadsPledgeClaim'.
//
// BUS, beyond BUILD_RULES version 1 (optional; a cast that does not answer is
// worked around):
//   cast:locate → cast   { id, x: null, z: null, found: false }
//       Asked whenever a step needs to know where a person is who is not in
//       the game's quest-giver list. The cast fills in x, z (world metres) and
//       found = true, synchronously. Unanswered, a follower is taken to be at
//       the player's side and a line is shown as a caption.
//   cast:ready ← cast    (version 1) is also how this subsystem knows a person
//       can show a `cast:say` line. Lines for anyone not announced ready are
//       captions at the bottom of the screen.
import { threeRoadsEnabled } from '../threeRoadsFlag.mjs';
import { localToWorld } from '../coords.mjs';
import { buildPledgeCompletionClaim } from '../../pledges/pledgeClaim.mjs';
import { playPledgeLine, stopPledgeLine } from '../../pledges/voice/pledgeVoice.mjs';
import { wolfveilAreaAtWorld } from '../../wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import { WOLFVEIL_TOWN_QUEST_NPC_SPOTS } from '../../wolfveil/WolfveilImportedTownLayout.mjs';
import { installThreeRoadsPledges, removeThreeRoadsPledges } from './pledgeRegistration.mjs';
import { empireOfFaction, pledgeHome, pledgeLine, threeRoadsPledges } from './pledgeScript.mjs';
import { createPledgeInterpreter } from './pledgeInterpreter.mjs';
import { createSpeechQueue } from './pledgeSpeech.mjs';
import { createPledgeOverlays } from './pledgeOverlays.mjs';
import { setPledgeNavigationProvider } from './pledgeNavigation.mjs';

// Told to the tracker and anything else that lists quests, so it reads the
// quest list again once the pledges are in it.
export const PLEDGES_CHANGED_EVENT = 'threeRoadsPledgesChanged';
export const PLEDGE_CLAIM_EVENT = 'threeRoadsPledgeClaim';
// What the world reports to the quest store; reaches registered pledges only.
export const PLEDGE_EVENT = 'axePledgeEvent';
export const PLEDGE_SOUND_EVENT = 'threeRoadsSound';
const CLAIMS_KEPT = 8;
const LINES_KEPT = 40;
// A speaker further off than this is heard as a caption, not over their head.
const SPEAKER_NEAR_METRES = 30;
const LOCATE_FRESH_SECONDS = 0.1;
const VIEW_EVERY_SECONDS = 0.06;

// Sound files for the script's named sounds, under /game3d/threeroads/sounds/.
// None has been made yet; a sound without a file is shown as a stage
// direction ("[sound: gate bell]") so the scene still reads.
export const PLEDGE_WORLD_SOUND_FILES = Object.freeze({});

// Told to the player when a step has to be started again. Plain system text,
// not story: the lead may replace it with lines of the script.
export const PLEDGE_WORLD_NOTICES = Object.freeze({
  trail_lost: 'The trail has gone cold. Pick it up again where it began.',
  escort_failed: 'You have left them behind. Go back for them.',
  defend_failed: 'You left the ground. Go back and hold it again.',
});

const loadGameBindings = () => import('./pledgeWorldGameBindings.js')
  .then(module => module.pledgeWorldGameBindings);

const isTyping = target => !!target?.closest?.('input,textarea,select,[contenteditable="true"]');

export function createPledgeWorldSubsystem(ctx = {}, {
  win = globalThis.window,
  bindings = null,
  loadBindings = loadGameBindings,
  clock = () => globalThis.performance.now() / 1000,
  warn = (...args) => globalThis.console?.warn(...args),
} = {}) {
  // A second lock on the switch: GameWorld3D only creates the world when it is
  // on, and nothing is registered from anywhere else.
  if (!win || !threeRoadsEnabled(win)) return null;

  const bus = ctx.bus || null;
  const pledges = threeRoadsPledges();
  // The points of the opening are Wolfveil's; in a cave or a dungeon the
  // pledges stay registered and tracked but nothing is watched.
  const inValley = ctx.region === 'wolfveil';
  const offs = [];
  let disposed = false;
  let game = null;
  let interpreter = null;
  let lastState = null;
  let ownModal = false;
  let keyHeld = false;
  let touchHeld = false;
  let lastViewAt = -1;
  let completions = null;         // pledge id -> times completed, the last time we looked
  const claims = [];
  const linesShown = [];
  const castReady = new Set();    // people the cast has announced as standing in the scene

  const send = (type, detail) => {
    try { win.dispatchEvent?.(new globalThis.CustomEvent(type, detail === undefined ? undefined : { detail })); }
    catch (error) { warn('Three Roads pledges could not send ' + type, error); }
  };

  // ── Where people are ──
  const located = new Map();      // id -> { x, z, own, found, at }
  const query = { id: null, x: null, z: null, found: false };
  const frame = { now: 0, player: { x: 0, z: 0 }, eDown: false, blocked: false, locate: null };
  function locate(id) {
    let entry = located.get(id);
    if (!entry) { entry = { x: 0, z: 0, own: false, found: false, at: -1 }; located.set(id, entry); }
    if (entry.at >= 0 && frame.now - entry.at < LOCATE_FRESH_SECONDS) return entry.found ? entry : null;
    entry.at = frame.now;
    entry.found = false;
    const givers = ctx.questNPCs;
    if (Array.isArray(givers)) {
      for (let i = 0; i < givers.length; i++) {
        const giver = givers[i];
        if (giver?.id !== id || !giver.group?.position) continue;
        entry.x = giver.group.position.x; entry.z = giver.group.position.z;
        entry.own = true; entry.found = true;
        return entry;
      }
    }
    query.id = id; query.x = null; query.z = null; query.found = false;
    bus?.emit('cast:locate', query);
    if (query.found && Number.isFinite(query.x) && Number.isFinite(query.z)) {
      entry.x = query.x; entry.z = query.z; entry.own = false; entry.found = true;
      return entry;
    }
    return null;
  }
  frame.locate = locate;

  // Where a person normally stands, for the trail when they are not in this scene.
  const homes = new Map();
  function homeOf(id) {
    const spot = WOLFVEIL_TOWN_QUEST_NPC_SPOTS[id];
    if (spot) return spot;
    const home = pledgeHome(id, lastState?.storyFlags || {}, ctx.worldArea || null);
    if (!home) return null;
    const key = id + ':' + home.x + ':' + home.z;
    if (!homes.has(key)) homes.set(key, Object.freeze(localToWorld(home.x, home.z)));
    return homes.get(key);
  }

  // ── What is said and shown ──
  const overlays = inValley ? createPledgeOverlays(win, {
    onChoose: (pledgeId, choiceId) => interpreter?.choose(pledgeId, choiceId),
    onDismissChoice: pledgeId => interpreter?.dismissChoice(pledgeId, clock()),
    onPromptDown: () => { touchHeld = true; pressInteract(); },
    onPromptUp: () => { touchHeld = false; },
  }) : createPledgeOverlays(null);

  const speakerNear = id => {
    if (!castReady.has(id)) return false;
    const at = locate(id);
    return !!at && Math.hypot(at.x - frame.player.x, at.z - frame.player.z) <= SPEAKER_NEAR_METRES;
  };
  const speech = createSpeechQueue({
    isNear: speakerNear,
    present(line, seconds, mode) {
      if (!line) { overlays.setCaption(null); return; }
      linesShown.push({ lineId: line.lineId, mode });
      if (linesShown.length > LINES_KEPT) linesShown.shift();
      if (mode === 'cast') {
        // Over the speaker's head; the cast shows it and plays the voice.
        overlays.setCaption(null);
        bus?.emit('cast:say', { id: line.speaker, lineId: line.lineId, text: line.text, seconds });
        return;
      }
      overlays.setCaption({ name: line.speakerName, text: line.text, stage: !line.speaker });
      if (line.lineId) playPledgeLine(line.lineId, { caption: line.text }).catch(() => {});
    },
  });

  function playSound(name) {
    send(PLEDGE_SOUND_EVENT, { name });
    const file = PLEDGE_WORLD_SOUND_FILES[name];
    if (file && typeof globalThis.Audio === 'function') {
      try { new globalThis.Audio('/game3d/threeroads/sounds/' + file).play()?.catch?.(() => {}); } catch { /* no sound */ }
      return;
    }
    speech.say({ lineId: null, speaker: null, speakerName: '', text: '[sound: ' + String(name).replaceAll('_', ' ') + ']', seconds: 2.2 });
  }

  // With only one area loaded, people and monsters are asked for only where
  // there is ground; the step's cues run again when the player gets there.
  const outsideScene = detail => !!ctx.areaScenes && !!ctx.worldArea &&
    wolfveilAreaAtWorld(detail) !== ctx.worldArea;

  const world = {
    bus(type, detail) {
      if ((type === 'cast:spawn' || type === 'enemies:spawnGroup') && outsideScene(detail)) return;
      if (type === 'cast:despawn') castReady.delete(detail.id);
      bus?.emit(type, detail);
    },
    say: lineId => speech.say(pledgeLine(lineId)),
    sound: playSound,
    setFlag: flag => { game?.setQuestStoryFlag(flag, true); },
    // Pledge business only: on 'axeQuestEvent' the older kill, talk and
    // discovery quests would hear it too (PLEDGE_ENGINE.md, section 5).
    report: detail => send(PLEDGE_EVENT, detail),
    notice: kind => overlays.showNotice(PLEDGE_WORLD_NOTICES[kind] || '', clock()),
    speechBusy: () => speech.busy(),
  };

  // ── The game's own menus ──
  const otherModalOpen = () => (!!win.__axeDialogueOpen && !ownModal) || !!win.__axeUiModalOpen ||
    !!win.__axeServiceModeOpen || !!win.__axePauseMenuOpen || !!win.__axeWorldMapOpen;
  // The choice is a dialogue: the game stops reading keys and frees the cursor.
  function setOwnModal(open) {
    if (open === ownModal) return;
    ownModal = open;
    win.__axeDialogueOpen = open;
    if (open) {
      try { if (win.document?.pointerLockElement) win.document.exitPointerLock?.(); } catch { /* no pointer lock */ }
      send('axeDialogueOpened');
    }
  }

  const view = { prompt: null, choice: null };
  function refreshView() {
    lastViewAt = frame.now;
    interpreter.view(frame, view);
    overlays.setPrompt(view.prompt);
    overlays.setChoice(view.choice);
    setOwnModal(!!view.choice);
  }

  // ── Input ──
  function pressInteract() {
    if (!interpreter) return null;
    frame.now = clock();
    frame.blocked = otherModalOpen();
    frame.eDown = true;
    const result = interpreter.interact(frame);
    if (result) refreshView();
    return result;
  }
  const swallow = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function onKeyDown(event) {
    if (!interpreter || isTyping(event.target)) return;
    const key = String(event.key || '').toLowerCase();
    if (view.choice) {
      const index = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
      if (index >= 0 && index < view.choice.options.length) {
        swallow(event);
        if (!event.repeat) interpreter.choose(view.choice.pledgeId, view.choice.options[index].id);
      } else if (key === 'escape') {
        swallow(event);
        interpreter.dismissChoice(view.choice.pledgeId, clock());
      }
      return;
    }
    if (key !== 'e' && event.code !== 'KeyE') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // While a deed has the key, its repeats are not the game's either.
    if (event.repeat) { if (keyHeld) swallow(event); return; }
    // 'consume': a pledge deed used the key. 'pass': a step heard it and the
    // game's own dialogue should still open (the ending, with the giver).
    if (pressInteract() === 'consume') { keyHeld = true; swallow(event); }
  }
  function onKeyUp(event) {
    if (String(event.key || '').toLowerCase() === 'e' || event.code === 'KeyE') keyHeld = false;
  }
  const onBlur = () => { keyHeld = false; touchHeld = false; };

  // ── The store ──
  function noteCompletions(state) {
    const counts = state.completionCounts || {};
    if (completions) {
      for (const pledge of pledges) {
        const now = Number(counts[pledge.id] || 0);
        if (now <= (completions.get(pledge.id) || 0)) continue;
        // What a server would be sent. No network call, no reward, no standing.
        const claim = buildPledgeCompletionClaim(pledge, state);
        claims.push(claim);
        if (claims.length > CLAIMS_KEPT) claims.shift();
        send(PLEDGE_CLAIM_EVENT, claim);
      }
    } else completions = new Map();
    for (const pledge of pledges) completions.set(pledge.id, Number(counts[pledge.id] || 0));
  }
  function onQuestState(state) {
    if (disposed) return;
    lastState = state;
    noteCompletions(state);
    interpreter?.sync(state);
  }

  const start = found => {
    if (disposed || !found) return;
    game = found;
    installThreeRoadsPledges(game.quests);
    send(PLEDGES_CHANGED_EVENT);
    if (inValley) {
      interpreter = createPledgeInterpreter({
        pledges, world, homeOf,
        getEmpire: () => empireOfFaction(game.getFactionId?.()),
      });
      offs.push(setPledgeNavigationProvider((pledge, player) => interpreter?.navTarget(pledge.id, player) || null));
      win.addEventListener?.('keydown', onKeyDown, true);
      win.addEventListener?.('keyup', onKeyUp, true);
      win.addEventListener?.('blur', onBlur);
      offs.push(() => {
        win.removeEventListener?.('keydown', onKeyDown, true);
        win.removeEventListener?.('keyup', onKeyUp, true);
        win.removeEventListener?.('blur', onBlur);
      });
    }
    // Called at once with the state as it is: that is the scene being entered.
    const stop = game.subscribeQuests(onQuestState);
    if (typeof stop === 'function') offs.push(stop);
  };

  if (bus) {
    offs.push(bus.on('cast:ready', detail => { if (detail?.id) castReady.add(detail.id); }));
  }
  if (bindings) start(bindings);
  else Promise.resolve().then(loadBindings).then(start)
    .catch(error => warn('Three Roads pledges could not reach the quest store', error));

  return {
    update(dt, playerPosition) {
      if (disposed || !interpreter) return;
      frame.now = clock();
      if (playerPosition) { frame.player.x = playerPosition.x; frame.player.z = playerPosition.z; }
      frame.eDown = keyHeld || touchHeld;
      frame.blocked = otherModalOpen();
      interpreter.update(frame);
      speech.update(frame.now);
      overlays.update(frame.now);
      if (frame.now - lastViewAt >= VIEW_EVERY_SECONDS) refreshView();
    },
    // The last few completion claims, newest last (window.__gw3dThreeRoads.get('pledges').claims()).
    claims: () => claims.map(claim => ({ ...claim })),
    // For checking a scene by hand: where each sworn pledge stands and what was said.
    status: () => (interpreter ? interpreter.status() : []),
    lines: () => linesShown.map(entry => ({ ...entry })),
    view: () => ({ prompt: view.prompt ? { ...view.prompt } : null, choice: view.choice }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs.splice(0)) { try { off(); } catch { /* already gone */ } }
      interpreter?.dispose();
      interpreter = null;
      speech.clear();
      stopPledgeLine();
      setOwnModal(false);
      overlays.dispose();
      // Every area change remounts the world, so the pledges stay registered
      // across a dispose. They are taken out only if the switch has been
      // turned off in the meantime.
      if (game && !threeRoadsEnabled(win)) {
        removeThreeRoadsPledges(game.quests);
        send(PLEDGES_CHANGED_EVENT);
      }
    },
  };
}
