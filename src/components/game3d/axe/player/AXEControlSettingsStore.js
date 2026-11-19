// Player control settings for Game 3D, saved per signed-in user (not per character: a control
// preference follows the player). Shown in the Esc Settings menu (PauseMenu.jsx).
//
//   clickToMove: false by default. WASD is always on; click-to-move is the option the player
//                switches on (AXEClickToMove.js).
//   dodgeRollVariant: false by default. Double-tap W / S sidestep forward / back flip; with the option on they
//                roll instead (player/game3dDodgeProfiles.mjs). A / D flips and R are unchanged.
//
// Key: axe_control_settings_v1::<userId> (characterStorage.userScopedKey). Reloads when the
// signed-in user changes.

import { subscribeCharacterChange, userScopedKey } from '../../characterStorage';

export const AXE_CONTROL_SETTINGS_KEY = 'axe_control_settings_v1';
export const AXE_CONTROL_SETTINGS_DEFAULTS = Object.freeze({ clickToMove: false, autoTargetNearby: false, dodgeRollVariant: false });

const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(userScopedKey(AXE_CONTROL_SETTINGS_KEY)) || 'null');
    if (saved?.v === 1) return { clickToMove: saved.clickToMove === true, autoTargetNearby: saved.autoTargetNearby === true,
      dodgeRollVariant: saved.dodgeRollVariant === true };
  } catch {}
  return { ...AXE_CONTROL_SETTINGS_DEFAULTS };
}

let settings = load();

function emit() {
  const snapshot = getAXEControlSettings();
  listeners.forEach((fn) => { try { fn(snapshot); } catch {} });
}

subscribeCharacterChange(() => { settings = load(); emit(); });

export function getAXEControlSettings() { return { ...settings }; }

export function isAXEClickToMoveEnabled() { return settings.clickToMove === true; }

export function isAXEAutoTargetNearbyEnabled() { return settings.autoTargetNearby === true; }

export function setAXEAutoTargetNearbyEnabled(enabled) {
  settings = { ...settings, autoTargetNearby: enabled === true };
  try { localStorage.setItem(userScopedKey(AXE_CONTROL_SETTINGS_KEY), JSON.stringify({ v: 1, ...settings })); } catch {}
  emit();
  return settings.autoTargetNearby;
}

export function setAXEClickToMoveEnabled(enabled) {
  settings = { ...settings, clickToMove: enabled === true };
  try { localStorage.setItem(userScopedKey(AXE_CONTROL_SETTINGS_KEY), JSON.stringify({ v: 1, ...settings })); } catch {}
  emit();
  return settings.clickToMove;
}

export function isAXEDodgeRollVariantEnabled() { return settings.dodgeRollVariant === true; }

export function setAXEDodgeRollVariantEnabled(enabled) {
  settings = { ...settings, dodgeRollVariant: enabled === true };
  try { localStorage.setItem(userScopedKey(AXE_CONTROL_SETTINGS_KEY), JSON.stringify({ v: 1, ...settings })); } catch { /* storage blocked */ }
  emit();
  return settings.dodgeRollVariant;
}

export function subscribeAXEControlSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
