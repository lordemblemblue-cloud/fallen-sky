// Game 3D Character panel: predictable base-attribute preview with no equipment.
// The caller supplies the exact combat stat formula (computeDerivedStats) and
// the migrated, COMMITTED character baseStats. No gear, class buffs or bonuses
// are ever passed to the formula: previewing points cannot grant them.
export const ATTRIBUTE_GROWTH_METRICS = Object.freeze([
  ['Maximum HP','maxHP'], ['Chi / Will','chi'], ['Damage','damage'],
  ['Defense','defense'], ['Attack success','attackSuccess'],
  ['Attack block','attackBlock'], ['HP regeneration','hpRegen'],
  ['Chi regeneration','manaRegen'], ['Critical chance','critChance','%'],
  ['Critical defense','criticalDefense'], ['Evasion','evasionPct','%'],
  ['Attack speed','attackSpeedPct','%'], ['Skill power','skillPowerPct','%'],
  ['Spell damage','spellDamagePct','%'], ['Damage roll','damageRollBonus'],
]);
const KEYS = new Set(['constitution','dexterity','strength','focus']);
const amount = n => Number(n) || 0;
export function formatAttributeGrowth(value, unit='') {
  const n = amount(value);
  const digits = Number.isInteger(n) ? 0 : Math.abs(n)<.01 ? 4 : 2;
  return (n>=0?'+':'')+n.toLocaleString('en-US',{maximumFractionDigits:digits})+unit;
}
export function getBaseAttributeGrowthPreview(baseStats, statKey, pendingPoints, derive) {
  if (!KEYS.has(statKey)) throw new Error('Unknown base attribute');
  if (typeof derive!=='function') throw new Error('Missing derived stat formula');
  const base={...baseStats};
  const count=Math.max(0,Math.floor(amount(pendingPoints)));
  const starting=amount(base[statKey]);
  // Explicit [] means no items; omit attribute and flat bonuses entirely.
  const before=derive(base,[]);
  const one=derive({...base,[statKey]:starting+1},[]);
  const staged=derive({...base,[statKey]:starting+count},[]);
  return ATTRIBUTE_GROWTH_METRICS.map(([label,key,unit])=>({
    label,key,unit,
    one:amount(one[key])-amount(before[key]),
    planned:amount(staged[key])-amount(before[key]),
  })).filter(metric=>Math.abs(metric.one)>1e-7 || Math.abs(metric.planned)>1e-7);
}
