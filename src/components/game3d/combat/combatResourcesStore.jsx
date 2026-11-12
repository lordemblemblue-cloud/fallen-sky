import { getPlayerHUD } from '../playerHUDStore';
import { subscribeCharacterChange } from '../characterStorage';
import {
  createCombatResourceLedger, syncCombatResourceCaps,
  trySpendCombatResource, advanceCombatResourceLedger, combatActionCost,
} from './CombatResourceLedger';

let state = createCombatResourceLedger(getPlayerHUD());
const listeners = new Set();
let uiAccumulator = 0;

const notify = () => listeners.forEach(listener => listener(state));

export function getCombatResources() {
  return state;
}

export function subscribeCombatResources(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function syncCombatResources() {
  const next = syncCombatResourceCaps(state, getPlayerHUD());
  if (next !== state) { state = next; notify(); }
  return state;
}

export function canSpendCombatResource(action, skill = null) {
  syncCombatResources();
  const hud = getPlayerHUD();
  if ((Number(hud.hp) || 0) <= 0) return { ok: false, reason: 'player_dead' };
  const cost = combatActionCost(action, skill);
  if (state.stamina + 1e-8 < cost.stamina) return { ok: false, reason: 'not_enough_stamina', cost };
  if (state.will + 1e-8 < cost.will) return { ok: false, reason: 'not_enough_will', cost };
  return { ok: true, cost };
}

export function spendCombatResource(action, skill = null) {
  syncCombatResources();
  if ((Number(getPlayerHUD().hp) || 0) <= 0) return { ok: false, reason: 'player_dead' };
  const result = trySpendCombatResource(state, action, skill);
  if (result.ok) { state = result.state; notify(); }
  return result;
}

// GameWorld3D is the only ticker. Avoid forcing 60 React rerenders per second.
export function tickCombatResources(delta) {
  const hud = getPlayerHUD();
  const next = advanceCombatResourceLedger(
    syncCombatResourceCaps(state, hud), delta, { alive: (Number(hud.hp) || 0) > 0 },
  );
  if (next === state) return;
  const capacityChanged = next.maxWill !== state.maxWill || next.maxStamina !== state.maxStamina;
  state = next;
  uiAccumulator += Math.max(0, Number(delta) || 0);
  if (capacityChanged || uiAccumulator >= 0.12) {
    uiAccumulator = 0;
    notify();
  }
}

export function resetCombatResources() {
  state = createCombatResourceLedger(getPlayerHUD());
  uiAccumulator = 0;
  notify();
}

// Never inherit another character's partially drained Will/stamina.
subscribeCharacterChange(resetCombatResources);
