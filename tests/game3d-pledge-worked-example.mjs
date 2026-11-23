// The worked example of docs/game3d/three-empires/PLEDGE_ENGINE.md, section 13,
// kept as data so a test can run it through the real store. It is an invented
// pledge, not game content. If this file changes, change the document too.

export const EXAMPLE_PLEDGE = {
  id: 'example_mill_sacks',
  npcId: 'example_miller',
  title: 'Example: the mill sacks',
  description: 'Example pledge for the engine document.',
  unlockLevel: 1,
  storyFlagsOnComplete: ['example_mill_done'],
  pledge: {
    line: 'example',
    chapter: 1,
    swornTo: 'the miller',
    cause: 'Rats are in the grain and the sacks have to reach the floor before dark.',
    cost: 'There is one load, and two who need it.',
    steps: [
      { id: 'ask', kind: 'talk', text: 'Speak with the miller.', target: 'example_miller', placeId: 'P09' },
      { id: 'reach_mill', kind: 'go_to', text: 'Go to the mill.', placeId: 'P09' },
      { id: 'clear_rats', kind: 'defeat', text: 'Clear three rats from the mill.', target: 'example_rat',
        placeId: 'P09', count: 3 },
      { id: 'haul', kind: 'carry', text: 'Carry two sacks to the threshing floor.', target: 'example_sack',
        placeId: 'P08', count: 2, failsOn: 'carry_dropped' },
      { id: 'ring_bell', kind: 'use', text: 'Ring the mill bell on the way.', target: 'example_mill_bell',
        seconds: 3, optional: true },
      { id: 'whose', kind: 'choose', text: 'Decide who gets the load.' },
      { id: 'hand_over', kind: 'deliver', text: 'Hand the tally to the quartermaster.',
        target: 'example_quartermaster', placeId: 'P08' },
    ],
    choices: {
      whose: {
        prompt: 'Who gets the load?',
        options: [
          { id: 'farm', text: 'The farm families.', flags: ['example_sacks_to_farm'] },
          { id: 'camp', text: 'Your own camp.', flags: ['example_sacks_to_camp'], outcome: 'bent' },
        ],
      },
    },
    standings: {
      kept: { trust: 3 },
      bent: { renown: 3, trust: -1 },
      broken: { trust: -2 },
      optional: { ring_bell: { regard: 1 } },
    },
  },
};

// What the world sends, in order: the window event, its detail, and each
// step's count afterwards (ask, reach_mill, clear_rats, haul, ring_bell, whose, hand_over).
export const EXAMPLE_EVENTS = [
  { on: 'axeQuestEvent', detail: { type: 'npc_talked', targetId: 'example_miller' },
    after: [1, 0, 0, 0, 0, 0, 0] },
  // Too early: "haul" is not open yet, so this is ignored and not remembered.
  { on: 'axeQuestEvent', detail: { type: 'carry_completed', targetId: 'example_sack' },
    after: [1, 0, 0, 0, 0, 0, 0] },
  { on: 'axePOIDiscovered', detail: { id: 'P09' },
    after: [1, 1, 0, 0, 0, 0, 0] },
  // The enemies subsystem's kill event. The step names the kind; the event's
  // targetId is the spawn group. A kill somewhere else does not count.
  { on: 'axePledgeEvent', detail: { type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P11', kind: 'example_rat', tier: 'normal', count: 1 },
    after: [1, 1, 0, 0, 0, 0, 0] },
  { on: 'axePledgeEvent', detail: { type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P09', kind: 'example_rat', tier: 'normal', count: 1 },
    after: [1, 1, 1, 0, 0, 0, 0] },
  { on: 'axePledgeEvent', detail: { type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P09', kind: 'example_rat', tier: 'normal', count: 1 },
    after: [1, 1, 2, 0, 0, 0, 0] },
  { on: 'axePledgeEvent', detail: { type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P09', kind: 'example_rat', tier: 'normal', count: 1 },
    after: [1, 1, 3, 0, 0, 0, 0] },
  { on: 'axeQuestEvent', detail: { type: 'carry_completed', targetId: 'example_sack', pledgeId: 'example_mill_sacks' },
    after: [1, 1, 3, 1, 0, 0, 0] },
  // Hit on the road with the second sack: the step goes back to zero.
  { on: 'axeQuestEvent', detail: { type: 'carry_dropped', targetId: 'example_sack', pledgeId: 'example_mill_sacks' },
    after: [1, 1, 3, 0, 0, 0, 0] },
  { on: 'axeQuestEvent', detail: { type: 'world_interact', targetId: 'example_mill_bell' },
    after: [1, 1, 3, 0, 1, 0, 0] },
  { on: 'axeQuestEvent', detail: { type: 'carry_completed', targetId: 'example_sack', pledgeId: 'example_mill_sacks', count: 2 },
    after: [1, 1, 3, 2, 1, 0, 0] },
  { on: 'axeQuestEvent', detail: { type: 'choice_made', pledgeId: 'example_mill_sacks', targetId: 'whose', choiceId: 'camp' },
    after: [1, 1, 3, 2, 1, 1, 0] },
  { on: 'axeQuestEvent', detail: { type: 'item_delivered', targetId: 'example_quartermaster', pledgeId: 'example_mill_sacks' },
    after: [1, 1, 3, 2, 1, 1, 1] },
];

export const EXAMPLE_CLAIM = {
  kind: 'pledge_completion_claim',
  version: 1,
  pledgeId: 'example_mill_sacks',
  line: 'example',
  chapter: 1,
  ready: true,
  steps: [
    { id: 'ask', kind: 'talk', count: 1, required: 1, optional: false, done: true },
    { id: 'reach_mill', kind: 'go_to', count: 1, required: 1, optional: false, done: true },
    { id: 'clear_rats', kind: 'defeat', count: 3, required: 3, optional: false, done: true },
    { id: 'haul', kind: 'carry', count: 2, required: 2, optional: false, done: true },
    { id: 'ring_bell', kind: 'use', count: 1, required: 1, optional: true, done: true },
    { id: 'whose', kind: 'choose', count: 1, required: 1, optional: false, done: true },
    { id: 'hand_over', kind: 'deliver', count: 1, required: 1, optional: false, done: true },
  ],
  choices: { whose: 'camp' },
  outcome: 'bent',
};
