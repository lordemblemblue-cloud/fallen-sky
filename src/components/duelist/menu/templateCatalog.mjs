// UI menu data only. Actual routes and match availability still come from MENU_MODES and the live lobby.
// A template can describe planned content without inventing working matchmaking or private lobbies.
export const MODE_TABS = Object.freeze([
  { id: 'normal', title: 'NORMAL', description: 'Standard battles and offline matches.' },
  { id: 'ranked', title: 'RANKED', description: 'Competitive matchmaking is in development.' },
  { id: 'practice', title: 'PRACTICE', description: 'Train against bots in supported local modes.' },
  { id: 'custom', title: 'CUSTOM', description: 'Private lobbies and rulesets are in development.' },
]);

const mode = (id, title, description, route = null, symbol = 'target', count = '') =>
  Object.freeze({ id, title, description, route, symbol, count });
export const TEMPLATE_MODES = Object.freeze({
  normal: Object.freeze([
    mode('duel', 'Duel', 'One-on-one; first fighter to win three rounds.', 'duel', 'swords', '1 v 1'),
    mode('ctf', 'Capture the Flag', 'Capture the enemy flag three times.', 'ctf', 'flag', 'Teams'),
    mode('transport', 'Transport', 'Escort the freight carrier or defend the delivery gate.', 'escort', 'truck', '4 v 4'),
    mode('tdm', 'Team Deathmatch', 'Red against blue in a team elimination battle.', 'tdm', 'users', 'Teams'),
    mode('control', 'Control Point', 'Hold two of three objectives to score.', 'control', 'target', 'Teams'),
    mode('ffa', 'Free for All', 'Every fighter for themselves.', 'ffa', 'zap', 'Solo'),
    mode('football', 'Football', 'Compete with the ball and your teammates.', 'football', 'circle', 'Teams'),
  ]),
  ranked: Object.freeze([
    mode('duel', 'Ranked Duel', 'Competitive one-on-one. Ranked queue is not deployed.', null, 'swords', '1 v 1'),
    mode('ctf', 'Ranked CTF', 'Competitive flag battles. Ranked queue is not deployed.', null, 'flag', 'Teams'),
    mode('tdm', 'Ranked Deathmatch', 'Team-based competitive play. Ranked queue is not deployed.', null, 'users', 'Teams'),
    mode('control', 'Ranked Control', 'Capture objectives for rank. Ranked queue is not deployed.', null, 'target', 'Teams'),
    mode('ffa', 'Ranked Free for All', 'Earn rank in solo matches. Ranked queue is not deployed.', null, 'zap', 'Solo'),
    mode('tournament', 'Tournament Duel', 'Tournament brackets are in development.', null, 'trophy', 'Planned'),
  ]),
  practice: Object.freeze([
    mode('duel', 'Duel Training', 'Practice one-on-one against a bot.', 'duel', 'swords', 'Solo'),
    mode('target-range', 'Target Range', 'Stationary target range has not been implemented.', null, 'target', 'Planned'),
    mode('tdm', 'Bot Match', 'Practice team combat against bots.', 'tdm', 'users', 'Bots'),
    mode('team-drills', 'Team Drills', 'Run an existing team deathmatch against bots.', 'tdm', 'shield', 'Bots'),
    mode('control', 'Control Point Drills', 'Practice capturing points against bots.', 'control', 'flag', 'Bots'),
    mode('free-practice', 'Free Practice', 'Use the real local practice match.', 'practice', 'zap', 'Solo'),
  ]),
  custom: Object.freeze([
    mode('create-lobby', 'Create Lobby', 'Private lobby creation is not deployed.', null, 'users', 'Planned'),
    mode('browse-lobbies', 'Browse Lobbies', 'Custom lobby discovery is not deployed.', null, 'search', 'Planned'),
    mode('private-match', 'Private Match', 'Invite-only matches are in development.', null, 'shield', 'Planned'),
    mode('tournament-room', 'Tournament Room', 'Custom tournament management is in development.', null, 'trophy', 'Planned'),
    mode('rulesets', 'Rulesets', 'Server-enforced custom rulesets are in development.', null, 'settings', 'Planned'),
    mode('spectator', 'Spectator Room', 'Spectator connections are in development.', null, 'eye', 'Planned'),
  ]),
});
export const templateTab = id => MODE_TABS.find(tab => tab.id === id) || MODE_TABS[0];
export const templateModes = id => TEMPLATE_MODES[id] || TEMPLATE_MODES.normal;
export const firstTemplateMode = id => templateModes(id)[0]?.id || 'duel';
export const templateMode = (category, id) => templateModes(category).find(mode => mode.id === id) || templateModes(category)[0];
export const templateLaunch = (category, id, online = false, onlineAvailable = false) => {
  const found = templateMode(category, id);
  if (found.id !== id || !found.route) return null;
  if (category === 'ranked' || category === 'custom') return null;
  if (online && (category !== 'normal' || !onlineAvailable)) return null;
  return { mode: found.route, online: online ? 1 : 0 };
};
