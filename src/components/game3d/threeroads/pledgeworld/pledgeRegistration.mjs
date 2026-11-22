// Making the pledges of the opening known to the game. Pure: the quest list
// and the registry are handed in, so this runs in node.
//
// The game's offer path (getAvailableQuestForNPC, getAXENPCQuestHandoff), its
// tracker and its logbook all read the QUESTS array of questData.jsx, and the
// quest store finds a pledge through pledges/pledgeRegistry.mjs. So a pledge
// has to be in both, and only while the switch is on.
//
// Safe on a remount: the registry replaces a source registered again, and a
// pledge already in the list is left where it is (or swapped in place if a
// hot reload made a new object), so there is never a second copy.
import { registerPledges, unregisterPledges } from '../../pledges/pledgeRegistry.mjs';
import { THREE_ROADS_PLEDGE_SOURCE, threeRoadsPledges } from './pledgeScript.mjs';

export function installThreeRoadsPledges(quests, {
  pledges = threeRoadsPledges(),
  register = registerPledges,
} = {}) {
  register(THREE_ROADS_PLEDGE_SOURCE, [...pledges]);
  let added = 0;
  if (Array.isArray(quests)) {
    for (const pledge of pledges) {
      const index = quests.findIndex(quest => quest?.id === pledge.id);
      if (index < 0) { quests.push(pledge); added++; }
      else if (quests[index] !== pledge) quests[index] = pledge;
    }
  }
  return added;
}

export function removeThreeRoadsPledges(quests, {
  pledges = threeRoadsPledges(),
  unregister = unregisterPledges,
} = {}) {
  unregister(THREE_ROADS_PLEDGE_SOURCE);
  let removed = 0;
  if (Array.isArray(quests)) {
    const ids = new Set(pledges.map(pledge => pledge.id));
    for (let i = quests.length - 1; i >= 0; i--) {
      if (ids.has(quests[i]?.id)) { quests.splice(i, 1); removed++; }
    }
  }
  return removed;
}
