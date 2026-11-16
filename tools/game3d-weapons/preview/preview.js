// Weapon grip preview: the real runtime (src/components/game3d/weapons/playerWeaponRuntime.js) on the real
// character GLBs, posed with their embedded clips. Grid mode renders every weapon of a set in idle / walk /
// run / attack and a hand close-up; live mode plays one clip in a loop with arrows or blade trails.
//   ?rig=fused-female-v1|fused-male-v1|artemis-v5|getsuga-v5  &set=swords|bows  &cols=idle,walk,run,attack,hand
//   ?mode=live&rig=...&weapon=fantasy_bow&clip=Rain_Of_Arrows
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPlayerWeaponRuntime, loadWeaponManifest, findWeaponRig } from '../../../src/components/game3d/weapons/playerWeaponRuntime.js';
import { createCombatWeaponTrails } from '../../../src/components/game3d/vfx/CombatWeaponTrails.jsx';

const RIG_URLS = {
  'fused-female-v1': '/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': '/models/characters/fused/Male_Fused_v2.glb',
  'artemis-v5': '/models/characters/Artemis_Character_v5.glb',
  'getsuga-v5': '/models/characters/Getsuga_Tensho_Character_v5.glb',
};
// Attack frames from the clips each body carries (the admin Mixamo combat clips need a Base44 session).
const ATTACK = {
  'fused-female-v1': { sword: ['Lunar_Beam', 2.87], bow: ['Rain_Of_Arrows', 0.27] },
  'artemis-v5': { sword: ['Lunar_Beam', 2.87], bow: ['Rain_Of_Arrows', 0.27] },
  'fused-male-v1': { sword: ['GetsugaTensho', 1.1], bow: ['Combat_Idle', 0.5] },
  'getsuga-v5': { sword: ['GetsugaTensho', 1.1], bow: ['Combat_Idle', 0.5] },
};
const params = new URLSearchParams(location.search);
const rigKey = params.get('rig') || 'fused-female-v1';
const mode = params.get('mode') || 'grid';
const report = document.getElementById('report');
const log = [];
const out = (s) => { log.push(s); report.textContent = log.join('\n'); };

document.getElementById('nav').innerHTML = Object.keys(RIG_URLS).flatMap((r) => ['swords', 'bows']
  .map((s) => `<a href="?rig=${r}&set=${s}">${r} ${s}</a>`)).join('');

function skinnedBox(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((n) => { if (n.isSkinnedMesh) box.expandByObject(n); });
  return box.isEmpty() ? box.setFromObject(root) : box;
}

async function loadRig(scene) {
  const gltf = await new GLTFLoader().loadAsync(RIG_URLS[rigKey]);
  const model = gltf.scene;
  model.animations = gltf.animations;
  const rigId = gltf.parser.json.extras?.rigId;
  if (rigId) { model.userData.rigId = rigId; model.userData.fusedCharacter = /^fused-/.test(rigId); }
  // same normalisation as loadAvatarModel: 1.7 m tall, feet on the ground
  let box = skinnedBox(model);
  model.scale.multiplyScalar(1.7 / (box.max.y - box.min.y));
  box = skinnedBox(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  model.traverse((n) => { if (n.isSkinnedMesh) n.frustumCulled = false; });
  scene.add(model);
  return model;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x34373d);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.0);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 1 }));
  scene.add(ground, new THREE.GridHelper(8, 16, 0x777777, 0x555555));
  return scene;
}

function pose(model, mixer, clipName, t) {
  mixer.stopAllAction();
  const clip = model.animations.find((c) => c.name === clipName);
  if (!clip) return false;
  const action = mixer.clipAction(clip);
  action.reset().play();
  mixer.setTime(Math.min(t, clip.duration - 1e-3));
  model.updateMatrixWorld(true);
  return true;
}

function frame(camera, model, shot, weapon, runtime) {
  const side = weapon.hand === 'left' ? 1 : -1; // the character faces +Z; its right is -X
  if (shot.cam === 'hand') {
    const hand = runtime.getRoot()?.parent;
    const p = hand ? hand.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1, 0);
    camera.fov = 22;
    camera.position.set(p.x + side * 0.55, p.y + 0.18, p.z + 0.75);
    camera.lookAt(p.x, p.y - 0.08, p.z);
  } else if (shot.cam === 'side') {
    camera.fov = 30;
    camera.position.set(side * 4.2, 1.05, 0.2);
    camera.lookAt(0, 0.88, 0);
  } else {
    camera.fov = 30;
    const a = THREE.MathUtils.degToRad(38);
    camera.position.set(side * Math.sin(a) * 4.4, 1.15, Math.cos(a) * 4.4);
    camera.lookAt(0, 0.9, 0);
  }
  camera.updateProjectionMatrix();
}

function shotFor(name, weapon) {
  const cls = weapon.class === 'bow' ? 'bow' : 'sword';
  switch (name) {
    case 'idle': return { clip: 'Idle', t: 1.0, stance: 'carry', cam: 'full' };
    case 'walk': return { clip: 'Walk', t: 0.55, stance: 'carry', cam: 'full' };
    case 'run': return { clip: 'Run', t: 0.3, stance: 'carry', cam: 'full' };
    case 'side': return { clip: 'Idle', t: 1.0, stance: 'carry', cam: 'side' };
    case 'attack': { const [clip, t] = ATTACK[rigKey][cls]; return { clip, t, stance: 'combat', cam: 'full', drawing: cls === 'bow' }; }
    case 'hand': return { clip: 'Idle', t: 1.0, stance: 'carry', cam: 'hand' };
    case 'combatHand': { const [clip, t] = ATTACK[rigKey][cls]; return { clip, t, stance: 'combat', cam: 'hand', drawing: cls === 'bow' }; }
    default: return { clip: 'Idle', t: 1, stance: 'carry', cam: 'full' };
  }
}

async function grid() {
  const manifest = await loadWeaponManifest();
  const set = params.get('set') || 'swords';
  const weapons = manifest.weapons.filter((w) => (set === 'bows' ? w.class === 'bow' : set === 'all' ? true : w.class !== 'bow'));
  const cols = (params.get('cols') || 'idle,walk,run,attack,hand').split(',');
  const cw = Number(params.get('cw') || 260);
  const ch = Number(params.get('ch') || 360);
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * cols.length, ch * weapons.length);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${cols.length}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  const scene = makeScene();
  const model = await loadRig(scene);
  const rig = findWeaponRig(model, manifest);
  out(`rig ${rigKey} -> manifest rig ${rig}; clips: ${model.animations.map((c) => c.name).join(', ')}`);
  const mixer = new THREE.AnimationMixer(model);
  const runtime = createPlayerWeaponRuntime({ model, scene, manifest });
  const camera = new THREE.PerspectiveCamera(30, cw / ch, 0.05, 50);
  renderer.setScissorTest(true);
  for (const [row, w] of weapons.entries()) {
    const ok = await runtime.equip(w.id);
    for (const [col, name] of cols.entries()) {
      const shot = shotFor(name, w);
      const posed = pose(model, mixer, shot.clip, shot.t);
      runtime.setStanceWeight(shot.stance === 'combat' ? 1 : 0);
      runtime.setNocked(!!shot.drawing);
      runtime.update(0, { drawing: !!shot.drawing });
      model.updateMatrixWorld(true);
      frame(camera, model, shot, w, runtime);
      const x = col * cw;
      const y = (weapons.length - 1 - row) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, camera);
      const box = new THREE.Box3().setFromObject(runtime.getRoot() || new THREE.Object3D());
      const size = box.getSize(new THREE.Vector3());
      const label = document.createElement('div');
      label.textContent = `${w.id} · ${name}${posed ? '' : ' (no clip)'} · low ${box.min.y.toFixed(2)} m`;
      labels.appendChild(label);
      if (col === 0) out(`${w.id}: equipped ${ok}; world size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m (manifest length ${w.length} m)`);
      if (box.min.y < 0.02) out(`  ! ${w.id} ${name}: lowest point ${box.min.y.toFixed(3)} m (ground contact)`);
    }
  }
  // keep the grid: labels are burnt in so the saved PNG stands on its own
  const shot = document.createElement('canvas');
  shot.width = canvas.width;
  shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif';
  g.fillStyle = '#f4efe2';
  g.shadowColor = '#000';
  g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, (i % cols.length) * cw + 6, Math.floor(i / cols.length) * ch + 16));
  const name = `${rigKey}-${set}-${cols.join('_')}.png`;
  const saved = await fetch(`/__shot?name=${name}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text()).catch(() => 'not saved');
  out(`saved ${saved}`);
  out('done');
  document.title = `grid ${rigKey} ${set} done`;
}

async function live() {
  const manifest = await loadWeaponManifest();
  const weaponId = params.get('weapon') || 'fantasy_sword';
  const clipName = params.get('clip') || 'Idle';
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(900, 700);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = makeScene();
  const model = await loadRig(scene);
  const mixer = new THREE.AnimationMixer(model);
  const runtime = createPlayerWeaponRuntime({ model, scene, manifest });
  await runtime.equip(weaponId);
  const weapon = manifest.weapons.find((w) => w.id === weaponId);
  const trails = createCombatWeaponTrails({ scene });
  const clip = model.animations.find((c) => c.name === clipName) || model.animations[0];
  mixer.clipAction(clip).play();
  const camera = new THREE.PerspectiveCamera(32, 900 / 700, 0.05, 80);
  const side = weapon.hand === 'left' ? 1 : -1;
  camera.position.set(side * 2.6, 1.5, 4.2);
  camera.lookAt(0, 0.9, 2);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd04040 }));
  target.position.set(0.4, 1.3, 9);
  scene.add(target);
  const clock = new THREE.Clock();
  let cycle = 0;
  let fired = 0;
  let swung = 0;
  const events = clip.userData?.events || {};
  const shotTimes = Object.entries(events).filter(([k]) => /Shot|Release/.test(k)).map(([, v]) => v);
  out(`live ${rigKey} ${weaponId} ${clip.name} (${clip.duration.toFixed(2)} s); shots at ${shotTimes.join(', ') || 'every 1.2 s'}`);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    mixer.update(dt);
    const t = mixer.clipAction(clip).time;
    if (t < cycle) { fired = 0; swung = 0; }
    cycle = t;
    const isBow = weapon.class === 'bow';
    const nextShot = shotTimes.length ? shotTimes[fired] : (fired + 1) * 1.2 - 0.25;
    const drawing = isBow && nextShot !== undefined && t > nextShot - 0.25 && t < nextShot;
    runtime.setNocked(drawing);
    runtime.update(dt, { state: drawing ? 'drawArrow' : (isBow ? null : 'meleeAttack'), drawing });
    if (isBow && nextShot !== undefined && t >= nextShot) { runtime.fireArrow({ target: target.position }); fired++; }
    if (!isBow && t > (swung + 1) * 0.9) {
      trails.emit({ actor: model, weaponPath: 'melee', hitIndex: swung, blade: runtime.getBladeAnchors() });
      swung++;
    }
    trails.update(dt);
    renderer.render(scene, camera);
  });
}

// ---------- summon: the real player animation path, stepped at a fixed 60 Hz ----------
//   ?mode=summon&rig=fused-female-v1&weapon=fantasy_sword|daggers&family=sword|bow|dual_blades
//   &moving=1 (walk while drawing)  &melt=1 (Space after it formed)  &mount=tiger (riding)  &times=0.1,0.3,...
async function summonStrip() {
  const { createLunaDashboardPlayerController } = await import('../../../src/components/game3d/player/LunaDashboardPlayerController.jsx');
  const { initialPlayerAnimationClips } = await import('../../../src/components/game3d/player/playerAnimationLibrary.jsx');
  const { loadUploadedAnimationMontage } = await import('../../../src/components/game3d/player/uploadedAnimationMontage.mjs');
  const { createPlayerWeaponSummon, resolveSpaceAction } = await import('../../../src/components/game3d/weapons/playerWeaponSummon.js');
  const manifest = await loadWeaponManifest();
  const weapon = params.get('weapon') || 'fantasy_sword';
  const family = params.get('family') || (weapon === 'daggers' ? 'dual_blades' : manifest.weapons.find((w) => w.id === weapon)?.class === 'bow' ? 'bow' : 'sword');
  const moving = params.get('moving') === '1';
  const melt = params.get('melt') === '1';
  const mountKind = params.get('mount');
  const times = (params.get('times') || (melt ? '0.05,0.2,0.35,0.5,0.65,0.85' : '0.08,0.22,0.36,0.5,0.66,0.84,1.1,2.4')).split(',').map(Number);
  const cw = Number(params.get('cw') || 300);
  const ch = Number(params.get('ch') || 400);
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * times.length, ch);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${times.length}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  const scene = makeScene();
  const model = await loadRig(scene);
  const mixer = new THREE.AnimationMixer(model);
  const playerAnim = createLunaDashboardPlayerController({ mixer, oneShotRef: { current: false } });
  const initial = initialPlayerAnimationClips(model);
  playerAnim.bindClips(initial);
  // &native=1 keeps the body's own clips (main's uploaded montage currently decodes turned / sunk on fused bodies)
  const montage = params.get('native') === '1' ? {} : await loadUploadedAnimationMontage(model).catch((e) => { out(`montage not loaded: ${e.message}`); return {}; });
  if (Object.keys(montage).length) playerAnim.bindClips({ ...initial, ...montage });
  out(`${rigKey}: ${Object.keys(montage).length} montage clips bound; weapon ${weapon} (${family})${moving ? ', walking' : ''}${melt ? ', then Space' : ''}${mountKind ? `, riding ${mountKind}` : ''}`);
  const runtime = createPlayerWeaponRuntime({ model, scene, manifest });
  const camera = new THREE.PerspectiveCamera(34, cw / ch, 0.05, 50);
  const summon = createPlayerWeaponSummon({ model, scene, runtime, renderer, getPixelScale: () => ch / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) });
  const item = family === 'dual_blades' ? { instanceId: 'dev-daggers', masteryWeaponId: 'dual_blades' }
    : family === 'bow' && weapon === 'training' ? { instanceId: 'dev-training', modelUrl: '/game3d/test-gear/training-bow.glb' }
      : { instanceId: `dev-${weapon}`, appearance: { weaponModelId: weapon } };
  // riding: the real seat pose and the mount's own weapon presenter
  let rider = null;
  let mountedWeapon = null;
  let lastMounted = null;
  if (mountKind) {
    const { createMountedRiderPose } = await import('../../../src/components/game3d/player/mountedRiderPose.mjs');
    const { createMountedWeaponPresentation } = await import('../../../src/components/game3d/player/mountedWeaponPresentation.mjs');
    const { GAME3D_FACTION_MOUNTS } = await import('../../../src/components/game3d/axe/factions/AXEFactionMountAssets.mjs');
    const def = Object.values(GAME3D_FACTION_MOUNTS).find((m) => m.companionId.includes(mountKind)) || GAME3D_FACTION_MOUNTS.AXE_Faction_3;
    const gltf = await new GLTFLoader().loadAsync(def.modelUrl);
    const mount = gltf.scene;
    const box = new THREE.Box3().setFromObject(mount);
    const size = box.getSize(new THREE.Vector3());
    mount.scale.setScalar((1.7 / Math.max(size.x, size.y, size.z)) * (def.scale || 1));
    mount.position.set(0, 0, 0);
    mount.traverse((n) => { if (n.isSkinnedMesh) n.frustumCulled = false; });
    scene.add(mount);
    mount.updateWorldMatrix(true, true);
    playerAnim.setMounted(true);
    rider = createMountedRiderPose({ player: model, mount, definition: { id: def.companionId } });
    mountedWeapon = createMountedWeaponPresentation({ player: model });
    summon.setSuspended(true);
    out(`mount ${def.name}: rider pose ${rider.getStatus?.().supported !== false ? 'seated' : 'unsupported'}`);
  }
  let drawItem = null;
  const step = (dt) => {
    summon.preUpdate();
    summon.sync(drawItem, family);
    playerAnim.setEquipmentContext({ weaponType: drawItem ? family : 'unarmed', summon: true, equipped: !!drawItem && summon.isOut() });
    playerAnim.updateActionState({ moving, running: false, direction: 'forward' });
    playerAnim.updateAnimation(dt);
    mixer.update(dt);
    playerAnim.updateMotion(model, dt, model.position.y);
    summon.update(dt, { state: playerAnim.getCurrent(), moving, inCombat: true, externalRoot: model.getObjectByName('AXE_Equipped_Training_Bow') });
    if (rider) {
      rider.update();
      mountedWeapon.update({ item: drawItem, family });
      const obj = mountedWeapon.getStatus().object;
      if (obj && obj !== lastMounted) summon.constructOn(obj, family === 'bow' ? 'bow' : 'blade');
      lastMounted = obj;
    }
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  // warm up with nothing drawn (world entry), let the GLB cache fill, then draw at t = 0
  summon.sync(null, family);
  if (item.appearance) { await runtime.equip(item.appearance.weaponModelId); runtime.unequip(); }
  for (let i = 0; i < 60; i++) step(1 / 60);
  drawItem = params.get('nodraw') === '1' ? null : item;
  step(1 / 60);
  await settle(); await settle();
  let t = 0;
  const states = new Set();
  const frame = (shot) => {
    model.updateMatrixWorld(true);
    const side = family === 'bow' ? 1 : -1;
    const hand = runtime.getRoots()[0]?.parent || model.getObjectByName(family === 'bow' ? 'mixamorigLeftHand' : 'mixamorigRightHand') || model;
    const p = hand.getWorldPosition(new THREE.Vector3());
    const close = params.get('cam') !== 'body';
    camera.position.set(p.x + side * (close ? 1.15 : 2.2), p.y + (close ? 0.25 : 0.35), p.z + (close ? 1.75 : 3.4));
    camera.lookAt(p.x, p.y + (close ? 0.12 : 0), p.z);
    camera.updateProjectionMatrix();
    const x = shot * cw;
    renderer.setViewport(x, 0, cw, ch);
    renderer.setScissor(x, 0, cw, ch);
    renderer.render(scene, camera);
  };
  let meltAt = null;
  for (const [i, target] of times.entries()) {
    if (melt && meltAt === null) {
      // let it form completely, then press Space
      while (t < 2.2) { step(1 / 60); t += 1 / 60; states.add(playerAnim.getCurrent()); }
      const action = resolveSpaceAction({ weaponOut: summon.isOut(), mounted: !!mountKind });
      out(`Space with the weapon out -> ${action}`);
      if (action === 'dismiss') summon.dismiss();
      meltAt = t;
    }
    const until = (meltAt ?? 0) + target;
    while (t < until) { step(1 / 60); t += 1 / 60; states.add(playerAnim.getCurrent()); await (t % 0.25 < 1 / 60 ? settle() : null); }
    frame(i);
    if (params.get('debug') === '1') {
      const w = (n) => model.getObjectByName(n)?.getWorldPosition(new THREE.Vector3()).toArray().map((x) => x.toFixed(2)).join(',');
      const root = runtime.getRoots()[0];
      out(`t+${target}: RightHand ${w('mixamorigRightHand')} LeftHand ${w('mixamorigLeftHand')} weapon ${root ? root.getWorldPosition(new THREE.Vector3()).toArray().map((x) => x.toFixed(2)).join(',') : '-'} parent ${root?.parent?.name}`);
    }
    const label = document.createElement('div');
    label.textContent = `${melt ? 'melt' : 'draw'} +${target.toFixed(2)} s · ${playerAnim.getCurrent()}${summon.isAnimating() ? ' · fx' : ''}`;
    labels.appendChild(label);
  }
  out(`animation states seen: ${[...states].join(', ')}`);
  out(`weapon out: ${summon.isOut()}; held: ${JSON.stringify(runtime.getCurrent())}; droplets alive at end: ${summon.isAnimating()}`);
  const shot = document.createElement('canvas');
  shot.width = canvas.width;
  shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif';
  g.fillStyle = '#f4efe2';
  g.shadowColor = '#000';
  g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, i * cw + 6, 16));
  const name = `summon-${rigKey}-${weapon}${moving ? '-walk' : ''}${melt ? '-melt' : ''}${mountKind ? `-mount-${mountKind}` : ''}${params.get('native') === '1' ? '-native' : ''}.png`;
  const saved = await fetch(`/__shot?name=${name}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text()).catch(() => 'not saved');
  out(`saved ${saved}`);
  document.title = `summon ${rigKey} ${weapon} done`;
}

// ---------- montage: the owner-uploaded clips as the game decodes them, one cell per clip ----------
//   ?mode=montage&rig=fused-female-v1&clips=idle,idleArmed,walk,equipBow&at=0.5 (fraction of each clip)
async function montageSheet() {
  const { loadUploadedAnimationMontage } = await import('../../../src/components/game3d/player/uploadedAnimationMontage.mjs');
  const { initialPlayerAnimationClips } = await import('../../../src/components/game3d/player/playerAnimationLibrary.jsx');
  const keys = (params.get('clips') || 'idle,idleArmed,idleLook,walk,run,equipBow,disarmBow,drawArrow').split(',');
  const at = Number(params.get('at') || 0.5);
  const cw = 260; const ch = 380;
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * keys.length, ch);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const scene = makeScene();
  const model = await loadRig(scene);
  const montage = await loadUploadedAnimationMontage(model);
  const native = initialPlayerAnimationClips(model);
  const mixer = new THREE.AnimationMixer(model);
  const camera = new THREE.PerspectiveCamera(30, cw / ch, 0.05, 50);
  camera.position.set(-1.6, 1.25, 3.6);
  camera.lookAt(0, 0.9, 0);
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${keys.length}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  keys.forEach((key, i) => {
    const source = key.startsWith('native:') ? native[key.slice(7)] : montage[key];
    mixer.stopAllAction();
    if (source) { mixer.clipAction(source).reset().play(); mixer.setTime(source.duration * at); }
    model.updateMatrixWorld(true);
    renderer.setViewport(i * cw, 0, cw, ch);
    renderer.setScissor(i * cw, 0, cw, ch);
    renderer.render(scene, camera);
    const label = document.createElement('div');
    label.textContent = `${key}${source ? ` ${source.duration.toFixed(2)} s` : ' (missing)'}`;
    labels.appendChild(label);
  });
  const shot = document.createElement('canvas');
  shot.width = canvas.width; shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif'; g.fillStyle = '#f4efe2'; g.shadowColor = '#000'; g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, i * cw + 6, 16));
  const name = `montage-${rigKey}-${keys.length}clips-at${at}.png`;
  out(`saved ${await fetch(`/__shot?name=${name}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text())}`);
  document.title = `montage ${rigKey} done`;
}

// ---------- combo: the baked 3-hit sword / bow combos, one row per hit ----------
//   ?mode=combo&rig=fused-female-v1&weapon=fantasy_sword|fantasy_bow|daggers&cam=front|side|back&cols=7
async function comboSheet() {
  const { bakeWeaponComboClips, comboKindForWeapon } = await import('../../../src/components/game3d/weapons/weaponComboClips.js');
  const manifest = await loadWeaponManifest();
  const weaponId = params.get('weapon') || 'fantasy_sword';
  const camKind = params.get('cam') || 'front';
  const cols = Number(params.get('cols') || 7);
  const cw = Number(params.get('cw') || 230);
  const ch = Number(params.get('ch') || 330);
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * cols, ch * 3);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${cols}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  const scene = makeScene();
  const model = await loadRig(scene);
  const runtime = createPlayerWeaponRuntime({ model, scene, manifest });
  const ok = weaponId === 'daggers' ? await runtime.equipDaggers() : await runtime.equip(weaponId);
  const cls = runtime.getCurrent()?.cls || 'sword';
  const grips = Object.fromEntries(runtime.getHands().map((h) => [h.side, h.gripQuaternion]));
  const t0 = performance.now();
  const clips = bakeWeaponComboClips(model, cls, grips, { reach: runtime.getCurrent()?.length }); // as the game's binder
  const bakeMs = performance.now() - t0;
  const names = Object.keys(clips);
  out(`${rigKey} ${weaponId} (${cls}, equipped ${ok}) -> ${comboKindForWeapon(cls)}: ${names.map((n) => `${n} ${clips[n].duration.toFixed(2)} s/${clips[n].tracks.length} tracks`).join(', ')}; baked in ${bakeMs.toFixed(1)} ms`);
  const mixer = new THREE.AnimationMixer(model);
  const camera = new THREE.PerspectiveCamera(30, cw / ch, 0.05, 50);
  const camPos = camKind === 'side' ? new THREE.Vector3(-4.2, 1.2, 0.3) : camKind === 'back' ? new THREE.Vector3(-1.9, 1.7, -3.8)
    : camKind === 'high' ? new THREE.Vector3(1.5, 3.1, 3.3) : camKind === 'left' ? new THREE.Vector3(2.6, 1.4, 3.2)
      : camKind === 'top' ? new THREE.Vector3(0.01, 5.2, 0.9) : new THREE.Vector3(-2.2, 1.45, 3.7);
  camera.position.copy(camPos);
  camera.lookAt(0, 0.95, 0.15);
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0.25), 1.1, 0xff4040, 0.2, 0.1)); // facing (+Z)
  const tipPath = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fd4ff }));
  tipPath.frustumCulled = false;
  scene.add(tipPath);
  const wristBend = (fore, hand) => {
    const f = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
    // the hand's own long axis: wrist -> middle knuckle
    const child = hand.children.find((c) => /Middle1$|^fingers_/.test(c.name)) || hand.children.find((c) => c.isBone && c.position.lengthSq() > 1e-10);
    if (!child) return 0;
    const h = child.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(f.dot(h), -1, 1)));
  };
  const bone = (n) => model.getObjectByName(n);
  names.forEach((name, row) => {
    const clip = clips[name];
    const action = mixer.clipAction(clip);
    const { hit, sweep, cancel } = clip.userData;
    // the tip's path over the whole clip
    const path = [];
    for (let i = 0; i <= 40; i++) {
      mixer.stopAllAction(); action.reset().play(); mixer.setTime((clip.duration * i) / 40);
      model.updateMatrixWorld(true);
      runtime.setStanceWeight(1);
      runtime.update(0, { state: name, drawing: false });
      const tip = runtime.getBladeAnchors()?.tip;
      if (tip) path.push(tip.getWorldPosition(new THREE.Vector3()));
    }
    tipPath.geometry.dispose();
    tipPath.geometry = new THREE.BufferGeometry().setFromPoints(path);
    tipPath.visible = path.length > 1;
    const times = [...new Set([0, ...(sweep || []), hit, cancel, clip.duration * 0.999,
      ...Array.from({ length: cols }, (_, i) => (clip.duration * i) / (cols - 1))].map((t) => +t.toFixed(3)))].sort((a, b) => a - b);
    // keep the key moments, fill the rest evenly
    const must = new Set([0, hit, ...(sweep || [])].map((t) => +t.toFixed(3)));
    let picked = times.filter((t) => must.has(t));
    for (const t of times) { if (picked.length >= cols) break; if (!picked.includes(t) && picked.every((p) => Math.abs(p - t) > clip.duration / (cols * 1.6))) picked.push(t); }
    picked = picked.sort((a, b) => a - b).slice(0, cols);
    const notes = [];
    picked.forEach((t, col) => {
      mixer.stopAllAction(); action.reset().play(); mixer.setTime(t);
      model.updateMatrixWorld(true);
      const drawing = cls === 'bow' && t < hit && t > 0.05;
      runtime.setNocked(drawing);
      runtime.update(1 / 60, { state: name, drawing });
      for (let i = 0; i < 12; i++) runtime.update(1 / 60, { state: name, drawing }); // settle the string
      model.updateMatrixWorld(true);
      const x = col * cw; const y = (names.length - 1 - row) * ch;
      renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, camera);
      const root = runtime.getRoot();
      const low = root ? new THREE.Box3().setFromObject(root).min.y : 0;
      const rb = wristBend(bone('mixamorigRightForeArm') || bone('lowerarm_r'), bone('mixamorigRightHand') || bone('hand_r'));
      const lb = wristBend(bone('mixamorigLeftForeArm') || bone('lowerarm_l'), bone('mixamorigLeftHand') || bone('hand_l'));
      notes.push(`t${t.toFixed(2)} wristR ${rb.toFixed(0)} wristL ${lb.toFixed(0)} low ${low.toFixed(2)}`);
      const label = document.createElement('div');
      label.textContent = `${name} ${t.toFixed(2)} s${Math.abs(t - hit) < 1e-3 ? ' HIT' : ''}`;
      labels.appendChild(label);
    });
    out(`${name}: hit ${hit} sweep ${sweep || '-'} cancel ${cancel} | ${notes.join(' | ')}`);
  });
  const shot = document.createElement('canvas');
  shot.width = canvas.width; shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif'; g.fillStyle = '#f4efe2'; g.shadowColor = '#000'; g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, (i % cols) * cw + 6, Math.floor(i / cols) * ch + 16));
  const file = `combo-${rigKey}-${weaponId}-${camKind}.png`;
  out(`saved ${await fetch(`/__shot?name=${file}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text())}`);
  document.title = `combo ${rigKey} ${weaponId} done`;
}

// ---------- fight: the real player path pressing attack — controller chain / buffer, combo binder,
// summon runtime, blade-ribbon trails and arrows — stepped at a fixed 60 Hz, one frame per sample time.
//   ?mode=fight&rig=fused-female-v1&weapon=fantasy_sword|fantasy_bow|daggers&presses=0.1,0.3,0.55&times=...&native=1
async function fightStrip() {
  const { createLunaDashboardPlayerController } = await import('../../../src/components/game3d/player/LunaDashboardPlayerController.jsx');
  const { initialPlayerAnimationClips } = await import('../../../src/components/game3d/player/playerAnimationLibrary.jsx');
  const { loadUploadedAnimationMontage } = await import('../../../src/components/game3d/player/uploadedAnimationMontage.mjs');
  const { createPlayerWeaponSummon } = await import('../../../src/components/game3d/weapons/playerWeaponSummon.js');
  const { createWeaponComboBinder } = await import('../../../src/components/game3d/weapons/weaponComboBinder.js');
  const { comboKindForWeapon } = await import('../../../src/components/game3d/weapons/weaponComboClips.js');
  const manifest = await loadWeaponManifest();
  const weapon = params.get('weapon') || 'fantasy_sword';
  const family = weapon === 'daggers' ? 'dual_blades' : manifest.weapons.find((w) => w.id === weapon)?.class === 'bow' ? 'bow' : 'sword';
  const presses = (params.get('presses') || '0.1,0.3,0.55').split(',').map(Number);
  const times = (params.get('times') || '0.12,0.3,0.42,0.6,0.75,0.9,1.1,1.3,1.6').split(',').map(Number);
  const cw = Number(params.get('cw') || 240);
  const ch = Number(params.get('ch') || 340);
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cw * times.length, ch);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.style.gridTemplateColumns = `repeat(${times.length}, ${cw}px)`;
  labels.style.gridAutoRows = `${ch}px`;
  const scene = makeScene();
  const model = await loadRig(scene);
  const mixer = new THREE.AnimationMixer(model);
  const playerAnim = createLunaDashboardPlayerController({ mixer, oneShotRef: { current: false } });
  const initial = initialPlayerAnimationClips(model);
  playerAnim.bindClips(initial);
  // as in GameWorld3D: runtime, summon and the combo binder right after the model loads (rest pose)
  const runtime = createPlayerWeaponRuntime({ model, scene, manifest });
  const camera = new THREE.PerspectiveCamera(34, cw / ch, 0.05, 60);
  const summon = createPlayerWeaponSummon({ model, scene, runtime, renderer, getPixelScale: () => ch / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) });
  const combos = createWeaponComboBinder({ model, controller: playerAnim, runtime });
  const montage = params.get('native') === '1' ? {} : await loadUploadedAnimationMontage(model).catch((e) => { out(`montage not loaded: ${e.message}`); return {}; });
  if (Object.keys(montage).length) playerAnim.bindClips({ ...initial, ...montage });
  const trails = createCombatWeaponTrails({ scene });
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd04040 }));
  target.position.set(0, 1.2, 7);
  scene.add(target);
  const item = family === 'dual_blades' ? { instanceId: 'dev-daggers', masteryWeaponId: 'dual_blades' } : { instanceId: `dev-${weapon}`, appearance: { weaponModelId: weapon } };
  summon.sync(item, family); // world entry: the equipped weapon is shown without the summon
  const kind = comboKindForWeapon(summon.getVisual()?.kind);
  const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80 && !runtime.getCurrent(); i++) await settle(50); // the weapon GLB loads
  const log2 = [];
  let t = 0;
  let next = 0;
  const step = (dt) => {
    summon.preUpdate();
    summon.sync(item, family);
    playerAnim.setEquipmentContext({ weaponType: family, summon: true, equipped: summon.isOut() });
    while (next < presses.length && t >= presses[next]) {
      summon.ensureOut();
      const ok = playerAnim.requestAttack(kind, { speed: 1 });
      log2.push(`press@${t.toFixed(2)}→${ok ? 'ok' : 'no'}${playerAnim.getComboState()?.queued ? '(buffered)' : ''}`);
      next++;
    }
    playerAnim.updateActionState({ moving: false });
    playerAnim.updateAnimation(dt);
    mixer.update(dt);
    playerAnim.updateMotion(model, dt, model.position.y);
    const swing = playerAnim.getComboState();
    summon.update(dt, { state: playerAnim.getCurrent(), inCombat: true, drawing: swing?.kind === 'bowCombo' ? swing.time > 0.04 && swing.time < swing.hit : null });
    combos.update();
    for (const cue of playerAnim.pollComboEvents()) {
      log2.push(`${cue.type}:${cue.state}@${t.toFixed(2)}`);
      if (cue.type === 'sweep') trails.emit({ actor: model, weaponPath: 'melee', hitIndex: cue.index, record: cue.seconds, blade: runtime.getBladeAnchors() });
      else if (cue.type === 'hit' && cue.kind === 'bowCombo') runtime.fireArrow({ target: target.position });
    }
    trails.update(dt);
  };
  const states = [];
  const shoot = (col) => {
    model.updateMatrixWorld(true);
    camera.position.set(family === 'bow' ? 2.4 : -2.6, 1.7, 3.4);
    camera.lookAt(0, 1.0, 0.6);
    renderer.setViewport(col * cw, 0, cw, ch);
    renderer.setScissor(col * cw, 0, cw, ch);
    renderer.render(scene, camera);
    const label = document.createElement('div');
    label.textContent = `+${t.toFixed(2)} s · ${playerAnim.getCurrent()}`;
    labels.appendChild(label);
  };
  combos.update(); // the held weapon's own grip, before the first press
  for (const [col, until] of times.entries()) {
    while (t < until - 1e-6) {
      step(1 / 60); t += 1 / 60;
      const s = playerAnim.getCurrent(); if (states[states.length - 1] !== s) states.push(s);
      if (Math.round(t * 60) % 6 === 0) await settle(); // let summons / loads resolve like real frames
    }
    shoot(col);
  }
  out(`${rigKey} ${weapon} (${family} -> ${kind}); combo clips baked for ${combos.bakedFor(kind)}; montage clips ${Object.keys(montage).length}`);
  out(`presses ${presses.join(', ')} | ${log2.join(' | ')}`);
  out(`states: ${states.join(' -> ')}`);
  const shot = document.createElement('canvas');
  shot.width = canvas.width; shot.height = canvas.height;
  const g = shot.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.font = '13px system-ui, sans-serif'; g.fillStyle = '#f4efe2'; g.shadowColor = '#000'; g.shadowBlur = 3;
  [...labels.children].forEach((el, i) => g.fillText(el.textContent, i * cw + 6, 16));
  const file = `fight-${rigKey}-${weapon}${params.get('native') === '1' ? '-native' : ''}.png`;
  out(`saved ${await fetch(`/__shot?name=${file}`, { method: 'POST', body: shot.toDataURL('image/png') }).then((r) => r.text())}`);
  document.title = `fight ${rigKey} ${weapon} done`;
}

(mode === 'live' ? live() : mode === 'summon' ? summonStrip() : mode === 'montage' ? montageSheet() : mode === 'combo' ? comboSheet()
  : mode === 'fight' ? fightStrip() : grid()).catch((e) => { out(`error: ${e.stack || e}`); console.error(e); });
