// Contextual Echo lines are choices, NEVER NPC speech or automatic messages.
// Only confirmed shared history (consented memories) can prompt recognition.
// Region and activity are conversation hints, not evidence of boss rewards or quest completion.
const REGION = {
  wolfveil: { label: 'Wolfveil', lines: [
    'Have you spent much time exploring beyond Wolfveil?',
    'Have you noticed anything unusual around the village?',
  ] },
  forest: { label: 'the forest', lines: [
    'Have you explored far into this forest?',
    'Have you come across anything unusual out here?',
  ] },
};

const tidy = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
export const echoPlaceLabel = (region) => REGION[tidy(region)]?.label || 'this part of the world';
const always = ['Would you like to explore together for a bit?', 'I should keep moving. Maybe we will cross paths again.'];
export function echoConversationCues(session = {}) {
  const previousCount = Math.max(0, Number(session.previous_encounters) || 0);
  const place = REGION[tidy(session.region)];
  const cues = [];
  if (previousCount > 0) {
    // Previous conversation is known only from a mutually saved entry.
    cues.push('We crossed paths before, didn\'t we?');
    if (session.previous_region) {
      cues.push(`I remember we spoke around ${echoPlaceLabel(session.previous_region)}.`);
    }
  }
  if (session.context_type === 'boss') {
    // Questions, not fabricated claims: the game has not validated a boss kill.
    cues.push('Were you here for the fight too?', 'Were you looking for something in this area?');
  } else if (session.context_type === 'exploration') {
    cues.push(...(place?.lines || [
      'Have you explored much of this area?',
      'Did you find anything worth investigating nearby?',
    ]));
  } else {
    cues.push('What brought you out this way?', 'Have you been exploring around here?');
  }
  return {
    heading: previousCount ? 'A familiar traveler' : 'A chance to talk',
    description: previousCount
      ? 'You both chose to remember an earlier conversation. What you say next is still up to you.'
      : 'Only you decide what your character says. These lines are optional starting points.',
    lines: [...new Set([...cues, ...always])].slice(0, 5),
    place: echoPlaceLabel(session.region),
    isReunion: previousCount > 0,
  };
}
