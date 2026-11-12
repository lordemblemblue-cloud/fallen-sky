import { useEffect, useState } from 'react';
import { weaponTrials } from './weaponTrialStore';

export function useWeaponTrials() {
  const [state, setState] = useState(() => weaponTrials.getState());
  useEffect(() => weaponTrials.subscribe(setState), []);
  return state;
}
export function useTrialCountdown(run, windowMs) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    setNow(performance.now());
    if (!windowMs || run?.status !== 'running') return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [run?.status, run?.startedAt, windowMs]);
  if (!windowMs || run?.startedAt == null) return windowMs;
  return Math.max(0, windowMs - Math.max(0, now - run.startedAt));
}
