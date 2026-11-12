import { base44 } from '@/api/base44Client';
import { withAppearanceDefaults } from './genesisAssets';
import { setCompanionIdentity } from './CompanionIdentityContext';

// Saves the appearance on the account and publishes it to every listener.
// `broadcast: false` keeps a Game 3D roster save from replacing the account
// avatar that the dashboard shows.
export async function saveAppearance(appearance, { broadcast = true } = {}) {
  const config = withAppearanceDefaults(appearance && typeof appearance === 'object' ? appearance : {});

  if (broadcast) {
    setCompanionIdentity(config);
    try {
      await base44.auth.updateMe({ avatar_appearance: config });
    } catch (error) {
      console.warn('[Appearance] account save failed', error);
    }
  }

  return config;
}

export default saveAppearance;