// Prints the before / after damage tables of docs/game3d/SKILL_DAMAGE_CURVE_20261118.md from the real
// skill registry and the real curve code, so the tables can be regenerated after any retuning:
//
//   node tools/game3d-skill-damage-curve/print-damage-table.mjs
//
// before = today's linear growth, scaleStat(skill, 'damage_pct', level)
// after  = the optional curve, scaleSkillDamage with the setting on (sword +40 %, bow +35 %, and
//          guardian skills +30 % with daggers in hand; guardian skills with other weapons = before)
// Numbers are the skill's damage multiplier per hit, as the Skill Book shows it (130.0 % = 1.30).

import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(path.join(tmpdir(), 'axe-skill-table-'));
try {
  const outfile = path.join(temp, 'registry.mjs');
  await build({
    stdin: {
      contents: [
        "export { default as skills, getSkillById, scaleStat, scaleSkillDamage } from './src/components/game3d/skills/skillRegistry.jsx';",
        "export { SKILL_DAMAGE_CURVE_CONFIG } from './src/components/game3d/skills/skillDamageCurve.mjs';",
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, jsx: 'automatic', format: 'esm', platform: 'node', outfile,
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  });
  const { skills, scaleStat, scaleSkillDamage, SKILL_DAMAGE_CURVE_CONFIG } = await import(pathToFileURL(outfile).href);

  const on = { ...SKILL_DAMAGE_CURVE_CONFIG, enabled: true };
  const off = { ...SKILL_DAMAGE_CURVE_CONFIG, enabled: false };
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const delta = (before, after) => {
    const change = (after / before - 1) * 100;
    return `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`;
  };
  const familyName = { sword: 'Sword', ranged: 'Bow', guardian: 'Daggers (guardian)' };
  const capOf = (skill) => `+${on.familyCaps[skill.weapon_type] * 100}%`;
  // today's growth from level 1 to the max level: the per-skill cap that would keep that skill's maximum
  const growthOf = (skill) => `+${((skill.scaling.damage_pct.max / skill.scaling.damage_pct.min - 1) * 100).toFixed(1)}%`;
  const before = (skill, level) => scaleSkillDamage(skill, level, 'dual_blades', off);
  const after = (skill, level) => scaleSkillDamage(skill, level, 'dual_blades', on);
  const cell = (skill, level) => `${pct(before(skill, level))} → ${pct(after(skill, level))}`;

  const damageSkills = skills.filter((s) => Number.isFinite(s.scaling?.damage_pct?.min) && familyName[s.weapon_type]);
  const core = damageSkills.filter((s) => s.max_level === 10);
  const ladder = damageSkills.filter((s) => s.max_level !== 10);
  const byFamily = (list, family) => list.filter((s) => s.weapon_type === family);
  for (const skill of damageSkills) {
    // the printed "before" must be today's number, not a re-derivation
    if (before(skill, 5) !== scaleStat(skill, 'damage_pct', 5)) throw new Error(`before != scaleStat for ${skill.skill_id}`);
  }

  const out = [];
  out.push('Damage multiplier per hit, **before → after**, at skill levels 1, 5 and 10.', '');
  out.push('### Weapon skills (max level 10)', '');
  out.push('| Skill | Weapon | Hits | Cap | Today\'s growth | Level 1 | Level 5 | Level 10 | Δ level 5 | Δ level 10 |');
  out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const family of ['sword', 'ranged', 'guardian']) {
    for (const skill of byFamily(core, family)) {
      out.push(`| ${skill.skill_name} (\`${skill.skill_id}\`) | ${familyName[family]} | ${skill.hit_count} | ${capOf(skill)} | ${growthOf(skill)} `
        + `| ${cell(skill, 1)} | ${cell(skill, 5)} | ${cell(skill, 10)} | ${delta(before(skill, 5), after(skill, 5))} | ${delta(before(skill, 10), after(skill, 10))} |`);
    }
  }
  out.push('', '### Total multiplier of one cast (all hits added up)', '');
  out.push('| Skill | Hits | Cooldown | Level 1 | Level 5 | Level 10 |');
  out.push('|---|---:|---:|---:|---:|---:|');
  for (const family of ['sword', 'ranged', 'guardian']) {
    for (const skill of byFamily(core, family)) {
      const total = (fn, level) => pct(fn(skill, level) * skill.hit_count);
      const castCell = (level) => `${total(before, level)} → ${total(after, level)}`;
      out.push(`| ${skill.skill_name} | ${skill.hit_count} | ${skill.cooldown}s | ${castCell(1)} | ${castCell(5)} | ${castCell(10)} |`);
    }
  }
  out.push('', '### Martial ladder and aerial skills (max level 30)', '');
  out.push('| Skill | Weapon | Hits | Cap | Today\'s growth | Level 1 | Level 5 | Level 10 | Level 30 | Δ level 10 | Δ level 30 |');
  out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const family of ['sword', 'ranged', 'guardian']) {
    for (const skill of byFamily(ladder, family)) {
      const max = skill.max_level;
      out.push(`| ${skill.skill_name} (\`${skill.skill_id}\`) | ${familyName[family]} | ${skill.hit_count} | ${capOf(skill)} | ${growthOf(skill)} `
        + `| ${cell(skill, 1)} | ${cell(skill, 5)} | ${cell(skill, 10)} | ${cell(skill, max)} `
        + `| ${delta(before(skill, 10), after(skill, 10))} | ${delta(before(skill, max), after(skill, max))} |`);
    }
  }
  globalThis.console.log(out.join('\n'));
} finally {
  await rm(temp, { recursive: true, force: true });
}
