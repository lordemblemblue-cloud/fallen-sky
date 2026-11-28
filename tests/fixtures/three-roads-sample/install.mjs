// Registers the retired War of Three Roads as a sample story, so the story tools have
// something to run on in tests: its bands, its cast, its places, and the frame of the old
// Wolfveil valley it was written for (region 'wolfveil', layout z + 70 = world z, five areas).
// Import this file first in a test that needs a story. Nothing in src/ imports it.
import { setStoryFrame } from '../../../src/components/game3d/threeroads/storyFrame.mjs';
import { setStoryBands } from '../../../src/components/game3d/threeroads/script/index.mjs';
import { setStoryCast } from '../../../src/components/game3d/threeroads/script/cast.mjs';
import { setStoryPlaces } from '../../../src/components/game3d/threeroads/places/layouts/index.mjs';
import { WOLFVEIL_AREA_IDS, wolfveilAreaAtWorld } from '../../../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import { WOLFVEIL_TOWN_QUEST_NPC_SPOTS } from '../../../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';
import { SAMPLE_BANDS } from './bands.mjs';
import { SAMPLE_BUILT_AREAS, SAMPLE_CAST, SAMPLE_ROLES, SAMPLE_VOICES } from './castTable.mjs';
import { TOWN_PLACES } from './layouts/town.mjs';
import { SOUTH_PLACES } from './layouts/south.mjs';
import { CAMP_PLACES } from './layouts/camps.mjs';

export { pledgePlace } from './pledgePlaces.mjs';

export const SAMPLE_FRAME = Object.freeze({
  regions: Object.freeze(['wolfveil']),
  zOffset: 70,
  areaAtWorld: wolfveilAreaAtWorld,
  areaIds: WOLFVEIL_AREA_IDS,
  giverSpots: WOLFVEIL_TOWN_QUEST_NPC_SPOTS,
});
export const SAMPLE_PLACES = Object.freeze([...TOWN_PLACES, ...SOUTH_PLACES, ...CAMP_PLACES]);

export function installSampleStory() {
  setStoryFrame(SAMPLE_FRAME);
  setStoryCast({ cast: SAMPLE_CAST, voices: SAMPLE_VOICES, roles: SAMPLE_ROLES, builtAreas: SAMPLE_BUILT_AREAS });
  setStoryBands(SAMPLE_BANDS);
  setStoryPlaces(SAMPLE_PLACES);
}
installSampleStory();
