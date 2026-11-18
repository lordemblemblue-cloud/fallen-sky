// Fallen Sky enchantment visuals (handoff workbook spec v1.0, 2026-11-18): P0 QA in node.
// Shared stage + rarity rules, armor surface light (never an aura), the separate weapon channel,
// per-item-instance data, lifecycle (no ghost light or leaks) and the wiring into the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  ENCHANT_VISUAL_STAGES, ENCHANT_STAGE_BREAKPOINTS, ENCHANT_VISUAL_RARITIES, ENCHANT_VISUAL_RARITY_ORDER,
  normalizeEnchantPercent, resolveEnchantStage, resolveEnchantRarity, resolveEnchantVisualStyle,
  enchantPercentFromRecords, describeEnchantChange, nextEnchantStage,
} from '../src/components/game3d/enchantVfx/enchantVisualRules.mjs';
import { computeOrnamentMask, computeAuthoredMask, computeEnchantGeometryAttributes } from '../src/components/game3d/enchantVfx/enchantMasks.mjs';
import { buildArmorEnchantMap, storedEnchantRecordsReader, armorEnchantKey } from '../src/components/game3d/enchantVfx/enchantEquipment.mjs';
import {
  ensureEnchantGlowMaterial, setEnchantGlowStyle, getEnchantGlowState, makeOrnamentMaskTexture, ENCHANT_GLOW_VERSION,
} from '../src/components/game3d/enchantVfx/enchantGlowMaterial.js';
import { applyArmorEnchantGlow, describeArmorEnchantGlow, enchantMaskDataForMaterial } from '../src/components/game3d/enchantVfx/armorEnchantGlow.js';
import { createWeaponEnchantVfx } from '../src/components/game3d/enchantVfx/weaponEnchantVfx.js';
import { getAXEEnhancementStatMultiplier, getAXEReinforcementCap, AXE_REINFORCEMENT_CONFIG } from '../base44/shared/axeItemEnhancement.ts';
import { makeAXEArmorTemplate, AXE_ARMOR_PACK_SETS } from '../src/components/game3d/axe/equipment/AXEArmorPackCatalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const stageAt = (percent) => resolveEnchantStage(percent).label;

test('QA-01..08: the stage is the largest breakpoint at or below the percentage', () => {
  assert.deepEqual(ENCHANT_STAGE_BREAKPOINTS, [0, 30, 59, 90, 120, 150, 200]);
  const cases = [
    [0, 'Unenchanted'], [29, 'Unenchanted'], [29.99, 'Unenchanted'], [30, 'Lit Glass'],
    [58, 'Lit Glass'], [58.99, 'Lit Glass'], [59, 'Verdant Spark'],
    [89, 'Verdant Spark'], [90, 'Golden Spark'],
    [119, 'Golden Spark'], [120, 'Azure Current'],
    [149, 'Azure Current'], [150, 'Chosen Radiance'],
    [199, 'Chosen Radiance'], [200, 'Ascended Resonance'],
    [201, 'Ascended Resonance'], [265, 'Ascended Resonance'], [1e9, 'Ascended Resonance'],
  ];
  for (const [percent, label] of cases) assert.equal(stageAt(percent), label, `${percent}%`);
  // QA-08: corrupt values clamp safely, no extra tier above 200
  for (const bad of [-5, -0.01, NaN, undefined, null, 'abc', Infinity * -1]) assert.equal(stageAt(bad), 'Unenchanted', String(bad));
  assert.equal(normalizeEnchantPercent(201), 200);
  assert.equal(normalizeEnchantPercent(-30), 0);
  assert.equal(normalizeEnchantPercent('150'), 150);
  assert.equal(ENCHANT_VISUAL_STAGES.length, 7, 'six milestones plus "none": no misleading additional tier');
  assert.equal(nextEnchantStage(200), null);
  assert.equal(nextEnchantStage(58).label, 'Verdant Spark');
});

test('QA-01: below 30% nothing renders and the material stays untouched', () => {
  for (const rarity of ENCHANT_VISUAL_RARITY_ORDER) {
    const style = resolveEnchantVisualStyle({ rarity, percent: 29, category: 'weapon' });
    assert.equal(style.active, false);
    assert.equal(style.emissiveGain, 0);
    assert.equal(style.externalAura, false);
    assert.equal(style.sparks, 0);
  }
});

test('stage palette, emissive and motion follow the Enchant Levels sheet', () => {
  const sheet = { 30: [0.18, 0.12], 59: [0.34, 0.25], 90: [0.52, 0.43], 120: [0.7, 0.61], 150: [0.88, 0.83], 200: [1, 1] };
  for (const [min, [emissive, motion]] of Object.entries(sheet)) {
    const stage = resolveEnchantStage(Number(min));
    assert.equal(stage.emissive, emissive, `${min} emissive`);
    assert.equal(stage.motion, motion, `${min} motion`);
    assert.ok(stage.colors.primary && stage.colors.secondary && stage.colors.tertiary);
  }
  assert.match(resolveEnchantStage(200).paletteName, /Silver, crimson and blue/);
  assert.match(resolveEnchantStage(150).paletteName, /Sky blue, white and icy silver/);
});

test('the enchant percentage is the item\'s total enhancement bonus, using the stat system\'s own formula', () => {
  const records = { reinforcement: { percent: 45 }, enchantments: [4, 3, 3, 0], overEnchant: { level: 3 } };
  assert.equal(enchantPercentFromRecords(records, getAXEEnhancementStatMultiplier), 62.5);
  assert.equal(enchantPercentFromRecords(records), 62.5, 'the fallback formula matches the multiplier');
  // float multiplier 1.59 must not drop the 59 milestone
  const edge = { reinforcement: { percent: 55 }, enchantments: [4, 0, 0, 0], overEnchant: { level: 0 } };
  assert.equal(enchantPercentFromRecords(edge, getAXEEnhancementStatMultiplier), 59);
  assert.equal(stageAt(enchantPercentFromRecords(edge, getAXEEnhancementStatMultiplier)), 'Verdant Spark');
  // stored as a percentage (150), not a multiplier (1.5); the engine ceiling really is 200
  assert.equal(AXE_REINFORCEMENT_CONFIG.maxPercent, 200);
  assert.equal(getAXEReinforcementCap({ rarity: 'ascendant' }), 200);
  assert.equal(enchantPercentFromRecords({}, getAXEEnhancementStatMultiplier), 0);
  assert.equal(enchantPercentFromRecords({ reinforcement: { percent: -40 } }), 0, 'corrupt negatives never show light');
});

test('QA-09/10: rarity is an independent axis; Mythical is not implemented', () => {
  assert.deepEqual(ENCHANT_VISUAL_RARITY_ORDER, ['common', 'unique', 'rare', 'elite', 'legendary']);
  assert.equal(Object.hasOwn(ENCHANT_VISUAL_RARITIES, 'mythical'), false);
  assert.equal(Object.hasOwn(ENCHANT_VISUAL_RARITIES, 'mythic'), false);
  for (const spelled of ['mythic', 'Mythical', 'mystical']) assert.equal(resolveEnchantRarity(spelled).id, 'legendary', spelled);
  const aliases = { uncommon: 'unique', unique: 'unique', rare_elite: 'rare', elite_set: 'elite', heroic: 'legendary',
    chosen: 'legendary', ascendant: 'legendary', '': 'common', banana: 'common', COMMON: 'common' };
  for (const [from, to] of Object.entries(aliases)) assert.equal(resolveEnchantRarity(from).id, to, from);
  const multipliers = ENCHANT_VISUAL_RARITY_ORDER.map((id) => ENCHANT_VISUAL_RARITIES[id].vfxMultiplier);
  assert.deepEqual(multipliers, [0.35, 0.45, 0.65, 0.82, 1]);
  // same percentage, five rarities: same stage and palette, more detail with rank
  const styles = ENCHANT_VISUAL_RARITY_ORDER.map((rarity) => resolveEnchantVisualStyle({ rarity, percent: 120 }));
  assert.ok(styles.every((s) => s.stageLabel === 'Azure Current' && s.palette.primary === styles[0].palette.primary));
  for (let i = 1; i < styles.length; i++) {
    assert.ok(styles[i].coverage > styles[i - 1].coverage, 'more inlay with rank');
    assert.ok(styles[i].emissiveGain > styles[i - 1].emissiveGain, 'brighter with rank');
    assert.ok(styles[i].layers >= styles[i - 1].layers);
  }
  assert.equal(styles[0].accent, null, 'Common: neutral + stage tint only');
  assert.equal(styles[1].accent, null, 'Unique shares the Common family');
  assert.match(styles[2].accent, /^#3f/i, 'Rare: cyan accent');
  assert.ok(styles[3].nodes > 0 && styles[3].glass === 0, 'Elite: linked inlay nodes');
  assert.ok(styles[4].glass > 0 && styles[4].accent2, 'Legendary: multi-layer glass, gold/platinum');
  assert.ok(Math.abs(styles[0].emissiveGain - 0.7 * 0.35) < 1e-9, 'gain = stage intensity x rarity multiplier');
  assert.ok(resolveEnchantVisualStyle({ rarity: 'common', percent: 200 }).emissiveGain <= 0.35, 'Common stays minimal at every stage');
});

test('QA-12/13: armor never has an external aura; weapons always do when enchanted', () => {
  for (const rarity of ENCHANT_VISUAL_RARITY_ORDER) {
    for (const percent of [30, 59, 90, 120, 150, 200]) {
      const armor = resolveEnchantVisualStyle({ rarity, percent, category: 'armor', slot: 'chest' });
      assert.equal(armor.externalAura, false, `${rarity} ${percent} armor`);
      assert.equal(armor.sparks, 0);
      const weapon = resolveEnchantVisualStyle({ rarity, percent, category: 'weapon' });
      assert.ok(weapon.externalAura && weapon.externalAura.strength > 0, `${rarity} ${percent} weapon aura`);
    }
  }
  const aura = (rarity) => resolveEnchantVisualStyle({ rarity, percent: 150, category: 'weapon' }).externalAura;
  assert.ok(aura('common').strength < 0.15, 'Common weapon aura is nearly invisible');
  assert.ok(aura('legendary').layers > aura('rare').layers, 'Legendary aura is layered');
  // sparks: none for Common/Unique, Rare only from 120, never at Lit Glass, halved on mobile
  const sparks = (rarity, percent, quality) => resolveEnchantVisualStyle({ rarity, percent, category: 'weapon', quality }).sparks;
  assert.equal(sparks('common', 200), 0);
  assert.equal(sparks('unique', 200), 0);
  assert.equal(sparks('rare', 119), 0);
  assert.ok(sparks('rare', 120) > 0);
  assert.equal(sparks('legendary', 58), 0);
  assert.ok(sparks('legendary', 59) > 0);
  assert.ok(sparks('legendary', 200, 'mobile') < sparks('legendary', 200, 'desktop'));
  assert.equal(resolveEnchantVisualStyle({ rarity: 'legendary', percent: 200, category: 'weapon', quality: 'mobile' }).externalAura.layers, 1);
});

test('QA-11/23: every worn piece reads its own item instance (and survives a reload from storage)', () => {
  const set = AXE_ARMOR_PACK_SETS.find((entry) => entry.id === 'nightscale');
  const item = (slot, instanceId, rarity = 'rare') => ({
    ...makeAXEArmorTemplate(set, set.pieces.find((piece) => piece.slot === slot)), instanceId, rarity, equipped: true,
  });
  const items = [item('chest', 'chest#1'), item('gloves', 'gloves#1', 'elite'), item('cape', 'cape#1', 'legendary'),
    { ...item('chest', 'chest#2'), equipped: false }, { instanceId: 'sword#1', slot: 'weapon', equipped: true, rarity: 'rare' }];
  const records = {
    'chest#1': { reinforcement: { percent: 150 } },
    'gloves#1': { reinforcement: { percent: 30 } },
    'cape#1': { reinforcement: { percent: 80 }, enchantments: [10, 0, 0, 0] },
    'chest#2': { reinforcement: { percent: 5 } },
  };
  const map = buildArmorEnchantMap(items, { recordsFor: (id) => records[id] || {}, multiplier: getAXEEnhancementStatMultiplier });
  assert.deepEqual(Object.keys(map).sort(), ['cape', 'chest', 'gloves'], 'armor slots only, the weapon is separate');
  assert.equal(map.chest.instanceId, 'chest#1', 'the equipped copy, not the template or the spare');
  assert.equal(stageAt(map.chest.percent), 'Chosen Radiance');
  assert.equal(stageAt(map.gloves.percent), 'Lit Glass');
  assert.equal(stageAt(map.cape.percent), 'Golden Spark');
  assert.equal(map.chest.pieceId, 'nightscale_chest');
  // persistence: the same map comes back from the saved, character-scoped records
  const store = new Map([
    ['axe_reinforcement_v1::u1::c1', JSON.stringify({ 'chest#1': { percent: 150 }, 'gloves#1': { percent: 30 }, 'cape#1': { percent: 80 } })],
    ['wwm_enchantments_v1::u1::c1', JSON.stringify({ 'cape#1': [10, 0, 0, 0] })],
    ['axe_over_enchant_v1::u1::c1', '{bad json'],
  ]);
  const storage = { getItem: (key) => store.get(key) ?? null };
  const reloaded = buildArmorEnchantMap(items, { recordsFor: storedEnchantRecordsReader(storage, 'u1', 'c1'), multiplier: getAXEEnhancementStatMultiplier });
  assert.equal(armorEnchantKey(reloaded), armorEnchantKey(map));
  assert.deepEqual(buildArmorEnchantMap(items, { recordsFor: storedEnchantRecordsReader(storage, 'u1', 'other') }).chest.percent, 0,
    'another roster character never borrows this one\'s light');
});

test('Blacksmith before/after: describeEnchantChange reports the stage a success would light', () => {
  const change = describeEnchantChange({ rarity: 'elite', before: 85, after: 90 });
  assert.equal(change.from.stageLabel, 'Verdant Spark');
  assert.equal(change.to.stageLabel, 'Golden Spark');
  assert.equal(change.stageChanges, true);
  assert.equal(describeEnchantChange({ rarity: 'elite', before: 60, after: 65 }).stageChanges, false);
});

test('ornament mask: engraving and gold trim carry light, a flat texture never lights the whole piece', () => {
  const w = 64; const h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = 52; rgba[i * 4 + 1] = 56; rgba[i * 4 + 2] = 64; rgba[i * 4 + 3] = 255; }
  for (let x = 0; x < w; x++) for (const y of [20, 21]) { const i = (y * w + x) * 4; rgba[i] = 222; rgba[i + 1] = 178; rgba[i + 2] = 60; }
  const mask = computeOrnamentMask(rgba, w, h);
  const goldRow = mask[20 * w + 10];
  const plain = mask[50 * w + 10];
  assert.ok(goldRow > plain, `gold line ${goldRow} ranks above plain metal ${plain}`);
  for (const coverage of [0.05, 0.1, 0.18]) {
    const lit = mask.filter((v) => v / 255 > 1 - coverage).length / mask.length;
    assert.ok(lit <= coverage + 0.02, `coverage ${coverage}: ${lit.toFixed(3)} of texels lit`);
  }
  const flat = computeOrnamentMask(new Uint8ClampedArray(w * h * 4).fill(128), w, h);
  assert.ok(flat.every((v) => v / 255 <= 1 - 0.18), 'a featureless texture stays dark at every rarity');
  const empty = computeOrnamentMask(new Uint8ClampedArray(w * h * 4), w, h);
  assert.ok(empty.every((v) => v === 0));
  // atlas padding (pure black between UV islands) never lights, and an island's border against the
  // padding is not an engraving: a plain island stays dark right up to its edge
  const atlas = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const island = x >= 32;
    atlas[i] = island ? 70 : 0; atlas[i + 1] = island ? 76 : 0; atlas[i + 2] = island ? 88 : 0; atlas[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) { const i = (y * w + 48) * 4; atlas[i] = 225; atlas[i + 1] = 180; atlas[i + 2] = 64; } // a gold engraving inside
  const atlasMask = computeOrnamentMask(atlas, w, h);
  for (let y = 0; y < h; y++) {
    assert.equal(atlasMask[y * w + 10], 0, 'padding stays 0');
    assert.ok(atlasMask[y * w + 32] / 255 <= 1 - 0.16, 'the island border is not lit');
    assert.ok(atlasMask[y * w + 48] / 255 > 1 - 0.16, 'the engraving inside the island is');
  }
});

test('artist masks: a piece\'s own emissive texture is the mask, grey levels tier it by rarity', () => {
  const pixels = (values) => {
    const rgba = new Uint8Array(values.length * 4);
    values.forEach((v, i) => { rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; });
    return rgba;
  };
  const values = [255, 237, 227, 217, 120, 0];
  assert.deepEqual([...computeAuthoredMask(pixels(values), 6, 1)], values, 'painted brightness is used as is');
  const lit = (rarity) => [...computeAuthoredMask(pixels(values), 6, 1)]
    .map((v) => v / 255 >= 1 - ENCHANT_VISUAL_RARITIES[rarity].coverage);
  assert.deepEqual(lit('common'), [true, false, false, false, false, false], 'white lights for every rarity');
  assert.deepEqual(lit('rare'), [true, true, false, false, false, false], '~0.93 grey: Rare and up');
  assert.deepEqual(lit('elite'), [true, true, true, false, false, false], '~0.89 grey: Elite and up');
  assert.deepEqual(lit('legendary'), [true, true, true, true, false, false], '~0.85 grey: Legendary only');
  // a material with its own emissive texture uses it; one whose emissive IS its colour map does not
  const colour = new THREE.DataTexture(pixels([40, 40, 40, 40]), 2, 2);
  const authored = new THREE.DataTexture(pixels([255, 0, 0, 0]), 2, 2);
  const withMask = new THREE.MeshStandardMaterial({ map: colour, emissiveMap: authored });
  assert.deepEqual([...enchantMaskDataForMaterial(withMask).data], [255, 0, 0, 0]);
  const reused = new THREE.MeshStandardMaterial({ map: colour, emissiveMap: colour }); // e.g. a pack weapon's glow
  assert.notDeepEqual([...enchantMaskDataForMaterial(reused).data], [40, 40, 40, 40], 'derived from the colour map instead');
  assert.equal(enchantMaskDataForMaterial(new THREE.MeshStandardMaterial()), null, 'no texture: the trim fallback');
});

test('trim fallback marks open borders and creases; flow runs from the focal point', () => {
  const plane = new THREE.PlaneGeometry(1, 1, 4, 4); // XY plane, +Y up
  const { trim, flow } = computeEnchantGeometryAttributes({
    positions: plane.attributes.position.array, indices: plane.index.array, flow: 'top_down',
  });
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const border = Math.abs(Math.abs(pos.getX(i)) - 0.5) < 1e-6 || Math.abs(Math.abs(pos.getY(i)) - 0.5) < 1e-6;
    assert.equal(trim[i], border ? 1 : 0, `vertex ${i}`);
    assert.ok(Math.abs(flow[i] - (0.5 - pos.getY(i))) < 1e-6, 'top_down: 0 at the top, 1 at the bottom');
  }
  const box = new THREE.BoxGeometry(1, 1, 1); // closed low-poly: only the 90 degree creases count
  const boxTrim = computeEnchantGeometryAttributes({ positions: box.attributes.position.array, indices: box.index.array }).trim;
  assert.ok(boxTrim.every((v) => Math.abs(v - 0.6) < 1e-6), 'creases, never open-border strength, on a closed box');
  const sphere = new THREE.SphereGeometry(1, 24, 16); // smooth and closed apart from its poles: no trim
  const sphereTrim = computeEnchantGeometryAttributes({ positions: sphere.attributes.position.array, indices: sphere.index.array }).trim;
  assert.ok(sphereTrim.filter((v) => v > 0).length / sphereTrim.length < 0.1);
  // a dense, noisy (sculpted / generated) mesh is "sharp" everywhere: its creases are ignored
  const noisy = new THREE.IcosahedronGeometry(1, 24);
  const np = noisy.attributes.position;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const jitter = new Map();
  for (let i = 0; i < np.count; i++) {
    const key = `${np.getX(i).toFixed(5)},${np.getY(i).toFixed(5)},${np.getZ(i).toFixed(5)}`;
    if (!jitter.has(key)) jitter.set(key, 1 + (rand() - 0.5) * 0.12);
    const s = jitter.get(key);
    np.setXYZ(i, np.getX(i) * s, np.getY(i) * s, np.getZ(i) * s);
  }
  const noisyTrim = computeEnchantGeometryAttributes({ positions: np.array }).trim;
  assert.ok(noisyTrim.every((v) => v === 0), 'no trim light sprayed over a noisy closed mesh');
  // a double-sided plate (each face duplicated with flipped winding): its rim reads as trim,
  // the shared (non-manifold) diagonal does not
  const quad = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0.5, 0.5, 0]);
  const quadTrim = computeEnchantGeometryAttributes({ positions: quad,
    indices: new Uint16Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 4, 1, 0, 4, 2, 1, 4, 3, 2, 4, 0, 3]) }).trim;
  assert.deepEqual([...quadTrim].map((v) => +v.toFixed(2)), [0.6, 0.6, 0.6, 0.6, 0], 'rim vertices lit, centre dark');
  // sternum_out: the front-centre (+Z) of a chest-like slab glows first
  const slab = new THREE.BoxGeometry(0.5, 0.6, 0.2, 6, 6, 2);
  const chestFlow = computeEnchantGeometryAttributes({ positions: slab.attributes.position.array, indices: slab.index.array, flow: 'sternum_out' }).flow;
  let best = 0;
  for (let i = 0; i < chestFlow.length; i++) if (chestFlow[i] < chestFlow[best]) best = i;
  assert.ok(slab.attributes.position.getZ(best) > 0.09 && Math.abs(slab.attributes.position.getX(best)) < 0.1);
  // weapons: grip (origin) 0 -> tip 1; bows light both limbs from the grip
  const blade = computeEnchantGeometryAttributes({ positions: new Float32Array([0, 0, 0, 0, 0.5, 0, 0, 1, 0]), flow: 'axis', axis: { dir: [0, 1, 0], length: 1 } }).flow;
  assert.deepEqual([...blade], [0, 0.5, 1]);
  const bow = computeEnchantGeometryAttributes({ positions: new Float32Array([0, -0.6, 0, 0, 0, 0, 0, 0.6, 0]), flow: 'axis', axis: { dir: [0, 1, 0], length: 0.6, symmetric: true } }).flow;
  assert.deepEqual([...bow].map((v) => +v.toFixed(5)), [1, 0, 1]);
});

function fakeShader() {
  return {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
}

test('surface patch: one shared program, uniforms only, nothing in userData, mask freed with the material', () => {
  const a = new THREE.MeshStandardMaterial();
  const b = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const stateA = ensureEnchantGlowMaterial(a);
  assert.equal(ensureEnchantGlowMaterial(a), stateA, 'idempotent');
  ensureEnchantGlowMaterial(b);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey(), 'items share one program');
  assert.match(a.customProgramCacheKey(), new RegExp(ENCHANT_GLOW_VERSION));
  const shader = fakeShader();
  a.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vAxeFlow = axeEnchFlow;/, 'the vertex anchor exists in this three.js version');
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= axeLight/, 'the fragment anchor exists in this three.js version');
  assert.match(shader.fragmentShader, /#include <map_fragment>\s+float axeOrnV/, 'the lit channel is resolved right after the base colour');
  assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= 1\.0 - uAxeInlay/, 'the lit channel becomes inlay (only where the mask lights it)');
  assert.ok(shader.fragmentShader.indexOf('float axeOrnV') < shader.fragmentShader.indexOf('totalEmissiveRadiance += axeLight'));
  assert.equal(shader.uniforms.uAxeGain, stateA.uniforms.uAxeGain, 'shader reads the live uniform objects');
  assert.equal(JSON.stringify(a.userData), '{}', 'Material.copy() never JSON-clones glow state');
  setEnchantGlowStyle(a, resolveEnchantVisualStyle({ rarity: 'rare', percent: 120, slot: 'chest' }));
  const key = a.customProgramCacheKey();
  setEnchantGlowStyle(a, resolveEnchantVisualStyle({ rarity: 'legendary', percent: 200, slot: 'chest' }));
  assert.equal(a.customProgramCacheKey(), key, 'an enchant change never recompiles');
  assert.ok(stateA.uniforms.uAxeGain.value > 0);
  setEnchantGlowStyle(a, resolveEnchantVisualStyle({ rarity: 'legendary', percent: 10 }));
  assert.equal(stateA.uniforms.uAxeGain.value, 0);
  const mask = makeOrnamentMaskTexture({ data: new Uint8Array(4), width: 2, height: 2 });
  let disposed = 0;
  mask.addEventListener('dispose', () => { disposed += 1; });
  ensureEnchantGlowMaterial(b, { mask });
  assert.notEqual(b.customProgramCacheKey(), a.customProgramCacheKey(), 'the masked variant is its own program');
  assert.ok(Object.hasOwn(b.defines, 'AXE_ENCHANT_MASK'));
  b.dispose();
  assert.equal(disposed, 1, 'the ornament mask goes with its material');
  assert.equal(ensureEnchantGlowMaterial(new THREE.MeshBasicMaterial()), null, 'only lit materials are patched');
});

function armorLayer(slot, pieceId) {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2, 2, 2, 2), material));
  return { asset: { id: pieceId, slot }, root, material };
}

test('armor renderer: per piece, only changed pieces are touched, no aura objects, untouched when unenchanted', () => {
  const chest = armorLayer('chest', 'nightscale_chest');
  const cape = armorLayer('cape', 'nightscale_cape');
  const hair = armorLayer('hair', 'hair_default');
  const plain = armorLayer('boots', 'nightscale_boots');
  const layers = new Map([['chest', chest], ['cape', cape], ['hair', hair], ['boots', plain]]);
  const childCounts = () => [...layers.values()].map((layer) => layer.root.children.length);
  const before = childCounts();
  const enchant = {
    chest: { instanceId: 'c#1', pieceId: 'nightscale_chest', rarity: 'legendary', percent: 150 },
    cape: { instanceId: 'k#1', pieceId: 'nightscale_cape', rarity: 'rare', percent: 30 },
    boots: { instanceId: 'b#1', pieceId: 'nightscale_boots', rarity: 'rare', percent: 25 },
  };
  assert.equal(applyArmorEnchantGlow(layers, enchant, { quality: 'desktop' }), 2, 'the 25% boots are never touched');
  assert.deepEqual(childCounts(), before, 'surface light only: nothing added around the body');
  assert.ok(getEnchantGlowState(chest.material).uniforms.uAxeGain.value > getEnchantGlowState(cape.material).uniforms.uAxeGain.value,
    'the 150% Legendary chest outshines the 30% Rare cape');
  assert.equal(getEnchantGlowState(hair.material), null, 'not armor: never patched');
  assert.equal(getEnchantGlowState(plain.material)?.uniforms.uAxeGain.value ?? 0, 0, 'a 25% piece shows no light');
  const geometry = chest.root.children[0].geometry;
  assert.ok(geometry.getAttribute('axeEnchTrim') && geometry.getAttribute('axeEnchFlow'));
  // lifecycle: identical data -> no work; one item changes -> only that piece is touched
  assert.equal(applyArmorEnchantGlow(layers, enchant, { quality: 'desktop' }), 0);
  assert.equal(applyArmorEnchantGlow(layers, { ...enchant, cape: { ...enchant.cape, percent: 90 } }, { quality: 'desktop' }), 1);
  assert.equal(describeArmorEnchantGlow(layers).cape.enchant.stage, 'Golden Spark');
  assert.equal(describeArmorEnchantGlow(layers).chest.enchant.externalAura, false);
  // a record for a different piece never lights this one; removing the record turns the light off
  const swapped = applyArmorEnchantGlow(layers, { chest: { ...enchant.chest, pieceId: 'frostwarden_chest' } }, { quality: 'desktop' });
  assert.ok(swapped >= 1);
  assert.equal(getEnchantGlowState(chest.material).uniforms.uAxeGain.value, 0);
  // the creator (no game3d_armor_enchant) touches nothing that was never enchanted
  const fresh = armorLayer('chest', 'nightscale_chest');
  assert.equal(applyArmorEnchantGlow(new Map([['chest', fresh]]), undefined), 0);
  assert.equal(getEnchantGlowState(fresh.material), null);
});

function weaponRoot() {
  const root = new THREE.Group();
  root.name = 'WeaponPack_test';
  const original = new THREE.MeshStandardMaterial({ name: 'blade' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.02, 1, 8, 1).translate(0, 0.5, 0), original);
  root.add(mesh);
  const hand = new THREE.Group();
  hand.add(root);
  return { root, mesh, original, hand };
}

test('QA-13/15: weapon renderer adds internal light + tight aura + sparks, and cleans up on rapid equip/unequip', () => {
  const percents = { 'sword#1': 120, 'sword#2': 0 };
  const vfx = createWeaponEnchantVfx({ getPercent: (item) => percents[item.instanceId] ?? 0, getQuality: () => 'desktop' });
  const item = { instanceId: 'sword#1', rarity: 'rare', slot: 'weapon' };
  const { root, mesh, original, hand } = weaponRoot();
  vfx.update(1 / 60, { roots: [root], item, kind: 'blade' });
  assert.notEqual(mesh.material, original, 'a private clone carries the light; the shared material is untouched');
  assert.equal(getEnchantGlowState(original), null);
  assert.ok(getEnchantGlowState(mesh.material).uniforms.uAxeGain.value > 0);
  const aura = mesh.children.filter((child) => /AXE_WeaponEnchantAura/.test(child.name));
  assert.equal(aura.length, 1, 'Rare: one tight aura shell on the weapon itself');
  assert.equal(aura[0].geometry, mesh.geometry, 'the shell shares the weapon geometry (no copy)');
  assert.ok(root.getObjectByName('AXE_WeaponEnchantSparks'), 'Rare at 120%: a few anchored sparks');
  assert.equal(vfx.describe()[0].stage, 'Azure Current');
  // the forming effect swaps the material: the aura hides meanwhile
  const patched = mesh.material;
  mesh.material = new THREE.MeshStandardMaterial();
  vfx.update(1 / 60, { roots: [root], item, kind: 'blade' });
  assert.equal(aura[0].visible, false);
  mesh.material = patched;
  vfx.update(1 / 60, { roots: [root], item, kind: 'blade' });
  assert.equal(aura[0].visible, true);
  // unequip: the root leaves the hand -> originals back, everything freed
  let freed = 0;
  patched.addEventListener('dispose', () => { freed += 1; });
  root.removeFromParent();
  vfx.update(1 / 60, { roots: [], item, kind: 'blade' });
  assert.equal(mesh.material, original);
  assert.equal(mesh.children.length, 0, 'no ghost aura');
  assert.equal(root.getObjectByName('AXE_WeaponEnchantSparks'), undefined);
  assert.equal(freed, 1);
  assert.equal(vfx.activeCount() + vfx.retiringCount(), 0);
  // rapid equip / unequip: nothing accumulates
  for (let i = 0; i < 40; i++) {
    hand.add(root);
    vfx.update(1 / 60, { roots: [root], item, kind: 'blade' });
    root.removeFromParent();
    vfx.update(1 / 60, { roots: [], item, kind: 'blade' });
  }
  assert.equal(mesh.material, original);
  assert.equal(mesh.children.length, 0);
  assert.equal(vfx.activeCount() + vfx.retiringCount(), 0);
  // an unenchanted weapon keeps its own material and gets no aura
  hand.add(root);
  vfx.update(1 / 60, { roots: [root], item: { instanceId: 'sword#2', rarity: 'legendary' }, kind: 'blade' });
  assert.equal(mesh.material, original);
  assert.equal(mesh.children.length, 0);
  // a weapon switch while the old one melts: the old aura disappears at once
  vfx.update(1 / 60, { roots: [root], item, kind: 'blade' });
  const old = mesh.children.find((child) => /AXE_WeaponEnchantAura/.test(child.name));
  vfx.update(1 / 60, { roots: [], item, kind: 'blade' }); // orphaned, still attached (melting)
  assert.equal(old.visible, false);
  vfx.dispose();
  assert.equal(mesh.material, original);
  assert.equal(mesh.children.length, 0);
});

test('Legendary weapons get layered aura shells; a Common aura stays a single faint shell', () => {
  const vfx = createWeaponEnchantVfx({ getPercent: () => 200, getQuality: () => 'desktop' });
  const legendary = weaponRoot();
  vfx.update(1 / 60, { roots: [legendary.root], item: { instanceId: 'l', rarity: 'legendary' }, kind: 'bow' });
  assert.equal(legendary.mesh.children.filter((c) => /Aura/.test(c.name)).length, 3);
  vfx.dispose();
  const common = weaponRoot();
  const vfx2 = createWeaponEnchantVfx({ getPercent: () => 200, getQuality: () => 'desktop' });
  vfx2.update(1 / 60, { roots: [common.root], item: { instanceId: 'c', rarity: 'common' }, kind: 'blade' });
  const shells = common.mesh.children.filter((c) => /Aura/.test(c.name));
  assert.equal(shells.length, 1);
  assert.ok(shells[0].material.uniforms.uStrength.value < 0.1);
  assert.equal(common.root.getObjectByName('AXE_WeaponEnchantSparks'), undefined, 'Common: no particles');
  vfx2.dispose();
});

test('wiring: one hook covers world + viewers, the weapon channel runs beside the summon, previews use the same rules', () => {
  const runtime = read('src/components/onboarding/customizationRuntime.js');
  assert.match(runtime, /import \{ applyArmorEnchantGlow \} from '\.\.\/game3d\/enchantVfx\/armorEnchantGlow\.js'/);
  assert.match(runtime, /applyArmorEnchantGlow\(this\.layers,this\.appearance\.game3d_armor_enchant\)/);
  const bridge = read('src/components/game3d/armor/armorEquipBridge.js');
  assert.match(bridge, /game3d_armor_enchant:armorEnchant/);
  assert.match(bridge, /subscribeEnchantments\(refresh\)/);
  const roster = read('src/components/game3d/equipment/SelectedCharacterArmorPreview.jsx');
  assert.match(roster, /game3d_armor_enchant: enchant/);
  const world = read('src/components/game3d/GameWorld3D.jsx');
  assert.match(world, /weaponEnchantVfx = createWeaponEnchantVfx\(/);
  assert.match(world, /weaponEnchantVfx\?\.update\(delta, \{ roots: weaponRuntime\?\.getRoots\(\) \|\| \[\], item: equippedForAnimation/);
  assert.ok((world.match(/weaponEnchantVfx\?\.dispose\(\)/g) || []).length >= 2, 'disposed on reload and on unmount');
  for (const file of ['src/components/game3d/axe/services/AXEBlacksmithImageWorkspace.jsx',
    'src/components/game3d/axe/services/AXEGlobalServicesMenu.jsx', 'src/components/game3d/progression/hub/CharacterInventoryTab.jsx']) {
    assert.match(read(file), /<EnchantLightPreview item=/, file);
  }
});

test('QA-22: the enchantment visuals never write gameplay state', () => {
  const dir = path.join(ROOT, 'src/components/game3d/enchantVfx');
  for (const name of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /\b(enchantSlot|reinforceItem|overEnchantItem|grantMaterials|setServerUpgradeRecord|purgeEnhancementStateForItem|equipAXEInventoryItem|unequipAXEInventoryItem)\s*\(/, name);
    assert.doesNotMatch(source, /localStorage\.setItem|\.setItem\(/, name);
  }
});
