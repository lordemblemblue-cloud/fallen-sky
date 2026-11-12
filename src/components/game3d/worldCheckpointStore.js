import { characterScopedStorage } from './characterStorage';
import { createWorldCheckpointStore } from './worldCheckpoint.mjs';

// Same active account + character namespace as progression, inventory and the
// CharacterVault cloud sync. A different character never inherits this location.
export const worldCheckpointStore = createWorldCheckpointStore(
  characterScopedStorage('axe_game3d_last_location_v1'),
);
