// Game 3D event sounds: plays sound-pack one-shots for moments that existing
// systems already announce with window events. Presentation only. Nothing
// here changes combat, rewards, quest state or progression, and every sound
// goes through the same playActionSound path (admin uploads and volume
// conventions apply). Swing, impact, enemy death and level-up are played by
// their existing call sites; this bridge adds the moments that had no sound.
import { selectComboFinisherSound } from '../combat/CombatSoundRouter.mjs';

export const EVENT_SOUND_VOLUME = Object.freeze({
  chest_open: 0.75,
  combo_finisher: 0.78,
  armor_break: 0.8,
  victory: 0.8,
  milestone_quest_victory: 0.7,
});
export const VICTORY_COOLDOWN_MS = 8000;      // one sting per win, even if several systems report it
export const ARMOR_BREAK_COOLDOWN_MS = 900;   // big hits can break several boss bars at once
export const CONTAINER_REPEAT_MS = 600;
export const BOSS_HEARING_RANGE = 140;        // metres; distant bosses dying elsewhere stay silent

export const GAME_EVENT_SOUND_EVENTS = Object.freeze([
  'axeContainerOpened', 'playerSkillStrike', 'axeShieldBroken', 'bossAction', 'bossDeathStarted',
  'axeRuntimeEnemyDefeated', 'axeDungeonBossDefeated', 'axeDuelResult', 'axeQuestRewardGranted',
  'axeFactionWarChanged', 'rogueBossDefeated',
]);

/**
 * @param {Object} options
 * @param {EventTarget|null} options.target - window in the game; injected in tests
 * @param {(key:string, options:{volume:number})=>void} options.playSound - playActionSound
 * @param {(key:string)=>boolean} options.hasSound - true when an upload or pack file exists
 * @param {()=>number} options.now - ms clock
 * @param {()=>({x:number,z:number}|null)} options.getListenerPosition - local player
 * @param {(bossId:string)=>({x:number,z:number}|null)} options.getBossPosition
 */
export function createGameEventSoundBridge({
  target = typeof window !== 'undefined' ? window : null,
  playSound = () => {},
  hasSound = () => true,
  now = () => Date.now(),
  getListenerPosition = () => null,
  getBossPosition = () => null,
  bossHearingRange = BOSS_HEARING_RANGE,
} = {}) {
  const lastAt = new Map();
  const recent = [];
  let warWins = null;
  let disposed = false;

  const gate = (tag, ms) => {
    const t = Number(now());
    const previous = lastAt.get(tag);
    if (previous !== undefined && t - previous < ms) return false;
    lastAt.set(tag, t);
    return true;
  };
  const play = (key, volume, reason) => {
    if (disposed || !hasSound(key)) return false;
    playSound(key, { volume });
    recent.push({ key, reason });
    if (recent.length > 32) recent.shift();
    return true;
  };
  const bossNearby = (bossId) => {
    const boss = bossId != null ? getBossPosition(bossId) : null;
    const me = getListenerPosition();
    if (!boss || !me) return true;
    const distance = Math.hypot(Number(boss.x) - Number(me.x), Number(boss.z) - Number(me.z));
    return !Number.isFinite(distance) || distance <= bossHearingRange;
  };
  const victory = (reason, volume = EVENT_SOUND_VOLUME.victory) =>
    hasSound('victory') && gate('victory', VICTORY_COOLDOWN_MS) && play('victory', volume, reason);
  const armorBreak = reason =>
    hasSound('armor_break') && gate('armor_break', ARMOR_BREAK_COOLDOWN_MS)
      && play('armor_break', EVENT_SOUND_VOLUME.armor_break, reason);

  const handlers = {
    // AXEInteractionMount's chests/loot containers.
    axeContainerOpened: (event) => {
      const id = event?.detail?.containerId ?? 'container';
      if (gate(`container:${id}`, CONTAINER_REPEAT_MS)) play('chest_open', EVENT_SOUND_VOLUME.chest_open, 'container');
    },
    // skillExecutor emits one event per timed hit, on the frame GameWorld3D swings.
    playerSkillStrike: (event) => {
      const d = event?.detail || {};
      const key = selectComboFinisherSound({
        weaponPath: d.weaponType === 'ranged' ? 'ranged' : 'melee',
        skillId: d.skillId ?? null, hitIndex: d.hitIndex, soulEcho: !!d.soulEcho, hasSound,
      });
      if (key) play(key, EVENT_SOUND_VOLUME.combo_finisher, 'combo');
    },
    // buffCompat.absorbShield: a hit emptied the player's Aegis/Ascension shield.
    axeShieldBroken: () => { armorBreak('player-shield'); },
    // BossBrain: a boss HP bar ("armor tank") shattered and the boss staggers.
    bossAction: (event) => {
      const d = event?.detail;
      const p = d?.payload;
      if (d?.type !== 'phase_shift' || p?.type !== 'bar_break') return;
      if (!(Number(p.hpBars) > 0)) return; // the final bar is the kill; victory covers it
      if (bossNearby(d.bossId)) armorBreak('boss-armor');
    },
    // updateBossMovement.beginBossDeath, once per boss (world bosses and the quarry dragon).
    bossDeathStarted: (event) => { if (bossNearby(event?.detail?.bossId)) victory('boss'); },
    axeRuntimeEnemyDefeated: (event) => { if (event?.detail?.dungeonBoss) victory('dungeon-boss'); },
    axeDungeonBossDefeated: () => { victory('dungeon-boss'); },
    // DuelSystem shows an authoritative result.
    axeDuelResult: (event) => { if (event?.detail?.won === true) victory('duel'); },
    // questRewards.grantQuestReward: milestone quests unlock an ability or class.
    axeQuestRewardGranted: (event) => {
      if (event?.detail?.reward?.unlock) victory('milestone-quest', EVENT_SOUND_VOLUME.milestone_quest_victory);
    },
    // rogueAttackBridge's charged-bow kill marks the rogue dying itself, so
    // EnemyPlayerSpawner.killRogue (which plays the death for melee kills) never runs.
    rogueBossDefeated: () => { play('enemy_death', 0.7, 'rogue-bow-kill'); },
    // AXEFactionWarStore.resolveAXEFactionWar counts a win for the joined faction.
    axeFactionWarChanged: (event) => {
      const d = event?.detail;
      const wins = d?.player ? Number(d.player.wins ?? 0) : NaN; // older saves may lack the counter
      if (!Number.isFinite(wins)) return;
      const previous = warWins;
      warWins = wins;
      const resolving = d?.cycle?.phase === 'resolution' || d?.cycle?.phase === 'cooldown';
      const joined = !!d?.player?.joinedCycleId && d.player.joinedCycleId === d?.cycle?.cycleId;
      if (previous !== null && wins > previous && resolving && joined) victory('faction-war');
    },
  };

  if (target?.addEventListener) {
    for (const type of GAME_EVENT_SOUND_EVENTS) target.addEventListener(type, handlers[type]);
  }

  return {
    recent: () => recent.slice(),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (target?.removeEventListener) {
        for (const type of GAME_EVENT_SOUND_EVENTS) target.removeEventListener(type, handlers[type]);
      }
    },
  };
}

// Outdoor regions get the calm nature bed. Like the wind bed it pauses during
// battle and resumes at its saved position; dungeons keep their own room tone.
export const OUTDOOR_NATURE_REGIONS = Object.freeze(['wolfveil', 'forest']);
export const OUTDOOR_NATURE_BED = Object.freeze({ volume: 0.035, policy: 'pause', fadeSeconds: 1.6 });

export function setOutdoorNatureBed(soundscape, region) {
  if (!soundscape?.setBed || !OUTDOOR_NATURE_REGIONS.includes(region)) return false;
  soundscape.setBed('ambience_nature', { ...OUTDOOR_NATURE_BED });
  return true;
}
