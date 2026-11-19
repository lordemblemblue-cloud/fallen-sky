// Hero level cap 100 -> 155 (owner, 2026-11-19). docs/game3d/LEVEL_CAP_155_20261119.md
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXE_LEVEL_CAP, AXE_PAR_HERO_TABLE, AXE_BUILD_CAPS, AXE_COMBAT_RULES, AXE_DUEL_STAT_LIMITS,
  getAXEParHero, getAXEEnemyStats, clampAXEDuelStats,
} from '../base44/shared/axePowerBudget.ts';
import { XP_TABLE, xpForLevel, totalXPToReach, bankXPAboveCapRaise } from '../src/components/game3d/progression/heroLevelCurve.mjs';
import { checkCharacterSave } from '../base44/shared/characterSaveRules.ts';
import { weaponSkillPointsEarned, WEAPON_SKILL_CAP } from '../base44/shared/weaponSkillPoints.mjs';
import { deriveCharacterLevel, MAX_CHARACTER_LEVEL } from '../server/game3d/progressionLevelPolicy.mjs';
import { deriveGame3DBaseStats } from '../server/game3d/combatStatsPreview.mjs';
import { createGame3DPrivateAXEPveResolvers143 } from '../server/game3d/privateAXEPveResolver143.mjs';

// main (e9c62fc) before the raise: the measured par rows, and enemies as getAXEEnemyStats made them
const MEASURED_ROWS = [
  [1, 38, 182, 19.9, 5.1, 10, 6.4, 0, 0, 0, 0.009, 0, 0, 0, 0, 0],
  [5, 142, 505, 63.4, 25.3, 31.8, 9.2, 14, 13, 0.074, 0.05, 0, 0, 0, 0, 0],
  [10, 233, 756, 90.3, 45.1, 56, 10.6, 32, 28, 0.106, 0.076, 0, 0.5, 0, 0, 0],
  [15, 347, 1063, 123.7, 68.4, 85.9, 12.3, 49, 44, 0.138, 0.108, 0, 1.1, 0, 0, 0],
  [20, 478, 1496, 158.4, 90.2, 114.9, 15, 66, 59, 0.171, 0.134, 0, 1.6, 0, 0, 0],
  [25, 605, 1936, 220.2, 113.7, 145.4, 16.9, 86, 75, 0.211, 0.189, 0, 2.1, 0, 0, 0],
  [30, 714, 2234, 255.2, 134.5, 172.8, 18.4, 102.5, 91.5, 0.246, 0.22, 0, 2.6, 0, 0, 0],
  [40, 1011, 3228, 365.3, 180.3, 237.3, 20.9, 136.5, 122.5, 0.314, 0.307, 3.7, 3.7, 0, 0, 0],
  [50, 1317, 4136, 466.1, 225.1, 300.3, 24.4, 175.5, 154.5, 0.394, 0.377, 4.7, 4.7, 0, 0, 0],
  [60, 1688, 5186, 589.8, 273.3, 377.4, 28.1, 205.5, 184.5, 0.465, 0.458, 5.8, 5.8, 0, 0, 0],
  [70, 2156, 6787, 820.8, 320.7, 458.1, 33.2, 244.5, 216.5, 0.539, 0.555, 6.8, 6.8, 0, 0, 0],
  [80, 2575, 8096, 976, 368.7, 541.6, 37.3, 276, 248, 0.627, 0.6, 7.9, 7.9, 0, 0, 0],
  [90, 3346, 10397, 1247.6, 413.6, 647.6, 41.6, 315, 280, 0.749, 0.6, 8.9, 8.9, 0, 0, 0],
  [100, 4126.6, 13321, 1563.5, 491.2, 792.8, 44.8, 345, 340, 0.811, 0.6, 10, 10, 0, 0, 0],
];
// level/tier: [maxHP, damage, defense, attackSuccess]
const MAIN_ENEMIES = {
  '1/normal': [107, 26, 11.94, 4.59], '1/elite': [498, 38, 14.925, 4.59], '1/worldBoss': [10427, 82, 21.492, 4.59],
  '7/normal': [672, 74, 44.496, 29.898], '7/elite': [3160, 111, 55.62, 29.898], '7/worldBoss': [67230, 236, 80.093, 29.898],
  '25/normal': [2572, 239, 132.12, 102.33], '25/elite': [12112, 359, 165.15, 102.33], '25/worldBoss': [258414, 765, 237.816, 102.33],
  '50/normal': [6367, 522, 279.66, 202.59], '50/elite': [30019, 784, 349.575, 202.59], '50/worldBoss': [641910, 1671, 503.388, 202.59],
  '75/normal': [13202, 975, 539.04, 310.23], '75/elite': [62235, 1462, 673.8, 310.23], '75/worldBoss': [1329857, 3119, 970.272, 310.23],
  '99/normal': [25717, 1767, 919.146, 435.096], '99/elite': [121202, 2651, 1148.933, 435.096], '99/worldBoss': [2587259, 5655, 1654.463, 435.096],
  '100/normal': [26338, 1808, 938.1, 442.08], '100/elite': [124132, 2713, 1172.625, 442.08], '100/worldBoss': [2649747, 5787, 1688.58, 442.08],
};
const r3 = (v) => Math.round(v * 1000) / 1000;

test('the cap is 155 and the par table now runs to it', () => {
  assert.equal(AXE_LEVEL_CAP, 155);
  assert.equal(AXE_PAR_HERO_TABLE.at(-1)[0], 155);
  assert.deepEqual(AXE_PAR_HERO_TABLE.map((r) => r[0]).filter((l) => l > 100), [110, 120, 130, 140, 150, 155]);
});

test('levels 1-100 are untouched: the measured rows, the par hero and every enemy', () => {
  assert.deepEqual(AXE_PAR_HERO_TABLE.filter((r) => r[0] <= 100).map((r) => [...r]), MEASURED_ROWS);
  for (const [key, expected] of Object.entries(MAIN_ENEMIES)) {
    const [level, tier] = key.split('/');
    const e = getAXEEnemyStats(Number(level), tier);
    assert.deepEqual([e.maxHP, e.damage, r3(e.defense), r3(e.attackSuccess)], expected, key);
  }
  // the par hero between measured rows still interpolates the same rows
  const at95 = getAXEParHero(95);
  assert.equal(at95.damage, (3346 + 4126.6) / 2);
  assert.equal(getAXEParHero(100).maxHP, 13321);
});

test('rows above 100 carry on the levels 80-100 slope, stopped at the build caps', () => {
  const r80 = MEASURED_ROWS.at(-3), r100 = MEASURED_ROWS.at(-1);
  const caps = { 6: AXE_COMBAT_RULES.critChanceCapPct, 9: AXE_BUILD_CAPS.critDamage, 10: AXE_BUILD_CAPS.criticalDefense,
    11: AXE_BUILD_CAPS.armorPenPct, 12: AXE_BUILD_CAPS.hitBonusPct, 13: AXE_BUILD_CAPS.avoidPct, 14: AXE_BUILD_CAPS.blockPct,
    15: AXE_BUILD_CAPS.damageReductionPct };
  let previous = r100;
  for (const row of AXE_PAR_HERO_TABLE.filter((r) => r[0] > 100)) {
    for (let j = 1; j < row.length; j++) {
      let expected = r100[j] + ((r100[j] - r80[j]) / 20) * (row[0] - 100);
      if (caps[j] != null) expected = Math.min(caps[j], expected);
      assert.ok(Math.abs(row[j] - expected) <= 0.51, `level ${row[0]} column ${j}: ${row[j]} vs ${expected}`);
      assert.ok(row[j] >= previous[j], `level ${row[0]} column ${j} never falls`);
      if (caps[j] != null) assert.ok(row[j] <= caps[j], `level ${row[0]} column ${j} within its cap`);
    }
    previous = row;
  }
  // crit chance meets its cap a little after 110, crit damage near 120
  assert.equal(getAXEParHero(120).critChance, 50);
  assert.equal(getAXEParHero(130).criticalDamage, 1);
});

test('enemies keep growing past 100 instead of stopping at the level-100 enemy', () => {
  const at = (level, tier = 'normal') => getAXEEnemyStats(level, tier);
  assert.equal(at(155).level, 155);
  assert.equal(at(999).level, 155);
  for (const [lo, hi] of [[100, 120], [120, 140], [140, 155]]) {
    assert.ok(at(hi).maxHP > at(lo).maxHP && at(hi).damage > at(lo).damage && at(hi).defense > at(lo).defense, `${lo} -> ${hi}`);
  }
  assert.ok(getAXEParHero(155).damage < getAXEParHero(100).damage * 2.1, 'straight line, not compounding');
});

test('duel limits come from the level-155 par hero', () => {
  const top = AXE_PAR_HERO_TABLE.at(-1);
  assert.equal(AXE_DUEL_STAT_LIMITS.level, 155);
  assert.equal(AXE_DUEL_STAT_LIMITS.damage, top[1] * 1.5);
  assert.equal(AXE_DUEL_STAT_LIMITS.maxHP, top[2] * 1.5);
  const s = clampAXEDuelStats({ level: 999, damage: 1e9, maxHP: 1e9 });
  assert.equal(s.level, 155);
  assert.equal(s.damage, top[1] * 1.5);
  assert.equal(clampAXEDuelStats({ level: 120 }).level, 120);
});

test('XP curve: the same 160 per level from 10 on, until the cap at 155', () => {
  assert.deepEqual(XP_TABLE, [5, 7, 14, 22, 35, 50, 70, 95, 125, 160]);
  for (let level = 10; level < 155; level++) assert.equal(xpForLevel(level), 160, `level ${level}`);
  assert.equal(xpForLevel(99), 160);
  assert.equal(xpForLevel(100), 160);
  assert.equal(xpForLevel(155), Infinity);
  assert.equal(xpForLevel(200), Infinity);
  assert.equal(totalXPToReach(10), 423);
  assert.equal(totalXPToReach(100), 14823);
  assert.equal(totalXPToReach(120), 18023);
  assert.equal(totalXPToReach(140), 21223);
  assert.equal(totalXPToReach(155), 23623);
});

// the world's level-up loop (GameWorld3D, EnemyPlayerSpawner, ...)
const gain = (level, xp, amount) => {
  let x = xp + amount, lv = level, need = xpForLevel(lv);
  while (x >= need) { x -= need; lv += 1; need = xpForLevel(lv); }
  return { level: lv, xp: x };
};

test('a hero saved at the old cap keeps their level and XP; nothing jumps on the next kill', () => {
  // at the old cap xpForLevel(100) was Infinity: XP piled up and xpForNext was saved as null
  const oldSave = { level: 100, xp: 5000, xpForNext: null };
  const loaded = bankXPAboveCapRaise(oldSave);
  assert.deepEqual(loaded, { xp: 159, xpBankedAtOldCap: 4841 });
  assert.equal(loaded.xp + loaded.xpBankedAtOldCap, 5000, 'no XP lost');
  assert.deepEqual(gain(100, loaded.xp, 10), { level: 101, xp: 9 }, 'one level, like any other kill');
  assert.equal(gain(100, oldSave.xp, 10).level, 131, 'without the bank the same kill would give 31 levels');
  // little XP at the cap: nothing to bank
  assert.deepEqual(bankXPAboveCapRaise({ level: 100, xp: 30, xpForNext: null }), { xp: 30, xpBankedAtOldCap: 0 });
  // once saved under the new cap (xpForNext 160) it comes back unchanged, bank and all
  const resaved = { level: 100, xp: 159, xpForNext: 160, xpBankedAtOldCap: 4841 };
  assert.deepEqual(bankXPAboveCapRaise(resaved), { xp: 159, xpBankedAtOldCap: 4841 });
  // the same old save loaded twice (the Vault's copy arriving later) banks the same amount
  assert.deepEqual(bankXPAboveCapRaise(oldSave), loaded);
});

test('saves below the cap and at the new cap come back unchanged', () => {
  for (const save of [
    { level: 1, xp: 0, xpForNext: 5 },
    { level: 50, xp: 100, xpForNext: 160 },
    { level: 99, xp: 159, xpForNext: 160 },
    { level: 155, xp: 99999, xpForNext: null }, // at the new cap: XP piles up as before
    {},
  ]) {
    assert.deepEqual(bankXPAboveCapRaise(save), { xp: save.xp || 0, xpBankedAtOldCap: 0 }, JSON.stringify(save));
  }
  assert.deepEqual(gain(154, 0, 160), { level: 155, xp: 0 });
  assert.deepEqual(gain(155, 0, 5000), { level: 155, xp: 5000 });
});

const heroSave = (hero) => ({ wwm_player_progression_v1: JSON.stringify({ xp: 0, unspentPoints: 0, ...hero }) });
const attrs = (total) => ({ strength: total, dexterity: 0, constitution: 0, focus: 0 });

test('the Character Vault accepts levels to 155 and the attribute points they earn', () => {
  assert.equal(checkCharacterSave(heroSave({ level: 155, baseStats: attrs(624) })).ok, true);
  assert.deepEqual(checkCharacterSave(heroSave({ level: 156, baseStats: attrs(0) })).errors, ['level 156 is outside 1–155']);
  assert.match(checkCharacterSave(heroSave({ level: 155, baseStats: attrs(625) })).errors[0], /625 attribute points at level 155 \(at most 624\)/);
  assert.equal(checkCharacterSave(heroSave({ level: 100, baseStats: attrs(0), xpBankedAtOldCap: 4841 })).ok, true);
  assert.deepEqual(checkCharacterSave(heroSave({ level: 100, baseStats: attrs(0), xpBankedAtOldCap: -1 })).errors, ['banked xp must be a number of 0 or more']);
});

test('weapon skill points still stop at level 100 (owner question)', () => {
  assert.equal(WEAPON_SKILL_CAP, 100);
  assert.equal(weaponSkillPointsEarned(100), 502);
  assert.equal(weaponSkillPointsEarned(155), 502);
});

test('the private server previews follow the same cap', () => {
  assert.equal(MAX_CHARACTER_LEVEL, 155);
  assert.equal(deriveCharacterLevel('100000000').level, 155);
  assert.equal(deriveCharacterLevel('100000000').capped, true);
  assert.equal(deriveGame3DBaseStats(155).level, 155);
  assert.throws(() => deriveGame3DBaseStats(156));
  const sheet = (level) => ({ ...getAXEParHero(level), level });
  const resolver = createGame3DPrivateAXEPveResolvers143({ randomRoll: () => 0.5 });
  const hit = resolver.resolvePlayerStrike({ attacker: sheet(155), defender: { ...getAXEEnemyStats(155), level: 155 }, skillMultiplier: 1, isSkill: false, targetHpPct: 1 });
  assert.ok(hit.damage >= 0);
});
