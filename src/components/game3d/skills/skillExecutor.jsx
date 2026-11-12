import { getSkillById, scaleStat } from './skillRegistry';
import { canCastWithEquippedWeapon, describeWeaponMismatch } from './weaponValidator';
import { activateBuff } from './buffEngine';
import { SKILL_TYPE, CAST_TYPE } from './skillTypes';
import { getLoadout } from './loadoutStore';
import { getAXEInventoryItemsByCategory, switchAXEInventoryWeapon } from '../axe/equipment/AXEEquipmentInventoryStore';
import { resolveAXEWeaponIdentity } from '../axe/weapons/AXEWeaponIdentity';
import { getWeaponLevel } from '../progression/weaponMasteryStore';
import { getActiveWeaponId } from '../progression/weaponMastery/WeaponScalingPipeline';
import { reportSkillCast } from '../progression/weaponMastery/WeaponMasteryEngine';
import { consumeCriticalFocusForSingleHit } from './twelveSkyFocusState';
import { armForcedCriticalHit } from '../combat/forcedCriticalBridge';
import { setCombatFlag } from '../talents/advancedClassStore';
import { getAXEMountFusionState } from '../axe/progression/AXEMountStore';
import { planAXEMountSoulEchoes } from '../axe/progression/AXEMountFusionSystem';
import { getAXEAscensionSkillMultiplier, hasAXEAscensionShockwave } from '../axe/progression/AXEAscensionStore';
import {
  onTripleSlashCast,
  onTripleSlashFinalHit,
  onDoubleShotHit,
  onDoubleShotCastEnd,
} from './skillSoundEffects';
import { getSkillMasteryLevel, noteBuffCast, noteSkillStrike } from './skillMasteryStore';
import { qualifyChargedCast, chargedStrikeModifiers, skillCombatFamily, FINISHER_CHAIN_LEAD_MS, FINISHER_CHAIN_GRACE_MS, chainedSingleDelay } from '../combat/ChargedSkillRules';
import { counterChargeQualification } from '../combat/KillFlowCounter.mjs';
import { AXE_AOE_CHANNEL, isAOEChannelUnlocked } from '../combat/ContinuousAOERules.mjs';

let castingUntil = 0;
let castingTimer = null;

function markCasting(durationMs = 350) {
  const now = Date.now();
  castingUntil = Math.max(castingUntil, now + Math.max(80, Number(durationMs) || 350));
  setCombatFlag('casting', true);
  if (castingTimer) clearTimeout(castingTimer);
  const release = () => {
    const remaining = castingUntil - Date.now();
    if (remaining > 0) {
      castingTimer = setTimeout(release, remaining);
      return;
    }
    castingTimer = null;
    setCombatFlag('casting', false);
  };
  castingTimer = setTimeout(release, Math.max(80, castingUntil - now));
}

function toast(text) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('skillActivatedToast', { detail: { text } }));
}

// echo: an extra strike from an absorbed mount's soul (Mount Soul Fusion), never the skill's own hit
function dispatchStrike(skill, hitIndex, level, echo = null, castOptions = {}) {
  if (typeof window === 'undefined') return;
  const baseMult = scaleStat(skill, 'damage_pct', level || 1) || 1;
  // Destroyer Nature (Taurus Chosen Ascension): skill damage x1.5, echoes included
  // Weapon mastery bonuses are already included in resolved stats; avoid applying twice.
  const charged = chargedStrikeModifiers(castOptions.qualification, hitIndex, skill.hit_count, !!echo);
  const multiplier = baseMult * (echo?.multiplierScale ?? 1) *
    getAXEAscensionSkillMultiplier() * charged.multiplier * (castOptions.channelPulse ? AXE_AOE_CHANNEL.pulseDamageScale : 1);
  const criticalAllowed = skill.critical_allowed !== false;
  const forceCritical = !echo && criticalAllowed && skill.cast_type === CAST_TYPE.SINGLE_HIT
    ? consumeCriticalFocusForSingleHit()
    : false;
  if (forceCritical) armForcedCriticalHit(1);
  const hitsTotal = echo?.total ?? skill.hit_count + (getAXEMountFusionState().active ? planAXEMountSoulEchoes(skill).length : 0);

  window.dispatchEvent(new CustomEvent('playerSkillStrike', {
    detail: {
      skillId: skill.skill_id,
      castId: castOptions.castId || null,
      multiplier,
      hitIndex,
      hitsTotal,
      charged: charged.multiplier > 1 || charged.critBonusPct > 0 || charged.fatalBonusPct > 0,
      chargedCritBonusPct: charged.critBonusPct,
      chargedFatalBonusPct: charged.fatalBonusPct,
      defensePiercePct: castOptions.chainFrom ? 0.35 : 0,
      chainFrom: castOptions.chainFrom || null,
      targetId: castOptions.targetId || null, // the fused count on every strike of the cast
      castType: skill.cast_type,
      weaponType: skill.weapon_type,
      forceCritical,
      criticalAllowed,
      axeSkillNumber: skill.axe_skill_number || null,
      axeRole: skill.axe_role || null,
      axePattern: skill.axe_pattern || null,
      aoeRadius: echo?.aoeRadius ?? Number(skill.aoe_radius || 0),
      soulEcho: echo?.kind || null, // 'spectral' | 'elemental' | 'spectral_aoe'
      soulPalette: echo?.palette || null,
      ascensionShockwave: !echo && skill.cast_type === CAST_TYPE.SINGLE_HIT && hasAXEAscensionShockwave(),
      divine: Boolean(skill.divine),
      aerial: Boolean(skill.aerial),
    },
  }));
  if (!castOptions.noMastery) noteSkillStrike(skill.skill_id, hitsTotal);
}

function scheduleSequential(skill, level, castOptions = {}) {
  const isTripleSlash = skill.skill_id === 'sword_triple_slash';
  if (isTripleSlash) onTripleSlashCast();
  if (castOptions.qualification?.charged && skillCombatFamily(skill) === 'three_hit') {
    const lastAt = Date.now() + ((skill.hit_count - 1) * skill.hit_delay * 1000);
    const openDelay = Math.max(0, lastAt - Date.now() - FINISHER_CHAIN_LEAD_MS);
    setTimeout(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('axeChargedFinisherWindow', {
        detail: { skillId: skill.skill_id, castId: castOptions.castId || null,
          targetId: castOptions.targetId || null,
          opensAt: Date.now(), finalHitAtMs: lastAt, expiresAt: lastAt + FINISHER_CHAIN_GRACE_MS,
          charged: true },
      }));
    }, openDelay);
  }
  for (let i = 0; i < skill.hit_count; i += 1) {
    setTimeout(() => {
      dispatchStrike(skill, i, level, null, castOptions);
      if (isTripleSlash && i === skill.hit_count - 1) onTripleSlashFinalHit();
    }, i * skill.hit_delay * 1000);
  }
}

function scheduleContinuousAOE(skill, level, castOptions) {
  // One cast pays Will and starts one cooldown. Subsequent pulses never
  // independently pay, award full skill XP, generate mount echoes or bypass PvP.
  if (typeof window === 'undefined') return;
  let index = 0, timer = null, stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    window.removeEventListener('axeAoeChannelStop', onStop);
    window.removeEventListener('playerSkillCastCancel', stop);
  };
  const onStop = event => {
    if (event.detail?.token === castOptions.channelToken) stop();
  };
  window.addEventListener('axeAoeChannelStop', onStop);
  window.addEventListener('playerSkillCastCancel', stop);
  window.dispatchEvent(new CustomEvent('playerSkillCastStart', {
    detail: { skillId: skill.skill_id, castType: skill.cast_type, duration: AXE_AOE_CHANNEL.durationMs / 1000 },
  }));
  const pulse = () => {
    if (stopped || index >= AXE_AOE_CHANNEL.maxPulses) { stop(); return; }
    dispatchStrike(skill, 0, level, null, { ...castOptions, channelPulse: true, noMastery: index > 0 });
    index++;
    if (index >= AXE_AOE_CHANNEL.maxPulses) stop();
  };
  pulse();
  if (!stopped) timer = setInterval(pulse, AXE_AOE_CHANNEL.pulseIntervalMs);
}
function scheduleGuardianBurst(skill, level, castOptions = {}) {
  const burst = skill.burst_delay ?? 0.08;
  const followUp = skill.follow_up_delay ?? 0.4;
  setTimeout(() => dispatchStrike(skill, 0, level, null, castOptions), 0);
  setTimeout(() => dispatchStrike(skill, 1, level, null, castOptions), burst * 1000);
  setTimeout(() => dispatchStrike(skill, 2, level, null, castOptions), skill.hit_delay * 1000);
  if ((skill.hit_count ?? 3) >= 4) {
    setTimeout(() => dispatchStrike(skill, 3, level, null, castOptions), (skill.hit_delay + followUp) * 1000);
  }
}

function scheduleRangedDouble(skill, level, castOptions = {}) {
  const isDoubleShot = skill.skill_id === 'ranged_double_shot';
  setTimeout(() => { dispatchStrike(skill, 0, level, null, castOptions); if (isDoubleShot) onDoubleShotHit(); }, 0);
  setTimeout(() => { dispatchStrike(skill, 1, level, null, castOptions); if (isDoubleShot) onDoubleShotHit(); }, skill.hit_delay * 1000);
  if (isDoubleShot) setTimeout(() => onDoubleShotCastEnd(), (skill.hit_delay * 1000) + 800);
}

function scheduleRangedBarrage(skill, level, castOptions = {}) {
  const castDurationMs = ((skill.hit_count - 1) * skill.hit_delay * 1000) + 350;
  window.dispatchEvent(new CustomEvent('playerSkillCastStart', {
    detail: { skillId: skill.skill_id, castType: skill.cast_type, duration: castDurationMs / 1000 },
  }));
  for (let i = 0; i < skill.hit_count; i += 1) {
    setTimeout(() => { dispatchStrike(skill, i, level, null, castOptions); onDoubleShotHit(); }, i * skill.hit_delay * 1000);
  }
  setTimeout(() => onDoubleShotCastEnd(), castDurationMs + 300);
}

export function castSkill(skillId, ctx = {}) {
  const skill = getSkillById(skillId);
  if (!skill) return { ok: false, reason: 'unknown_skill' };

  if (skill.skill_type === SKILL_TYPE.PASSIVE) {
    toast('Passive skills activate automatically');
    return { ok: false, reason: 'passive_cannot_cast' };
  }

  const supportedCast = skill.skill_type === SKILL_TYPE.ACTIVE_BUFF ||
    [CAST_TYPE.SINGLE_HIT, CAST_TYPE.MULTI_HIT_SEQUENTIAL, CAST_TYPE.MULTI_HIT_BURST,
      CAST_TYPE.RANGED_DOUBLE, CAST_TYPE.RANGED_BARRAGE].includes(skill.cast_type);
  if (!supportedCast) return { ok: false, reason: 'unsupported_cast_type' };

  // Preflight BEFORE an optional mastery auto-swap, so insufficient Will never
  // changes the equipped weapon. Only a successful cast pays once.
  const affordability = ctx.canSpendCombatResource?.('skill', skill) || { ok: true };
  if (!affordability.ok) {
    toast(affordability.reason === 'not_enough_will' ? 'Not enough Will' :
      affordability.reason === 'not_enough_stamina' ? 'Not enough stamina' : 'Cannot cast now');
    return affordability;
  }

  let weaponCheck = canCastWithEquippedWeapon(skillId);
  if (!weaponCheck.ok && skill.weapon_type && ctx.allowMasterySwap === true) {
    // Mastery (level 10+) unlocks an atomic swap-and-cast for owned weapons.
    // A skill never fires unarmed or with the wrong weapon. Invalid targets,
    // unowned weapons, low mastery, and failed saves leave equipment untouched.
    const candidate = getAXEInventoryItemsByCategory('weapon').find(item => {
      const identity = resolveAXEWeaponIdentity(item);
      return identity.advancedWeaponType === skill.weapon_type &&
        getWeaponLevel(identity.masteryWeaponId) >= 10;
    });
    if (candidate) {
      const swapped = switchAXEInventoryWeapon(candidate.instanceId, { level: ctx.playerLevel || 1 });
      if (!swapped.ok) return { ok: false, reason: swapped.reason };
      weaponCheck = canCastWithEquippedWeapon(skillId);
      if (weaponCheck.ok && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('axeMasteryWeaponTransition', {
          detail: { weaponInstanceId: candidate.instanceId, weaponType: skill.weapon_type, durationMs: 4000 },
        }));
      }
    }
  }
  if (!weaponCheck.ok) {
    toast(describeWeaponMismatch(weaponCheck));
    return { ok: false, reason: weaponCheck.reason };
  }

  // Use the tracked skill mastery level unless the caller specifies a fixed level.
  const level = Number(ctx.level) || getSkillMasteryLevel(skillId);
  const inferredSlot = Number.isInteger(ctx.slotIndex)
    ? ctx.slotIndex
    : getLoadout().activeSlots.indexOf(skillId);

  const counter = ctx.counterInstant === true && !ctx.isPvp
    ? counterChargeQualification(skillCombatFamily(skill)) : null;
  const qualification = counter ||
    qualifyChargedCast(skill, level, Number(ctx.heldMs) || 0, ctx.specializationId);
  const channelAOE = !ctx.isPvp && ctx.channelAOE === true &&
    typeof ctx.channelToken === 'string' && ctx.channelToken.length > 0 &&
    isAOEChannelUnlocked(skill, level);
  const eligibleChain = skillCombatFamily(skill) === 'single' &&
    typeof ctx.chainFrom === 'string' &&
    Number.isFinite(Number(ctx.chainReadyAtMs)) &&
    Math.abs(Number(ctx.chainReadyAtMs) - Date.now()) <= 800;
  const castOptions = { qualification, castId: ctx.castId || null,
    targetId: ctx.targetId || null,
    chainFrom: eligibleChain ? ctx.chainFrom : null,
    channelToken: channelAOE ? ctx.channelToken : null };
  const paid = ctx.spendCombatResource?.('skill', skill) || { ok: true };
  if (!paid.ok) {
    toast(paid.reason === 'not_enough_will' ? 'Not enough Will' : 'Not enough stamina');
    return paid;
  }

  if (skill.skill_type === SKILL_TYPE.ACTIVE_BUFF) {
    markCasting(220);
    noteBuffCast(skillId, activateBuff(skillId, level, { maxHP: ctx.maxHP })?.expiresAt);
    reportSkillCast(getActiveWeaponId());
    toast(`${skill.icon} ${skill.skill_name} activated`);
    return { ok: true };
  }

  if (skill.aerial && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('axeAerialSkillCast', {
      detail: { skillId: skill.skill_id, role: skill.axe_role, criticalAllowed: true },
    }));
  }

  const inferredDurationMs = Math.max(
    300,
    Math.round(
      (
        skill.cast_type === CAST_TYPE.RANGED_BARRAGE
          ? ((skill.hit_count - 1) * skill.hit_delay + 0.35)
          : skill.cast_type === CAST_TYPE.MULTI_HIT_SEQUENTIAL
            ? ((skill.hit_count - 1) * skill.hit_delay + 0.35)
            : skill.cast_type === CAST_TYPE.MULTI_HIT_BURST
              ? (skill.hit_delay + (skill.follow_up_delay || 0.4) + 0.25)
              : skill.cast_type === CAST_TYPE.RANGED_DOUBLE
                ? (skill.hit_delay + 0.25)
                : 0.45
      ) * 1000
    ),
  );
  markCasting(channelAOE ? AXE_AOE_CHANNEL.durationMs : inferredDurationMs);

  if (channelAOE) {
    scheduleContinuousAOE(skill, level, castOptions);
  } else switch (skill.cast_type) {
    case CAST_TYPE.SINGLE_HIT:
      window.dispatchEvent(new CustomEvent('playerSkillCastStart', {
        detail: { skillId: skill.skill_id, castType: skill.cast_type, duration: 0.45 },
      }));
      setTimeout(() => dispatchStrike(skill, 0, level, null, castOptions),
        eligibleChain ? chainedSingleDelay(Date.now(), ctx.chainReadyAtMs) : 120);
      break;
    case CAST_TYPE.MULTI_HIT_SEQUENTIAL:
      scheduleSequential(skill, level, castOptions);
      break;
    case CAST_TYPE.MULTI_HIT_BURST:
      scheduleGuardianBurst(skill, level, castOptions);
      break;
    case CAST_TYPE.RANGED_DOUBLE:
      scheduleRangedDouble(skill, level, castOptions);
      break;
    case CAST_TYPE.RANGED_BARRAGE:
      scheduleRangedBarrage(skill, level, castOptions);
      break;
    default:
      return { ok: false, reason: 'unsupported_cast_type' };
  }

  // Mount Soul Fusion: the absorbed mount's soul adds its own strikes after the skill's
  const fusion = getAXEMountFusionState();
  if (fusion.active && !channelAOE) {
    const echoes = planAXEMountSoulEchoes(skill);
    echoes.forEach((echo, i) => setTimeout(() => dispatchStrike(skill, skill.hit_count + i, level,
      { ...echo, palette: fusion.palette?.id || null, total: skill.hit_count + echoes.length }), echo.atMs));
  }

  reportSkillCast(getActiveWeaponId());
  toast(`${skill.icon} ${skill.skill_name}${counter ? ' — instant counter' : qualification.charged ? ' — charged' : ''}${channelAOE ? ' — channeling' : ''}${eligibleChain ? ' — chained finisher' : ''}`);
  return { ok: true };
}
