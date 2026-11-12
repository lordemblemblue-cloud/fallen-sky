// The Living Quest cinematic: one NPC, a short branching conversation and the
// hunt she offers. Beats are keyed so a choice can jump straight to another id.

// A gold monogram stands in until the NPC portrait art is added, so the
// dialogue header always renders.
const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="48" fill="#1b1508"/>
      <circle cx="48" cy="48" r="42" fill="none" stroke="#c9a227" stroke-opacity="0.5" stroke-width="2"/>
      <text x="48" y="58" font-family="Georgia, serif" font-size="32" fill="#e5c76b" text-anchor="middle">S</text>
    </svg>`,
  );

export const QUEST_GIVER = {
  id: 'sable_vey',
  name: 'Sable Vey',
  role: 'Keeper of the First Territory',
  color: '#e5c76b',
  accent: 'rgba(201, 162, 39, 0.14)',
  portrait: PORTRAIT,
};

export const FIRST_BEAT = 'welcome';

export const BEATS = {
  welcome: {
    id: 'welcome',
    type: 'dialogue',
    speaker: QUEST_GIVER.name,
    text: "You walk like someone who has never had to earn a border. Good. The First Territory has been patient with strangers lately, and patience is running short.",
    choices: [
      { label: 'I am listening.', next: 'warning' },
      { label: 'Who are you to decide that?', next: 'warning' },
    ],
  },
  warning: {
    id: 'warning',
    type: 'dialogue',
    speaker: QUEST_GIVER.name,
    text: 'Something came through the treeline at dusk and it did not come to trade. Three herders are missing, the watchfires will not light, and the dogs will not go near the eastern ridge.',
    choices: [{ label: 'What do you need from me?', next: 'offer' }],
  },
  offer: {
    id: 'offer',
    type: 'quest',
    speaker: QUEST_GIVER.name,
    title: 'Shadows at the Eastern Ridge',
    objectiveText: 'Clear the ridge of the creatures that came through the treeline.',
    spawnCount: 5,
    spawnTier: 'normal',
    reward: { xp: 450 },
    choices: [],
  },
  accepted: {
    id: 'accepted',
    type: 'ending',
    speaker: QUEST_GIVER.name,
    chapter: 'Chapter I',
    headline: 'The Ridge Is Yours To Hold',
    body: 'Sable marks the eastern ridge on your map with a thumb pressed in ash. The hunt is in your questbook now.',
    choices: [],
  },
};

export default BEATS;