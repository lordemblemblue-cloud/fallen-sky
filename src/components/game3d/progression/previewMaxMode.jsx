import { subscribeCharacterChange } from '../characterStorage';
import { allowsSpiritualPreviewMax } from './previewMaxRules.mjs';

// In-memory only. Never write these flags into characterScopedStorage, the
// Character Vault, multiplayer replication, achievements or rewards.
const systems = ['halo', 'wings', 'titles'];
const maxed = { halo: false, wings: false, titles: false };
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
export function isAnyPreviewMaxActive() {
  return systems.some(isPreviewMaxActive);
}
export function getPreviewMaxSnapshot() {
  return Object.fromEntries(systems.map(id => [id, isPreviewMaxActive(id)]));
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
export function maxAllPreviewSystems() {
  if (!isSpiritualPreviewMode()) return false;
  systems.forEach(id => { maxed[id] = true; });
  notify();
  return true;
}
export function clearPreviewMax() {
  systems.forEach(id => { maxed[id] = false; });
  notify();
}

// Never carry a preview overlay across a character/account switch.
subscribeCharacterChange(clearPreviewMax);
