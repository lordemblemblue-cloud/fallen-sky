// HP, Stamina, Will, shield, and the Dimensional Veil's state, with their regeneration.
// "Will controls whether reality can reach you. Armor protects you when it tries. Swordsmanship determines
// whether you survive when both defenses fail." (owner's design document)
import { VITALS, VEIL } from './tuning.mjs';

export function createVitals(overrides = {}) {
  const max = { hp: VITALS.hp, stamina: VITALS.stamina, will: VITALS.will, shield: VITALS.shield, ...overrides };
  return {
    max,
    hp: max.hp,
    stamina: max.stamina,
    will: max.will,
    shield: max.shield,
    collapsed: false, // Veil Collapse: the body is tangible
    collapsedAt: -Infinity,
    winded: false, // stamina ran dry: no rolls or heavy attacks until it recovers
    lastStaminaSpend: -Infinity,
    lastWillSpend: -Infinity,
    lastShieldHit: -Infinity,
    lastHurt: -Infinity, // when the body last lost HP
    dead: false,
  };
}

// 'stable' | 'unstable' | 'collapsed': drives the Veil's look (patterns intact, breaking, gone) and the leak.
export function veilState(v) {
  if (v.collapsed) return 'collapsed';
  return v.will < v.max.will * VEIL.unstableBelow ? 'unstable' : 'stable';
}

export function spendStamina(v, amount, now) {
  if (amount <= 0) return true;
  if (v.winded || v.stamina < amount) return false;
  v.stamina -= amount;
  v.lastStaminaSpend = now;
  if (v.stamina <= 0) { v.stamina = 0; v.winded = true; }
  return true;
}

// Drains stamina without a check (blocking, sprinting): may leave the fighter winded.
export function drainStamina(v, amount, now) {
  if (amount <= 0) return 0;
  const paid = Math.min(v.stamina, amount);
  v.stamina -= paid;
  v.lastStaminaSpend = now;
  if (v.stamina <= 0) { v.stamina = 0; v.winded = true; }
  return paid;
}

export function spendWill(v, amount, now) {
  if (amount <= 0) return true;
  if (v.collapsed || v.will < amount) return false;
  v.will -= amount;
  v.lastWillSpend = now;
  if (v.will <= 0) collapseVeil(v, now);
  return true;
}

// Drains Will without a check (the Veil stopping a hit, holding a grip): may collapse the Veil.
export function drainWill(v, amount, now) {
  if (amount <= 0 || v.collapsed) return 0;
  const paid = Math.min(v.will, amount);
  v.will -= paid;
  v.lastWillSpend = now;
  if (v.will <= 1e-9) collapseVeil(v, now);
  return paid;
}

export function collapseVeil(v, now) {
  v.will = 0;
  v.collapsed = true;
  v.collapsedAt = now;
}

export function regenerate(v, dt, now) {
  if (v.dead || dt <= 0) return;
  if (now - v.lastStaminaSpend >= VITALS.staminaRegenDelay) {
    v.stamina = Math.min(v.max.stamina, v.stamina + VITALS.staminaRegenPerSec * dt);
    if (v.winded && v.stamina >= VITALS.staminaRecoverAt) v.winded = false;
  }
  const willDelay = v.collapsed ? VEIL.collapseRecoverDelay : VITALS.willRegenDelay;
  const since = v.collapsed ? now - v.collapsedAt : now - v.lastWillSpend;
  if (since >= willDelay) {
    v.will = Math.min(v.max.will, v.will + VITALS.willRegenPerSec * (v.willRegenScale || 1) * dt);
    if (v.collapsed && v.will >= VEIL.collapseRestoreAt) v.collapsed = false; // the Veil re-forms
  }
  if (now - v.lastShieldHit >= VITALS.shieldRegenDelay) v.shield = Math.min(v.max.shield, v.shield + VITALS.shieldRegenPerSec * dt);
}
