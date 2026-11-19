// A player's Duelist preferences, kept in this browser: the fighter, the bots' level and number, the practice
// opponent, mouse sensitivity, their own key bindings (client/bindings.mjs) and whether the comms are spoken. Missing or unreadable storage (a private window) falls back to the defaults.
/* global window */
import { useCallback, useState } from 'react';

const KEY = 'duelist.prefs';
export const DEFAULT_PREFS = Object.freeze({ fighter: 'maskedWarrior', foe: 'huntress', level: 'duelist', bots: 1, sensitivity: 1, keys: {}, voices: true });

export function readPrefs() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_PREFS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not saved: this visit only */ }
  return next;
}

/** [prefs, update(patch)] for a menu page. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const update = useCallback((patch) => setPrefs(writePrefs(patch)), []);
  return [prefs, update];
}
