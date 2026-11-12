import { subscribeWeaponMasteryEvents } from '../weaponMastery/WeaponMasteryEngine';
import { getPlayerHUD, subscribePlayerHUD } from '../../playerHUDStore';
import { getActiveEquippedAXEWeapon } from '../../axe/equipment/AXEEquipmentInventoryStore';
import { resolveAXEWeaponIdentity } from '../../axe/weapons/AXEWeaponIdentity';
import { weaponTrials } from './weaponTrialStore';

let owners = 0;
let cleanup = null;
// HUD owns the runtime, not the menu. Repeated mounts must not double-count hits.
export function bindWeaponTrialsRuntime() {
  if (typeof window === 'undefined') return () => {};
  owners += 1;
  if (owners === 1) {
    const credit = (damage, reportedFamily = null) => {
      if (!(getPlayerHUD().hp > 0)) return;
      const weapon = getActiveEquippedAXEWeapon();
      if (!weapon) return;
      const weaponId = resolveAXEWeaponIdentity(weapon).masteryWeaponId;
      if (reportedFamily && reportedFamily !== weaponId) return;
      weaponTrials.hit({ weaponId, damage });
    };
    const offMastery = subscribeWeaponMasteryEvents((event) => {
      if (event?.type === 'ON_HIT') credit(event.damage, event.weaponId);
    });
    const onPractice = (event) => credit(event.detail?.damage);
    const onBoss = (event) => {
      if (['player', 'arrow', 'player_attack', 'charged_bow'].includes(event.detail?.source)) {
        credit(event.detail.damage);
      }
    };
    let alive = getPlayerHUD().hp > 0;
    const offHUD = subscribePlayerHUD((hud) => {
      const nextAlive = hud.hp > 0;
      if (alive && !nextAlive) weaponTrials.resetAttempt('Defeated. Start a fresh attempt after recovering.');
      alive = nextAlive;
    });
    window.addEventListener('axePracticeHitLanded', onPractice);
    window.addEventListener('bossDamageTaken', onBoss);
    window.addEventListener('rogueBossDamageTaken', onBoss);
    const timer = setInterval(() => weaponTrials.tick(), 250);
    cleanup = () => {
      offMastery(); offHUD(); clearInterval(timer);
      window.removeEventListener('axePracticeHitLanded', onPractice);
      window.removeEventListener('bossDamageTaken', onBoss);
      window.removeEventListener('rogueBossDamageTaken', onBoss);
      weaponTrials.resetAttempt('Practice paused while away. Your next landed hit starts again.');
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true; owners -= 1;
    if (owners === 0) { cleanup?.(); cleanup = null; }
  };
}
