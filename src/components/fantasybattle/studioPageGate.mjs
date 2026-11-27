/**
 * Whether the archer battle test page (/fantasy-battle-studio) opens: the same rule as /fantasy-battle, i.e. when the
 * game is released (FANTASY_BATTLE_RELEASED in the games hub catalog) or in development (import.meta.env.DEV).
 * Only a literal true opens it.
 */
export function fantasyBattleStudioOpen({ released, dev } = {}) {
  return released === true || dev === true;
}

export const FANTASY_BATTLE_STUDIO_PATH = '/fantasy-battle-studio';
