// Combat 10.7 — versioned, SERVER-LEVEL base stats preview.
// No ranked/ELO/stat award use. Equipment affixes require their own ledger.
import {AXE_LEVEL_CAP} from '../../base44/shared/axePowerBudget.ts';
export const COMBAT_BASE_STATS_VERSION='game3d-pve-preview-v1';
export function deriveGame3DBaseStats(level){
 if(!Number.isSafeInteger(level)||level<1||level>AXE_LEVEL_CAP)
  throw Error('Invalid trusted character level');
 const growth=level-1;
 const stats={
  maxHP:100+12*growth,
  strength:10+2*growth,
  spirit:10+2*growth,
  defense:8+growth,
  dexterity:10+growth,
  critResistance:5+Math.floor(growth/2),
  dodge:5+Math.floor(growth/3),
  attackSpeed:100+Math.floor(growth/5),
 };
 return {version:COMBAT_BASE_STATS_VERSION,level,stats,
  equipmentBonusesIncluded:false,
  competitiveApproved:false,rankedLoadoutAuthorized:false};
}
