// Part 15: earned, limited tactical decisions after player dodges, player
// parries, and a genuine visual reacquisition. Uses ordinary Fighter input;
// never creates an instant hit, aims through walls or skips saber recovery.
import { staminaBroken, STAMINA_SWING_COST, STAMINA_AI_BACKOFF_THRESHOLD } from './experimentalStamina.js';
import { chooseExchangeFootwork } from './experimentalExchangeFootwork.js';

export const TACTICAL_NOTICE_SECONDS = 0.26;
export const TACTICAL_REACTION_COOLDOWN = 1.8;
export const TACTICAL_DODGE_WINDOW = 1.05;
export const TACTICAL_PARRY_WINDOW = 2.5;
export const TACTICAL_REACQUIRE_WINDOW = 0.7;
export const TACTICAL_ATTACK_RANGE = 2.65;

const duration = {
  'dodge-landed': TACTICAL_DODGE_WINDOW,
  'player-parry': TACTICAL_PARRY_WINDOW,
  reacquired: TACTICAL_REACQUIRE_WINDOW,
};
const live = p => !!(p && !p.remote && p.status === 'normal' && p.hp > 0);
const distance = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);

export function tacticalModeEligible(g, npc, target = g?.player) {
  return !!(g?.experimentalCombatActive?.() && !g.net && !g.online &&
    !g.teamMode && !g.boardingMode && !g.tutorialMode && !g.director &&
    !g.bossWay && !g.attract && !g.aiOff && !g.noDamage &&
    npc && !npc.isPlayer && !npc.remote && npc.hasSaber &&
    !npc.saber?.holstered && !npc.saber?.inFlight &&
    live(target) && target.isPlayer &&
    g.foesOf?.(npc)?.includes(target) && Number.isFinite(g.t));
}

// Called ONLY by already-confirmed gameplay events. A new cue cannot steal
// attention from a higher-priority defensive commitment or spam after a hit.
export function noteTacticalCue(g, npc, target, kind) {
  if (!Object.hasOwn(duration, kind) || !tacticalModeEligible(g, npc, target) ||
      !Number.isFinite(npc.pos?.[0]) || !Number.isFinite(target.pos?.[0]) ||
      distance(npc, target) > 5 ||
      (npc.experimentalTacticalReadyAt ?? 0) > g.t ||
      npc.experimentalTacticalCue) return false;
  npc.experimentalTacticalCue = {
    kind, target, noticedAt: g.t + TACTICAL_NOTICE_SECONDS,
    until: g.t + duration[kind],
    side: (npc.humId || 1) % 2 ? 1 : -1,
  };
  npc.experimentalTacticalReadyAt = g.t + TACTICAL_REACTION_COOLDOWN;
  return true;
}

function committed(npc, now) {
  return !!(npc.experimentalAdaptiveResponse || npc.experimentalComboResponse ||
    npc.experimentalFlankRead || npc.experimentalSurgeResponse ||
    npc.experimentalExchangeChain || npc.experimentalExchangeRiposte ||
    (npc.experimentalExchangeRecoveryUntil ?? 0) > now ||
    (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now ||
    npc.executing || npc.kata || npc.kicking || npc.dodge ||
    npc.critStrike || npc.saber?.isActiveSwing?.() ||
    (npc.saber?.weaponTime ?? 0) > 0 ||
    (npc.forceUntil ?? 0) > now);
}

// coordination is the Part 13 perception + squad result *after* the normal
// brain. A supporting teammate cannot be turned into a simultaneous attacker.
export function tickTacticalDuel(g, npc, coordination) {
  const cue = npc?.experimentalTacticalCue;
  if (!cue) return null;
  const now = g?.t, player = cue.target;
  if (!tacticalModeEligible(g, npc, player) || now > cue.until ||
      npc.status === 'dead' || npc.hp <= 0) {
    npc.experimentalTacticalCue = null;
    return null;
  }
  if (!['visible', 'lead'].includes(coordination)) return null;
  if (npc.status !== 'normal' || !npc.onGround || committed(npc, now)) return null;
  if (now < cue.noticedAt) {
    // Prevent the ordinary duelist brain from starting a fresh saber swing
    // in the very reaction delay that the player has earned. An existing
    // committed swing is excluded above and keeps its authored frames.
    npc.cmd.attack = false;
    npc.cmd.alt = false;
    return 'observe';
  }
  const stamina = npc.experimentalStamina;
  if (!stamina || staminaBroken(stamina, now) ||
      stamina.current < STAMINA_AI_BACKOFF_THRESHOLD) return null;
  const d = distance(npc, player);
  if (!Number.isFinite(d) || d > 5 || d < 0.35) {
    npc.experimentalTacticalCue = null;
    return null;
  }
  const forward = (Math.sin(npc.yaw) * (player.pos[0] - npc.pos[0]) +
    Math.cos(npc.yaw) * (player.pos[2] - npc.pos[2])) / d;
  if (forward < 0.3) return null; // no rear omniscience or aim-snaps

  // A real player parry is an invitation to recover, never immediate revenge.
  // Reacquisition after disappearing requires a guarded approach.
  if (cue.kind === 'player-parry' || cue.kind === 'reacquired') {
    npc.cmd.attack = false;
    npc.cmd.alt = false;
    npc.cmd.fwd = cue.kind === 'player-parry' ? -0.5 : d > 2.3 ? 0.3 : -0.1;
    npc.cmd.right = cue.side * 0.35;
    npc.cmd.walk = true;
    return cue.kind === 'player-parry' ? 'recover' : 'reacquire';
  }

  // After an actual completed player dodge, a skilled, well-rested duelist
  // may initiate ONE ordinary directional saber attack if the player is
  // still inside its forward attack envelope. The saber's real hit test,
  // authored timing and Game.onSwing stamina debit decide the outcome.
  const skill = Math.max(0, Math.min(1, npc.blockSkill ?? 0.5));
  if (cue.kind === 'dodge-landed' && d <= TACTICAL_ATTACK_RANGE &&
      skill >= 0.65 && stamina.current >= STAMINA_SWING_COST + 28) {
    npc.cmd.attack = true;
    npc.cmd.alt = false;
    npc.cmd.fwd = d > 2.1 ? 0.6 : 0;
    npc.cmd.right = cue.side * 0.65;
    npc.cmd.walk = false;
    npc.experimentalTacticalCue = null;
    return 'directional-attack';
  }
  const move = chooseExchangeFootwork(npc, player, cue.side);
  if (!move) { npc.experimentalTacticalCue = null; return null; }
  npc.cmd.attack = false;
  npc.cmd.alt = false;
  npc.cmd.fwd = move.fwd;
  npc.cmd.right = move.right;
  npc.cmd.walk = true;
  return 'reposition';
}
