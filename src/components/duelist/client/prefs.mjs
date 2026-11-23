// A player's Duelist preferences, kept in this browser: the fighter, the bots' level and number, the practice
// opponent, mouse sensitivity, their own key bindings (client/bindings.mjs) and whether the comms are spoken. Missing or unreadable storage (a private window) falls back to the defaults.
/* global window */
import { useCallback, useState } from 'react';

const KEY = 'duelist.prefs';
// classId: the class the player fights as (core/classes.mjs), kept between matches; classXp: the EXP each class has
// earned in offline matches ({ warrior, duelist, assassin, healer }: core/progression.mjs; online, the match server
// keeps it); xp: the single EXP of before the classes had levels, which goes to the class in use the first time;
// announcer: whose voice calls a match's moments (client/announcerJudge.mjs ANNOUNCER_VOICES), or 'off'
export const DEFAULT_PREFS = Object.freeze({ fighter: 'maskedWarrior', foe: 'huntress', level: 'duelist', bots: 1, sensitivity: 1, keys: {}, voices: true, announcer: 'alice', classId: 'duelist', xp: 0, classXp: null });

/** The EXP of each class from the preferences (the EXP of before class levels goes to the class in use). */
export function classProgressOf(prefs) {
  if (prefs?.classXp && typeof prefs.classXp === 'object') return { ...prefs.classXp };
  return prefs?.xp > 0 && prefs.classId ? { [prefs.classId]: prefs.xp } : {};
}

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
