import { withAppearanceDefaults } from './genesisAssets';

// One normalised appearance object for every consumer: the world avatar, the
// creator preview and the account avatar all read the same shape.
export function playerAppearance(source) {
  return withAppearanceDefaults(source && typeof source === 'object' ? source : {});
}

export default playerAppearance;