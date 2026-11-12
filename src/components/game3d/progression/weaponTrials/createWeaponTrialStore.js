import { WEAPON_TRIALS, TRIAL_FAMILIES, getWeaponTrial, createTrialRun, advanceTrialRun, expireTrialRun } from './weaponTrialRules';

function normalize(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { /* unreadable saves start a clean journal */ }
  const result = { version: 1, selectedTrialId: null, records: {} };
  if (data?.version !== 1) return result;
  result.selectedTrialId = getWeaponTrial(data.selectedTrialId)?.id ?? null;
  for (const { id } of WEAPON_TRIALS) {
    const record = data.records?.[id];
    if (!Number.isSafeInteger(record?.completions) || record.completions < 1
      || !Number.isFinite(record.bestMs) || record.bestMs < 0) continue;
    result.records[id] = { completions: Math.min(999999, record.completions), bestMs: record.bestMs,
      lastFamilies: [...new Set(Array.isArray(record.lastFamilies) ? record.lastFamilies : [])]
        .filter((family) => TRIAL_FAMILIES.includes(family)).slice(0, 3) };
  }
  return result;
}

export function createWeaponTrialStore({ read, write, now = () => performance.now() }) {
  let data, run = null, pending = null, message = '';
  const listeners = new Set();
  const readData = () => { try { return normalize(read()); } catch { return normalize(null); } };
  data = readData();
  const getState = () => structuredClone({ ...data, run, message });
  const emit = () => listeners.forEach((listener) => listener(getState()));
  const save = (next) => { try { return write(JSON.stringify(next)) === true; } catch { return false; } };
  const commitResult = () => {
    if (!pending) return false;
    if (!save(pending)) {
      run = { ...run, status: 'save_failed' };
      message = 'Your seal could not be saved. Free device storage, then retry before leaving.';
      emit(); return false;
    }
    data = pending; pending = null; run = { ...run, status: 'complete' };
    message = `${getWeaponTrial(run.trialId).seal} recorded.`;
    emit(); return true;
  };
  return {
    getState,
    subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
    reload() { data = readData(); run = null; pending = null; message = ''; emit(); },
    start(trialId) {
      if (!getWeaponTrial(trialId) || pending) return false;
      const next = { ...data, selectedTrialId: trialId };
      if (!save(next)) { message = 'Could not save your trial selection. Free device storage and retry.'; emit(); return false; }
      data = next; run = createTrialRun(trialId); message = ''; emit(); return true;
    },
    pause() { if (pending) return false; run = null; message = ''; emit(); return true; },
    resetAttempt(note = 'Attempt reset. Your next landed hit starts again.') {
      if (!run || pending || run.status === 'complete') return;
      run = { ...createTrialRun(run.trialId), note }; emit();
    },
    hit(hit) {
      const next = advanceTrialRun(run, hit, now());
      if (next === run) return;
      run = next;
      if (run.status !== 'complete') { emit(); return; }
      const record = data.records[run.trialId];
      pending = { ...data, records: { ...data.records, [run.trialId]: {
        completions: Math.min(999999, (record?.completions ?? 0) + 1),
        bestMs: Math.min(record?.bestMs ?? Infinity, run.elapsedMs), lastFamilies: run.families,
      } } };
      commitResult();
    },
    tick() { const next = expireTrialRun(run, now()); if (next !== run) { run = next; emit(); } },
    retry: commitResult,
  };
}
