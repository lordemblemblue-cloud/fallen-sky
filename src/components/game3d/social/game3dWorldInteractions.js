import { callGameServer } from './socialServer';
import { getActiveId } from '../characterStorage';

// Auth identity is taken from the signed-in server session, not from these calls.
const invoke = (action, data = {}) => callGameServer('game3dWorldInteraction', action, data);
export const listGame3DBlockedPlayers = () => invoke('blocked_list');
export const blockGame3DPlayer = targetUserId => invoke('block', { targetUserId });
export const unblockGame3DPlayer = targetUserId => invoke('unblock', { targetUserId });
export const reportGame3DPlayer = (targetUserId, reason, region) =>
  invoke('report', { targetUserId, reason, region });
export const inviteGame3DClan = targetUserId =>
  invoke('clan_invite', { targetUserId });
export const inviteGame3DCompetition = (targetUserId, kind, region) =>
  invoke('compete_invite', { targetUserId, kind, region });
export const listGame3DCompetitions = () => invoke('compete_list');
export const respondGame3DCompetition = (challengeId, accept) =>
  invoke('compete_respond', { challengeId, accept });
export const requestGame3DMountActivity = (companionId, mountAction, region) =>
  invoke('mount_command', { characterId: getActiveId(), companionId, mountAction, region });
export const listGame3DMountActivities = () =>
  invoke('mount_list', { characterId: getActiveId() });
