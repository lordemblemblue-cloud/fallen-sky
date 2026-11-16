// Independent equipment perks; PvE strike authority reads these AFTER a hit
// resolves, not as free skill-tree point purchases. PvP requires matching
// authoritative duel worker changes before this bonus may apply there.
const FAMILIES=Object.freeze(['single','three_hit','aoe','aerial']);
export function makeAXEFarmingItemPerks({slot='chest',rarity='rare'}={}){
  const grade=String(rarity||'').toLowerCase();
  if(slot==='weapon'){
    const strength={rare:12,elite:16,legendary:20}[grade];
    if(!strength)return null;
    return Object.freeze({type:'offensive_skill_pct',
      families:grade==='rare'?['single','three_hit','aerial']:FAMILIES,
      basePct:strength,ascendedSkillLevels:4,maxTotalPct:36});
  }
  if(!['helm','chest','gloves','legs','boots','cape'].includes(slot))return null;
  const defensePct={rare:3,elite:5,legendary:7}[grade];
  return defensePct?Object.freeze({type:'armor_defense_pct',basePct:defensePct,
    ascendedBonusPct:grade==='rare'?3:grade==='elite'?4:5}):null;
}
export function getAXEWeaponSkillPerkBonus(item,rank=0,{family='single',aerial=false}={}){
  const perk=item?.abilityPerks;
  if(!perk||perk.type!=='offensive_skill_pct')return 0;
  const slot=String(item.slot||item.category||'');
  if(slot!=='weapon')return 0;
  const f=aerial?'aerial':String(family);
  if(!perk.families?.includes(f))return 0;
  const capped=Math.max(0,Math.min(4,Math.floor(Number(rank)||0)));
  // Per-skill virtual levels come only after genuine Stage IV; all prior
  // stages are paid back through the normal Ascension item/stat imprint.
  const extra=capped>=4?Math.max(0,Math.min(4,Number(perk.ascendedSkillLevels)||0))*3:0;
  return Math.min(36,Math.max(0,Number(perk.basePct)||0)+extra);
}
