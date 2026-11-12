// ─────────────────────────────────────────────
// DUEL — through the duel server (duelSystem)
//
// Owns:
//   • sendDuelChallenge(sender, receiver)
//   • acceptDuelChallenge(req) / declineDuelChallenge(req)
//   • strikeInDuel(duelId, swing), forfeitDuel(duelId), fetchDuelState()
//
// The server owns the whole duel: who may challenge whom, the accept, every hit (rolled
// and resolved with the game's combat rules against each duelist's stats) and the result.
// `req` is a pending DuelSession shaped by IncomingRequestToast ({ id, sender_id, … }).
// ─────────────────────────────────────────────

import { callGameServer, myDuelStats } from './socialServer';
import {getActiveId} from '../characterStorage';

export const sendDuelChallenge = (sender, receiver) =>
  callGameServer('duelSystem', 'challenge', { opponentId: receiver.id, opponentName: receiver.name, stats: myDuelStats(), characterId: getActiveId() });

export const acceptDuelChallenge = (req) =>
  callGameServer('duelSystem', 'respond', { duelId: req.id, decision: 'accept', stats: myDuelStats(), characterId: getActiveId() });

export const declineDuelChallenge = (req) =>
  callGameServer('duelSystem', 'respond', { duelId: req.id, decision: 'decline' });

// Server starts a stopwatch when the mastered-skill key is actually pressed.
// Its receipt proves hold duration only; server-owned mastery is separate.
export const beginDuelSkillCharge = (duelId, charge) =>
  callGameServer('duelSystem', 'begin_charge', { duelId, ...charge });

// Universal AEGIS Shield uses the duel server's own HP and cooldown clock.
export const castDuelShield = duelId =>
  callGameServer('duelSystem', 'cast_shield', { duelId });

// Read account-scoped, confirmed duel mastery XP (not character-local PvE XP).
export const getDuelMasteryState = () =>
  callGameServer('duelSystem', 'mastery_state', {});

// Handoff only occurs after BOTH authenticated duel participants opt in.
// This is feature-gated server-side and never implicitly toggled by combat.
export const requestDedicatedDuel = duelId =>
  callGameServer('duelSystem','request_dedicated',{duelId});

export const cancelDedicatedHandoff = duelId =>
  callGameServer('duelSystem','cancel_dedicated',{duelId});

// Register a modern skill cast once before the first timed duel hit.
// This is a server receipt, not a self-reported mastery or charged bonus.
export const beginDuelSkillCast = (duelId, cast) =>
  callGameServer('duelSystem', 'begin_cast', { duelId, ...cast });

// Submit *our own* location for speed screening and server-time freshness.
// The server ignores client-submitted distance for damage range.
export const syncDuelPosition = (duelId, position) =>
  callGameServer('duelSystem', 'sync_position', { duelId, position });

// Replay a bounded recent journal of server-resolved hits to both duelists.
// Authenticated backend refuses access to any other duel.
export const fetchDuelCombatEvents = duelId =>
  callGameServer('duelSystem', 'combat_events', { duelId });

// One swing at the duel opponent: { distance, weaponPath, castId?, hitIndex? } -> { hit, duel }
export const strikeInDuel = (duelId, swing) => callGameServer('duelSystem', 'hit', { duelId, ...swing });

export const forfeitDuel = (duelId) => callGameServer('duelSystem', 'forfeit', { duelId });

// { active, incoming, outgoing }
export const fetchDuelState = () => callGameServer('duelSystem', 'state', {});
