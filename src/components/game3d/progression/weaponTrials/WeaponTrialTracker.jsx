import { useEffect } from 'react';
import { getWeaponTrial } from './weaponTrialRules';
import { weaponTrials } from './weaponTrialStore';
import { bindWeaponTrialsRuntime } from './weaponTrialRuntime';
import { useWeaponTrials } from './useWeaponTrials';
import { TrialProgress, stopTrialActionKey } from './WeaponTrialsPanel';

export default function WeaponTrialTracker() {
  useEffect(() => bindWeaponTrialsRuntime(), []);
  const { run, message } = useWeaponTrials();
  const trial = getWeaponTrial(run?.trialId);
  if (!trial) return null;
  const failed = run.status === 'save_failed';
  return <section aria-label="Tracked weapon trial" className="pointer-events-auto shrink-0 rounded-xl border-l-2 border-cyan-200/70 bg-slate-950/[0.85] p-3 text-slate-100 backdrop-blur-md"
    onKeyDown={stopTrialActionKey} onKeyUp={stopTrialActionKey}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{trial.name}</h3>
      <button onClick={() => failed ? weaponTrials.retry() : weaponTrials.pause()}
        className="rounded px-1 py-1 text-xs text-cyan-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-200">
        {failed ? 'Retry save' : run.status === 'complete' ? 'Dismiss' : 'Stop'}
      </button>
    </div>
    <TrialProgress run={run} compact />
    <p role="status" className={`mt-2 text-xs leading-4 ${failed ? 'text-amber-100' : 'text-slate-300'}`}>
      {message || (run.status === 'waiting' ? run.note : trial.description)}
    </p>
  </section>;
}
