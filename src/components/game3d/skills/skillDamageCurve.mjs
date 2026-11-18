// ─── Skill damage curve — an optional balance setting ───────────────────
// The level-dependent damage of sword, bow and dagger skills (Claude implementation handoff,
// section 6). Rules and the before/after table: docs/game3d/SKILL_DAMAGE_CURVE_20261118.md.
//
// OFF by default. While it is off nothing in this file changes a number: a skill's damage is
// scaleStat(skill, 'damage_pct', level), the linear min → max growth, exactly as before.
//
// ON, a skill that has a cap swaps that linear growth for
//     damage_pct(level) = min × M
//     t = clamp((level − 1) / (max_level − 1), 0, 1)     progress through the skill's own levels
//     M = 1 + cap × (0.65 t + 0.35 t²)                    1 at level 1, 1 + cap at max level
// It REPLACES the linear growth (the registry's `max` goes unused); it never multiplies on top of
// it. It is applied at one point only, scaleSkillDamage in skillRegistry.jsx, which
// skillExecutor.dispatchStrike calls, so a skill's level is never scaled twice. Level 1 is unchanged.
//
// Pure: no imports and no side effects at load, so node tests load it directly.

// Caps are fractions of the level-1 value: 0.40 = +40 % at the skill's max level.
export const SKILL_DAMAGE_CURVE_CONFIG = Object.freeze({
  // THE balance setting. Off until the balance review approves the curve.
  enabled: false,
  // By the skill's weapon_type.
  familyCaps: Object.freeze({
    sword: 0.40,
    ranged: 0.35, // bow
    guardian: 0.30, // daggers: see guardianWeaponIds
  }),
  // Guardian skills (Twin Fang Combo, Crushing Blow, ...) can be cast with other guardian-type
  // weapons too. They get the curve only while one of these mastery weapon ids is in hand;
  // with any other weapon they keep the linear growth.
  guardianWeaponIds: Object.freeze(['dual_blades']),
  // Per-skill cap override by skill_id, e.g. { sword_heavy_strike: 0.45 }. A number replaces the
  // family cap (guardian skills still need the weapon rule above). null keeps that one skill on
  // the linear growth. Anything that is not a finite number >= 0 counts as null.
  skillCaps: Object.freeze({}),
});

const hasOwn = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
const validCap = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// t: how far through its own levels the skill is, 0 at level 1 and 1 at max_level.
export function skillCurveProgress(level, maxLevel) {
  const lvl = Number(level) || 1;
  const span = Math.max(1, (Number(maxLevel) || 1) - 1);
  return clamp01((lvl - 1) / span);
}

// M: 1 at t = 0, 1 + cap at t = 1; slower than linear at first, catching up at the top.
export function skillCurveMultiplier(cap, t) {
  const x = clamp01(Number(t) || 0);
  return 1 + cap * (0.65 * x + 0.35 * x * x);
}

// The cap that applies to this skill right now, or null when it keeps the linear growth.
// heldWeapon: the held weapon's mastery id ('dual_blades' for daggers), or a function returning it.
// A function is only called for guardian skills, the one family whose cap depends on the weapon.
export function resolveSkillCurveCap(skill, heldWeapon = null, config = SKILL_DAMAGE_CURVE_CONFIG) {
  const family = skill?.weapon_type;
  if (family === 'guardian') {
    const held = typeof heldWeapon === 'function' ? heldWeapon() : heldWeapon;
    const allowed = config?.guardianWeaponIds;
    if (typeof held !== 'string' || !Array.isArray(allowed)
      || !allowed.some((id) => String(id).toLowerCase() === held.toLowerCase())) return null;
  }
  if (hasOwn(config?.skillCaps, skill?.skill_id)) return validCap(config.skillCaps[skill.skill_id]);
  return hasOwn(config?.familyCaps, family) ? validCap(config.familyCaps[family]) : null;
}

// The curved damage_pct of a skill at `level`, or null when the setting is off or the skill has
// no cap (the caller then uses the linear growth). Needs only the skill's level-1 value, `min`.
export function curvedSkillDamagePct(skill, level, heldWeapon = null, config = SKILL_DAMAGE_CURVE_CONFIG) {
  if (config?.enabled !== true) return null;
  const min = skill?.scaling?.damage_pct?.min;
  if (typeof min !== 'number' || !Number.isFinite(min)) return null;
  const cap = resolveSkillCurveCap(skill, heldWeapon, config);
  if (cap === null) return null;
  return min * skillCurveMultiplier(cap, skillCurveProgress(level, skill.max_level));
}

// ─── Turning the setting on for a playtest ──────────────────────────────
// Highest first:
//   1. on a developer machine (a dev build, or localhost): `?skillCurve=1` / `?skillCurve=0` in the
//      address, remembered in this browser until the other value is used;
//   2. the build flag VITE_GAME3D_SKILL_DAMAGE_CURVE = 'true' | 'false';
//   3. SKILL_DAMAGE_CURVE_CONFIG.enabled (false).
// A live site never reads the address or the browser storage for this.
export const SKILL_DAMAGE_CURVE_QUERY = 'skillCurve';
export const SKILL_DAMAGE_CURVE_STORAGE_KEY = 'axe_skill_damage_curve_v1';

const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1'
  || hostname === '[::1]' || hostname === '::1' || String(hostname).endsWith('.localhost');

export function resolveSkillDamageCurveEnabled({
  base = SKILL_DAMAGE_CURVE_CONFIG.enabled, env = {}, search = '', storage = null, hostname = '', dev = false,
} = {}) {
  if (dev === true || isLocalHost(hostname)) {
    let param = null;
    try { param = new globalThis.URLSearchParams(search).get(SKILL_DAMAGE_CURVE_QUERY); } catch { param = null; }
    if (param === '1' || param === '0') {
      try { storage?.setItem?.(SKILL_DAMAGE_CURVE_STORAGE_KEY, param); } catch { /* storage may be blocked */ }
      return param === '1';
    }
    try {
      const saved = storage?.getItem?.(SKILL_DAMAGE_CURVE_STORAGE_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch { /* storage may be blocked */ }
  }
  const build = env?.VITE_GAME3D_SKILL_DAMAGE_CURVE;
  if (build === 'true') return true;
  if (build === 'false') return false;
  return base === true;
}

let liveConfig = null;

// For tests: forget the resolved setting so the next getSkillDamageCurveConfig() reads the page again.
export function resetSkillDamageCurveConfig() { liveConfig = null; }

// The config the game runs with: SKILL_DAMAGE_CURVE_CONFIG with `enabled` resolved once per page load.
export function getSkillDamageCurveConfig() {
  if (liveConfig) return liveConfig;
  let env = {};
  try { env = import.meta.env || {}; } catch { env = {}; }
  const hostname = globalThis.location?.hostname || '';
  const dev = env.DEV === true;
  let storage = null; // only a developer machine reads the address or the storage (see above)
  if (dev || isLocalHost(hostname)) {
    try { storage = globalThis.localStorage || null; } catch { storage = null; }
  }
  const enabled = resolveSkillDamageCurveEnabled({
    env, storage, hostname, dev, search: globalThis.location?.search || '',
  });
  liveConfig = enabled === SKILL_DAMAGE_CURVE_CONFIG.enabled
    ? SKILL_DAMAGE_CURVE_CONFIG
    : Object.freeze({ ...SKILL_DAMAGE_CURVE_CONFIG, enabled });
  if (liveConfig.enabled) {
    const show = (cap) => (validCap(cap) === null ? 'linear' : `+${Math.round(cap * 1000) / 10}%`);
    const caps = liveConfig.familyCaps;
    globalThis.console?.info?.('[skill damage curve] ON: skill damage follows the curve, not the linear growth '
      + `(sword ${show(caps.sword)}, bow ${show(caps.ranged)}, daggers ${show(caps.guardian)}).`);
  }
  return liveConfig;
}
