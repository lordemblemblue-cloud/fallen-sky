// Part 16: evidence-backed saber interruption recovery in local Experimental combat.
// Never applies damage, skips a get-up animation, teleports, or changes multiplayer.
import { chooseExchangeFootwork } from './experimentalExchangeFootwork.js';

export const MISSED_SWING_RECOVERY = 0.65;
export const GUARD_BREAK_RECOVERY = 1.0;
export const GETUP_RECOVERY = 0.9;
export const SWING_MISS_COOLDOWN = 1.3;
export const RECOVERY_MAX_WAIT = 2.25;
export const SWING_CONTACT_GRACE = 0.12;
const durations = {
  'missed-swing': MISSED_SWING_RECOVERY,
  'guard-break': GUARD_BREAK_RECOVERY,
  'getup': GETUP_RECOVERY,
  'saber-wound': 0.55, // Part 17: only after verified nonlethal torso contact
};
const validTime = g => Number.isFinite(g?.t);
const alive = f => !!(f && !f.remote && f.status !== 'dead' && f.hp > 0);

export function recoveryEligible(g, npc) {
  return !!(g?.experimentalCombatActive?.() && validTime(g) &&
    !g.net && !g.online && !g.teamMode && !g.tutorialMode &&
    !g.director && !g.bossWay && !g.boardingMode && !g.attract &&
    !g.noDamage && !g.aiOff && npc && !npc.isPlayer && !npc.remote &&
    npc.hasSaber && alive(npc) && g.foesOf?.(npc)?.includes(g.player));
}

function cancelQueuedCounters(npc) {
  // An interrupted enemy cannot execute a queued counter after the attack
  // or defensive animation that justified it has ended.
  npc.experimentalAdaptiveResponse = null;
  npc.experimentalExchangeChain = null;
  npc.experimentalExchangeRiposte = null;
  npc.experimentalExchangeRecoveryUntil = 0;
  npc.experimentalTacticalCue = null;
  npc.experimentalComboResponse = null;
  npc.experimentalSurgeResponse = null;
}
export function clearCombatRecovery(npc) {
  if (!npc) return;
  npc.experimentalSwingReceipt = null;
  npc.experimentalRecovery = null;
}

export function scheduleCombatRecovery(g, npc, reason) {
  if (!Object.hasOwn(durations, reason) || !recoveryEligible(g, npc)) return false;
  const old = npc.experimentalRecovery;
  if (reason === 'missed-swing' &&
      ((npc.experimentalRecoveryReadyAt ?? 0) > g.t ||
       (old && old.reason !== 'missed-swing'))) return false;
  if (old && old.reason === reason) return false;
  npc.experimentalSwingReceipt = null;
  cancelQueuedCounters(npc);
  npc.experimentalRecovery = {
    reason, stage: reason === 'guard-break' ? 'await-resume' : 'await-ready',
    queuedAt: g.t, awaitUntil: g.t + RECOVERY_MAX_WAIT,
    until: 0, side: (npc.humId || 1) % 2 ? 1 : -1,
  };
  if (reason === 'missed-swing')
    npc.experimentalRecoveryReadyAt = g.t + SWING_MISS_COOLDOWN;
  return true;
}

// The saber engine fires 'swing' only when the authored strike is committed.
// A new swing also retires the previous swing receipt; a repeated idle frame
// never creates a "miss" on its own.
export function trackCommittedSwing(g, npc, move) {
  if (!recoveryEligible(g, npc) || npc.status !== 'normal' ||
      !npc.saber?.inAttack?.(move)) return false;
  const old = npc.experimentalSwingReceipt;
  if (old && !old.contact)
    scheduleCombatRecovery(g, npc, 'missed-swing');
  const ms = Number.isFinite(npc.saber.moveLen) ? npc.saber.moveLen : 550;
  npc.experimentalSwingReceipt = {
    move, since: g.t, until: g.t + Math.min(1.9, Math.max(0.24, ms / 1000)) +
      SWING_CONTACT_GRACE, contact: false,
  };
  return true;
}

// Called after a REAL blade/body block, hit, or segment-against-segment
// collision, not on near misses, automatic prediction or a dodge.
export function markPhysicalContact(g, npc) {
  if (!recoveryEligible(g, npc) || !npc.experimentalSwingReceipt) return false;
  npc.experimentalSwingReceipt.contact = true;
  return true;
}

// Called after Combat.step has considered hits for the current simulation
// frame; contact receipts must be processed before classifying a swing miss.
export function settleSwingReceipt(g, npc) {
  const receipt = npc?.experimentalSwingReceipt;
  if (!receipt) return null;
  if (!recoveryEligible(g, npc) || npc.status !== 'normal') {
    npc.experimentalSwingReceipt = null;
    return null;
  }
  if (receipt.contact) {
    npc.experimentalSwingReceipt = null;
    return 'contact';
  }
  if (g.t < receipt.until) return null;
  // Do not end a strike while its authored collision window is active. A
  // bounded extra grace prevents broken animation timers from holding state.
  if (npc.saber?.weaponTime > 0 && g.t < receipt.until + 0.4) return null;
  npc.experimentalSwingReceipt = null;
  return scheduleCombatRecovery(g, npc, 'missed-swing') ? 'missed-swing' : null;
}

export function noteGuardBreakRecovery(g, npc) {
  // Trigger after a real successful knockOpen, not just stamina reaching zero.
  if (!npc || npc.status !== 'open') return false;
  return scheduleCombatRecovery(g, npc, 'guard-break');
}

export function noteGetupRecovery(g, npc, previousStatus) {
  // Called on exactly the frame an authored get-up FINISHES.
  if (previousStatus !== 'getup' || npc?.status !== 'normal') return false;
  return scheduleCombatRecovery(g, npc, 'getup');
}

export function tickCombatRecovery(g, npc, perception) {
  const rec = npc?.experimentalRecovery;
  if (!rec) return null;
  if (!recoveryEligible(g, npc) || !alive(g.player) ||
      g.t > rec.awaitUntil && rec.stage !== 'active') {
    clearCombatRecovery(npc);
    return null;
  }
  if (rec.stage === 'await-resume') {
    if (npc.status !== 'normal') return null;
    rec.stage = 'await-ready';
  }
  if (npc.status !== 'normal' || !npc.onGround) {
    clearCombatRecovery(npc);
    return null;
  }
  if (rec.stage === 'await-ready') {
    // This never accelerates the end of an already authored saber swing,
    // Force action, dodge or animation lock.
    npc.cmd.attack = false; npc.cmd.alt = false;
    if (npc.saber?.isActiveSwing?.() ||
        (npc.saber?.weaponTime ?? 0) > 0 ||
        (npc.forceUntil ?? 0) > g.t ||
        (npc.legsLockUntil ?? 0) > g.t || npc.dodge ||
        npc.executing || npc.kata || npc.critStrike ||
        (npc.critAt ?? 0) > g.t ||
        (npc.critUntil ?? 0) > g.t) return 'waiting';
    rec.stage = 'active';
    rec.until = g.t + durations[rec.reason];
  }
  if (g.t > rec.until) { clearCombatRecovery(npc); return null; }
  // This rest interval cannot run over a newly committed counter or Force
  // animation. The original recovery state is discarded, not resumed later.
  if (npc.critStrike || (npc.critAt ?? 0) > g.t ||
      (npc.critUntil ?? 0) > g.t || npc.dodge ||
      (npc.forceUntil ?? 0) > g.t ||
      (npc.legsLockUntil ?? 0) > g.t ||
      npc.executing || npc.kata ||
      npc.saber?.isActiveSwing?.() ||
      (npc.saber?.weaponTime ?? 0) > 0 ||
      npc.experimentalAdaptiveResponse || npc.experimentalExchangeChain ||
      npc.experimentalExchangeRiposte) {
    clearCombatRecovery(npc);
    return null;
  }
  npc.experimentalTacticalCue = null;
  npc.cmd.attack = false;
  npc.cmd.alt = false;
  // If the player disappeared, preserve Part 13's last-seen search rather
  // than turning/moving toward a hidden live player location.
  if (!['visible', 'lead', 'support', 'committed'].includes(perception))
    return 'guarding';
  const move = chooseExchangeFootwork(npc, g.player, rec.side);
  if (move) {
    npc.cmd.fwd = rec.reason === 'missed-swing' ? move.fwd :
      Math.min(move.fwd, -0.32);
    npc.cmd.right = move.right;
    npc.cmd.walk = true;
  }
  return rec.reason;
}
