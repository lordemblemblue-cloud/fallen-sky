// Enchantment light contact sheets on the real code path:
// fused Eve body + fitted armor GLBs through AvatarCustomizationRuntime (whose apply() calls
// armorEnchantGlow), and the weapon pack GLBs through the weapon channel (weaponEnchantVfx).
// URL params: set=crescent_moon|nightscale|frostwarden, quality=desktop|mobile, auto=1 (render all sheets).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvatarCustomizationRuntime } from '@/components/onboarding/customizationRuntime';
import { loadBuiltinLayers } from '@/components/onboarding/creatorBuiltinLayers';
import { describeArmorEnchantGlow } from '@/components/game3d/enchantVfx/armorEnchantGlow.js';
import { createWeaponEnchantVfx } from '@/components/game3d/enchantVfx/weaponEnchantVfx.js';
import { setEnchantQuality } from '@/components/game3d/enchantVfx/enchantQuality.js';
import { resolveEnchantStage, ENCHANT_VISUAL_RARITY_ORDER } from '@/components/game3d/enchantVfx/enchantVisualRules.mjs';

const params = new URLSearchParams(location.search);
const SET = params.get('set') || 'crescent_moon';
const QUALITY = params.get('quality') === 'mobile' ? 'mobile' : 'desktop';
setEnchantQuality(QUALITY);
const statusEl = document.getElementById('status');
const log = (...parts) => { statusEl.textContent += `\n${parts.join(' ')}`; console.log('[enchant-preview]', ...parts); };
statusEl.textContent = `set=${SET} quality=${QUALITY}`;

// A controllable clock: the glow reads performance.now() through material.onBeforeRender.
let clock = 1.4;
performance.now = () => clock * 1000;

const W = 300; const H = 460;
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // as GameWorld3D
renderer.toneMappingExposure = 1.1;

function makeScene(background = '#1b2230') {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.add(new THREE.HemisphereLight(0xdde7ff, 0x3b342a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.7);
  sun.position.set(1.6, 3.2, 2.6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6);
  rim.position.set(-2, 2, -2.5);
  scene.add(rim);
  return scene;
}
const scene = makeScene();
const camera = new THREE.PerspectiveCamera(28, W / H, 0.02, 60);

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/characters/fused/Female_Fused_v2.glb');
const model = gltf.scene;
const rigId = gltf.parser.json.extras?.rigId || 'fused-female-v1';
model.traverse((n) => { if (n.isMesh) n.frustumCulled = false; });
scene.add(model);
log('body', rigId);
// Frame on the bare body, so every armor set gets the same camera.
model.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(model);
const height = box.max.y - box.min.y;

const runtime = new AvatarCustomizationRuntime(model, { gender: 'female', rigId, onState: (s) => s?.error && log('armor error', s.error) });
const manifest = await loadBuiltinLayers('armor', { equippedIds: [] });
const pieces = (manifest.female || []).filter((p) => p.rig_id === rigId && p.id.startsWith(`${SET}_`));
log('pieces', pieces.map((p) => p.id).join(', '));
const selected = Object.fromEntries(pieces.map((p) => [p.slot, p.id]));
const appearance = (enchant) => ({ gender: 'female', selected_assets: selected, customization_assets: pieces, game3d_armor_enchant: enchant });
await runtime.update(appearance({}));
await runtime.regions;
model.updateMatrixWorld(true);
log('body bounds', box.min.toArray().map((v) => v.toFixed(2)).join(','), '->', box.max.toArray().map((v) => v.toFixed(2)).join(','));

const VIEWS = {
  full: { target: [0, 0.52, 0], dist: 2.85, yaw: 0.35, lift: 0.05 },
  chest: { target: [0, 0.74, 0.02], dist: 1.05, yaw: 0.28, lift: 0.04 },
  back: { target: [0, 0.6, 0], dist: 2.3, yaw: Math.PI + 0.35, lift: 0.08 },
  arms: { target: [0, 0.7, 0], dist: 1.65, yaw: 0.9, lift: 0.1 },
  legs: { target: [0, 0.3, 0], dist: 1.6, yaw: 0.45, lift: 0.04 },
};
function setView(name) {
  const v = VIEWS[name];
  const target = new THREE.Vector3(v.target[0], box.min.y + v.target[1] * height, v.target[2]);
  camera.position.set(target.x + Math.sin(v.yaw) * v.dist, target.y + v.lift * height, target.z + Math.cos(v.yaw) * v.dist);
  camera.lookAt(target);
}

const enchantAll = (percent, rarity, slots = Object.keys(selected)) => Object.fromEntries(slots.map((slot) => [slot, {
  instanceId: `${slot}#qa`, pieceId: selected[slot], rarity, percent,
}]));

async function applyEnchant(map) {
  await runtime.update(appearance(map));
}

function renderArmor(view, time = 1.4) {
  clock = time;
  setView(view);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  return renderer.domElement;
}

// --- weapons -------------------------------------------------------------------------------------
const weaponScene = makeScene('#151b26');
const weaponCamera = new THREE.PerspectiveCamera(26, W / H, 0.01, 30);
const weaponVfx = createWeaponEnchantVfx({ getPercent: (item) => item.percent, getQuality: () => QUALITY });
async function loadWeapon(file, kind) {
  const g = await loader.loadAsync(`/game3d/weapons/${file}`);
  const root = new THREE.Group();
  root.name = `WeaponPack_${file}`;
  root.add(g.scene);
  const holder = new THREE.Group();
  holder.add(root);
  weaponScene.add(holder);
  holder.visible = false;
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  return { file, kind, root, holder, box: b };
}
function frameWeapon(w) {
  const size = w.box.getSize(new THREE.Vector3());
  const center = w.box.getCenter(new THREE.Vector3());
  const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => a[1] - b[1]);
  const thin = axes[0][0]; const long = axes[2][0];
  const dir = new THREE.Vector3(); dir[thin] = 1;
  const up = new THREE.Vector3(); up[long] = 1;
  const dist = axes[2][1] / (2 * Math.tan(THREE.MathUtils.degToRad(weaponCamera.fov / 2))) * 1.18;
  weaponCamera.up.copy(up);
  weaponCamera.position.copy(center).addScaledVector(dir, dist).add(new THREE.Vector3(0.05, 0, 0.05).multiplyScalar(dist * 0.4));
  weaponCamera.lookAt(center);
}
function renderWeapon(w, item, time = 1.4) {
  weaponScene.children.forEach((c) => { if (c.isGroup && c.children[0]?.name?.startsWith('WeaponPack_')) c.visible = c === w.holder; });
  clock = time - 1.2;
  for (let i = 0; i < 72; i++) { clock += 1 / 60; weaponVfx.update(1 / 60, { roots: [w.root], item, kind: w.kind }); }
  frameWeapon(w);
  renderer.render(weaponScene, weaponCamera);
  return renderer.domElement;
}

// --- sheets --------------------------------------------------------------------------------------
function makeSheet(cols, rows, title) {
  const pad = 26;
  const sheet = document.createElement('canvas');
  sheet.width = cols * W; sheet.height = rows * (H + pad) + 34;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#0b0f16'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#e6eef8'; ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(title, 10, 24);
  return {
    sheet,
    put(col, row, label) {
      const x = col * W; const y = 34 + row * (H + pad);
      ctx.drawImage(renderer.domElement, x, y, W, H);
      ctx.fillStyle = '#c9d6e6'; ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(label, x + 8, y + H + 18);
    },
  };
}
async function save(sheet, name) {
  const res = await fetch(`/__shot?name=${name}`, { method: 'POST', body: sheet.toDataURL('image/png') });
  log('saved', await res.text());
  document.getElementById('sheet').src = sheet.toDataURL('image/png');
}

const STAGES = [0, 30, 59, 90, 120, 150, 200];

async function sheetStages(rarity = 'legendary', view = 'full') {
  const s = makeSheet(STAGES.length, 1, `${SET} · ${rarity} · every stage (${view}) · ${QUALITY}`);
  for (const [i, percent] of STAGES.entries()) {
    await applyEnchant(enchantAll(percent, rarity));
    renderArmor(view);
    s.put(i, 0, `${percent}% ${resolveEnchantStage(percent).label}`);
  }
  await save(s.sheet, `armor-${SET}-${rarity}-stages-${view}-${QUALITY}.png`);
}
async function sheetRarities(percent = 120, view = 'chest') {
  const s = makeSheet(ENCHANT_VISUAL_RARITY_ORDER.length, 1, `${SET} · ${percent}% ${resolveEnchantStage(percent).label} · five rarities (${view})`);
  for (const [i, rarity] of ENCHANT_VISUAL_RARITY_ORDER.entries()) {
    await applyEnchant(enchantAll(percent, rarity));
    renderArmor(view);
    s.put(i, 0, rarity);
  }
  await save(s.sheet, `armor-${SET}-${percent}-rarities-${view}-${QUALITY}.png`);
}
async function sheetMixed() {
  const map = {
    ...enchantAll(0, 'rare'),
    ...enchantAll(150, 'legendary', ['chest']),
    ...enchantAll(30, 'rare', ['gloves']),
    ...enchantAll(90, 'elite', ['cape']),
    ...enchantAll(120, 'elite', ['pants']),
    ...enchantAll(59, 'rare', ['boots']),
  };
  await applyEnchant(map);
  const s = makeSheet(4, 1, `${SET} · each piece its own item: chest 150 L, gloves 30 R, cape 90 E, pants 120 E, boots 59 R, helmet 0`);
  for (const [i, view] of ['full', 'back', 'arms', 'legs'].entries()) { renderArmor(view); s.put(i, 0, view); }
  log('armor state', JSON.stringify(describeArmorEnchantGlow(runtime.layers)));
  await save(s.sheet, `armor-${SET}-mixed-${QUALITY}.png`);
}
async function sheetMotion(percent = 200, rarity = 'legendary') {
  await applyEnchant(enchantAll(percent, rarity));
  const times = [0.2, 1.0, 1.8, 2.6, 3.4];
  const s = makeSheet(times.length, 1, `${SET} · ${percent}% ${rarity} · motion over time (chest)`);
  for (const [i, t] of times.entries()) { renderArmor('chest', t); s.put(i, 0, `t=${t}s`); }
  await save(s.sheet, `armor-${SET}-${percent}-motion-${QUALITY}.png`);
}
async function sheetWeapons() {
  const weapons = [await loadWeapon('fantasy_sword.glb', 'blade'), await loadWeapon('violet_bow.glb', 'bow')];
  for (const w of weapons) {
    const rows = ['common', 'rare', 'elite', 'legendary'];
    const s = makeSheet(STAGES.length, rows.length, `${w.file} · weapon channel: inlay + tight aura + sparks · ${QUALITY}`);
    for (const [r, rarity] of rows.entries()) {
      for (const [c, percent] of STAGES.entries()) {
        renderWeapon(w, { instanceId: `${w.file}#${rarity}`, rarity, percent });
        s.put(c, r, `${rarity} ${percent}%`);
      }
    }
    log('weapon state', JSON.stringify(weaponVfx.describe()));
    await save(s.sheet, `weapon-${w.file.replace('.glb', '')}-${QUALITY}.png`);
  }
}

// QA-17/18: pose real bones (arm raise, knee bend, spine twist, cape chain swing); the inlay must stay put.
async function sheetPosed() {
  await applyEnchant({
    ...enchantAll(0, 'rare'), ...enchantAll(150, 'legendary', ['chest']), ...enchantAll(120, 'elite', ['gloves']),
    ...enchantAll(90, 'elite', ['cape']), ...enchantAll(120, 'legendary', ['pants']), ...enchantAll(59, 'rare', ['boots']),
  });
  const s = makeSheet(4, 1, `${SET} · surface light follows skinning and the cape chains`);
  renderArmor('full'); s.put(0, 0, 'rest · front');
  renderArmor('back'); s.put(1, 0, 'rest · back');
  const saved = [];
  model.traverse((n) => { if (n.isBone) saved.push([n, n.quaternion.clone()]); });
  const turn = (name, axis, angle) => model.getObjectByName(name)?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  const X = new THREE.Vector3(1, 0, 0); const Y = new THREE.Vector3(0, 1, 0); const Z = new THREE.Vector3(0, 0, 1);
  turn('mixamorigRightArm', X, -1.0); turn('mixamorigRightForeArm', Z, 0.8);
  turn('mixamorigLeftUpLeg', X, -0.7); turn('mixamorigLeftLeg', X, 1.0); turn('mixamorigSpine2', Y, 0.35);
  model.traverse((n) => { if (n.isBone && /^Cape_/.test(n.name)) n.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.16)); });
  model.updateMatrixWorld(true);
  renderArmor('full'); s.put(2, 0, 'posed · front');
  renderArmor('back'); s.put(3, 0, 'posed · back');
  saved.forEach(([n, q]) => n.quaternion.copy(q));
  model.updateMatrixWorld(true);
  await save(s.sheet, `armor-${SET}-posed-${QUALITY}.png`);
}

// Performance: enchant changes are uniform writes; the program count must not grow with them.
async function programCheck() {
  const counts = [];
  for (const rarity of ENCHANT_VISUAL_RARITY_ORDER) {
    for (const percent of STAGES) { await applyEnchant(enchantAll(percent, rarity)); renderArmor('full'); }
    counts.push(renderer.info.programs.length);
  }
  return { programsAfterEachRarity: counts, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
}

window.enchantPreview = { sheetStages, sheetRarities, sheetMixed, sheetMotion, sheetWeapons, sheetPosed, programCheck, applyEnchant, renderArmor, runtime, enchantAll, renderer };
log('ready');
if (params.get('auto') === '1') {
  try {
    await sheetStages('legendary', 'full');
    await sheetStages('rare', 'chest');
    await sheetRarities(120, 'chest');
    await sheetRarities(200, 'chest');
    await sheetMixed();
    await sheetMotion(200, 'legendary');
    await sheetMotion(120, 'elite');
    await sheetPosed();
    await sheetWeapons();
    log('programs', JSON.stringify(await programCheck()));
    log('ALL DONE');
  } catch (error) {
    log('FAILED', error?.stack || error);
  }
}
