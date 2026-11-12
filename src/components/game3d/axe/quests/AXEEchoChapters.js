// Connected Echo Chronicle story content. These are solo character quests;
// social dialogue and shared memories remain optional, mutual-consent features.
const make = (id, title, npcId, requires, kind, objective, reward, extra = {}) => Object.freeze({
  id, title, npcId, requires, category: kind, campaignId: kind === 'side'
    ? 'axe_campaign_echo_branches' : 'axe_campaign_echo_chapters',
  unlockLevel: 1, recommendedLevel: 1, priority: kind === 'side' ? 110 : 112,
  repeatable: false, objectives: Object.freeze([Object.freeze(objective)]),
  objective: Object.freeze(objective), reward: Object.freeze(reward),
  storyFlagsOnComplete: Object.freeze([id + '_complete']), ...extra,
});
export const AXE_ECHO_QUESTS = Object.freeze([
  make('echo_ch_14_first_echo', 'Chapter 1.4 — The First Echo', 'archer_lyra',
    'axe_q_first_patrol', 'chapter', { type: 'kill', count: 2, id: 'patrol', label: 'Clear two threats on patrol' },
    { xp: 90, points: 1 }, { chapter: '1.4', spawnCount: 2, spawnTier: 'normal',
      description: 'Lyra asks you to patrol the roads. Talk with travelers if you wish; nobody is obligated to share a memory.' }),
  make('echo_ch_15_world_signs', 'Chapter 1.5 — Signs Along the Road', 'archer_kira',
    'echo_ch_14_first_echo', 'chapter', { type: 'discover_location', targetId: 'ft_spirit_vein', count: 1, id: 'crystal', label: 'Find the Spirit Crystal Vein' },
    { xp: 110, points: 1 }, { chapter: '1.5',
      description: 'Kira saw a strange light outside the capital. Find the Spirit Crystal Vein in the First Territory.' }),
  make('echo_ch_16_crossroads', 'Chapter 1.6 — The Fork in the Road', 'archer_vex',
    'echo_ch_15_world_signs', 'chapter', { type: 'kill_tier', tier: 'elite', count: 1, id: 'elite', label: 'Defeat the elite at the crossroads' },
    { xp: 170, points: 2 }, { chapter: '1.6', spawnCount: 1, spawnTier: 'elite',
      description: 'Vex warns of an elite roaming the crossroads. When the road is clear, two optional investigations become available.' }),
  make('echo_ch_17_aftershocks', 'Chapter 1.7 — Aftershocks', 'archer_zephyr',
    'echo_ch_16_crossroads', 'chapter', { type: 'kill', count: 4, id: 'aftershock', label: 'Clear four threats along the road' },
    { xp: 210, points: 2 }, { chapter: '1.7', spawnCount: 4, spawnTier: 'normal',
      description: 'Zephyr asks you to contain a spreading disturbance. Either optional quest can be pursued separately.' }),
  make('echo_ch_18_traces_remain', 'Chapter 1.8 — Traces That Remain', 'archer_lyra',
    'echo_ch_17_aftershocks', 'chapter', { type: 'kill_tier', tier: 'champion', count: 1, id: 'champion', label: 'Defeat the champion on the road' },
    { xp: 330, points: 3 }, { chapter: '1.8', spawnCount: 1, spawnTier: 'champion',
      description: 'Lyra asks you to confront a champion. Later player meetings can recall only mutually remembered conversations.' }),
  make('echo_branch_hidden_echo', 'The Hidden Echo', 'archer_noor',
    'echo_ch_16_crossroads', 'side', { type: 'discover_location', targetId: 'ft_weathered_tablet', count: 1, id: 'tablet', label: 'Discover the Weathered Stone Tablet' },
    { xp: 170, points: 1 }, { branchOf: '1.6', description: 'Noor asks you to investigate the Weathered Stone Tablet in the First Territory.' }),
  make('echo_branch_broken_road', 'The Broken Road', 'archer_vex',
    'echo_ch_16_crossroads', 'side', { type: 'kill', count: 3, id: 'road', label: 'Clear three dangers from the broken road' },
    { xp: 170, points: 1 }, { branchOf: '1.6', spawnCount: 3, spawnTier: 'normal',
      description: 'Vex asks you to protect the crossroads. Traveling together is optional, and each player chooses their own quest.' }),
]);
export const AXE_ECHO_CHAPTERS = Object.freeze(AXE_ECHO_QUESTS.filter(q => q.chapter));
export const AXE_ECHO_BRANCH_LEADS = Object.freeze([
  Object.freeze({ questId: 'echo_branch_hidden_echo', title: 'The Hidden Echo', npc: 'Noor the Wanderer',
    suggestion: 'Have you heard about the old stone tablet? Would you like to look for it?' }),
  Object.freeze({ questId: 'echo_branch_broken_road', title: 'The Broken Road', npc: 'Vex the Hunter',
    suggestion: 'The road may not be safe. Would you like to investigate together?' }),
]);
export const getAXEEchoAdventureLeads = (state = {}) => {
  const completed = new Set(state.completedIds || []);
  return completed.has('echo_ch_16_crossroads')
    ? AXE_ECHO_BRANCH_LEADS.filter(lead => !completed.has(lead.questId)) : [];
};
