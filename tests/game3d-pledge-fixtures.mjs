// Invented pledges for the pledge-engine tests. They are test fixtures only:
// nothing here is game content, and none of it is registered in the game.
// Between them the three use every step kind, a choice, a failure reset, an
// optional step and an abandon.

export const FERRY_CRATE = {
  id: 'fx_ferry_crate',
  npcId: 'fx_ferryman',
  title: 'Fixture: the ferry crate',
  description: 'Fixture pledge used by the tests.',
  unlockLevel: 2,
  storyFlagsOnComplete: ['fx_ferry_done'],
  pledge: {
    line: 'fixture',
    chapter: 1,
    swornTo: 'the ferryman',
    cause: 'A crate went missing from the ferry.',
    cost: 'Whoever keeps the crate leaves someone else without it.',
    steps: [
      { id: 'ask', kind: 'talk', text: 'Ask the ferryman what was lost.', target: 'fx_ferryman' },
      { id: 'dock', kind: 'go_to', text: 'Go to the dock.', placeId: 'FX_DOCK' },
      { id: 'planks', kind: 'pick_up', text: 'Gather three planks.', target: 'fx_plank', count: 3 },
      { id: 'haul', kind: 'carry', text: 'Carry two crates to the yard.', target: 'fx_crate',
        placeId: 'FX_YARD', count: 2, failsOn: 'carry_dropped' },
      { id: 'lantern', kind: 'use', text: 'Light the yard lantern on the way.', target: 'fx_lantern',
        seconds: 4, optional: true },
      { id: 'whose', kind: 'choose', text: 'Decide whose crate it is.' },
      { id: 'hand_over', kind: 'deliver', text: 'Hand the tally to the clerk.', target: 'fx_clerk' },
    ],
    choices: {
      whose: {
        prompt: 'Whose crate is it?',
        options: [
          { id: 'owner', text: 'Return it to its owner.', flags: ['fx_crate_returned'] },
          { id: 'keep', text: 'Keep it for the ferry.', flags: ['fx_crate_kept'], outcome: 'bent' },
        ],
      },
    },
    standings: {
      kept: { renown: 1, trust: 3 },
      bent: { renown: 4, trust: -1 },
      broken: { trust: -2 },
      optional: { lantern: { regard: 1 } },
    },
    rewardPreview: { kinds: ['experience', 'trust'] },
  },
};

export const ORCHARD_WATCH = {
  id: 'fx_orchard_watch',
  npcId: 'fx_beekeeper',
  title: 'Fixture: the orchard watch',
  description: 'Fixture pledge used by the tests.',
  unlockLevel: 4,
  requires: 'fx_ferry_crate',
  requiresAll: ['fx_ferry_crate', 'fx_stray_calf'],
  storyFlagsRequired: ['fx_ferry_done'],
  factionId: 'fx_faction_a',
  pledge: {
    line: 'fixture',
    chapter: 2,
    swornTo: 'the beekeeper',
    cause: 'The orchard is overrun.',
    cost: 'The hive has to be held while the trees burn.',
    steps: [
      { id: 'wasps', kind: 'defeat', text: 'Clear four wasps from the orchard.', target: 'fx_wasp',
        placeId: 'FX_ORCHARD', count: 4 },
      { id: 'heaves', kind: 'defend', text: 'Guard the press through three heaves.',
        placeId: 'FX_ORCHARD', count: 3, seconds: 30, failsOn: ['defend_failed'] },
      { id: 'bell', kind: 'use', text: 'Ring the orchard bell.', target: 'fx_bell', seconds: 3,
        optional: true },
      { id: 'queen', kind: 'defeat_boss', text: 'Bring down the queen.', target: 'fx_queen_wasp' },
      { id: 'mound', kind: 'hold_zone', text: 'Hold the hive mound.', placeId: 'FX_HIVE_MOUND',
        seconds: 45, failsOn: 'zone_lost' },
      { id: 'walk_home', kind: 'escort', text: 'Walk the beekeeper to the gate.',
        target: 'fx_beekeeper', placeId: 'FX_GATE', failsOn: 'escort_failed' },
      { id: 'drone', kind: 'spare', text: 'Beat the drone guard without killing it.',
        target: 'fx_drone_guard' },
    ],
    standings: { kept: { renown: 5 }, optional: { bell: { trust: 2 } } },
  },
};

export const STRAY_CALF = {
  id: 'fx_stray_calf',
  npcId: null,
  title: 'Fixture: the stray calf',
  description: 'Fixture pledge used by the tests.',
  repeatable: true,
  pledge: {
    line: 'fixture',
    swornTo: 'yourself',
    cause: 'A calf is loose on the road.',
    cost: 'Someone goes without it.',
    steps: [
      { id: 'find', kind: 'go_to', text: 'Find the calf.', target: 'fx_calf_spot' },
      { id: 'fate', kind: 'choose', text: 'Decide where it goes.' },
    ],
    choices: {
      fate: {
        options: [
          { id: 'farm', text: 'Take it to the farm.', flags: ['fx_calf_farm'] },
          { id: 'camp', text: 'Take it to the camp.', flags: ['fx_calf_camp'], outcome: 'bent' },
          { id: 'free', text: 'Let it go.', flags: ['fx_calf_free', 'fx_calf_farm'], outcome: 'bent' },
        ],
      },
    },
    standings: { kept: { trust: 1 }, bent: { renown: 1 }, broken: { trust: -1 } },
  },
};

// Every event that completes the ferry crate, in order, choosing `choiceId`.
export const ferryCrateEvents = (choiceId = 'owner') => [
  { type: 'npc_talked', targetId: 'fx_ferryman' },
  { type: 'location_discovered', targetId: 'FX_DOCK' },
  { type: 'item_collected', itemId: 'fx_plank', count: 3 },
  { type: 'carry_completed', targetId: 'fx_crate' },
  { type: 'carry_completed', targetId: 'fx_crate' },
  { type: 'choice_made', targetId: 'whose', choiceId },
  { type: 'item_delivered', targetId: 'fx_clerk' },
];

export const orchardWatchEvents = () => [
  { type: 'enemy_killed', targetId: 'fx_wasp', placeId: 'FX_ORCHARD', count: 4 },
  { type: 'defend_completed', targetId: 'FX_ORCHARD', count: 3 },
  { type: 'boss_killed', targetId: 'fx_queen_wasp' },
  { type: 'capture_completed', targetId: 'FX_HIVE_MOUND' },
  { type: 'escort_completed', targetId: 'fx_beekeeper' },
  { type: 'enemy_spared', targetId: 'fx_drone_guard' },
];
