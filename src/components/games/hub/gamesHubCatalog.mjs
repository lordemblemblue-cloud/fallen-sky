// The games on the Adam X Eve Games hub, in menu order (left to right).
// Adding a game is one more entry here: the cross-scroll menu, its keys,
// swipes and background all read this list.
//
// A tile launches only if it is released AND its route is available. A route
// existing does not mean its game is ready for players. Explicitly flip the
// release switch after QA/review; do not auto-release the third game.

export const GAMES_HUB_FOCUS_STORAGE_KEY = 'adamXEve.gamesHub.focusedGame.v2';

// Fantasy Battle (game #3) is under development. Keep the public launcher and
// direct route unavailable until the game is reviewed and ready.
export const FANTASY_BATTLE_RELEASED = false;

const BASE44_MEDIA = 'https://media.base44.com/images/public/6af625cd654fa5b8954442ce';

export const GAMES_HUB_TILES = Object.freeze([
  Object.freeze({
    id: 'duelist',
    gpuPrompt: true,
    to: '/duelist',
    title: 'Duelist Adventure',
    tagline: 'Blade-to-blade duels: real-time combat, powers and story missions.',
    details: Object.freeze(['Real-time duels', '3D', 'Solo and online']),
    art: `${BASE44_MEDIA}/597788ade_emblem_blue_duelist_adventure.png`,
    backdrop: null,
    fallback: 'linear-gradient(225deg,#2a0b0b 0%,#7a1d1d 55%,#f0a050 100%)',
    accent: '#f0a050',
  }),
  Object.freeze({
    id: 'fallen-sky',
    releaseStatus: 'beta-experimental',
    gpuPrompt: true,
    to: '/gameview',
    title: 'Fallen Sky Online',
    tagline: 'The living world of Adam and Eve: factions, companions, mounts and quests.',
    details: Object.freeze(['Open world', '3D', 'Online']),
    art: `${BASE44_MEDIA}/371ca9e0d_fallen_sky_riftbound_hero.png`,
    backdrop: null,
    fallback: 'linear-gradient(135deg,#0b1f3a 0%,#1d4f7a 55%,#7cc4e8 100%)',
    accent: '#7cc4e8',
  }),
  Object.freeze({
    id: 'fantasy-battle',
    to: '/fantasy-battle',
    releaseStatus: FANTASY_BATTLE_RELEASED ? 'ready' : 'coming-soon',
    title: 'Fantasy Battle',
    tagline: 'A turn-based archer battle, played out on a 2D field.',
    details: Object.freeze(['Turn-based', '2D', 'Archers']),
    art: '/hub/fantasy-battle-tile.webp',
    backdrop: '/hub/fantasy-battle-backdrop.webp',
    fallback: 'linear-gradient(135deg,#0d0b22 0%,#26163d 55%,#4a2a2c 100%)',
    accent: '#e8c36a',
  }),
]);

// routesByPath is the router's own table (TanStack Router `router.routesByPath`,
// keyed by full path). Without a table, trust the catalog and let every tile play.
export function isTilePlayable(tile, routesByPath) {
  if (!tile || typeof tile.to !== 'string' || !tile.to.startsWith('/')) return false;
  if (tile.releaseStatus === 'coming-soon') return false;
  if (!routesByPath || typeof routesByPath !== 'object') return true;
  const path = tile.to.length > 1 ? tile.to.replace(/\/+$/, '') : tile.to;
  return Boolean(routesByPath[path]);
}

export function tileBackdrop(tile) {
  return tile?.backdrop || tile?.art || null;
}