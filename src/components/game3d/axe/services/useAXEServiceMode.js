import { useEffect, useState, useSyncExternalStore } from 'react';
import { createAXEServiceModeController } from './AXEServiceModeController.js';
import { getAXEServiceGroupForService } from './AXEServiceGroups.js';
import { summonAXEServiceStation, enterAXEServiceStation, leaveAXEServiceStation,
  setAXEStationPreview } from './world/AXEServiceStationStore.js';
import { getPlayerHUD, subscribePlayerHUD } from '../../playerHUDStore';
import { subscribeDeath, isDead } from '../../death/deathStore';
import { subscribeCharacterChange } from '../../characterStorage';
import { canSwitchAdvancedClass } from '../../talents/advancedClassStore';
import { getAXEDungeonState } from '../dungeons/AXEDungeonStore';

export function getAXEServiceModeRestriction(groupId = null) {
  if (isDead() || getPlayerHUD().hp <= 0) return 'Services are unavailable while you are dead.';
  // Character and Skill Book are direct character management views. Allow the
  // player to open and read their stats/skill catalog without requiring a
  // workstation or an advanced-class switch. Physical services still keep
  // the combat/dungeon restrictions below.
  if (groupId === 'character' || groupId === 'skills') return null;
  if (getAXEDungeonState().activeSession) return 'Leave the dungeon before using Services.';
  const combat = canSwitchAdvancedClass();
  return combat.allowed ? null : combat.reason.replace('switch class', 'use services');
}

export default function useAXEServiceMode() {
  const [controller] = useState(() => createAXEServiceModeController({
    summon: summonAXEServiceStation, enter: enterAXEServiceStation, leave: leaveAXEServiceStation,
    canOpen: getAXEServiceModeRestriction,
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    const syncInput = () => {
      window.__axeServiceModeOpen = !!controller.getSnapshot().groupId;
      if (window.__axeServiceModeOpen) {
        document.exitPointerLock?.();
        window.dispatchEvent(new CustomEvent('playerSkillCastCancel'));
      } else setAXEStationPreview(null);
    };
    syncInput();
    const unsubscribe = controller.subscribe(syncInput);
    const onWorldRequest = event => {
      const detail = event.detail || {};
      const group = detail.groupId || getAXEServiceGroupForService(detail.serviceId)?.id;
      if (group) controller.open(group, detail);
    };
    const cancel = () => controller.close();
    const combat = () => {
      const currentGroup = controller.getSnapshot().groupId;
      if (currentGroup && currentGroup !== 'character' && currentGroup !== 'skills') {
        controller.close('Service closed because combat started.');
      }
    };
    const onStationLost = event => {
      if (controller.getSnapshot().stationId) controller.close(
        String(event.detail?.reason || 'Workstation unavailable').replaceAll('_', ' '));
    };
    const disruptive = ['playerRespawn', 'gw3dSceneTeardown'];
    const combatEvents = ['rogueAITakeDamage', 'bossTakeDamage', 'enemyTakeDamage', 'playerTookDamage'];
    window.addEventListener('axeWorldServiceRequested', onWorldRequest);
    window.addEventListener('axeServiceStationUnavailable', onStationLost);
    disruptive.forEach(event => window.addEventListener(event, cancel));
    combatEvents.forEach(event => window.addEventListener(event, combat));
    let hp = getPlayerHUD().hp;
    const unHud = subscribePlayerHUD(next => { if (next.hp < hp) combat(); hp = next.hp; });
    const unDeath = subscribeDeath(next => { if (next.phase !== 'alive') cancel(); });
    const unCharacter = subscribeCharacterChange(cancel);
    // Duel/trade/cast flags are maintained by the existing game's combat rules.
    const check = setInterval(() => {
      if (!controller.getSnapshot().groupId) return;
      const reason = getAXEServiceModeRestriction(controller.getSnapshot().groupId);
      if (reason) controller.close(reason);
    }, 250);
    return () => {
      unsubscribe(); unHud(); unDeath(); unCharacter(); clearInterval(check);
      window.removeEventListener('axeWorldServiceRequested', onWorldRequest);
      window.removeEventListener('axeServiceStationUnavailable', onStationLost);
      disruptive.forEach(event => window.removeEventListener(event, cancel));
      combatEvents.forEach(event => window.removeEventListener(event, combat));
      controller.close();
      window.__axeServiceModeOpen = false;
      setAXEStationPreview(null);
    };
  }, [controller]);
  return { ...state, controller, active: !!state.groupId };
}
