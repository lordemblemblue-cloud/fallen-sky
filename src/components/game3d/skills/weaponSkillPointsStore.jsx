// Character-scoped Game 3D weapon skill point allocations.
// The source of entitlement is the already-persisted character level, not a
// mutable earned-points counter. Attribute points and skill-use XP stay separate.
import { characterScopedStorage, subscribeCharacterChange } from '../characterStorage';
import { getPlayerHUD, subscribePlayerHUD } from '../playerHUDStore';
import {
  WEAPON_SKILL_POINTS_KEY, blankWeaponSkillPoints, checkWeaponSkillPoints,
  investWeaponSkillPoints, weaponSkillState, chargedWeaponSkillBonusPct,
  chargedWeaponSkillPassivePct, weaponSkillTierForId, weaponTierUnlocked,
} from '../../../../base44/shared/weaponSkillPoints.mjs';

const storage = characterScopedStorage(WEAPON_SKILL_POINTS_KEY);
const listeners = new Set();
let lastLevel = Math.max(1, Number(getPlayerHUD().level) || 1);

function read() {
  try {
    const saved = JSON.parse(storage.get() || 'null');
    if (saved && checkWeaponSkillPoints(saved, lastLevel).length === 0) return saved;
  } catch { /* no existing character allocation */ }
  return blankWeaponSkillPoints();
}
let allocation = read();
function notify() {
  const next = getWeaponSkillPoints();
  listeners.forEach(fn => fn(next));
}
export function getWeaponSkillPoints() {
  const level = Math.max(1, Math.floor(Number(getPlayerHUD().level) || 1));
  const save = { v: 1, nodes: Object.fromEntries(
    Object.entries(allocation.nodes).map(([id, nodes]) => [id, nodes.slice()])) };
  return { level, save, ...weaponSkillState(save, level) };
}
export function getWeaponSkillChargeBonusPct(skillId) {
  return chargedWeaponSkillBonusPct(allocation, skillId) + chargedWeaponSkillPassivePct(allocation, skillId);
}
export function isWeaponSkillUnlocked(skillId) {
  const tier = weaponSkillTierForId(skillId);
  return !tier || weaponTierUnlocked(allocation, tier.pathId, tier.tierIndex);
}
export function investWeaponSkillPoint(pathId, tierIndex, amount = 1) {
  const level = Math.max(1, Math.floor(Number(getPlayerHUD().level) || 1));
  const result = investWeaponSkillPoints(allocation, level, pathId, tierIndex, amount);
  if (!result.ok) return result;
  try { storage.set(JSON.stringify(result.save)); }
  catch { return { ok: false, reason: 'SAVE_FAILED' }; }
  allocation = result.save;
  notify();
  return { ok: true, ...getWeaponSkillPoints() };
}
export function subscribeWeaponSkillPoints(fn) {
  listeners.add(fn);
  fn(getWeaponSkillPoints());
  return () => listeners.delete(fn);
}
subscribeCharacterChange(() => {
  lastLevel = Math.max(1, Number(getPlayerHUD().level) || 1);
  allocation = read();
  notify();
});
subscribePlayerHUD(hud => {
  const level = Math.max(1, Math.floor(Number(hud.level) || 1));
  if (level === lastLevel) return;
  lastLevel = level;
  // A server-restored save may be older or newer. Do not mutate allocations on
  // level change; the shared entitlement and Vault validator handle the budget.
  notify();
});
