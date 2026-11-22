/**
 * Presentation-only catalog for the cinematic Duelist home screen.
 *
 * route matches one of the existing /duelist-next/$page modes.
 * A null route means there is no gameplay implementation yet; the menu must
 * render that feature as planned instead of pretending it can matchmake.
 */
export const HUB_MODE_CARDS = Object.freeze([
  { id: 'duel', title: 'DUEL', description: 'One-on-one battles. First to three rounds.', route: 'duel', symbol: 'swords' },
  { id: 'ctf', title: 'CAPTURE THE FLAG', description: 'Take the enemy flag and defend yours.', route: 'ctf', symbol: 'flag' },
  { id: 'transport', title: 'TRANSPORT', description: 'Escort or intercept the cargo carrier.', route: 'escort', symbol: 'truck' },
  { id: 'tdm', title: 'TEAM DEATHMATCH', description: 'Red against blue. Fight as a team.', route: 'tdm', symbol: 'users' },
  { id: 'control', title: 'CONTROL POINT', description: 'Capture two of three points to score.', route: 'control', symbol: 'target' },
  { id: 'ffa', title: 'FREE FOR ALL', description: 'Six fighters, one champion.', route: 'ffa', symbol: 'zap' },
  { id: 'football', title: 'FOOTBALL', description: 'Compete in a team ball match.', route: 'football', symbol: 'circle' },
  { id: 'practice', title: 'PRACTICE', description: 'Train solo against bots.', route: 'practice', symbol: 'shield' },
  { id: 'online', title: 'ONLINE', description: 'Join a random available match.', route: 'online', symbol: 'globe' },
]);

export function findHubMode(id) {
  return HUB_MODE_CARDS.find((mode) => mode.id === id) || null;
}

export function canLaunchHubMode(id) {
  return Boolean(findHubMode(id)?.route);
}
