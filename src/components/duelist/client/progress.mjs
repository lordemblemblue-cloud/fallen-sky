// The level and EXP shown under the portrait (client/DuelistHud.jsx): the level of the class being played.
// The rules are in core/progression.mjs (levels 1 to 25, with combat ranks earned separately during each match); the match awards
// the EXP (sim/match.mjs) and whoever keeps the player's progress saves it: the match server for an online player,
// this browser's preferences (client/prefs.mjs `classXp`) for an offline one.
export { XP, xpToNext, xpForEvent, levelFromXp as levelFrom, LEVEL_CAP } from '../core/progression.mjs';
