// Game 3D player + mount animation preview: the real runtime modules on the real GLBs, no sign-in.
//   ?body=male|female   &mount=faction_tiger|faction_armored_wolf|faction_bear|none   &roll=1 (roll dodges)
//   &demo=dodges|sprint|moments|flight   runs a scripted sequence and saves screenshots to /__shot
//   &fallback=1                          loads a re-rigged mount's hosted original through its runtime rig profile
// Keys: WASD move, Shift run, Ctrl sprint, double-tap WASD dodge, R roll, T toggle roll variant, 1 skill cast,
//       L level up, F mount / dismount, Space jump (on foot) or take off / land (riding), drag = orbit camera.
// The mount goes through the game's companion path (Faction 3 facing frame for the hosted #160 fallback,
// prepareMountAnimationClips, the Faction 3 secondary rig); tools/game3d-mounts/preview renders gait sheets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPlayerAnimationClips, initialPlayerAnimationClips } from '@/components/game3d/player/playerAnimationLibrary.jsx';
import { createLunaDashboardPlayerController } from '@/components/game3d/player/LunaDashboardPlayerController.jsx';
import { syncFusedLocomotion } from '@/components/game3d/player/fusedLocomotionSync.js';
import { getInputDodge, getPlanarBasisFromYaw } from '@/components/game3d/player/characterDodgeVector.js';
import { createDoubleTapDetector, dodgeMoveCandidates, pickDodgeMove } from '@/components/game3d/player/game3dDodgeProfiles.mjs';
import { getEightWayDodgeMove } from '@/components/game3d/player/game3dEightWayDodge.mjs';
import { createPlayerMomentGestures } from '@/components/game3d/player/playerMomentGestures.mjs';
import { createSkillUseBurst, createLevelUpCelebration, skillBurstColor } from '@/components/game3d/vfx/playerMomentEffects.jsx';
import { createMountFlightController } from '@/components/game3d/character/mountFlight.mjs';
import { prepareMountAnimationClips } from '@/components/game3d/character/mountAnimations.mjs';
import { createFactionThreeFacingFrame } from '@/components/game3d/character/factionThreeMountFacing.mjs';
import { createFactionThreeMountRig } from '@/components/game3d/character/factionThreeMountRig.mjs';
import { createMountedRiderPose } from '@/components/game3d/player/mountedRiderPose.mjs';
import { getCompanionById, createCompanionLoadingManager } from '@/components/game3d/companionData.jsx';

const WALK_SPEED = 4, RUN_SPEED = 9, SPRINT_SPEED = RUN_SPEED * 1.35, ROT_SMOOTH = 0.18; // gameWorldConfig values
const BODY_URLS = { male: '/models/characters/fused/Male_Fused_v2.glb', female: '/models/characters/fused/Female_Fused_v2.glb' };
const Q = new URLSearchParams(location.search);
const bodyName = Q.get('body') === 'female' ? 'female' : 'male';
const mountId = Q.get('mount') || 'faction_tiger';
let rollVariant = Q.get('roll') === '1';
const useFallback = Q.get('fallback') === '1';

const hud = document.getElementById('hud'), logBox = document.getElementById('log'), bar = document.getElementById('bar');
const lines = [];
const log = (...args) => { lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); if (lines.length > 60) lines.shift(); logBox.textContent = lines.join('\n'); };
for (const level of ['warn', 'error']) { const orig = console[level].bind(console); console[level] = (...a) => { log(`[${level}]`, ...a.map((x) => (x instanceof Error ? x.message : x))); orig(...a); }; }
window.__preview = { log, lines };

// ------------------------------------------------------------------------------------------------- scene
// A hidden Browser pane reports a 0 x 0 window; render at 1280 x 720 then so screenshots still work.
const viewW = () => innerWidth || 1280, viewH = () => innerHeight || 720;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(viewW(), viewH());
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fa8c9);
scene.fog = new THREE.Fog(0x7fa8c9, 60, 160);
const camera = new THREE.PerspectiveCamera(50, viewW() / viewH(), 0.05, 400);
scene.add(new THREE.HemisphereLight(0xdfe9f3, 0x4b5a3a, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(8, 14, 6); scene.add(sun);
{
  const size = 512, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#5f7f4a' : '#6b8d55'; ctx.fillRect(x * 64, y * 64, 64, 64); }
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, size - 2, size - 2);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(60, 60); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  for (let i = 0; i < 24; i++) { // a few posts for a sense of travel and altitude
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0x9a7b55 }));
    post.position.set(Math.sin(i * 2.4) * (10 + i * 2.3), 1.6, Math.cos(i * 1.7) * (10 + i * 2.3)); scene.add(post);
  }
}
addEventListener('resize', () => { camera.aspect = viewW() / viewH(); camera.updateProjectionMatrix(); renderer.setSize(viewW(), viewH()); });

// ------------------------------------------------------------------------------------------------- player
const loader = new GLTFLoader();
function skinnedBox(root) { const box = new THREE.Box3(); root.updateMatrixWorld(true); root.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); }); return box.isEmpty() ? box.setFromObject(root) : box; }
async function loadBody(name) {
  const gltf = await loader.loadAsync(BODY_URLS[name]);
  const model = gltf.scene;
  model.animations = gltf.animations;
  const json = gltf.parser.json;
  model.animations.forEach((clip, i) => { const extras = json.animations?.[i]?.extras; if (extras) clip.userData = { ...clip.userData, ...extras }; });
  model.userData.rigId = json.extras?.rigId; model.userData.fusedCharacter = /^fused-/.test(model.userData.rigId || '');
  let box = skinnedBox(model);
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  box = skinnedBox(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  model.traverse((n) => { if (n.isSkinnedMesh) n.frustumCulled = false; });
  // As in GameWorld3D, the scaled body is the gameplay root; the world sets its position to the spawn point,
  // which replaces loadAvatarModel's small centring offset.
  model.position.set(0, 0, 0);
  return { root: model, model, rigId: model.userData.rigId };
}

const keys = {};
const dodgeTaps = createDoubleTapDetector();
const orbit = { yaw: Math.PI, pitch: 0.32, distance: 5.2 };
let player = null, mixer = null, playerAnim = null, clipSources = {};
const effects = [];
const gestures = createPlayerMomentGestures({ getActor: () => player?.root || null });
const groundY = () => 0;
let flashText = '', flashUntil = 0;
const notice = (text) => { flashText = text; flashUntil = performance.now() + 1500; log(text); };

// As GameWorld3D: the keys point on screen through the camera yaw; the eight-way move follows the body.
function performDodge(direction, vector, { rollKey = false } = {}) {
  const options = rollKey ? { rollKey: true } : { rollDodges: rollVariant };
  const move = pickDodgeMove(dodgeMoveCandidates(direction, options), (key) => !!playerAnim.has(key)) || getEightWayDodgeMove(direction, { roll: rollKey });
  const started = rollKey ? playerAnim.requestRoll(vector, direction) : playerAnim.requestDodge(vector, direction, { rollDodges: rollVariant });
  if (started) notice(`${direction}${rollKey ? ' (R)' : ''}: ${playerAnim.getCurrent()} (${clipSources[playerAnim.getCurrent()] || 'clip'}) ${move.duration}s @ ${move.speed} m/s`);
  else notice(`dodge ${direction} refused (busy ${playerAnim.isMovementOverridden()})`);
  return started;
}
function inputDodge(k) {
  const held = (key, opposite) => k === key || (k !== opposite && !!keys[key]);
  return getInputDodge(player.root, orbit.yaw, { forward: held('w', 's'), backward: held('s', 'w'), left: held('a', 'd'), right: held('d', 'a') },
    { fallback: k === 'r' ? 'backward' : 'forward' });
}
function dodgeFromKey(k) {
  const d = inputDodge(k);
  return performDodge(d.direction, d.vector);
}
function rollFromKey() {
  const d = inputDodge('r');
  return performDodge(d.direction, d.vector, { rollKey: true });
}
function castSkill(weaponType = 'sword') {
  effects.push(createSkillUseBurst({ scene, playerRef: { current: player.root }, getGroundY: groundY, color: skillBurstColor(weaponType), duration: 0.65 }));
  gestures.play('skillCast', { seconds: 0.55 });
  playerAnim.requestAttack?.('melee', { speed: 1 });
  notice(`skill cast (${weaponType}): burst + surge gesture over ${playerAnim.getCurrent()}`);
}
function levelUp() {
  effects.push(createLevelUpCelebration({ scene, playerRef: { current: player.root }, getGroundY: groundY }));
  gestures.play('levelUp');
  notice('level up: pillar, rings, sparks, cheer gesture');
}

// ------------------------------------------------------------------------------------------------- mount
let mount = null; // { root, def, mixer, actions: {idle,walk,run,fly}, current, rider }
let mounted = false;
const mountFlight = createMountFlightController();
const mountTargetQuat = new THREE.Quaternion(), mountPitchQuat = new THREE.Quaternion(), MOUNT_PITCH_AXIS = new THREE.Vector3(1, 0, 0);
async function loadMount(id) {
  const base = getCompanionById(id);
  if (!base) return null;
  // &fallback=1 loads the hosted original a re-rigged mount falls back to (GameWorld3D's failToPreviousModel).
  const def = useFallback && base.previousModelUrl
    ? { ...base, modelUrl: base.previousModelUrl, previousModelUrl: null, animationSource: base.previousAnimationSource || base.animationSource, animationRigProfile: base.previousAnimationRigProfile ?? null }
    : base;
  const manager = createCompanionLoadingManager(THREE, def);
  const gltfLoader = manager ? new GLTFLoader(manager) : new GLTFLoader();
  const gltf = await gltfLoader.loadAsync(def.modelUrl);
  const visual = gltf.scene;
  // GameWorld3D's setupCompanion: the facing frame (a no-op except for the hosted #160), then normalisation.
  const { worldRoot: root } = createFactionThreeFacingFrame(visual, def);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  root.scale.setScalar((1.7 / Math.max(size.x, size.y, size.z)) * (def.scale || 1));
  root.position.set(3, 0, 0);
  scene.add(root);
  const secondaryRig = createFactionThreeMountRig(visual, def);
  const m = { root, def, mixer: new THREE.AnimationMixer(visual), actions: {}, current: 'idle', rider: null, clips: [], secondaryRig };
  const clips = await prepareMountAnimationClips(visual, gltf.animations || [], def);
  m.clips = clips;
  const find = (s) => clips.find((c) => (c.name || '').toLowerCase().includes(s)) || null;
  const idle = find(def.idleClipName) || clips[0], walk = find(def.walkClipName) || clips[1] || clips[0], run = find(def.runClipName) || clips[2] || null, fly = find('fly');
  if (idle) { m.actions.idle = m.mixer.clipAction(idle); m.actions.idle.play(); }
  if (walk && walk !== idle) m.actions.walk = m.mixer.clipAction(walk);
  if (run && run !== idle && run !== walk) m.actions.run = m.mixer.clipAction(run);
  if (fly && fly !== idle && fly !== walk && fly !== run) m.actions.fly = m.mixer.clipAction(fly);
  log(`mount ${def.name}: clips ${clips.map((c) => `${c.name}(${c.duration.toFixed(2)}s,${c.tracks.length}t)`).join(' ')}`, 'fly userData', fly?.userData || null);
  return m;
}
function playMount(name) {
  if (!mount) return;
  const a = mount.actions;
  if (name === 'fly' && !a.fly) name = 'run';
  if (name === 'run' && !a.run && a.walk) name = 'walk';
  const next = a[name] || a.idle;
  if (!next || (name === mount.current && next.isRunning())) return;
  for (const [k, action] of Object.entries(a)) if (k !== name) action.fadeOut(0.2);
  next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
  mount.current = name;
}
function toggleMount() {
  if (!mount || !player) return;
  if (mounted) {
    mount.rider?.restore(); mount.rider = null;
    mounted = false; mountFlight.land(true);
    playerAnim.setMounted(false);
    player.root.position.set(mount.root.position.x + 1.4, 0, mount.root.position.z);
    mount.root.position.y = 0;
    notice('dismounted');
  } else {
    mount.root.position.set(player.root.position.x, 0, player.root.position.z);
    mount.root.quaternion.copy(player.root.quaternion);
    playerAnim.setMounted(true);
    mounted = true;
    mount.rider = createMountedRiderPose({ player: player.root, mount: mount.root, definition: mount.def });
    notice(`mounted ${mount.def.name} (rider pose ${mount.rider.getStatus().supported ? 'ok' : mount.rider.getStatus().reason})`);
  }
}

// ------------------------------------------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!player) return;
  if (dodgeTaps.keyDown(k, performance.now(), { repeat: e.repeat }) && !mounted) { dodgeFromKey(k); e.preventDefault(); return; }
  if (k === ' ') {
    if (mounted) { if (!e.repeat) notice(mount?.actions.fly ? `flight: ${mountFlight.toggle()}` : 'this mount cannot fly'); }
    else if (!e.repeat && playerAnim.requestJump()) notice('jump');
    e.preventDefault();
  }
  if (k === 'r' && !e.repeat && !mounted) rollFromKey();
  if (k === 't' && !e.repeat) { rollVariant = !rollVariant; notice(`roll variant ${rollVariant ? 'ON' : 'OFF'}`); }
  if (k === '1' && !e.repeat) castSkill('sword');
  if (k === '2' && !e.repeat) castSkill('bow');
  if (k === 'l' && !e.repeat) levelUp();
  if (k === 'f' && !e.repeat) toggleMount();
});
addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; dodgeTaps.keyUp(k); });
addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; dodgeTaps.reset(); });
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => { if (!drag) return; orbit.yaw -= (e.clientX - drag.x) * 0.006; orbit.pitch = Math.max(-0.2, Math.min(1.2, orbit.pitch + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('wheel', (e) => { orbit.distance = Math.max(2.2, Math.min(14, orbit.distance + e.deltaY * 0.005)); });

// ------------------------------------------------------------------------------------------------- buttons
const button = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };
for (const b of ['male', 'female']) { const a = document.createElement('a'); a.textContent = `body: ${b}`; a.href = `?body=${b}&mount=${mountId}`; bar.appendChild(a); }
for (const m of ['faction_tiger', 'faction_armored_wolf', 'faction_bear', 'none']) { const a = document.createElement('a'); a.textContent = `mount: ${m}`; a.href = `?body=${bodyName}&mount=${m}`; bar.appendChild(a); }
const dodgeButton = (dir, key) => button(`dodge ${dir} (${key}${key})`, () => { if (!mounted && player) dodgeFromKey(key); });
dodgeButton('forward', 'w'); dodgeButton('left', 'a'); dodgeButton('back', 's'); dodgeButton('right', 'd');
button('roll R', () => { if (!mounted && player) rollFromKey(); });
button('toggle roll variant (T)', () => { rollVariant = !rollVariant; notice(`roll variant ${rollVariant ? 'ON' : 'OFF'}`); });
button('skill sword (1)', () => castSkill('sword')); button('skill bow (2)', () => castSkill('bow')); button('level up (L)', levelUp);
button('mount (F)', toggleMount); button('fly (Space)', () => { if (mounted) notice(`flight: ${mountFlight.toggle()}`); });
button('screenshot', () => shot(`manual-${Date.now()}.png`));

async function shot(name) {
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL('image/png');
  const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
  log('shot', name, res.ok ? 'saved' : 'failed');
}

// ------------------------------------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let fps = 0, frames = 0, fpsAt = performance.now();
let stepping = false; // a demo drives tick() itself
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  frames++; if (performance.now() - fpsAt > 500) { fps = frames * 1000 / (performance.now() - fpsAt); frames = 0; fpsAt = performance.now(); }
  if (!stepping) tick(delta);
  renderer.render(scene, camera);
}
function tick(delta) {
  if (player && playerAnim) {
    const { forward, right } = getPlanarBasisFromYaw(orbit.yaw);
    const move = new THREE.Vector3();
    if (keys.w) move.add(forward); if (keys.s) move.sub(forward); if (keys.a) move.sub(right); if (keys.d) move.add(right);
    const isMoving = move.lengthSq() > 0, isRunning = !!keys.shift && isMoving, isSprinting = !!keys.control && isMoving;
    const speed = (isSprinting ? SPRINT_SPEED : isRunning ? RUN_SPEED : WALK_SPEED) * (mounted ? (mount?.def.speedMultiplier || 1) * mountFlight.speedMultiplier() : 1);
    const overridden = playerAnim.isMovementOverridden();
    if (isMoving && !overridden) {
      move.normalize();
      player.root.position.x += move.x * speed * delta; player.root.position.z += move.z * speed * delta;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(move.x, move.z));
      player.root.quaternion.slerp(q, ROT_SMOOTH);
    }
    gestures.preUpdate();
    playerAnim.updateMotion(player.root, delta, 0, (dx, dz) => { player.root.position.x += dx; player.root.position.z += dz; return 0; });
    playerAnim.updateActionState({ moving: isMoving, running: isRunning, sprinting: isSprinting, direction: 'forward', aiming: false });
    if (isMoving && !mounted) syncFusedLocomotion(playerAnim, player.model, speed);
    playerAnim.updateAnimation(delta);
    mixer.update(delta);
    if (mount) {
      mount.mixer.update(delta);
      if (mounted) {
        mount.root.position.x = player.root.position.x; mount.root.position.z = player.root.position.z;
        const flight = mountFlight.update(delta, { mounted: true, moving: isMoving });
        mountTargetQuat.copy(player.root.quaternion);
        if (flight.flying) mountTargetQuat.multiply(mountPitchQuat.setFromAxisAngle(MOUNT_PITCH_AXIS, flight.pitch));
        mount.root.quaternion.slerp(mountTargetQuat, ROT_SMOOTH);
        mount.root.position.y = flight.altitude; player.root.position.y = flight.altitude;
        playMount(flight.airborne ? 'fly' : isMoving ? 'run' : 'idle');
        mount.secondaryRig.update(delta, { flying: mountFlight.isAirborne() });
        mount.rider?.update();
      } else { mountFlight.land(true); playMount('idle'); mount.secondaryRig.update(delta); }
    }
    gestures.update();
    for (let i = effects.length - 1; i >= 0; i--) { const fx = effects[i]; fx.update(delta); if (!fx.alive()) { fx.dispose(); effects.splice(i, 1); } }
    const target = player.root.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    camera.position.set(target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.distance, target.y + Math.sin(orbit.pitch) * orbit.distance, target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.distance);
    camera.lookAt(target);
    const state = playerAnim.getCurrent();
    const action = playerAnim.actions?.[state];
    const debug = playerAnim.getDebugState();
    hud.textContent = [
      `${bodyName} (${player.rigId})  mount: ${mount ? mount.def.name : 'none'}${mounted ? ' [riding]' : ''}  fps ${fps.toFixed(0)}`,
      `state ${state}  clip ${action?.getClip().name || '-'}  source ${clipSources[state] || '-'}  timeScale ${action?.getEffectiveTimeScale().toFixed(2) || '-'}  t ${action?.time.toFixed(2) || '-'}`,
      `root y ${player.root.position.y.toFixed(2)}  hop ${(debug.hopOffset || 0).toFixed(2)}  busy ${debug.isBusy}  speed ${isMoving ? speed.toFixed(1) : 0} m/s  roll variant ${rollVariant ? 'ON' : 'off'}`,
      mount ? `mount anim ${mount.current}  flight ${mountFlight.getPhase()} alt ${mountFlight.getAltitude().toFixed(2)} m  fly clip ${mount.actions.fly ? 'yes' : 'no'}` : '',
      performance.now() < flashUntil ? `» ${flashText}` : '',
      'WASD move · Shift run · Ctrl sprint · double-tap WASD dodge · R roll · T roll variant · 1/2 skill · L level up · F mount · Space jump / fly',
    ].join('\n');
  }
}
animate();
// advance the world by `seconds` in fixed 1/60 steps (demo mode); renders once at the end
function advance(seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) tick(1 / 60);
  renderer.render(scene, camera);
}
window.__preview.tick = tick; window.__preview.advance = advance;

// ------------------------------------------------------------------------------------------------- demos
const sleep = (ms) => new Promise((r) => { advance(ms / 1000); setTimeout(r, 0); });
async function runDemo(name) {
  const tag = `${bodyName}-${name}${useFallback ? '-fallback' : ''}`;
  stepping = true;
  await sleep(600);
  if (name === 'dodges') {
    for (const [key, dir] of [['w', 'forward'], ['a', 'left'], ['s', 'back'], ['d', 'right']]) {
      player.root.position.set(0, 0, 0); player.root.quaternion.identity();
      dodgeFromKey(key); await sleep(260); await shot(`${tag}-${dir}-a.png`); await sleep(220); await shot(`${tag}-${dir}-b.png`); await sleep(900);
    }
    rollVariant = true;
    for (const [key, dir] of [['w', 'rollfwd'], ['s', 'rollback']]) {
      player.root.position.set(0, 0, 0); player.root.quaternion.identity();
      dodgeFromKey(key); await sleep(300); await shot(`${tag}-${dir}-a.png`); await sleep(260); await shot(`${tag}-${dir}-b.png`); await sleep(900);
    }
    rollVariant = false;
    player.root.position.set(0, 0, 0); player.root.quaternion.identity();
    rollFromKey(); await sleep(420); await shot(`${tag}-r-alone.png`); await sleep(900);
  } else if (name === 'sprint') {
    player.root.position.set(-60, 0, -70); // an open lane with no posts in the camera line
    keys.w = true; keys.control = true;await sleep(900); await shot(`${tag}-sprint-a.png`); await sleep(180); await shot(`${tag}-sprint-b.png`);
    keys.control = false; keys.shift = true; await sleep(700); await shot(`${tag}-run.png`); keys.shift = false; await sleep(600); await shot(`${tag}-walk.png`); keys.w = false;
  } else if (name === 'moments') {
    castSkill('sword'); await sleep(240); await shot(`${tag}-skill-sword.png`); await sleep(900);
    castSkill('bow'); await sleep(240); await shot(`${tag}-skill-bow.png`); await sleep(900);
    levelUp(); await sleep(500); await shot(`${tag}-levelup-a.png`); await sleep(700); await shot(`${tag}-levelup-b.png`);
  } else if (name === 'flight') {
    const height = (label) => log(label, 'airborne', mountFlight.isAirborne(), 'altitude', mount.root.position.y.toFixed(2), 'm, clip', mount.current);
    toggleMount(); await sleep(500); await shot(`${tag}-${mountId}-mounted.png`);
    keys.w = true; await sleep(800); await shot(`${tag}-${mountId}-ride.png`);
    notice(`flight: ${mountFlight.toggle()}`); await sleep(1400); await shot(`${tag}-${mountId}-fly-a.png`); height('fly-a'); await sleep(300); await shot(`${tag}-${mountId}-fly-b.png`);
    keys.w = false; await sleep(900); await shot(`${tag}-${mountId}-hover.png`); height('hover');
    notice(`flight: ${mountFlight.toggle()}`); await sleep(1500); await shot(`${tag}-${mountId}-landed.png`); height('landed');
    toggleMount();
  }
  stepping = false;
  log('demo done', name);
  window.__demoDone = name;
}

// ------------------------------------------------------------------------------------------------- boot
(async () => {
  try {
    player = await loadBody(bodyName);
    scene.add(player.root);
    mixer = new THREE.AnimationMixer(player.root);
    playerAnim = createLunaDashboardPlayerController({ mixer });
    playerAnim.bindClips(initialPlayerAnimationClips(player.model));
    const describe = (clips) => { clipSources = {}; for (const [k, c] of Object.entries(clips)) clipSources[k] = c.userData?.mobilityPack ? 'pack' : c.userData?.montage ? 'montage' : c.userData?.generatedFallback ? 'fallback' : c.userData?.author ? 'native' : 'clip'; };
    describe(initialPlayerAnimationClips(player.model));
    const { clipsByKey } = await loadPlayerAnimationClips({ load() {} }, player.model, { onMontageReady: (clips) => { playerAnim.bindClips(clips); describe(clips); log('rebound', Object.keys(clips).length, 'clips'); } });
    playerAnim.bindClips(clipsByKey); describe(clipsByKey);
    log('clips', Object.entries(clipSources).filter(([, s]) => s === 'pack').map(([k]) => k).join(' '), '← pack');
    log('sprint', clipsByKey.sprint?.name, clipsByKey.sprint?.userData);
    if (mountId !== 'none') mount = await loadMount(mountId).catch((e) => { log('mount failed', e.message); return null; });
    window.__preview.playerAnim = playerAnim; window.__preview.player = player; window.__preview.getMount = () => mount; window.__preview.mountFlight = mountFlight;
    window.__previewReady = true;
    if (Q.get('demo')) runDemo(Q.get('demo'));
  } catch (error) { log('boot failed', error.message); console.error(error); }
})();
