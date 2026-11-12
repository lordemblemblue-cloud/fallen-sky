// Local, recent Game 3D world moments can surface *optional* adventure leads.
// These client events are not authoritative proof of a shared discovery,
// rescue or completed quest. Never send them to the server as achievements.
import { getAXEEchoAdventureLeads } from '../axe/quests/AXEEchoChapters';

const MOMENTS = Object.freeze({
  ft_weathered_tablet: Object.freeze({ questId: 'echo_branch_hidden_echo',
    label: 'You recently approached the Weathered Stone Tablet' }),
  ft_spirit_vein: Object.freeze({ questId: 'echo_branch_hidden_echo',
    label: 'You recently noticed the Spirit Crystal Vein' }),
  AXE_POI_CaveEntrance: Object.freeze({ questId: 'echo_branch_hidden_echo',
    label: 'You recently passed a cave entrance' }),
});

export const LIVING_MOMENT_DURATION_MS = 90_000;

export function echoWorldMoment(event, now = Date.now()) {
  if (!event || typeof event !== 'object') return null;
  const type = String(event.type || '');
  const target = String(event.targetId || event.id || '');
  if (type === 'location_discovered' && Object.prototype.hasOwnProperty.call(MOMENTS, target)) {
    return { ...MOMENTS[target], at: now, type: 'exploration' };
  }
  if (type === 'enemy_killed') {
    return { questId: 'echo_branch_broken_road',
      label: 'You recently faced an enemy in the world', at: now, type: 'combat' };
  }
  // A boss-rescue suggestion needs an authoritative combat-assist record,
  // which the current Game 3D events do not provide.
  return null;
}

export function getEchoLivingAdventureLeads(questState, recentMoment, now = Date.now()) {
  const leads = getAXEEchoAdventureLeads(questState);
  if (!recentMoment || !Number.isFinite(recentMoment.at) ||
    recentMoment.at > now || now - recentMoment.at > LIVING_MOMENT_DURATION_MS) {
    return leads.map(lead => ({ ...lead, nearbyHint: null }));
  }
  return leads.map(lead => ({
    ...lead,
    nearbyHint: lead.questId === recentMoment.questId ? recentMoment.label : null,
  })).sort((a, b) => Number(!!b.nearbyHint) - Number(!!a.nearbyHint));
}
