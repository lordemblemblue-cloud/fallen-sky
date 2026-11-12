// Never interpret a browser challenge/mount click as a completed objective.
export const GAME3D_COMPETITIONS = Object.freeze([
  'race', 'arm_wrestle', 'kill_contest', 'checkpoint_sprint', 'survival', 'treasure_rush',
]);
export const GAME3D_MOUNT_ACTIONS = Object.freeze([
  'follow', 'fetch', 'treasure', 'water_play', 'brush', 'bond', 'rest',
]);
export const GAME3D_REPORT_REASONS = Object.freeze([
  'harassment', 'spam', 'cheating', 'offensive_name', 'other',
]);
const valid = text => typeof text === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(text);
export function checkGame3DTarget(actor, target) {
  return valid(actor) && valid(target) && actor !== target;
}
export function checkGame3DCharacterId(id) {
  return valid(id) && id !== '__default__' && id !== '__anon__';
}
export function checkGame3DAction(group, id) {
  const values = group === 'competition' ? GAME3D_COMPETITIONS
    : group === 'mount' ? GAME3D_MOUNT_ACTIONS
    : group === 'report' ? GAME3D_REPORT_REASONS : [];
  return typeof id === 'string' && values.includes(id);
}
export function canRespondToCompetition(row, userId, now = Date.now()) {
  return !!row && row.opponent_id === userId &&
    row.status === 'pending' && Number.isFinite(Date.parse(row.expires_at)) &&
    Date.parse(row.expires_at) > now;
}
