import { subscribeCharacterChange } from '../characterStorage';
import { allowsSpiritualPreviewMax } from './previewMaxRules.mjs';

// In-memory only. Never write these flags into characterScopedStorage, the
// Character Vault, multiplayer replication, achievements or rewards.
const systems = ['halo', 'wings', 'titles'];
const maxed = { halo: false, wings: false, titles: false, kills: false };
// Presentation-only test balance. Never write to killCountStore or player data.
export const SPIRITUAL_PREVIEW_MAX_KILLS = 999999;
const listeners = new Set();

export function isSpiritualPreviewMode() {
  return allowsSpiritualPreviewMax({
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
    enabled: import.meta.env?.VITE_AXE_GAME3D_PREVIEW_MAX,
    serverEnv: import.meta.env?.VITE_AXE_GAME3D_SERVER_ENV,
    previewHost: import.meta.env?.VITE_AXE_GAME3D_PREVIEW_HOST,
    dev: import.meta.env?.DEV === true,
  });
}

export function isPreviewMaxActive(system) {
  return isSpiritualPreviewMode() && Boolean(maxed[system]);
}
export function isPreviewKillsActive() {
  return isSpiritualPreviewMode() && maxed.kills;
}
export function getPreviewKillCount(realKills) {
  return isPreviewKillsActive() ? SPIRITUAL_PREVIEW_MAX_KILLS : realKills;
}
export function isAnyPreviewMaxActive() {
  return systems.some(isPreviewMaxActive);
}
export function getPreviewMaxSnapshot() {
  return { ...Object.fromEntries(systems.map(id => [id, isPreviewMaxActive(id)])),
    kills: isPreviewKillsActive() };
}
function notify() {
  const snapshot = getPreviewMaxSnapshot();
  listeners.forEach(fn => fn(snapshot));
}
export function subscribePreviewMax(fn) {
  listeners.add(fn);
  fn(getPreviewMaxSnapshot());
  return () => listeners.delete(fn);
}
export function setPreviewMax(system, enabled = true) {
  if (!isSpiritualPreviewMode() || !systems.includes(system)) return false;
  maxed[system] = Boolean(enabled);
  notify();
  return true;
}
export function setPreviewKills(enabled = true) {
  if (!isSpiritualPreviewMode()) return false;
  maxed.kills = Boolean(enabled);
  notify();
  return true;
}
export function maxAllPreviewSystems() {
  if (!isSpiritualPreviewMode()) return false;
  systems.forEach(id => { maxed[id] = true; });
  maxed.kills = true;
  notify();
  return true;
}
export function clearPreviewMax() {
  systems.forEach(id => { maxed[id] = false; });
  maxed.kills = false;
  notify();
}

// Never carry a preview overlay across a character/account switch.
subscribeCharacterChange(clearPreviewMax);
