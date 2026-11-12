import { characterScopedStorage, subscribeCharacterChange } from '../../characterStorage';
import { createWeaponTrialStore } from './createWeaponTrialStore';

export const WEAPON_TRIAL_STORAGE_KEY = 'axe_weapon_trials_v1';
const storage = characterScopedStorage(WEAPON_TRIAL_STORAGE_KEY);
export const weaponTrials = createWeaponTrialStore({ read: storage.get, write: storage.setChecked });
subscribeCharacterChange(() => weaponTrials.reload());
