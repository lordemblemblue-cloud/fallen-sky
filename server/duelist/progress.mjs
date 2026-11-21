/* global setTimeout, clearTimeout */
// Duelist Adventure match server: each account's EXP per class (src/components/duelist/core/progression.mjs).
// The server is the one that decides an online fighter's level: it hands a joining player's progress to the match
// and adds what the match says was earned. A browser never tells it a level.
// Kept in memory, and in a JSON file when one is named (DUELIST_PROGRESS_FILE), so it outlasts a restart; without
// a file, progress lasts as long as the server runs. Guests' progress is never written down.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CLASS_IDS } from '../../src/components/duelist/core/classes.mjs';
import { cleanProgress, XP_CAP } from '../../src/components/duelist/core/progression.mjs';

/** file: where to keep it (null: memory only); saveAfterMs: how long a change may wait before it is written. */
export function createProgressStore({ file = null, log = () => {}, saveAfterMs = 2000 } = {}) {
  const accounts = new Map(); // account id -> { warrior, duelist, assassin, healer }
  if (file) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      for (const [id, progress] of Object.entries(raw?.accounts || {})) accounts.set(id, cleanProgress(progress, CLASS_IDS));
      log('progress:', accounts.size, 'accounts read from', file);
    } catch (error) {
      if (error.code !== 'ENOENT') log('progress: the file could not be read, starting empty:', error.message);
    }
  }
  const kept = (id) => typeof id === 'string' && id.length > 0 && !id.startsWith('guest-');
  let timer = null;
  const save = () => {
    timer = null;
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const out = {};
      for (const [id, progress] of accounts) if (kept(id)) out[id] = progress;
      writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, accounts: out }));
      renameSync(`${file}.tmp`, file); // whole or not at all
    } catch (error) {
      log('progress: not saved:', error.message);
    }
  };
  return {
    /** An account's EXP per class (zeros for someone new). */
    get(id) { return { ...(accounts.get(id) || cleanProgress(null, CLASS_IDS)) }; },
    /** Add EXP the match awarded. Returns the class's new total, or null for anything that is not an award. */
    add(id, classId, amount) {
      if (typeof id !== 'string' || !id || !CLASS_IDS.includes(classId) || !Number.isFinite(amount) || amount <= 0) return null;
      const progress = accounts.get(id) || cleanProgress(null, CLASS_IDS);
      progress[classId] = Math.min(XP_CAP, progress[classId] + Math.floor(amount));
      accounts.set(id, progress);
      if (file && kept(id) && !timer) { timer = setTimeout(save, saveAfterMs); timer.unref?.(); }
      return progress[classId];
    },
    /** Write now (on shutdown). */
    flush() { if (timer) clearTimeout(timer); save(); },
  };
}
