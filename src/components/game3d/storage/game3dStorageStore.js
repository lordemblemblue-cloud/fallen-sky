import { characterScopedStorage, subscribeCharacterChange } from '../characterStorage';
import {
  emptyStorage, normalizeStorage, planStoredDrop,
} from './game3dStorageModel.mjs';

// CharacterVault includes this allowlisted storage key with the same conflict
// revision rules as other player saves. A server item custody service will
// eventually replace local transfers for cross-character trading.
const storage = characterScopedStorage('axe_game3d_storage_v1');
const listeners = new Set();
const load = () => {
  try { return normalizeStorage(JSON.parse(storage.get() || 'null')); }
  catch { return emptyStorage(); }
};
let state = load();
const emit = () => listeners.forEach(fn => fn(state));
subscribeCharacterChange(() => { state = load(); emit(); });

export function getGame3DStorage() { return state; }
export function subscribeGame3DStorage(fn) {
  listeners.add(fn); fn(state);
  return () => listeners.delete(fn);
}

// Only write the overflow before treating the new loot as collected. A failed
// write or full vault never discards a freshly earned unit.
export function tryStoreOverflowLoot(item) {
  const plan = planStoredDrop(state, item);
  if (!plan.ok) return plan;
  if (plan.duplicate) return plan;
  if (!storage.setChecked(JSON.stringify(plan.next)))
    return {ok:false,reason:'SAVE_FAILED'};
  state = plan.next;
  emit();
  return {ok:true,location:'storage',item};
}
