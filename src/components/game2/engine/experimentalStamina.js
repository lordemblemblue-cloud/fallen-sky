// Offline-only Experimental saber stamina. Shared by the local player and
// local saber-wielding AI; separate from Force points, Classic and multiplayer.
export const STAMINA_MAX = 100;
export const STAMINA_SWING_COST = 14;
export const STAMINA_BLOCK_COST = 20;
export const STAMINA_CLASH_COST = 9;
export const STAMINA_AI_BACKOFF_THRESHOLD = 30;
export const STAMINA_GUARD_PER_SEC = 12;
export const STAMINA_REGEN_PER_SEC = 20;
export const STAMINA_REGEN_DELAY = 0.55;
export const STAMINA_BREAK_SECONDS = 1.2;

export const createStamina = () => ({ current: STAMINA_MAX, brokenUntil: 0, recoverAt: 0 });

export function staminaBroken(state, now) {
  return !!state && Number.isFinite(now) && (state.brokenUntil || 0) > now;
}

function safeState(state) {
  const s = state || createStamina();
  return {
    current: Math.max(0, Math.min(STAMINA_MAX, Number.isFinite(s.current) ? s.current : STAMINA_MAX)),
    brokenUntil: Number.isFinite(s.brokenUntil) ? s.brokenUntil : 0,
    recoverAt: Number.isFinite(s.recoverAt) ? s.recoverAt : 0,
  };
}

export function spendStamina(state, cost, now) {
  const s = safeState(state);
  if (!Number.isFinite(now) || !Number.isFinite(cost) || cost < 0 || staminaBroken(s, now)) {
    return { state: s, paid: false, broke: false };
  }
  if (s.current < cost || s.current - cost <= 0) {
    const brokenUntil = now + STAMINA_BREAK_SECONDS;
    return { state: { current: 0, brokenUntil, recoverAt: brokenUntil + STAMINA_REGEN_DELAY },
      paid: s.current >= cost, broke: true };
  }
  return { state: { current: s.current - cost, brokenUntil: s.brokenUntil,
    recoverAt: now + STAMINA_REGEN_DELAY }, paid: true, broke: false };
}

export function stepStamina(state, { dt = 0, now = 0, guarding = false } = {}) {
  const s = safeState(state);
  if (!Number.isFinite(dt) || !Number.isFinite(now) || dt <= 0 || staminaBroken(s, now)) return s;
  const seconds = Math.min(dt, 0.1);
  if (guarding) return spendStamina(s, STAMINA_GUARD_PER_SEC * seconds, now).state;
  if (now < s.recoverAt) return s;
  return { ...s, current: Math.min(STAMINA_MAX, s.current + STAMINA_REGEN_PER_SEC * seconds) };
}
