// Part 13: bounded duel perception and cooperative spacing for local Experimental AI.
// Commands flow through Fighter.update; no positions, hits, animations or resources
// are manufactured. Classic, cinematic, scripted and networked scenes opt out.
import { chooseExchangeFootwork } from './experimentalExchangeFootwork.js';
import { noteTacticalCue } from './experimentalTacticalDuelAI.js';
import { staminaBroken, STAMINA_SWING_COST } from './experimentalStamina.js';

export const DUEL_SIGHT_MEMORY = 1.65;
export const DUEL_SEARCH_SWEEP_SECONDS = 9;
export const DUEL_SQUAD_REACQUIRE_SECONDS = 0.22;
export const DUEL_NOTICE_RANGE = 14;
export const DUEL_SQUAD_RANGE = 4.8;
export const DUEL_ATTACK_LEASE = 0.85;
export const DUEL_MIN_MEMBER_STAMINA = STAMINA_SWING_COST + 8;

const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
const eye = f => typeof f?.chest === 'function'
  ? f.chest() : [f.pos[0], f.pos[1] + 1.15, f.pos[2]];

export function experimentalDuelEligible(g, npc) {
  const player = g?.player;
  return !!(g?.experimentalCombatActive?.() && !g.net && !g.online &&
    !g.teamMode && !g.boardingMode && !g.director && !g.bossWay &&
    !g.attract && !g.tutorialMode && !g.aiOff && !g.noDamage &&
    npc && !npc.remote && !npc.isPlayer && npc.hasSaber &&
    npc.status === 'normal' && npc.hp > 0 && npc.onGround &&
    !npc.dodge && !npc.kata && !npc.executing &&
    player && player.status === 'normal' && player.hp > 0 &&
    !player.remote && g.foesOf?.(npc)?.includes(player) &&
    typeof g.world?.lineOfSight === 'function');
}

export function currentDuelSight(g, npc) {
  const player = g?.player;
  if (!experimentalDuelEligible(g, npc) || !Number.isFinite(g.t)) return false;
  const d = dist(npc, player);
  if (!Number.isFinite(d) || d > DUEL_NOTICE_RANGE) return false;
  const fx = Math.sin(npc.yaw), fz = Math.cos(npc.yaw);
  const dx = player.pos[0] - npc.pos[0], dz = player.pos[2] - npc.pos[2];
  // Field-of-view protects rear flanks until normal AI locomotion or a
  // previously scheduled delayed flank-notice has actually resolved.
  const frontal = d < 0.75 || d < 0.01 || (fx * dx + fz * dz) / d >= -0.12;
  return frontal && !!g.world.lineOfSight(eye(npc), eye(player));
}

function hasResponse(npc, now) {
  return !!(npc.experimentalFlankRead ||
    npc.experimentalSurgeResponse || npc.experimentalComboResponse ||
    npc.experimentalAdaptiveResponse || npc.experimentalExchangeChain ||
    npc.experimentalExchangeRiposte ||
    (npc.experimentalExchangeRecoveryUntil ?? 0) > now ||
    (npc.critAt ?? 0) > now || (npc.critUntil ?? 0) > now);
}

export const DUEL_INVESTIGATE_LANE = 0.22;
export const DUEL_SHARED_SEARCH_RADIUS = 2;

// Partners get complementary *movement inputs*, not shared target knowledge.
// Each NPC must have independently observed this same player recently. Only
// cached observed coordinates and known ally positions participate.
function nearbySearchPartners(g, npc, sight) {
  if (!npc.team || sight?.target !== g.player ||
      !Number.isFinite(sight.seenAt) || !Array.isArray(sight.pos))
    return [];
  return (g.npcs || []).filter(other => {
    const seen = other?.experimentalDuelSight;
    if (!other || other.team !== npc.team || other.isPlayer ||
        other.remote || !other.hasSaber || other.hp <= 0 ||
        other.status !== 'normal' || !other.onGround ||
        busy(other, g.t) || other.experimentalRecovery ||
        (other.legsLockUntil ?? 0) > g.t ||
        seen?.target !== g.player || !Array.isArray(seen.pos) ||
        !Number.isFinite(seen.seenAt) ||
        g.t - seen.seenAt < 0 || g.t - seen.seenAt > DUEL_SIGHT_MEMORY)
      return false;
    const apart = Math.hypot(other.pos?.[0] - npc.pos[0],
      other.pos?.[2] - npc.pos[2]);
    const reports = Math.hypot(seen.pos[0] - sight.pos[0],
      seen.pos[2] - sight.pos[2]);
    return Number.isFinite(apart) && apart <= DUEL_SQUAD_RANGE &&
      Number.isFinite(reports) && reports <= DUEL_SHARED_SEARCH_RADIUS &&
      !currentDuelSight(g, other); // only other investigators, never visible attackers
  });
}

// Return 'visible', 'investigate', 'search' or null. The recorded location
// is frozen at the LAST observed position, never updated from an unseen player.
export function applyDuelSight(g, npc) {
  if (!experimentalDuelEligible(g, npc)) return null;
  // A newly replaced player/session cannot inherit the previous player's
  // coordinates, search heading or reacquisition cue.
  if (npc.experimentalDuelSight?.target &&
      npc.experimentalDuelSight.target !== g.player) {
    npc.experimentalDuelSight = null;
    npc.experimentalDuelSearch = null;
    npc.experimentalHadDuelSight = false;
    npc.experimentalDuelLostAt = null;
    npc.experimentalDuelSquadReadyAt = 0;
  }
  if (currentDuelSight(g, npc)) {
    const lostAt = npc.experimentalDuelLostAt;
    if (Number.isFinite(lostAt) && g.t >= lostAt) {
      // The fighter has really reacquired sight, but fellow duelists must
      // confirm their own sight before they can share an attack lane.
      // Do not grant a squad lease on the exact reacquisition frame.
      npc.experimentalDuelSquadReadyAt = g.t + DUEL_SQUAD_REACQUIRE_SECONDS;
      if (g.t - lostAt >= 0.2 && g.t - lostAt <= 3)
        noteTacticalCue(g, npc, g.player, 'reacquired');
    }
    npc.experimentalHadDuelSight = true;
    npc.experimentalDuelLostAt = null;
    npc.experimentalDuelSight = {
      target: g.player, seenAt: g.t, pos: g.player.pos.slice(),
    };
    npc.experimentalDuelSearch = null;
    return 'visible';
  }
  if (npc.experimentalHadDuelSight) {
    npc.experimentalHadDuelSight = false;
    npc.experimentalDuelLostAt = g.t;
  }
  // Even a local line-of-sight break is not permission for omniscient Force
  // use or perfect aim. Do not cancel already committed saber animations.
  npc.cmd.attack = false;
  npc.cmd.alt = false;
  npc.experimentalDuelSupportUntil = 0;
  const sight = npc.experimentalDuelSight;
  if (npc.experimentalFlankRead) return 'search'; // separate delayed notice owns orientation
  if (hasResponse(npc, g.t)) {
    // Existing authored dodge/guard may finish; do not steer its movement
    // toward an occluded opponent's live position.
    npc.cmd.fwd = 0; npc.cmd.right = 0;
    npc.targetYaw = npc.yaw;
    return 'search';
  }
  if (sight && g.t - sight.seenAt <= DUEL_SIGHT_MEMORY) {
    const dx = sight.pos[0] - npc.pos[0], dz = sight.pos[2] - npc.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > 0.2) npc.targetYaw = Math.atan2(dx, dz);
    npc.cmd.fwd = d > 1.5 ? 0.4 : 0;
    npc.cmd.right = 0;
    // Two independently alerted Jedi should not funnel into the exact same
    // narrow search lane. Do not touch any authored animation commitment.
    if (d > 1.5 && !busy(npc, g.t) && !npc.experimentalRecovery &&
        (npc.legsLockUntil ?? 0) <= g.t) {
      const partners = nearbySearchPartners(g, npc, sight);
      if (partners.length > 1 && partners.includes(npc))
        npc.cmd.right = (partners.indexOf(npc) % 2 ? 1 : -1) *
          DUEL_INVESTIGATE_LANE;
    }
    npc.cmd.walk = true;
    return 'investigate';
  }
  // Turn gradually to scan the arena, without rotating straight to the
  // concealed player's exact current location. An entire sweep takes seconds.
  npc.cmd.fwd = 0; npc.cmd.right = 0; npc.cmd.walk = true;
  let scan = npc.experimentalDuelSearch;
  if (!scan || !Number.isFinite(scan.started) || g.t < scan.started) {
    scan = { started: g.t, yaw: npc.yaw, side: (npc.humId || 0) % 2 ? 1 : -1 };
    npc.experimentalDuelSearch = scan;
  }
  // A finite visual sweep does not loop forever as if a hidden target kept
  // renewing the alert. On expiry the guard holds its scanned heading until
  // an actual sighting restarts combat perception.
  const elapsed = Math.min(DUEL_SEARCH_SWEEP_SECONDS,
    Math.max(0, g.t - scan.started));
  npc.targetYaw = scan.yaw + elapsed * 0.55 * scan.side;
  return 'search';
}

function busy(npc, now) {
  return !!(hasResponse(npc, now) ||
    npc.kicking || npc.thrown || npc.critStrike ||
    npc.saber?.isActiveSwing?.() || (npc.saber?.weaponTime ?? 0) > 0 ||
    (npc.forceUntil ?? 0) > now);
}

export function eligibleSquadMembers(g, npc) {
  if (!experimentalDuelEligible(g, npc) || !currentDuelSight(g, npc))
    return [];
  // Current geometry alone does not prove an ally's perception pass has
  // processed reacquisition yet. Prevent cross-NPC instant awareness and
  // preserve each NPC's short independent return-to-squad window.
  const squadReady = member =>
    (member.experimentalDuelSquadReadyAt ?? 0) <= g.t &&
    member.experimentalDuelLostAt == null &&
    (!member.experimentalDuelSight?.target ||
      member.experimentalDuelSight.target === g.player);
  if (!squadReady(npc)) return [];
  return (g.npcs || []).filter(other =>
    other.team === npc.team && experimentalDuelEligible(g, other) &&
    squadReady(other) && currentDuelSight(g, other) &&
    dist(other, g.player) <= DUEL_SQUAD_RANGE &&
    other.experimentalStamina && !staminaBroken(other.experimentalStamina, g.t) &&
    other.experimentalStamina.current >= DUEL_MIN_MEMBER_STAMINA);
}

// Lease the initiative to one nearby duelist. Rotate at the end of a natural
// attack opportunity, not mid-swing. Existing counter states take precedence.
export function chooseSquadAttacker(g, members) {
  if (!g || members.length < 2) return null;
  const last = g.experimentalDuelAttackLease;
  if (last && last.player === g.player && members.includes(last.npc)) {
    if (last.until > g.t) return last.npc;
    if (busy(last.npc, g.t)) {
      last.until = g.t + 0.2;
      return last.npc;
    }
  }
  const oldIndex = last && last.player === g.player ? members.indexOf(last.npc) : -1;
  const next = members[(oldIndex + 1) % members.length];
  g.experimentalDuelAttackLease = { player: g.player, npc: next,
    until: g.t + DUEL_ATTACK_LEASE };
  return next;
}

// Called after existing authored AI decisions, after counter/Force replies,
// but before Fighter.update. Only idle non-leading duelists have cmd overridden.
export function applySquadSpacing(g, npc) {
  if (!experimentalDuelEligible(g, npc) || !currentDuelSight(g, npc)) return null;
  const members = eligibleSquadMembers(g, npc);
  if (members.length < 2 || !members.includes(npc)) return null;
  const lead = chooseSquadAttacker(g, members);
  if (!lead) return null;
  if (lead === npc) return 'lead';
  if (busy(npc, g.t)) return 'committed';
  const side = (members.indexOf(npc) % 2 ? 1 : -1);
  const move = chooseExchangeFootwork(npc, g.player, side);
  if (!move) return null;
  npc.cmd.attack = false;
  npc.cmd.alt = false;
  npc.cmd.fwd = move.fwd;
  npc.cmd.right = move.right;
  npc.cmd.walk = move.walk;
  npc.experimentalDuelSupportUntil = g.t + 0.10;
  return 'support';
}

export function runExperimentalDuelCoordination(g, npc) {
  const sight = applyDuelSight(g, npc);
  if (sight !== 'visible') return sight;
  return applySquadSpacing(g, npc) || sight;
}
