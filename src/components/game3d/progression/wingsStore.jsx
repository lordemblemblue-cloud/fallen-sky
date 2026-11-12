// ─── Wings Store ───────────────────────────────────────────────────────────
// Persistent, character-scoped Angel Wings progression.
//
// Each Wing path (type) tracks its OWN level, raised via the same attempt/RNG
// spend of HUD kills as Halo (HALO_ATTEMPT_COST, Halo success bands). You can
// level each wing type SEPARATELY. Only ONE wing is equipped at a time — that
// one contributes its multiplier + specialization to derived stats.
//
// API:
//   attemptWingEnhancement(pathId)       — spend kills, roll level up on a path
//   attemptWingEnhancementBatch(pathId) — run N attempts in sequence
//   equipWings(pathId) / unequipWings()  — set the active wing
//   getWingsState()                     — full snapshot for UI
//   getEquippedWingsMultiplierBonuses()  — virtual attribute points for statsSystem
//   getEquippedWingsFlatBonuses()        — flat final stats for statsSystem
//   subscribeWings(fn)                  — reactive subscription (re-emits on kills)
//   setWingLevel(pathId, level)          — admin / debug
//   resetWings()                        — admin / debug

import {
  MAX_WING_LEVEL,
  WING_ATTEMPT_COST,
  getWingSuccessChance,
  getWingMultiplierForLevel,
  getWingFlatBonusesForLevel,
  getWingPathById,
  WING_PATHS,
} from './wingsData';
import {
  getKillCount,
  incrementKillCount,
  subscribeKillCount,
} from '../killCountStore';
import { characterScopedStorage, subscribeCharacterChange } from '../characterStorage';
import { isPreviewMaxActive, subscribePreviewMax } from './previewMaxMode';
import {
  AXE_WING_REINFORCEMENT_CONFIG,
  getAXEWingReinforcementChance,
  getAXEWingReinforcementCost,
  getAXEWingStatScale,
  getAXEWingVisualTier,
  resolveAXEWingReinforcement,
} from '../axe/progression/AXEWingReinforcementSystem';

const storage = characterScopedStorage('wings_progression_v1');

const initialPaths = () => {
  const p = {};
  WING_PATHS.forEach((w) => { p[w.id] = { level: 0, totalAttempts: 0, totalSuccesses: 0, reinforcementPercent: 0 }; });
  return p;
};

const loadState = () => {
  try {
    const raw = storage.get();
    if (raw) {
      const parsed = JSON.parse(raw);
      const paths = initialPaths();
      Object.keys(parsed.paths || {}).forEach((id) => {
        if (paths[id]) {
          const p = parsed.paths[id];
          paths[id] = {
            level:          Math.max(0, Math.min(MAX_WING_LEVEL, p.level || 0)),
            totalAttempts:  Math.max(0, p.totalAttempts || 0),
            totalSuccesses: Math.max(0, p.totalSuccesses || 0),
            reinforcementPercent: Math.max(
              0,
              Math.min(AXE_WING_REINFORCEMENT_CONFIG.maxPercent, Number(p.reinforcementPercent || 0)),
            ),
          };
        }
      });
      return {
        paths,
        equippedPathId: parsed.equippedPathId || null,
        visualStyle: parsed.visualStyle === 'blue_energy' ? 'blue_energy' : 'classic',
        materials: {
          wing_feather: Math.max(0, Number(parsed.materials?.wing_feather ?? 24)),
          wing_essence: Math.max(0, Number(parsed.materials?.wing_essence ?? 12)),
          wing_stabilizer: Math.max(0, Number(parsed.materials?.wing_stabilizer ?? 3)),
        },
      };
    }
  } catch {}
  return {
    paths: initialPaths(),
    equippedPathId: null,
    visualStyle: 'classic',
    materials: { wing_feather: 24, wing_essence: 12, wing_stabilizer: 3 },
  };
};

let state = loadState();
let previewEquippedPathId; // undefined = use saved selection; null = preview unequipped
const listeners = new Set();
const save = () => { storage.set(JSON.stringify(state)); };
const emit = () => { listeners.forEach((fn) => fn(getWingsState())); };

subscribeCharacterChange(() => { previewEquippedPathId = undefined; state = loadState(); emit(); });
subscribeKillCount(() => emit());
subscribePreviewMax(() => { if (!isPreviewMaxActive('wings')) previewEquippedPathId = undefined; emit(); });

const equippedId = () => !isPreviewMaxActive('wings') ? state.equippedPathId
  : previewEquippedPathId !== undefined ? previewEquippedPathId : state.equippedPathId || WING_PATHS[0]?.id || null;

const scaleWingBonuses = (bonuses = {}, percent = 0) => {
  const scale = getAXEWingStatScale(percent);
  return Object.fromEntries(
    Object.entries(bonuses || {}).map(([key, value]) => [
      key,
      Number.isFinite(Number(value)) ? Number(value) * scale : value,
    ]),
  );
};

// ── Public API ────────────────────────────────────────────────────────────

export function getWingsState() {
  const preview = isPreviewMaxActive('wings');
  const selectedId = equippedId();
  const kills = getKillCount();
  const paths = {};
  WING_PATHS.forEach((def) => {
    const p = state.paths[def.id];
    const level = preview ? MAX_WING_LEVEL : p.level;
    const reinforcementPercent = preview ? AXE_WING_REINFORCEMENT_CONFIG.maxPercent : Number(p.reinforcementPercent || 0);
    paths[def.id] = {
      ...def,
      level:           level,
      totalAttempts:   p.totalAttempts,
      totalSuccesses:  p.totalSuccesses,
      reinforcementPercent,
      reinforcementChance: getAXEWingReinforcementChance(reinforcementPercent),
      reinforcementCost: getAXEWingReinforcementCost(reinforcementPercent, false),
      visualTier: getAXEWingVisualTier(reinforcementPercent),
      isMaxReinforcement: reinforcementPercent >= AXE_WING_REINFORCEMENT_CONFIG.maxPercent,
      isMaxLevel:      level >= MAX_WING_LEVEL,
      successChance:   getWingSuccessChance(level),
      multiplierBonuses: scaleWingBonuses(getWingMultiplierForLevel(level), reinforcementPercent),
      flatBonuses: scaleWingBonuses(getWingFlatBonusesForLevel(def.id, level), reinforcementPercent),
      nextFlatBonuses: level < MAX_WING_LEVEL
        ? scaleWingBonuses(getWingFlatBonusesForLevel(def.id, level + 1), reinforcementPercent)
        : null,
    };
  });
  return {
    paths,
    equippedPathId: selectedId,
    visualStyle: state.visualStyle || 'classic',
    equippedWing: selectedId ? paths[selectedId] : null,
    attemptCost: WING_ATTEMPT_COST,
    kills,
    materials: { ...(state.materials || {}) },
    maxReinforcementPercent: AXE_WING_REINFORCEMENT_CONFIG.maxPercent,
  };
}

export function subscribeWings(fn) {
  listeners.add(fn);
  fn(getWingsState());
  return () => listeners.delete(fn);
}

export function equipWings(pathId) {
  if (!getWingPathById(pathId)) return;
  if (isPreviewMaxActive('wings')) { previewEquippedPathId = pathId; emit(); return; }
  state.equippedPathId = pathId;
  save();
  emit();
}

// Cosmetic option shared by all factions. This never changes levels, stats or kills.
export function setWingVisualStyle(style) {
  if (!['classic', 'blue_energy'].includes(style)) return { ok: false, reason: 'INVALID_STYLE' };
  if (isPreviewMaxActive('wings')) return { ok: false, reason: 'TEST_PREVIEW_READ_ONLY' };
  if (state.visualStyle === style) return { ok: true };
  state = { ...state, visualStyle: style };
  save();
  emit();
  return { ok: true };
}

export function unequipWings() {
  if (isPreviewMaxActive('wings')) { previewEquippedPathId = null; emit(); return; }
  state.equippedPathId = null;
  save();
  emit();
}

// Attempt to enhance a specific wing path. Spends WING_ATTEMPT_COST kills.
export function attemptWingEnhancement(pathId) {
  if (isPreviewMaxActive('wings')) return { ok: false, reason: 'test_preview_read_only' };
  const p = state.paths[pathId];
  if (!p) return { ok: false, reason: 'no_path' };
  if (p.level >= MAX_WING_LEVEL) return { ok: false, reason: 'max_level' };
  const banked = getKillCount();
  if (banked < WING_ATTEMPT_COST) {
    return { ok: false, reason: 'insufficient_kills', need: WING_ATTEMPT_COST, have: banked };
  }
  const chance = getWingSuccessChance(p.level);
  const success = Math.random() < chance;
  let nextLevel = p.level;
  if (success) nextLevel += 1;
  state.paths[pathId] = {
    ...p,
    level:          nextLevel,
    totalAttempts:  p.totalAttempts + 1,
    totalSuccesses: p.totalSuccesses + (success ? 1 : 0),
  };
  save();
  incrementKillCount(-WING_ATTEMPT_COST);
  return { ok: true, success, level: nextLevel, chance, pathId };
}

export function attemptWingEnhancementBatch(pathId, count) {
  const n = Math.max(1, Math.floor(count || 0));
  let attempts = 0;
  let successes = 0;
  for (let i = 0; i < n; i++) {
    const r = attemptWingEnhancement(pathId);
    if (!r.ok) break;
    attempts += 1;
    if (r.success) successes += 1;
    if ((state.paths[pathId]?.level || 0) >= MAX_WING_LEVEL) break;
  }
  return { attempts, successes, finalLevel: state.paths[pathId]?.level || 0 };
}

const canAffordWingMaterials = (cost = {}) =>
  Object.entries(cost).every(([id, amount]) => Number(state.materials?.[id] || 0) >= Number(amount || 0));

const consumeWingMaterials = (cost = {}) => {
  const next = { ...(state.materials || {}) };
  for (const [id, amount] of Object.entries(cost)) next[id] = Math.max(0, Number(next[id] || 0) - Number(amount || 0));
  state = { ...state, materials: next };
};

export function attemptWingReinforcement(pathId, {
  protectedAttempt = false,
  roll,
} = {}) {
  if (isPreviewMaxActive('wings')) return { ok: false, reason: 'test_preview_read_only' };
  const p = state.paths[pathId];
  if (!p) return { ok: false, reason: 'no_path' };

  const current = Number(p.reinforcementPercent || 0);
  if (current >= AXE_WING_REINFORCEMENT_CONFIG.maxPercent) {
    return { ok: false, reason: 'max_reinforcement', percent: current };
  }

  const cost = getAXEWingReinforcementCost(current, protectedAttempt);
  if (!canAffordWingMaterials(cost)) {
    return { ok: false, reason: 'insufficient_materials', cost, materials: { ...(state.materials || {}) } };
  }

  const result = resolveAXEWingReinforcement(current, {
    protectedAttempt,
    ...(Number.isFinite(roll) ? { roll } : {}),
  });

  consumeWingMaterials(cost);
  state.paths[pathId] = {
    ...p,
    reinforcementPercent: result.percent,
  };
  save();
  emit();
  return { ...result, cost, pathId, visualTier: getAXEWingVisualTier(result.percent) };
}

export function grantWingMaterials(delta = {}) {
  state = {
    ...state,
    materials: {
      wing_feather: Number(state.materials?.wing_feather || 0) + Math.max(0, Number(delta.wing_feather || 0)),
      wing_essence: Number(state.materials?.wing_essence || 0) + Math.max(0, Number(delta.wing_essence || 0)),
      wing_stabilizer: Number(state.materials?.wing_stabilizer || 0) + Math.max(0, Number(delta.wing_stabilizer || 0)),
    },
  };
  save();
  emit();
  return { ...state.materials };
}

// ── Stats pipeline hooks ──────────────────────────────────────────────────
// Only the EQUIPPED wing contributes bonuses. Multiplier = virtual attribute
// points (same shape as Halo); flat = final stats (same shape as Title).
export function getEquippedWingsMultiplierBonuses() {
  const id = equippedId();
  if (!id) return null;
  const p = state.paths[id];
  const preview = isPreviewMaxActive('wings');
  return scaleWingBonuses(getWingMultiplierForLevel(preview ? MAX_WING_LEVEL : p.level),
    preview ? AXE_WING_REINFORCEMENT_CONFIG.maxPercent : p.reinforcementPercent || 0);
}

export function getEquippedWingsFlatBonuses() {
  const id = equippedId();
  if (!id) {
    return { hp: 0, damage: 0, defense: 0, critChance: 0, critDamage: 0, criticalDefense: 0 };
  }
  const p = state.paths[id];
  const preview = isPreviewMaxActive('wings');
  return scaleWingBonuses(
    getWingFlatBonusesForLevel(id, preview ? MAX_WING_LEVEL : p.level),
    preview ? AXE_WING_REINFORCEMENT_CONFIG.maxPercent : p.reinforcementPercent || 0,
  );
}

export function setWingLevel(pathId, level) {
  const p = state.paths[pathId];
  if (!p) return;
  state.paths[pathId] = { ...p, level: Math.max(0, Math.min(MAX_WING_LEVEL, Math.round(level))) };
  save();
  emit();
}

export function resetWings() {
  state = { paths: initialPaths(), equippedPathId: null, visualStyle: 'classic', materials: { wing_feather: 24, wing_essence: 12, wing_stabilizer: 3 } };
  save();
  emit();
}