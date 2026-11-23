// Duelist Adventure (new build): one match in the arena (practice, duel, free for all, team deathmatch or
// capture the flag), played in the browser against bots (client/localSource.mjs) or online on the match
// server (net/client.mjs); or the story mission in its depot (client/missionSource.mjs). All are "sources"
// with the same shape; this view draws whichever it is given.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createSceneRenderer } from '../../../lib/webgpuSceneRenderer.js';
import { MOVES, FLOW, CLASS_MODE, modeOf, fighterVeil, isStunned } from '../core/index.mjs';
import { bodyOf, hostile, forwardOf, PROJECTILE_HEIGHT, shelterOf } from '../sim/world.mjs';
import { MODES, CTF } from '../sim/match.mjs';
import { clearLine, rayDistance } from '../sim/level.mjs';
import { loadFighterBody, MOVEMENT_PACK_URL } from './assets.mjs';
import { clipsForBody } from './motionLibrary.mjs';
import { bakeDuelMoves } from './duelMoves.mjs';
import { createCrystalSword, attachToHand } from './crystalWeapon.mjs';
import { createSidearm, createAimLine } from './sidearm.mjs';
import { dressGuard } from './guardKit.mjs';
import { createFighterAnimator } from './animator.mjs';
import { createArena, createSceneLighting } from './arena.mjs';
import { createDepot, createMarkerOverlay, DEPOT } from './depot.mjs';
import { createDuelVfx } from './vfx.mjs';
import { createControls, createFollowCamera } from './controls.mjs';
import MobileTouchControls from '../../mobile/MobileTouchControls.jsx';
import { isMobileTouchDevice } from '../../mobile/mobileTouchModel.mjs';
import { keysFrom, keyLabel, helpLine } from './bindings.mjs';
import { createVoices } from './voices.mjs';
import { createWarp } from './warp.mjs';
import { createSwordTrail } from './trails.mjs';
import { createDuelAudio } from './audio.mjs';
import { createDirector } from './director.mjs';
import { createNameTags, createCtfProps, fighterColor, TEAM_COLORS } from './matchProps.mjs';
import { createFootballProps } from './footballProps.mjs';
import { createEscortProps } from './escortProps.mjs';
import { createControlProps } from './controlProps.mjs';
import { createLocalSource } from './localSource.mjs';
import { createMissionSource } from './missionSource.mjs';
import { createOnlineSource } from '../net/client.mjs';
import { Countdown, RespawnNote, Result } from './MatchHud.jsx';
import DuelistHud from './DuelistHud.jsx';
import { createHudFeed } from './hudFeed.mjs';
import { levelFrom } from './progress.mjs';
import { takePortrait } from './portrait.mjs';
import ClassPicker from './ClassPicker.jsx';
import { classChoiceSecondsLeft, shouldShowMatchClassPicker, CLASS_CHOICE_PROMPT_SECONDS } from './matchClassEntry.mjs';
import GraphicsRuntimePanel from '../../shared/GraphicsRuntimePanel';
import ShopPanel from './ShopPanel.jsx';
import StorySupplyPanel from './StorySupplyPanel.jsx';
import MatchLoadingScreen from './MatchLoadingScreen.jsx';
import { createClassWeapon, equipClassWeapon, wholeWeapon, weaponBlades, mirrorGrip, STAFF_HANDS } from './classWeapons.mjs';
import { createSecondHand } from './secondHand.mjs';
import { CLASSES, classById, hiddenFrom, effectOn, moveFor, abilityRank, specialTier } from '../core/index.mjs';

// A cloaked fighter you can still see (your own, an ally's, an enemy's up close) is a ghost of itself. The body's
// materials become the actor's own the first time, so no other fighter with the same body fades with it.
function setGhost(actor, on) {
  if (!!actor.ghost === on) return;
  actor.ghost = on;
  actor.model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData.ownMaterial) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.userData.ownMaterial = true;
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (on) {
        m.userData.solid = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
        m.transparent = true; m.opacity = Math.min(m.opacity, 0.3); m.depthWrite = false;
      } else if (m.userData.solid) { Object.assign(m, m.userData.solid); delete m.userData.solid; }
      m.needsUpdate = true;
    }
  });
}
import { Objective, Comms, Prompt, Crew, DownNote, MissionEnd } from './MissionHud.jsx';
import { getAppParams } from '@/lib/app-params';
import './duelist.css';
import '../menu/duelistDarkBlueTheme.css';

const POWERS = ['push', 'pull', 'grip', 'breach', 'dash', 'resist']; // the on-screen buttons, labelled with their keys
const EVASIONS = ['Front_Roll', 'Back_Flip', 'Flip_Left', 'Flip_Right'];
const YOU_COLOR = 0x9fe8ff;
const NET_TEXT = { connecting: 'Connecting to the match server…', joining: 'Finding a match…' };
const CREW_TEXT = { connecting: 'Connecting to the match server…', joining: 'Joining the crew…' };
// what the body does while it uses something (a clip of the motion pack, by the thing's kind)
const WORK_CLIPS = { crate: { clip: 'interact' }, terminal: { clip: 'hack', loop: true }, core: { clip: 'pickup' }, bell: { clip: 'interact' }, use: { clip: 'interact' } };
const KNEEL = Object.freeze({ clip: 'crouchIdle', loop: true, progress: 0 }); // someone who stood down
const HEAD = 1.45; // metres: where the camera looks, and where its line to the fighter starts
const BODY_REMAINS = 7; // seconds a fallen guard lies before it is cleared away

// seat: { body, weapon ('sword' | 'sidearm'), kit (a guard's uniform), kind }; classId: the fighter's class (its
// crystal form and colour), or null
async function createActor(scene, seat, weaponColor, classId = null) {
  const bodyId = seat.body;
  const { model, clips } = await loadFighterBody(bodyId);
  if (seat.kit) dressGuard(model, seat.kit); // fitted at rest, before anything poses the body
  // the clip packs are retargeted from the body's rest pose: before anything poses it
  const [pack, dodges] = await Promise.all([
    clipsForBody(model, { rigKey: bodyId }),
    clipsForBody(model, { rigKey: bodyId, url: MOVEMENT_PACK_URL, names: EVASIONS }),
  ]);
  const group = new THREE.Group();
  group.add(model);
  scene.add(group);
  // held in Telekinesis has no clip in the pack: an authored pose
  const { clips: baked, grip, handBone } = bakeDuelMoves(model, ['held']);
  const gun = seat.weapon === 'sidearm';
  const rightHand = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(handBone || 'mixamorig:RightHand'));
  const leftHand = model.getObjectByName('mixamorigLeftHand');
  const classDef = gun ? null : classById(classId);
  let sword;
  let blades = []; // what leaves a trail: { group, base, tip } along each blade
  if (classDef) {
    // the class's crystal form: one blade, twin blades (one in each hand) or the double-bladed staff
    const weapon = createClassWeapon(classId);
    equipClassWeapon(weapon, { rightHand, leftHand, grip });
    sword = wholeWeapon(weapon);
    blades = weaponBlades(weapon);
  } else {
    sword = gun ? createSidearm({ color: weaponColor }) : createCrystalSword({ color: weaponColor });
    attachToHand(sword, rightHand, grip);
    if (!gun) blades = [{ group: sword.group, base: 0.5, tip: 0.98 }];
  }
  // the stance (idle, guard, which hands grip) goes with the crystal form
  const stance = gun ? 'sidearm' : classDef?.weapon === 'dualBlades' || classDef?.weapon === 'staff' ? classDef.weapon : 'sword';
  // the staff is held in both hands: the left one is kept on the shaft whatever the body's proportions
  const secondHand = stance === 'staff' ? createSecondHand({ model, weapon: sword.group, grip: mirrorGrip(grip), along: STAFF_HANDS }) : null;
  const animator = createFighterAnimator({ model, clips: { pack, dodges, walk: clips.walk, baked }, stance, secondHand });
  const trailColor = classDef ? classDef.color : weaponColor;
  const trails = blades.map((b) => ({ group: b.group, trail: createSwordTrail(scene, { color: trailColor, base: b.base, tip: b.tip }) }));
  const aim = gun ? createAimLine(scene, { color: weaponColor }) : null;
  const chestBone = model.getObjectByName('mixamorigSpine2') || model.getObjectByName('mixamorigSpine1');
  return {
    group, model, sword, animator, trails, aim, gun, classId: classDef ? classId : null, kind: seat.kind || 'player', yaw: 0, at: new THREE.Vector3(), fallen: 0,
    voice: /huntress|female/i.test(seat.body || '') ? 'f' : 'm', // which recorded voice it roars and taunts in
    root: group,
    bladeNear(point) {
      let nearest = null;
      for (const { group: blade, base, tip } of blades) {
        const local = blade.worldToLocal(point.clone());
        const y = THREE.MathUtils.clamp(local.y, Math.min(base, tip), Math.max(base, tip));
        const edge = blade.localToWorld(local.set(0, y, 0));
        if (!nearest || edge.distanceToSquared(point) < nearest.distanceToSquared(point)) nearest = edge;
      }
      return nearest;
    },
    chest: () => (chestBone ? chestBone.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.2)),
    hand: () => (leftHand ? leftHand.getWorldPosition(new THREE.Vector3()) : group.position.clone().setY(1.3)),
    dispose() { animator.dispose(); sword.dispose(); for (const t of trails) t.trail.dispose(); aim?.dispose(); group.removeFromParent(); },
  };
}

/**
 * mode: practice | duel | ffa | tdm | ctf (online: also 'any', the Join button) | story (a co-op mission: mission
 * names which, sim/mission.mjs MISSIONS; onNext(id) goes on to the next one after it is finished; onMission(id)
 * hears which mission is playing, when it is not the one asked for or changes).
 * you: your body; foe: the opponent's in a local duel or practice; bots: how many opponents in practice;
 * botLevel: trainee | duelist | master. online + serverUrl: play on the match server instead of in the browser
 * (story: with a crew; room is a crew's code, 'new' for a room of your own, or null for any open crew).
 */
export default function DuelistGame({ mode = 'practice', botLevel = 'duelist', you: youBody = 'maskedWarrior', foe: foeBody = 'huntress', bots = 1,
  online = false, serverUrl = null, sensitivity = 1, room = null, matchId = null, mission = 'contraband', onLeave = null, onNext = null,
  onMission = null, keys = null, voicesOn = true, classId = 'duelist', onClassChange = null, progress = null, onProgress = null }) {
  const bound = keysFrom(keys || {});
  const keysKey = JSON.stringify(bound);
  const voicesRef = useRef(null);
  const sourceRef = useRef(null);
  const [picking, setPicking] = useState(false); // explicit reopen after initial confirmation
  // Do not let the automatic match/round countdown dismiss class selection.
  const [entryClass, setEntryClass] = useState({ generation: 0, confirmed: false });
  const [pendingClassPick, setPendingClassPick] = useState(null);
  const [choiceSeconds, setChoiceSeconds] = useState(CLASS_CHOICE_PROMPT_SECONDS);
  const initialChosenRef = useRef(false);
  const [shopOpen, setShopOpen] = useState(false);
  const controlsRef = useRef(null);
  const mountRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [status, setStatus] = useState('loading');
  const [net, setNet] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [fightFlash, setFightFlash] = useState(false);
  const pressRef = useRef(null);
  const audioRef = useRef(null);
  const onMissionRef = useRef(onMission);
  onMissionRef.current = onMission;
  // class levels (core/progression.mjs): offline, this browser keeps each class's EXP (progress in, onProgress out);
  // online, the match server does
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const progressRef = useRef(progress);
  const [portrait, setPortrait] = useState(null); // a picture of the player's fighter, for the HUD
  const [muted, setMuted] = useState(false);
  const [showGpuDiagnostics, setShowGpuDiagnostics] = useState(false);
  useEffect(() => {
    if (!shopOpen) return undefined;
    const onEscape = event => { if (event.key === 'Escape') setShopOpen(false); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [shopOpen]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let disposed = false;
    setStatus('loading');
    initialChosenRef.current = false;
    setEntryClass({ generation, confirmed: false });
    setPendingClassPick(null);
    setPicking(false);
    setChoiceSeconds(CLASS_CHOICE_PROMPT_SECONDS);
    setHud(null);
    setNet(null);
    const selectedRenderer = createSceneRenderer('duelist-adventure', { gameplay: true, antialias: true, powerPreference: 'high-performance' });
    const renderer = selectedRenderer.renderer;
    window.__duelistGameRenderer = renderer;
    window.__duelistGameRendererChoice = { kind: selectedRenderer.kind, reason: selectedRenderer.reason };
    renderer.setPixelRatio(Math.min(isMobileTouchDevice(window) ? 1.25 : 2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (renderer.__sceneState) renderer.__sceneState.gameplayScene = scene;
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    const lights = createSceneLighting(scene);
    scene.add(lights.sun.target);
    const story = mode === 'story';
    const seed = 1 + ((Date.now() / 1000) % 100000 | 0) + generation * 7919;
    const source = story && !online ? createMissionSource({ id: mission, seed, youBody })
      : online ? createOnlineSource({ url: serverUrl, token: getAppParams().token, name: '', body: youBody, mode, mission, room, matchId, classId, onChange: (s, detail) => setNet({ status: s, detail }) })
        : createLocalSource({ mode, botLevel, bots, seed, youBody, foeBody, classId, progress: progressRef.current });
    const { world } = source;
    sourceRef.current = source;
    // a mission's rooms (matches are fought in the open arena); online they follow the crew to its next mission
    let level = source.level || null;
    let generationSeen = source.generation || 0;
    let missionTold = mission;
    const tellMission = () => { const id = source.def?.id; if (id && id !== missionTold) { missionTold = id; onMissionRef.current?.(id); } };
    const me = () => source.meId;
    // the arena is sized by the mode (online, the mode is known once a match is found); a mission has its depot
    let arenaMode = null;
    let arena = null;
    let warp = null;
    const warpHolder = { ring: (...a) => warp?.ring(...a), hold: (...a) => warp?.hold(...a) };
    const arenaHolder = { arc: (...a) => arena?.arc(...a) };
    const ensureArena = (m) => {
      const key = level ? `mission:${source.def?.id}` : m;
      if (arenaMode === key) return;
      arenaMode = key;
      if (arena) { arena.dispose(); arena.group.removeFromParent(); }
      arena = level ? createDepot({ level, def: source.def, scene, lights }) : createArena({ radius: MODES[m]?.arena || 18 });
      scene.add(arena.group);
    };
    ensureArena(source.mode || mode);
    let markers = level ? createMarkerOverlay(mount) : null;
    warp = createWarp(renderer, scene, camera);
    const vfx = createDuelVfx(scene, { warp: warpHolder, arena: arenaHolder, camera });
    const audio = createDuelAudio();
    audioRef.current = audio;
    setMuted(audio.muted);
    const toggleBattleShop = () => {
      const currentView = source.view?.();
      if (!currentView || currentView.phase === 'over' || currentView.phase === 'complete' || currentView.phase === 'failed') return;
      // The cursor must be free to interact with the shop. Closing leaves it free until the
      // player clicks the arena to recapture it, avoiding a surprise mouse lock.
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      setShopOpen((open) => !open);
    };
    const controls = createControls(renderer.domElement, { keys: bound, sensitivity, onShopToggle: toggleBattleShop });
    controlsRef.current = controls;
    controls.setPaused(shopOpen);
    // the comms lines, spoken as they appear on screen (and the radio's click)
    const voices = createVoices({ audio, enabled: voicesOn });
    voicesRef.current = voices;
    let lineShown = null;
    const follow = createFollowCamera(camera);
    const wake = () => audio.resume(); // browsers start sound only after the player does something
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    const actors = {};
    const pending = new Set();
    const director = createDirector({ world, vfx, audio, actors, playerId: me });
    const tags = createNameTags(scene);
    let ctf = null;
    let football = null;
    let control = null;
    let escort = null;
    let lockId = null;
    let clock = 0;
    // the HUD's kill feed and banners
    const feed = createHudFeed();
    let portraitOf = null; // the actor the portrait was taken of (retaken when the fighter is rebuilt)
    let portraitWait = 0;
    const lookDir = new THREE.Vector3();
    let last = performance.now();
    let hudClock = 0;
    let frame = 0;
    let fightTimer = 0;
    let seatsSeen = 0;
    let seatList = [];
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      warp.setSize(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    pressRef.current = (command) => controls.press(command);

    // fighters come and go with the seats (online: players join, bots step out; a mission: its people appear
    // room by room). Bodies are built one at a time, a frame apart, so a full room does not arrive as a hitch.
    const queue = [];
    const retired = new Set(); // a mission's fallen, cleared away
    let building = false;
    const colorOf = (s, i) => s.color ?? (TEAM_COLORS[s.team] ? fighterColor(s.team) : s.id === me() ? YOU_COLOR : fighterColor(null, i));
    const syncActors = () => {
      seatsSeen = source.seatsVersion;
      seatList = source.seats();
      const ids = new Set(seatList.map((s) => s.id));
      for (const id of Object.keys(actors)) if (!ids.has(id)) { actors[id].dispose(); delete actors[id]; tags.remove(id); }
      seatList.forEach((s, i) => {
        if (actors[s.id] || pending.has(s.id) || retired.has(s.id)) return;
        pending.add(s.id);
        queue.push({ seat: s, color: colorOf(s, i), classId: world.fighters.get(s.id)?.classId || null });
      });
    };
    const buildNext = () => {
      if (building || !queue.length) return;
      const { seat: s, color, classId: cls } = queue.shift();
      if (!source.seats().some((x) => x.id === s.id)) { pending.delete(s.id); return; }
      building = true;
      const gen = generationSeen;
      createActor(scene, s, color, cls).then((actor) => {
        if (disposed || gen !== generationSeen || !source.seats().some((x) => x.id === s.id)) { actor.dispose(); return; }
        actors[s.id] = actor;
        // Every opponent needs readable health above their head, including
        // unnamed story enemies. Friendly teammates retain ally-colored HP.
        if (s.id !== me()) {
          const mine = world.fighters.get(me());
          const other = world.fighters.get(s.id);
          const enemy = mine && other ? hostile(world, mine, other) : s.kind === 'enemy';
          tags.set(s.id, s.name || (enemy ? 'Enemy' : 'Ally'),
            s.kind === 'enemy' ? 0xffc9b8 : s.kind === 'ally' ? 0xd9c6ff : TEAM_COLORS[s.team] ? fighterColor(s.team) : 0xdfe9f5,
            enemy);
        }
      }).catch((error) => { console.error('[duelist] could not load a fighter', error); setStatus('error'); })
        .finally(() => { pending.delete(s.id); building = false; });
    };

    // someone who stood down (kneeling) is out of the fight: no lock-on, no panel
    const outOfFight = (f) => !!f.yielded || !!lastView?.yielded?.includes(f.id);
    // Lock-on (owner, 2026-11-22): whoever is nearest where the camera looks, within 20 m and in sight: enemies, and for
    // a Healer her allies too (Mend heals the ally she is locked on to; Levitate lifts the enemy she is locked on to).
    // The angle off the aim counts most, the distance a little.
    const aimedTarget = (range = 20) => {
      const mine = world.fighters.get(me());
      const at = bodyOf(world, me());
      if (!mine || !at) return null;
      const healer = mine.classId === 'healer';
      const aim = controls.yaw();
      let best = null;
      for (const f of world.fighters.values()) {
        if (f.id === me() || f.vitals.dead || outOfFight(f)) continue;
        if (!healer && !hostile(world, mine, f)) continue;
        const b = bodyOf(world, f.id);
        const dx = b.x - at.x;
        const dz = b.z - at.z;
        const d = Math.hypot(dx, dz);
        if (d > range || (level && !clearLine(level, at, b))) continue;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - aim), Math.cos(Math.atan2(dx, dz) - aim)));
        const score = off * 3 + d / range;
        if (!best || score < best.score) best = { id: f.id, score };
      }
      return best?.id || null;
    };
    // the nearest standing hostile to the player (for the right-hand panel); in rooms, one in sight
    const nearestHostile = (range = Infinity) => {
      const mine = world.fighters.get(me());
      const at = bodyOf(world, me());
      if (!mine || !at) return null;
      let best = null;
      for (const f of world.fighters.values()) {
        if (f.id === me() || f.vitals.dead || outOfFight(f) || !hostile(world, mine, f)) continue;
        const b = bodyOf(world, f.id);
        const d = Math.hypot(b.x - at.x, b.z - at.z);
        if (d > range || (best && d >= best.d) || (level && !clearLine(level, at, b))) continue;
        best = { id: f.id, d };
      }
      return best?.id || null;
    };
    // indoors the camera stays in the room: pulled in front of whatever is between it and the fighter's head
    const head = new THREE.Vector3();
    const clampCamera = (target, point) => {
      if (!level) return;
      head.set(target.x, target.y + HEAD, target.z);
      const dx = point.x - head.x;
      const dz = point.z - head.z;
      const d = Math.hypot(dx, dz);
      const margin = 0.3;
      if (d > 1e-4) {
        const free = rayDistance(level, head, { x: dx / d, z: dz / d }, d + margin, arena.cameraBlockers(point.y));
        if (free < d + margin) {
          const k = Math.max(0.1, (free - margin) / d);
          point.x = head.x + dx * k;
          point.z = head.z + dz * k;
          point.y = head.y + (point.y - head.y) * k;
        }
      }
      point.y = Math.min(point.y, DEPOT.height - 0.3);
    };
    const lockedBody = () => {
      const f = lockId ? world.fighters.get(lockId) : null;
      if (!f || f.vitals.dead || outOfFight(f)) { lockId = null; return null; }
      return bodyOf(world, lockId);
    };

    // development only: drive the match from a test (see the previous build's notes in docs/duelist)
    let timeScale = 1;
    let viewOffset = 0;
    let fixedShot = null;
    let manual = false;
    let film = null;
    let pilot = null; // development: the game plays your fighter through a mission
    let drawing = true; // development: off while a test skips ahead
    if (import.meta.env?.DEV) {
      window.__duelist = {
        source, match: source.match || null, mission: source.mission || null, world, controls, actors, audio, voices, arena, camera, renderer,
        autopilot: (on = true) => {
          if (!on || !source.mission) { pilot = null; return Promise.resolve(false); }
          return import('../sim/autopilot.mjs').then((m) => { pilot = { think: m.thinkAutopilot, state: m.createAutopilot(me(), { seed: 3 }) }; return true; });
        },
        // skip ahead without drawing or animating (a mission's later stages, in a test)
        skip: (seconds, stepSize = 1 / 30) => { drawing = false; try { for (let t = 0; t < seconds - 1e-9; t += stepSize) tick(stepSize); } finally { drawing = true; } },
        slow: (v = 1) => { timeScale = Math.max(0, v); },
        lock: (on, id = null) => { lockId = on ? (id || aimedTarget(Infinity) || nearestHostile()) : null; },
        view: (offset = 0) => { viewOffset = offset; },
        shot: (shot = null) => { fixedShot = shot; },
        manual: (on) => { manual = !!on; },
        advance: (seconds, stepSize = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += stepSize) tick(stepSize); },
        film: (count = 12, every = 0.05, cols = 4) => new Promise((resolve) => {
          const w = renderer.domElement.width;
          const h = renderer.domElement.height;
          const scale = Math.min(1, 1200 / (cols * w));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(cols * w * scale);
          canvas.height = Math.round(Math.ceil(count / cols) * h * scale);
          film = { count, every, cols, scale, w, h, index: 0, acc: every, ctx: canvas.getContext('2d'), canvas, resolve };
        }),
      };
    }
    const filmFrame = (dt) => {
      film.acc += dt;
      if (film.acc < film.every) return;
      film.acc = 0;
      const { ctx, cols, scale, w, h, index } = film;
      const x = (index % cols) * w * scale;
      const y = Math.floor(index / cols) * h * scale;
      ctx.drawImage(renderer.domElement, x, y, w * scale, h * scale);
      ctx.fillStyle = '#9fe8ff';
      ctx.font = '14px sans-serif';
      ctx.fillText(`${world.time.toFixed(2)}s`, x + 6, y + 18);
      film.index += 1;
      if (film.index >= film.count) {
        let img = document.getElementById('duelist-film');
        if (!img) {
          img = document.createElement('img');
          img.id = 'duelist-film';
          img.style.cssText = 'position:fixed;left:0;top:0;max-width:100vw;max-height:100vh;z-index:60;background:#000;cursor:pointer';
          img.onclick = () => img.remove();
          document.body.appendChild(img);
        }
        img.src = film.canvas.toDataURL('image/jpeg', 0.85);
        film.resolve({ width: film.canvas.width, height: film.canvas.height });
        film = null;
      }
    };

    const hudContext = () => ({
      me: me(), myTeam: seatList.find((s) => s.id === me())?.team || null,
      nameOf: (id) => seatList.find((s) => s.id === id)?.name || null,
      teamOf: (id) => seatList.find((s) => s.id === id)?.team || null,
      classOf: (id) => world.fighters.get(id)?.classId || null,
    });
    const onMatchEvent = (e) => {
      const myTeam = seatList.find((s) => s.id === me())?.team || null;
      if (!source.mission && source.kind !== 'mission') {
        const ctx = hudContext();
        feed.event(e, clock, ctx);
        // an offline match's EXP is this browser's to keep (the match server keeps an online player's)
        if (e.type === 'xp' && e.id === ctx.me && !online) onProgressRef.current?.(e.classId, e.total);
      }
      if (e.type === 'fight') { fightTimer = 0.9; setFightFlash(true); }
      else if (e.type === 'captured') audio.play(e.team === myTeam ? 'resist' : 'breach');
      else if (e.type === 'flagTaken') audio.play('gripStart', actors[e.by]?.chest() || null);
      else if (e.type === 'pointCaptured') audio.play('objective');
      else if (e.type === 'over') {
        const won = e.winner === me() || (myTeam && e.winner === myTeam);
        audio.play(e.winner === 'draw' ? 'loss' : won ? 'victory' : 'loss');
      }
      // a mission's
      else if (e.type === 'stage') audio.play('objective');
      else if (e.type === 'interacted') {
        const kind = source.def?.interactables?.find((it) => it.id === e.id)?.kind;
        audio.play(kind === 'bell' ? 'bell' : 'interact', actors[e.by]?.chest() || null);
      }
      else if (e.type === 'door') audio.play('door', arena.doorAt?.(e.id) || null);
      else if (e.type === 'failed') audio.play('loss');
      else if (e.type === 'complete') audio.play('victory');
      else if (e.type === 'retry' || e.type === 'respawn') { if (e.type === 'retry') director.reset(); if (e.type === 'retry' || e.id === me()) follow.snap(); }
    };

    // In rooms, only people the camera or your fighter could see are drawn and animated: a line to the body
    // (or just either side of it) that no wall, pillar or shut door crosses. Anyone close counts, and whoever
    // drops out of sight stays a moment longer.
    const eyes = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    const lineClear = (from, x, z, boxes) => {
      const dx = x - from.x;
      const dz = z - from.z;
      const d = Math.hypot(dx, dz);
      return d < 0.5 || rayDistance(level, from, { x: dx / d, z: dz / d }, d, boxes) >= d - 1e-3;
    };
    const inSight = (actor, body, dt) => {
      const boxes = arena.cameraBlockers(Infinity);
      let seen = false;
      for (const from of eyes) {
        const dx = body.x - from.x;
        const dz = body.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        const sx = (-dz / d) * 0.55;
        const sz = (dx / d) * 0.55;
        if (d < 5 || lineClear(from, body.x, body.z, boxes) || lineClear(from, body.x + sx, body.z + sz, boxes) || lineClear(from, body.x - sx, body.z - sz, boxes)) { seen = true; break; }
      }
      actor.unseen = seen ? 0 : (actor.unseen ?? 99) + dt;
      return actor.unseen < 1.2;
    };
    const retire = (id) => { actors[id].dispose(); delete actors[id]; retired.add(id); tags.remove(id); };

    // a mission's view (the depot is drawn from it): fresh ten times a second, with the HUD
    let lastView = level ? source.view() : null;
    let alarmOn = false;
    const tick = (dt) => {
      clock += dt;
      if (controls.takeLockToggle()) lockId = lockId ? null : aimedTarget();
      if (fightTimer > 0) { fightTimer -= dt; if (fightTimer <= 0) setFightFlash(false); }
      // a new mission or match on the same connection (a crew going on to the next mission): its rooms, and
      // nobody of the last one (ids repeat between missions)
      if ((source.generation || 0) !== generationSeen || (source.level || null) !== level) {
        generationSeen = source.generation || 0;
        setShopOpen(false); // a new crew operation should close the previous supply screen
        if ((source.level || null) !== level) {
          level = source.level || null;
          ensureArena(source.mode || mode);
          if (level && !markers) markers = createMarkerOverlay(mount);
        }
        lastView = level ? source.view() : null;
        tellMission();
        const players = new Set(source.seats().filter((s) => s.kind === 'player').map((s) => s.id));
        for (const [id, actor] of Object.entries(actors)) if (!players.has(id)) { actor.dispose(); delete actors[id]; tags.remove(id); }
        retired.clear();
        queue.length = 0;
        pending.clear();
        seatsSeen = -1;
        alarmOn = false;
        lockId = null;
      }
      if (source.status === 'ready' && source.seatsVersion !== seatsSeen) syncActors();
      buildNext();
      const mineId = me();
      // the players' bodies must be there to start; a mission's people step in as they are built
      const ready = source.status === 'ready' && mineId && seatList.length > 0 && seatList.every((s) => actors[s.id] || s.kind === 'enemy' || s.kind === 'ally');
      if (ready) {
        if (!level && source.mode && source.mode !== arenaMode) ensureArena(source.mode);
        if (!ctf && source.mode === 'ctf') {
          const z = MODES.ctf.arena - CTF.baseInset;
          ctf = createCtfProps(scene, { red: { home: { x: 0, z: -z } }, blue: { home: { x: 0, z } } });
        }
        if (!football && source.mode === 'football') football = createFootballProps(scene, MODES.football.arena);
        if (!escort && source.mode === 'escort') escort = createEscortProps(scene);
        if (!control && source.mode === 'control') control = createControlProps(scene, MODES.control.arena);
        const readInput = () => {
          if (pilot && source.mission) return pilot.think(source.mission, pilot.state);
          const at = bodyOf(world, mineId);
          const target = lockedBody();
          const faceYaw = target && at ? Math.atan2(target.x - at.x, target.z - at.z) : null;
          // One attack animation lasts multiple simulation frames. Keep the
          // blade and collision arc facing the camera or locked opponent while
          // movement keys independently strafe and backstep.
          const mine = world.fighters.get(mineId);
          const aimWhileAttacking = mine?.action?.move?.kind === 'attack';
          // the lock goes with the input: targeted abilities take it (the rules check it qualifies)
          return { ...controls.read({ faceYaw, strafe: !!target, aimWhileAttacking }), target: target ? lockId : null };
        };
        // A local match cannot begin its simulation countdown before the player
        // actually selects a class. Online authority is still owned by the server.
        const { effects, events } = !online && !source.mission && !initialChosenRef.current
          ? { effects: [], events: [] }
          : source.step(dt, readInput);
        escort?.update(source.escortDistance?.() ?? 0);
        football?.update(source.ball?.(), dt);
        for (const e of events) onMatchEvent(e);
        // a heavy hit holds the picture for a few hundredths of a second (the rules run on)
        const feel = director.frame(dt);
        const show = feel.stopped ? dt * 0.1 : dt;
        // who is using what (a crate's lid, a console, a core): their bodies show it
        const working = new Map();
        for (const it of lastView?.interactables || []) if (it.by && it.progress > 0) working.set(it.by, { ...(WORK_CLIPS[it.kind] || WORK_CLIPS.use), progress: it.progress });
        for (const id of lastView?.yielded || []) if (!working.has(id)) working.set(id, KNEEL);
        if (level) {
          const mine = bodyOf(world, mineId);
          eyes[0].x = camera.position.x; eyes[0].z = camera.position.z;
          if (mine) { eyes[1].x = mine.x; eyes[1].z = mine.z; }
        }
        for (const [id, actor] of Object.entries(actors)) {
          const fighter = world.fighters.get(id);
          const body = bodyOf(world, id);
          if (!fighter || !body) { actor.group.visible = false; actor.aim?.hide(); continue; }
          // a fighter that came back as another class is rebuilt with its new crystal form
          if (!actor.gun && actor.kind !== 'enemy' && actor.kind !== 'ally' && (fighter.classId || null) !== actor.classId) {
            actor.dispose();
            delete actors[id];
            tags.remove(id);
            seatsSeen = -1;
            continue;
          }
          // a Veil Cloak hides an enemy farther than its shimmer
          const viewer = world.fighters.get(mineId);
          if (viewer && id !== mineId && hiddenFrom(fighter, body, viewer, bodyOf(world, mineId), world.time)) { actor.group.visible = false; continue; }
          if (fighter.effects) {
            setGhost(actor, !!effectOn(fighter, 'cloak', world.time));
            const lasting = Object.keys(fighter.effects).filter((kind) => kind !== 'cloak' && effectOn(fighter, kind, world.time));
            // standing in an allied Sanctuary's healing mist: its light clings to the body (client/abilityFx.mjs)
            if (world.zones?.length && !fighter.vitals.dead && shelterOf(world, fighter)) lasting.push('sanctuary');
            if (lasting.length && drawing) vfx.aura(actor, lasting, show);
          }
          if (level && actor.kind === 'enemy' && !inSight(actor, body, dt)) {
            actor.group.visible = false;
            actor.aim?.hide();
            if (fighter.vitals.dead) retire(id); // nobody is looking: the fallen are cleared away
            continue;
          }
          actor.group.visible = true;
          if (actor.gone && !fighter.vitals.dead) vfx.revive(actor); // it came apart when it fell: whole again
          // a respawn is a cut, not a slide across the arena
          if (!actor.group.userData.posed || actor.at.distanceToSquared(body) > 25) actor.yaw = body.yaw;
          const turn = Math.atan2(Math.sin(body.yaw - actor.yaw), Math.cos(body.yaw - actor.yaw));
          actor.group.userData.posed = true;
          const turnRate = fighter.action?.id === 'roll' ? 32 : 22;
          actor.yaw += turn * -Math.expm1(-dt * turnRate);
          actor.at.set(body.x, body.y, body.z);
          actor.group.position.copy(actor.at);
          actor.group.rotation.set(0, actor.yaw, 0);
          if (drawing) actor.animator.update(dt, { fighter, body, now: world.time, working: working.get(id) || null, impact: actor.impactPose, clash: actor.clashAt ?? null });
          const will = fighter.vitals.max.will > 0 ? fighter.vitals.will / fighter.vitals.max.will : 0;
          actor.sword.setWill(will, fighterVeil(fighter));
          const a = fighter.action;
          if (actor.gun) {
            // a shot's wind-up shows: the sidearm's core heats and a line marks where the round will go
            const winding = a && a.move.damageKind === 'projectile' && a.t < a.move.startup ? a.t / a.move.startup : 0;
            actor.sword.charge(winding);
            if (winding > 0) {
              const dir = forwardOf(body.yaw);
              const reach = level ? Math.min(a.move.range, rayDistance(level, body, dir, a.move.range)) : a.move.range;
              const muzzle = actor.sword.muzzle();
              actor.aim.show({ x: muzzle.x, y: PROJECTILE_HEIGHT, z: muzzle.z }, body.yaw, reach, winding);
            } else actor.aim.hide();
          }
          actor.sword.update(show);
          for (const t of actor.trails) t.trail.update(dt, t.group, fighter.vitals.collapsed ? 0.25 : 0.55 + 0.45 * will, a?.move?.kind === 'attack');
          // a mission's fallen lie a while, then are cleared away
          if (actor.kind === 'enemy' && fighter.vitals.dead) {
            actor.fallen += dt;
            if (actor.fallen > BODY_REMAINS) actor.group.position.y -= (actor.fallen - BODY_REMAINS) * 0.9;
            if (actor.fallen > BODY_REMAINS + 1.4) retire(id);
          }
        }
        // Contact points now use both posed actors from this frame.
        director.step(effects);
        const grips = [...world.fighters.values()].filter((f) => f.heldBy && actors[f.heldBy] && actors[f.id]).map((f) => ({ holder: actors[f.heldBy], held: actors[f.id] }));
        // an Execution drawing its target in: the golden tether from the Duelist's hand
        const seizes = [...world.fighters.values()].filter((f) => f.seizedBy && actors[f.seizedBy] && actors[f.id]).map((f) => ({ holder: actors[f.seizedBy], held: actors[f.id] }));
        vfx.update(show, { grips, seizes });
        tags.update(actors,
          (id) => !!world.fighters.get(id)?.vitals.dead || !actors[id].group.visible,
          (id) => {
            const vitals = world.fighters.get(id)?.vitals;
            return vitals ? { hp: vitals.hp, maxHp: vitals.max.hp } : null;
          });
        if (ctf) {
          const z = MODES.ctf.arena - CTF.baseInset;
          const homes = { red: { x: 0, z: -z }, blue: { x: 0, z } };
          const flags = source.flags();
          if (flags) ctf.update(show, Object.fromEntries(Object.entries(flags).map(([t, f]) => [t, { ...f, home: f.home || homes[t] }])), actors, (id) => bodyOf(world, id));
        }
        const at = bodyOf(world, mineId);
        const target = lockedBody();
        // watched while the game plays your fighter: the camera turns with the body
        if (pilot && at) { const y = controls.yaw(); controls.setYaw(y + Math.atan2(Math.sin(at.yaw - y), Math.cos(at.yaw - y)) * Math.min(1, dt * 2.5)); }
        const followYaw = target && at ? Math.atan2(target.x - at.x, target.z - at.z) : controls.yaw();
        if (at) {
          if (follow.distanceTo(at) > 8) follow.snap();
          follow.update(dt, { target: at, yaw: followYaw + viewOffset, pitch: controls.pitch(), lockOn: target, clamp: clampCamera });
          if (level) {
            // the key light follows the crew through the rooms; a camera pressed against you looks through you
            lights.sun.position.set(at.x + 5, 20, at.z + 3);
            lights.sun.target.position.set(at.x, 0, at.z);
            if (actors[mineId]) actors[mineId].group.visible = camera.position.distanceTo(head.set(at.x, at.y + HEAD, at.z)) > 0.85;
          }
        }
        if (target && at) controls.setYaw(followYaw);
        if (markers) markers.update(lastView?.phase === 'live' ? lastView.markers.filter((m) => !m.follow) : [], camera, at);
        if (lastView && !!lastView.alarm !== alarmOn) { alarmOn = !!lastView.alarm; if (alarmOn) audio.play('alarm'); }
        if (fixedShot) { camera.position.fromArray(fixedShot.position); camera.lookAt(...fixedShot.target); }
        if (feel.shake > 0.001) {
          const t = feel.shake * feel.shake;
          camera.rotateX(Math.sin(clock * 53) * 0.022 * t);
          camera.rotateY(Math.sin(clock * 47 + 1.3) * 0.022 * t);
          camera.rotateZ(Math.sin(clock * 61 + 2.1) * 0.03 * t);
        }
        audio.listen(camera.position, camera.getWorldDirection(lookDir));
        // HUD at 10 Hz
        hudClock += dt;
        if (hudClock > 0.1) {
          hudClock = 0;
          const mine = world.fighters.get(mineId);
          const shownId = lockId || nearestHostile(14);
          const shown = shownId ? world.fighters.get(shownId) : null;
          const seat = shownId ? seatList.find((s) => s.id === shownId) : null;
          const view = source.view();
          const inMatch = !!view && !view.mission;
          if (inMatch) feed.view(view, clock, hudContext());
          control?.update(view?.controlPoints);
          if (level) lastView = view;
          const line = view?.comms || null;
          const said = line ? `${line.speaker}\n${line.text}` : null;
          if (said !== lineShown) {
            lineShown = said;
            if (line && drawing) { audio.play('comms'); voices.say(line.speaker, line.text); }
          }
          setHud({
            you: mine ? snapshot(mine, world.time) : null,
            target: shown ? snapshot(shown, world.time) : null,
            targetName: seat?.name || '',
            targetTeam: seat?.team || null,
            lockOn: !!lockId,
            view,
            myTeam: seatList.find((s) => s.id === mineId)?.team || null,
            powers: mine ? POWERS.map((id, i) => {
              const key = i < 4 ? controls.keys[`ability${i + 1}`] : controls.keys[id];
              return { id, key: keyLabel(key, { short: true }), ready: Math.max(0, (mine.cooldowns[id] ?? 0) - world.time), cost: MOVES[id].will };
            }) : [],
            // the class: its four abilities (keys 1-4) and the special meter (owned by the match's seat)
            classId: mine?.classId || null,
            abilities: mine?.classId ? CLASSES[mine.classId].abilities.map((ab, i) => ({ id: ab.id, name: ab.name, slot: i + 1,
              key: keyLabel(controls.keys[`ability${i + 1}`], { short: true }), ready: Math.max(0, (mine.cooldowns[ab.id] ?? 0) - world.time),
              cost: MOVES[ab.id].will, total: moveFor(mine, ab.id).cooldown, rank: abilityRank(mine.matchBoost) })) : null,
            specialTier: mine?.classId ? specialTier(mine.matchBoost) : null,
            matchBoost: mine?.matchBoost ?? 0,
            // the sword's mode (swift, balanced, heavy): only a form that cuts by direction has one
            mode: mine && Object.keys(FLOW[mine.weapon]?.modes || {}).length > 1 ? modeOf(mine) : null, // the twin blades and the staff have one
            modeKey: mine && CLASS_MODE[mine.classId] ? null : keyLabel(controls.keys.mode, { short: true }), // a class has one mode: no key
            classLevel: mine?.classId ? mine.level : null, // the level this life is fought at (a new one comes with the next spawn)
            specialMeter: mine?.classId ? (Number.isFinite(mine.meter) ? mine.meter : view?.me?.specialMeter ?? 0) : null,
            specialKey: keyLabel(controls.keys.special, { short: true }),
            dead: !!mine?.vitals.dead,
            meId: mineId,
            kills: inMatch ? feed.kills(clock).slice() : null,
            banners: inMatch ? feed.banners(clock) : null,
            flagStates: inMatch && view.flags ? { blue: feed.flagState('blue', view.flags.blue?.state, clock), red: feed.flagState('red', view.flags.red?.state, clock) } : null,
            level: levelFrom(view?.me?.xp ?? 0), // the class's EXP, as the match has it
          });
          setStatus('ready');
        }
      } else if (source.status !== 'reconnecting') {
        // nothing to follow yet (while reconnecting the picture simply holds still)
        const start = source.def?.start || { x: 0, z: 0 };
        follow.update(dt, { target: { x: start.x, y: 0, z: start.z }, yaw: controls.yaw(), pitch: controls.pitch(), clamp: clampCamera });
      }
      arena.update(dt, { view: lastView });
      warp.update(dt);
      // the HUD's portrait: a picture of the player's fighter, once it has stood a moment (again if it is rebuilt)
      const mineActor = actors[me()];
      if (drawing && mineActor && mineActor !== portraitOf && mineActor.group.visible) {
        portraitWait += dt;
        if (portraitWait > 0.5) {
          portraitOf = mineActor;
          portraitWait = 0;
          const picture = takePortrait(renderer, scene, mineActor);
          if (picture) setPortrait(picture);
        }
      }
      if (drawing) warp.render();
      if (film) filmFrame(dt);
    };
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000) * timeScale;
      last = now;
      if (!manual) tick(dt);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      source.dispose();
      controls.dispose();
      vfx.dispose();
      warp.dispose();
      voices.dispose();
      audio.dispose();
      tags.dispose();
      ctf?.dispose();
      football?.dispose();
      control?.dispose();
      escort?.dispose();
      markers?.dispose();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      arena.dispose();
      for (const actor of Object.values(actors)) actor.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (window.__duelistGameRenderer === renderer) {
        delete window.__duelistGameRenderer;
        delete window.__duelistGameRendererChoice;
      }
      if (window.__duelist?.world === world) delete window.__duelist;
    };
  }, [mode, botLevel, youBody, foeBody, bots, generation, online, serverUrl, sensitivity, room, matchId, mission, keysKey, voicesOn]);

  const view = hud?.view;
  const quest = view?.mission ? view : null; // a story mission's view; otherwise a match's
  const match = view && !quest ? view : null;
  const waiting = online && net && net.status !== 'ready';
  const again = () => setGeneration((g) => g + 1);
  // the class picker: by hand, or on its own before the fight, between rounds and while down
  const current = hud?.classId || classId;
  const classAnswer = sourceRef.current?.classAnswer || null;
  const initialConfirmed = entryClass.generation === generation && entryClass.confirmed;
  const showPicker = shouldShowMatchClassPicker({
    match, mission: !!quest, confirmed: initialConfirmed, manuallyOpened: picking,
  });
  // Inputs stay inactive while selecting a class. Explicitly reopening the
  // picker pauses controls too, including for online matches.
  useEffect(() => {
    controlsRef.current?.setPaused(shopOpen || showPicker);
  }, [shopOpen, showPicker]);
  // Five seconds tells the player to decide, but zero NEVER makes a choice or closes the menu.
  useEffect(() => {
    if (!match || quest || initialConfirmed || match.phase === 'over') return undefined;
    const openedAt = Date.now();
    setChoiceSeconds(CLASS_CHOICE_PROMPT_SECONDS);
    const id = window.setInterval(() => setChoiceSeconds(classChoiceSecondsLeft(openedAt, Date.now())), 200);
    return () => window.clearInterval(id);
  }, [!!match, !!quest, initialConfirmed, generation, match?.phase === 'over']);
  // Countdown/respawn picker must release the mouse so its class and Select controls work.
  useEffect(() => {
    if (showPicker && document.pointerLockElement) document.exitPointerLock?.();
  }, [showPicker]);
  const pickClass = (id) => {
    const source = sourceRef.current;
    if (!source?.chooseClass || pendingClassPick) return;
    source.chooseClass(id);
    if (online) {
      // Do not hide the picker or persist a class until the authoritative
      // multiplayer server accepts it. Rejected requests remain editable.
      setPendingClassPick({ generation, id });
      return;
    }
    if (source.classAnswer?.ok !== true) return;
    initialChosenRef.current = true;
    setEntryClass({ generation, confirmed: true });
    setPicking(false);
    onClassChange?.(id);
  };
  useEffect(() => {
    if (!online || !pendingClassPick || pendingClassPick.generation !== generation) return;
    const answer = sourceRef.current?.classAnswer;
    if (!answer) return; // still waiting for server response
    if (answer.ok === true) {
      initialChosenRef.current = true;
      setEntryClass({ generation, confirmed: true });
      setPicking(false);
      onClassChange?.(pendingClassPick.id);
    }
    setPendingClassPick(null);
  }, [online, pendingClassPick, generation, net, hud, onClassChange]);
  const classKeys = ['ability1', 'ability2', 'ability3', 'ability4', 'special'].map((a) => keyLabel(bound[a], { short: true }));
  return (
    <div className="duelist-game" ref={mountRef}>
      <MobileTouchControls game="duelist"
        specialReady={!!hud?.classId && Number.isFinite(hud?.specialMeter) &&
          hud.specialMeter + 1e-6 >= (CLASSES[hud.classId]?.special?.cost ?? 100) && !hud.dead}
        specialCharge={hud?.specialMeter}
        lockActive={!!hud?.lockOn}
        disabled={!hud || !!showPicker || shopOpen || waiting || hud.dead ||
          match?.phase === 'over' || quest?.phase === 'complete' || quest?.phase === 'failed'}
        onMove={move => controlsRef.current?.setTouchMove(move)}
        onLook={(dx, dy) => controlsRef.current?.look(dx, dy)}
        onActionDown={action => controlsRef.current?.touchActionDown(action)}
        onActionUp={action => controlsRef.current?.touchActionUp(action)} />
      <DuelistHud hud={hud} fighter={youBody} portrait={portrait} story={!!quest} pickerOpen={!!showPicker} onPower={(id) => pressRef.current?.(id)}
        onClass={match && match.phase !== 'over' ? () => { if (document.pointerLockElement) document.exitPointerLock?.(); setPicking(true); } : null}
        help={helpLine(bound, { story: mode === 'story', abilityNames: hud?.classId ? CLASSES[hud.classId].abilities.map((a) => a.name) : null })} />
      {match && initialConfirmed && <Countdown view={match} fightFlash={fightFlash} />}
      {match && <RespawnNote view={match} />}
      {match && <Result view={match} myTeam={hud.myTeam} online={online} onAgain={again} />}
      {quest && <Objective view={quest} />}
      {quest && <Crew view={quest} />}
      {quest && <Prompt view={quest} keyName={keyLabel(bound.interact, { short: true })} />}
      {quest && <Comms view={quest} />}
      {quest && <DownNote view={quest} />}
      {quest && <MissionEnd view={quest} onAgain={online ? null : again} onLeave={onLeave} onNext={online ? null : onNext} />}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 60,
        maxWidth: 'min(340px, calc(100vw - 24px))', color: '#e4efff' }}>
        <button type="button" aria-expanded={showGpuDiagnostics}
          aria-controls="duelist-live-gpu-panel"
          onClick={() => setShowGpuDiagnostics(open => !open)}
          style={{ padding: '5px 10px', borderRadius: 10, color: 'inherit',
            background: 'rgba(8,17,30,.82)', border: '1px solid rgba(190,220,250,.35)', fontSize: 12 }}>
          GPU status
        </button>
        {showGpuDiagnostics && <div id="duelist-live-gpu-panel" style={{ marginTop: 7 }}>
          <GraphicsRuntimePanel sceneId="duelist-adventure"/>
        </div>}
      </div>
      {match?.me?.items?.some((it) => it.tier === 3 && ['thundermirror', 'siphonmirror'].includes(it.id)) && (
        <button type="button" className="duelist-active-relic" onClick={() => pressRef.current?.('itemActive')}>
          {bound.itemActive ? keyLabel(bound.itemActive, {short:true}) + ' · ' : ''}Use relic
        </button>
      )}
      {match && <button type="button" className="duelist-shop-toggle" onClick={() => {
        if (document.pointerLockElement) document.exitPointerLock?.();
        setShopOpen(true);
      }}>{keyLabel(bound.shop, { short: true })} · Shop · {Math.floor(match.me?.gold ?? 0)} gold</button>}
      {shopOpen && match && match.phase !== 'over' && <ShopPanel
        me={match.me} answer={sourceRef.current?.shopAnswer || null}
        onBuy={(id) => sourceRef.current?.buyItem?.(id)}
        onClose={() => setShopOpen(false)} />}
      {quest && quest.phase === 'live' && <button type="button" className="duelist-shop-toggle"
        onClick={() => { if (document.pointerLockElement) document.exitPointerLock?.(); setShopOpen(true); }}>
        {keyLabel(bound.shop, { short: true })} · Story Supplies · {quest.me?.supplyUsed ? 'Used' : '1 free'}
      </button>}
      {shopOpen && quest && quest.phase === 'live' && <StorySupplyPanel
        view={quest} answer={sourceRef.current?.storySupplyAnswer || null}
        onUse={(id) => sourceRef.current?.claimStorySupply?.(id)}
        onClose={() => setShopOpen(false)} />}
      <button type="button" className="duelist-sound" onClick={() => { const a = audioRef.current; if (!a) return; a.resume(); a.setMuted(!a.muted); setMuted(a.muted); if (a.muted) voicesRef.current?.stop(); }}>
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      {online && !net && status === 'loading' && (
        <MatchLoadingScreen mode={mode} message="Preparing match connection…" />
      )}
      {waiting && (net.status === 'connecting' || net.status === 'joining') && (
        <MatchLoadingScreen mode={mode} message={(mode === 'story' ? CREW_TEXT : NET_TEXT)[net.status]} />
      )}
      {waiting && (net.status === 'error' || net.status === 'closed') && (
        <MatchLoadingScreen mode={mode} variant="error" message={net.detail || 'Not connected.'} />
      )}
      {waiting && net.status === 'reconnecting' && (
        <MatchLoadingScreen mode={mode} message={net.detail || 'Connection lost. Reconnecting…'}
          note={mode !== 'story' ? 'A bot keeps your seat until you are back.'
            : (quest?.people?.length || 1) > 1 ? 'The autopilot plays your fighter until you are back.' : 'The mission waits for you.'} />
      )}
      {!online && status === 'loading' && (
        <MatchLoadingScreen mode={mode} message={mode === 'story' ? 'Breaking into the depot…' : 'Forging the arena…'} />
      )}
      {status === 'error' && <MatchLoadingScreen mode={mode} variant="error" message="The fighters could not be loaded." />}
      {showPicker && (
        <ClassPicker current={current} pending={classAnswer?.ok ? classAnswer.pending : null} fighter={youBody} keys={classKeys} progress={match.me?.progress || progressRef.current} matchBoost={match.me?.matchBoost || 0}
          live={match.phase === 'live' && !hud?.dead} onPick={pickClass}
          initialChoice={!initialConfirmed} secondsLeft={choiceSeconds}
          submitting={!!pendingClassPick} error={classAnswer?.ok === false ? classAnswer.reason : null}
          onClose={initialConfirmed && picking ? () => setPicking(false) : null} />
      )}
    </div>
  );
}

const share = (value, max) => (max > 0 ? value / max : 0); // an ordinary person has no Will at all

function snapshot(f, now) {
  const v = f.vitals;
  return {
    hp: share(v.hp, v.max.hp), hpValue: v.hp, hpMax: v.max.hp, willValue: v.will, special: f.classId ? (Number.isFinite(f.meter) ? f.meter : 0) : null, stamina: share(v.stamina, v.max.stamina), will: share(v.will, v.max.will), shield: share(v.shield, v.max.shield),
    veil: fighterVeil(f), noVeil: v.max.will <= 0, winded: v.winded, stunned: isStunned(f, now), held: !!f.heldBy, breached: Object.keys(f.breaches).length > 0,
    dead: v.dead,
  };
}

