// Part 11: earned AI counter -> player retaliation -> one defensive answer.
// All triggers are committed combat events; no scripted damage or free parries.
// Never active in Classic, multiplayer, tutorial, or mission/raid cinematics.
import { staminaBroken } from './experimentalStamina.js';
import { chooseExchangeFootwork, canExchangeRiposte, exchangeHasCurrentSight, EXCHANGE_RIPOSTE_DELAY, EXCHANGE_RIPOSTE_WINDOW } from './experimentalExchangeFootwork.js';

export const EXCHANGE_CHAIN_MAX_SECONDS = 3.4;
export const EXCHANGE_SWING_WINDOW = 0.8;
export const EXCHANGE_REPLY_WINDOW = 1.35;
export const EXCHANGE_NOTICE_MIN = 0.17;
export const EXCHANGE_NOTICE_MAX = 0.38;
export const EXCHANGE_FORCE_COST_PERCENT = 15;
export const EXCHANGE_MIN_STAMINA = 28;
export const EXCHANGE_MAX_RANGE = 3.8;
export const EXCHANGE_RECOVERY_SECONDS = 0.5;

const live = f => !!(f && !f.remote && f.status === 'normal' && f.hp > 0);
const distance = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
const front = (a, b) => {
  const d = distance(a, b);
  return d >= 0.3 && d <= EXCHANGE_MAX_RANGE &&
    (Math.sin(a.yaw) * (b.pos[0] - a.pos[0]) +
     Math.cos(a.yaw) * (b.pos[2] - a.pos[2])) / d >= 0.2;
};

export function exchangeAllowed(g, npc, player) {
  return !!(g?.experimentalCombatActive?.() && !g.net && !g.online &&
    !g.teamMode && !g.director && !g.bossWay && !g.tutorialMode &&
    !g.aiOff && !g.attract && !g.boardingMode && !g.noDamage &&
    live(npc) && live(player) && !npc.isPlayer && player.isPlayer &&
    npc.hasSaber && !npc.saber?.holstered && !npc.saber?.inFlight &&
    npc.onGround && !npc.kata && !npc.executing && !npc.dodge &&
    !npc.experimentalFlankRead && !npc.experimentalSurgeResponse &&
    !npc.experimentalComboResponse && g.foesOf?.(npc)?.includes(player));
}

// Part 10's chosen attack only proposes an exchange. The AI must still
// actually begin its normal saber swing before this state can progress.
export function startAIExchange(g, npc, player) {
  if (!exchangeAllowed(g, npc, player) || npc.experimentalExchangeChain) return false;
  npc.experimentalExchangeChain = {
    player, stage: 'await-ai-swing', since: g.t,
    until: g.t + EXCHANGE_CHAIN_MAX_SECONDS,
  };
  return true;
}

export function noteExchangeSwing(g, fighter) {
  if (!g?.experimentalCombatActive?.() || !fighter) return false;
  if (fighter.isPlayer) {
    let marked = false;
    for (const npc of g.npcs || []) {
      const s = npc.experimentalExchangeChain;
      if (!s || s.stage !== 'await-reply' || s.player !== fighter ||
          g.t > s.until || !exchangeAllowed(g, npc, fighter) ||
          !front(npc, fighter)) continue;
      const skill = Math.max(0, Math.min(1, npc.blockSkill ?? 0.5));
      s.stage = 'reply';
      s.until = Math.min(s.since + EXCHANGE_CHAIN_MAX_SECONDS, g.t + EXCHANGE_REPLY_WINDOW);
      s.noticeAt = g.t + EXCHANGE_NOTICE_MAX -
        (EXCHANGE_NOTICE_MAX - EXCHANGE_NOTICE_MIN) * skill;
      s.replyUntil = g.t + EXCHANGE_REPLY_WINDOW;
      // Limited, readable choice: a normal ready-saber cover or one funded,
      // obstacle-checked Force evasion. No instantaneous block/damage.
      const F = g.forceOf?.(npc);
      s.action = npc.experimentalStamina?.current >= 45 && F &&
        F.fp >= (F.max || 100) * EXCHANGE_FORCE_COST_PERCENT / 100 &&
        skill >= 0.55 ? 'force-evade' : 'cover';
      s.side = Math.sin(npc.yaw - fighter.yaw) >= 0 ? 1 : -1;
      marked = true;
    }
    return marked;
  }
  const s = fighter.experimentalExchangeChain;
  if (!s || s.stage !== 'await-ai-swing' || g.t > s.until ||
      !exchangeAllowed(g, fighter, s.player)) return false;
  s.stage = 'await-contact';
  s.swingUntil = Math.min(s.until, g.t + EXCHANGE_SWING_WINDOW);
  return true;
}

export function noteExchangeContact(g, attacker, defender, kind) {
  const s = attacker?.experimentalExchangeChain;
  if (!s || s.stage !== 'await-contact' || s.player !== defender ||
      !['hit', 'blocked'].includes(kind) || g.t > s.swingUntil ||
      !exchangeAllowed(g, attacker, defender) || !live(defender)) return false;
  s.stage = 'await-reply';
  s.until = Math.min(s.until, g.t + EXCHANGE_REPLY_WINDOW);
  return true;
}

// Only an actual *blocked* player saber strike against the specific AI
// duelist creates this optional next answer. A swing button or near miss
// cannot manufacture a follow-up. The defender still needs recovery.
export function noteExchangePlayerBlock(g, player, npc) {
  if (!exchangeAllowed(g, npc, player) || !front(npc, player) ||
      (npc.critAt ?? 0) > g.t || (npc.critUntil ?? 0) > g.t ||
      npc.experimentalExchangeRiposte) return false;
  const s = npc.experimentalExchangeChain;
  const pending = s?.stage === 'reply' && s.player === player && g.t <= s.until;
  const recovering = !s && npc.experimentalExchangeRecoveryTarget === player &&
    npc.experimentalExchangeRecoveryKind === 'cover' &&
    (npc.experimentalExchangeRecoveryUntil ?? 0) > g.t;
  if (!pending && !recovering) return false;
  const token = { target: player, readyAt: g.t + EXCHANGE_RIPOSTE_DELAY,
    until: Math.min(g.t + EXCHANGE_RIPOSTE_WINDOW,
      pending ? s.until : npc.experimentalExchangeRecoveryUntil) };
  if (pending) {
    if (s.riposte) return false;
    s.riposte = token;
  } else npc.experimentalExchangeRiposte = token;
  return true;
}

export function tickExchangeDefense(g, npc) {
  const s = npc?.experimentalExchangeChain;
  if (!s) return null;
  const now = g?.t;
  const player = s.player;
  if (!Number.isFinite(now) || now > s.until ||
      !exchangeAllowed(g, npc, player) || !front(npc, player) ||
      !npc.experimentalStamina ||
      staminaBroken(npc.experimentalStamina, now) ||
      npc.experimentalStamina.current < EXCHANGE_MIN_STAMINA ||
      (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now) {
    npc.experimentalExchangeChain = null;
    return null;
  }
  if (s.stage !== 'reply') return null;
  if (now > s.replyUntil) {
    npc.experimentalExchangeChain = null;
    return null;
  }
  if (now < s.noticeAt) return null;
  // The incoming player's authored swing may already connect by this point.
  // Recovery and AI facing constraints are always respected.
  if (npc.saber?.isActiveSwing?.() || npc.saber?.weaponTime > 0 ||
      npc.forceUntil > now || npc.critStrike) return null;
  npc.cmd.attack = false;
  const F = g.forceOf?.(npc);
  const cost = (F?.max || 100) * EXCHANGE_FORCE_COST_PERCENT / 100;
  if (s.action === 'force-evade' && F && !F.holding && !F.charging &&
      !F.dash && F.fp >= cost && (npc.dodgeReadyAt || 0) <= now) {
    npc.cmd.fwd = -0.5; npc.cmd.right = s.side;
    if (g.combat?.evadeHeld?.(player, npc, F, cost)) {
      npc.experimentalExchangeChain = null;
      npc.experimentalExchangeRecoveryUntil = now + EXCHANGE_RECOVERY_SECONDS;
      npc.experimentalExchangeRecoverySide = s.side;
      npc.experimentalExchangeRecoveryTarget = player;
      npc.experimentalExchangeRecoveryKind = 'force-evade';
      npc.experimentalExchangeRiposte = null;
      return 'force-evade';
    }
  }
  // Cover remains a real, vulnerable ready-saber stance. The existing
  // collision/block resolver determines whether it actually parries anything.
  // Grounded footwork is handled by Fighter.update with the same walls/floor.
  const motion = chooseExchangeFootwork(npc, player, s.side);
  npc.cmd.fwd = motion?.fwd ?? -0.2;
  npc.cmd.right = motion?.right ?? s.side * 0.25;
  npc.cmd.walk = true;
  npc.experimentalExchangeChain = null;
  npc.experimentalExchangeRecoveryUntil = now + EXCHANGE_RECOVERY_SECONDS;
  npc.experimentalExchangeRecoverySide = s.side;
  npc.experimentalExchangeRecoveryTarget = player;
  npc.experimentalExchangeRecoveryKind = 'cover';
  npc.experimentalExchangeRiposte = s.riposte || null;
  // Let the defensive stance and legs settle before any earned riposte.
  if (npc.experimentalExchangeRiposte)
    npc.experimentalExchangeRiposte.readyAt = Math.max(
      npc.experimentalExchangeRiposte.readyAt, now + 0.18);
  return 'cover';
}

export function tickExchangeRecovery(g, npc) {
  if (!g?.experimentalCombatActive?.() || g.net || g.online ||
      g.teamMode || g.tutorialMode || g.bossWay || g.director ||
      g.boardingMode || g.attract || g.noDamage || g.aiOff ||
      (npc?.experimentalExchangeRecoveryUntil ?? 0) <= g.t) return false;
  if (!npc || npc.isPlayer || npc.remote || npc.status !== 'normal' ||
      !npc.onGround || npc.kata || npc.executing || npc.dodge ||
      npc.experimentalFlankRead || npc.experimentalSurgeResponse ||
      npc.experimentalComboResponse || npc.experimentalAdaptiveResponse) return false;
  const player = npc.experimentalExchangeRecoveryTarget;
  if (!player || !g.foesOf?.(npc)?.includes(player) ||
      player.status === 'dead' || player.hp <= 0) return false;
  // Losing real sight retires a queued riposte and its live-target footwork.
  // The later Part 13 perception pass owns last-seen search movement, so this
  // response never steers towards a player hidden behind level geometry.
  if (!exchangeHasCurrentSight(g, npc, player)) {
    npc.experimentalExchangeRiposte = null;
    npc.experimentalExchangeRecoveryUntil = 0;
    npc.experimentalExchangeRecoveryTarget = null;
    npc.experimentalExchangeRecoveryKind = null;
    return false;
  }
  // A real block can earn *one* delayed counter, but never from an animation
  // alone. It uses the same cmd.attack and stamina debit as any normal swing.
  if (npc.experimentalExchangeRiposte &&
      canExchangeRiposte(g, npc, npc.experimentalExchangeRiposte)) {
    npc.experimentalExchangeRiposte = null;
    npc.experimentalExchangeRecoveryUntil = 0;
    npc.cmd.attack = true;
    npc.cmd.alt = false;
    npc.cmd.fwd = 0.08; npc.cmd.right = 0;
    npc.cmd.walk = false;
    return 'riposte';
  }
  if (npc.experimentalExchangeRiposte &&
      g.t > npc.experimentalExchangeRiposte.until)
    npc.experimentalExchangeRiposte = null;
  // Preserve a cautious orbit while the player can still hit the duelist.
  // Fighter.update handles locomotion acceleration, foot animations and
  // actual BSP collisions; there is no instant teleport or forced block.
  const motion = chooseExchangeFootwork(npc, player,
    npc.experimentalExchangeRecoverySide || 1);
  if (!motion) return false;
  npc.cmd.attack = false;
  npc.cmd.alt = false;
  npc.cmd.fwd = motion.fwd;
  npc.cmd.right = motion.right;
  npc.cmd.walk = motion.walk;
  return true;
}
