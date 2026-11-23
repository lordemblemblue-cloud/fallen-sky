// Administrator-only shortcuts to EXISTING Three Roads story locations.
// These are not new spawns, maps, quests or rewards. Local layout metres use
// the same +70 Z offset as the playable Wolfveil world.
import { placeAnchorWorld } from './places/layouts/index.mjs';
import { campPlan } from './land/campPlans.mjs';
import { wolfveilAreaAtWorld } from '../wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

const point = (id, name, detail, x, z, preview = false) => Object.freeze({
  id, name, detail, x, z, area: wolfveilAreaAtWorld({ x, z }), preview,
});

const tree = placeAnchorWorld('P01', 'tree');
const field = placeAnchorWorld('P08', 'centre');
const campPoint = (id, name, detail) => {
  const camp = campPlan(id);
  if (!camp) throw new Error('Missing Three Roads camp layout: ' + id);
  return point(id, name, detail, camp.centre.x, camp.centre.z + 70, true);
};

export const QUEST_TEST_DESTINATIONS = Object.freeze([
  point('oath-tree', 'Oath Tree / Fountain', 'Wolfveil Town · opening quests', tree.x, tree.z),
  point('gate-fields', 'Gate Fields', 'Southern Gate Fields · opening quests', field.x, field.z),
  campPoint('western_road_camp', 'Akitsu Camp', 'Western Cedar Wilds · unfinished preview'),
  campPoint('the_landing', 'Tameri Camp', 'Eastern Riverlands · unfinished preview'),
  campPoint('castra_lupa', 'Remoria Fort', 'Northern Highlands · unfinished preview'),
]);

const BY_ID = new Map(QUEST_TEST_DESTINATIONS.map(entry => [entry.id, entry]));
export const questTestDestination = id => BY_ID.get(id) || null;
