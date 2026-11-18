// Part 5: continuous post-Force-step animation and believable rear-flank reads.
// These helpers never run in Classic, networked sessions, or scripted missions.
export const FLOW_BLEND_SECONDS = 0.12;
export const FLOW_EXIT_WINDOW = 0.42;
export const FLANK_NOTICE_MIN = 0.18;
export const FLANK_NOTICE_MAX = 0.58;
export const FLANK_TURN_WINDOW = 0.46;
export const DEFENSIVE_CHAIN_GRACE = 0.4;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function flowAttackBlend(fighter, now, authoredSeconds, isIdle = false) {
  const authored = Math.max(0.04, Number.isFinite(authoredSeconds) ? authoredSeconds : 0.1);
  if (isIdle || !fighter?.isPlayer || !fighter?.g?.experimentalCombatActive?.() ||
      !fighter.experimentalCombo || fighter.experimentalFlowUntil <= now ||
      fighter.dodge || fighter.status !== 'normal') return authored;
  // Increase pose blending only: never accelerate clips, skip frames or
  // alter the authored saber state machine's attack/hit timing.
  return Math.max(authored, FLOW_BLEND_SECONDS); // never shorten a longer authored blend
}

export function markFlowLanding(fighter, now) {
  const combo = fighter?.experimentalCombo;
  if (!fighter?.isPlayer || !combo ||
      !['step', 'reposition'].includes(combo.phase) || combo.until <= now ||
      combo.target?.status === 'dead') return false;
  fighter.experimentalFlowUntil = now + FLOW_EXIT_WINDOW;
  return true;
}

export function planFlankRead(attacker, defender, now) {
  if (!attacker?.isPlayer || !attacker.experimentalCombo || !defender ||
      defender.remote || defender.isPlayer || !defender.hasSaber ||
      defender.status !== 'normal' || defender.hp <= 0 ||
      !defender.onGround || !Number.isFinite(now) ||
      attacker.experimentalCombo.target !== defender) return null;
  const dx = attacker.pos[0] - defender.pos[0];
  const dz = attacker.pos[2] - defender.pos[2];
  const dist = Math.hypot(dx, dz);
  if (dist < 0.2 || dist > 5) return null;
  const forward = (Math.sin(defender.yaw) * dx + Math.cos(defender.yaw) * dz) / dist;
  if (forward >= -0.25) return null; // never create fake rear awareness in front
  const skill = clamp(defender.blockSkill ?? 0.5, 0, 1);
  const delay = FLANK_NOTICE_MAX - (FLANK_NOTICE_MAX - FLANK_NOTICE_MIN) * skill;
  // The opponent must *notice* the flank. Until then it cannot track the
  // player's new exact direction or initiate an instant rear counter.
  return { attacker, noticeAt: now + delay, until: now + delay + FLANK_TURN_WINDOW,
    side: (dx * Math.cos(defender.yaw) - dz * Math.sin(defender.yaw)) >= 0 ? 1 : -1 };
}

export function flankReadCommand(defender, now) {
  const s = defender?.experimentalFlankRead;
  if (!s || !Number.isFinite(now) || now > s.until ||
      s.attacker?.status === 'dead' || defender.status !== 'normal') return null;
  if (now < s.noticeAt) return { phase: 'unaware', turn: false, side: 0 };
  return { phase: 'turn', turn: true, side: s.side };
}

export function recordComboDefense(fighter, attacker, now) {
  const s = fighter?.experimentalCombo, stamina = fighter?.experimentalStamina;
  if (!fighter?.isPlayer || !s || s.target !== attacker ||
      !['contact', 'reposition'].includes(s.phase) || s.defenseUsed ||
      !Number.isFinite(now) || now > s.until ||
      !stamina || stamina.current <= 0 || stamina.brokenUntil > now) return false;
  // A real, successfully blocked enemy strike buys 400 ms for a counter.
  // Each combo receives only one such grace period; repeated guards cannot
  // manufacture an endless counter loop.
  fighter.experimentalCombo = { ...s, defenseUsed: true, until: s.until + DEFENSIVE_CHAIN_GRACE };
  return true;
}
