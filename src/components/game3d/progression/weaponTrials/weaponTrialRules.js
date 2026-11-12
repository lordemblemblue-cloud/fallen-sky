// Personal PvE practice challenges. These never award combat power or currency.
export const TRIAL_FAMILIES = Object.freeze(['sword', 'dual_blades', 'bow', 'sky']);
export const WEAPON_TRIALS = Object.freeze([
  Object.freeze({ id: 'steady_hand', name: 'Steady Hand', seal: 'First Form', target: 8, windowMs: null,
    familiesNeeded: 1, description: 'Land eight hits with one weapon family.',
    hint: 'A hit with another family restarts your count. Take your time.' }),
  Object.freeze({ id: 'paired_forms', name: 'Paired Forms', seal: 'Crossing Blades', target: 2, windowMs: 8000,
    familiesNeeded: 2, description: 'Hit with two different weapon families within eight seconds.',
    hint: 'The first hit starts the clock. Repeating a family does not extend it.' }),
  Object.freeze({ id: 'threefold_flow', name: 'Threefold Flow', seal: 'Threefold Seal', target: 3, windowMs: 12000,
    familiesNeeded: 3, description: 'Hit with three different weapon families within twelve seconds.',
    hint: 'Plan your weapon changes before the first hit. Each family counts once.' }),
]);
export const getWeaponTrial = (id) => WEAPON_TRIALS.find((trial) => trial.id === id);
export function createTrialRun(trialId) {
  return { trialId, status: 'waiting', progress: 0, families: [], startedAt: null, lastAt: null,
    elapsedMs: 0, note: 'Your first landed hit begins the trial.' };
}
export function expireTrialRun(run, now) {
  const trial = getWeaponTrial(run?.trialId);
  if (Number.isFinite(now) && run?.status === 'running' && trial?.windowMs && now - run.startedAt >= trial.windowMs) {
    return { ...createTrialRun(run.trialId), note: 'Time elapsed. Your next landed hit starts a fresh attempt.' };
  }
  return run;
}
export function advanceTrialRun(run, hit, now) {
  const trial = getWeaponTrial(run?.trialId);
  if (!trial || !['waiting', 'running'].includes(run.status) || !Number.isFinite(now)
    || !TRIAL_FAMILIES.includes(hit?.weaponId) || !Number.isFinite(hit?.damage) || hit.damage <= 0
    || (run.lastAt !== null && now < run.lastAt)) return run;
  let current = expireTrialRun(run, now);
  if (trial.familiesNeeded === 1 && current.families.length && current.families[0] !== hit.weaponId) {
    current = createTrialRun(run.trialId);
  }
  if (trial.familiesNeeded > 1 && current.families.includes(hit.weaponId)) return current;
  const families = [...new Set([...current.families, hit.weaponId])];
  const progress = trial.familiesNeeded === 1 ? current.progress + 1 : families.length;
  const startedAt = current.startedAt ?? now;
  return { ...current, families, progress, startedAt, lastAt: now, elapsedMs: now - startedAt,
    status: progress >= trial.target ? 'complete' : 'running',
    note: progress >= trial.target ? 'Trial complete.' : trial.familiesNeeded === 1
      ? 'Keep using the same weapon family.' : 'Land a hit with a different weapon family.' };
}
