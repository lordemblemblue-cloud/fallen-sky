import { useEffect, useState } from 'react';
import { Check, Compass, Award, ArrowRight } from 'lucide-react';
import { getAXEInventoryItemsByCategory, subscribeAXEEquipmentInventory } from '../../axe/equipment/AXEEquipmentInventoryStore';
import { resolveAXEWeaponIdentity } from '../../axe/weapons/AXEWeaponIdentity';
import { getWeaponName } from '../weaponSynergyData';
import { WEAPON_TRIALS, TRIAL_FAMILIES, getWeaponTrial } from './weaponTrialRules';
import { weaponTrials } from './weaponTrialStore';
import { useWeaponTrials, useTrialCountdown } from './useWeaponTrials';

const buttonClass = 'rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40';
const ownedFamilies = () => [...new Set(getAXEInventoryItemsByCategory('weapon')
  .map((item) => resolveAXEWeaponIdentity(item).masteryWeaponId))].filter((id) => TRIAL_FAMILIES.includes(id));

// Space/Enter activate these buttons, not combat. Preserve C/ESC overlay shortcuts.
export function stopTrialActionKey(event) {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
}

export function TrialProgress({ run, compact = false }) {
  const trial = getWeaponTrial(run?.trialId);
  const remaining = useTrialCountdown(run, trial?.windowMs);
  if (!trial) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
        <span>{run.progress} / {trial.target} {trial.familiesNeeded === 1 ? 'hits' : 'families'}</span>
        <span className="tabular-nums text-cyan-200">{run.status === 'complete' ? 'Recorded'
          : run.status === 'save_failed' ? 'Save needed'
          : trial.windowMs ? `${(remaining / 1000).toFixed(1)}s` : 'No timer'}</span>
      </div>
      <div role="progressbar" aria-label={`${trial.name} progress`} aria-valuemin={0}
        aria-valuemax={trial.target} aria-valuenow={run.progress}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-200 transition-[width] motion-reduce:transition-none"
          style={{ width: `${100 * run.progress / trial.target}%` }} />
      </div>
      {!compact && <div className="mt-3 flex flex-wrap gap-2">
        {TRIAL_FAMILIES.map((family) => <span key={family}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${run.families.includes(family)
            ? 'bg-cyan-200/10 text-cyan-100' : 'bg-white/5 text-slate-400'}`}>
          {run.families.includes(family) && <Check size={12} aria-label="Hit landed" />}{getWeaponName(family)}
        </span>)}
      </div>}
    </div>
  );
}

export default function WeaponTrialsPanel() {
  const state = useWeaponTrials();
  const [families, setFamilies] = useState(ownedFamilies);
  useEffect(() => subscribeAXEEquipmentInventory(() => setFamilies(ownedFamilies())), []);
  const activeTrial = getWeaponTrial(state.run?.trialId);
  const failed = state.run?.status === 'save_failed';
  const seals = Object.keys(state.records).length;
  return (
    <section aria-label="Weapon Trials" className="mx-auto max-w-6xl text-slate-100"
      onKeyDown={stopTrialActionKey} onKeyUp={stopTrialActionKey}>
      <header className="flex flex-wrap items-start justify-between gap-6 pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-cyan-200/80">Practice journal</p>
          <h3 className="mt-2 text-3xl font-medium tracking-tight text-[#efe6d6]">Make every form your own.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">Choose a trial, return to the world, and land your hits.
            Practice a steady hand or flow between the weapons you own.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
          <Award className="text-[#d8c59f]" size={24} aria-hidden="true" />
          <div><div className="text-xl tabular-nums">{seals}<span className="text-sm text-slate-400"> / 3</span></div>
            <div className="text-xs text-slate-400">Journal seals</div></div>
        </div>
      </header>

      {state.message && <div role="status" className={`mb-5 rounded-xl px-4 py-3 text-sm ${failed
        || state.message.startsWith('Could not') ? 'bg-amber-200/10 text-amber-100' : 'bg-cyan-200/10 text-cyan-100'}`}>
        {state.message}
        {failed && <button onClick={() => weaponTrials.retry()} className={`${buttonClass} ml-2 bg-white/10`}>Retry save</button>}
      </div>}

      {activeTrial && <div className="mb-6 rounded-xl border-l-2 border-cyan-200/70 bg-cyan-100/[0.04] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs text-cyan-200">{state.run.status === 'complete' ? 'Trial completed' : 'Tracked trial'}</p>
            <h4 className="mt-1 text-lg font-medium">{activeTrial.name}</h4></div>
          <button onClick={() => weaponTrials.pause()} disabled={failed} className={`${buttonClass} bg-white/5 hover:bg-white/10`}>
            {state.run.status === 'complete' ? 'Dismiss' : 'Stop trial'}
          </button>
        </div>
        <TrialProgress run={state.run} />
        <p className="mt-3 text-sm text-slate-300">{state.run.note}</p>
      </div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {WEAPON_TRIALS.map((trial, index) => {
          const record = state.records[trial.id];
          const active = state.run?.trialId === trial.id && ['waiting', 'running'].includes(state.run.status);
          const eligible = families.length >= trial.familiesNeeded;
          return <article key={trial.id} className={`flex min-w-0 flex-col rounded-2xl border p-5 ${active
            ? 'border-cyan-200/30 bg-cyan-200/[0.04]' : 'border-white/10 bg-white/[0.025]'}`}>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="tracking-[0.2em]">FORM 0{index + 1}</span>
              <span>{trial.windowMs ? `${trial.windowMs / 1000} second window` : 'At your pace'}</span>
            </div>
            <div className="my-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#d8c59f]/10 text-[#d8c59f]">
              {record ? <Award size={24} /> : <Compass size={24} />}
            </div>
            <h4 className="text-xl font-medium text-[#efe6d6]">{trial.name}</h4>
            <p className="mt-2 text-sm leading-6 text-slate-200">{trial.description}</p>
            <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{trial.hint}</p>
            <div className="my-5 border-t border-white/10 pt-4 text-sm">
              <div className="flex items-center gap-2 text-[#d8c59f]">{record && <Check size={15} />} {trial.seal}</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{record
                ? `${record.completions} completed · Best ${(record.bestMs / 1000).toFixed(1)}s`
                : 'Complete to record this seal in your journal.'}</p>
            </div>
            <button disabled={active || !eligible || failed} onClick={() => weaponTrials.start(trial.id)}
              className={`${buttonClass} flex items-center justify-between gap-2 bg-white/10 text-slate-100 hover:bg-cyan-200/15`}
              aria-label={active ? `Tracking ${trial.name}` : `Begin ${trial.name}`}>
              {active ? 'Tracking in world' : record ? 'Try again' : 'Begin trial'}<ArrowRight size={16} aria-hidden="true" />
            </button>
            {!eligible && <p className="mt-2 text-xs text-amber-100/80">Own {trial.familiesNeeded} different weapon families to begin.</p>}
          </article>;
        })}
      </div>
      <footer className="mt-6 space-y-2 text-sm leading-6 text-slate-400">
        <p>Hits on world enemies, hostile rogues, and bosses count. A missed attack or a cast into empty space does not.</p>
        <p>These are personal practice records. Seals add no stats, XP, or items. Death resets the current attempt.
          Leaving the world resets unfinished progress; recorded seals stay with this character.</p>
      </footer>
    </section>
  );
}
