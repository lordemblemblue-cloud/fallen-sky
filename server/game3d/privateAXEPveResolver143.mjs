// 14.3: re-use the EXACT same shared AXE PvE outcome engine as the game
// and dedicated duel gateway; never create a second damage formula.
import {randomInt} from 'node:crypto';
import {axeStrikeOutcomes,rollAXEStrike,AXE_LEVEL_CAP}
 from '../../base44/shared/axePowerBudget.ts';

const valid=n=>typeof n==='number'&&Number.isFinite(n);
const verifiedSheet=x=>x&&typeof x==='object'&&
 valid(x.damage)&&x.damage>=1&&x.damage<=100000&&
 valid(x.maxHP)&&x.maxHP>=1&&x.maxHP<=100000&&
 valid(x.defense)&&x.defense>=0&&x.defense<=100000&&
 Number.isInteger(x.level)&&x.level>=1&&x.level<=AXE_LEVEL_CAP;
const cryptographicRoll=()=>randomInt(0,2**32)/2**32;

export function createGame3DPrivateAXEPveResolvers143({
 randomRoll=cryptographicRoll,
}={}){
 if(typeof randomRoll!=='function')
  throw Error('14.3 requires private RNG');
 const strike=({attacker,defender,skillMultiplier,isSkill,targetHpPct}={})=>{
  if(!verifiedSheet(attacker)||!verifiedSheet(defender)||
     skillMultiplier!==1||isSkill!==false||
     !valid(targetHpPct)||targetHpPct<0||targetHpPct>1)
   throw Error('14.3 invalid private AXE PvE strike request');
  const roll=randomRoll();
  if(!valid(roll)||roll<0||roll>=1)
   throw Error('14.3 invalid private RNG roll');
  const options=axeStrikeOutcomes(attacker,defender,{
   pvp:false,isSkill:false,skillMultiplier:1,
   targetHpPct,
  });
  const outcome=rollAXEStrike(options,roll);
  if(!outcome||!['miss','avoid','deflect','hit'].includes(outcome.kind)||
     !valid(outcome.damage)||outcome.damage<0||
     outcome.damage>100000||!Number.isInteger(outcome.damage))
   throw Error('14.3 invalid shared AXE result');
  // The 13.6 engine does not yet consume reflect/leech; never pretend to
  // apply those effects or double count them in the main HP ledger.
  return Object.freeze({damage:outcome.damage,
   critical:outcome.critical===true,blocked:outcome.blocked===true,
   reflected:0,lifeSteal:0});
 };
 return Object.freeze({
  resolvePlayerStrike:strike,
  resolveEnemyStrike:strike,
  source:'shared-axe-power-budget-pve',
  reflectedAndLifeStealApplied:false,
  equipmentBonusesAuthorized:false,
  privateServerOnly:true,productionReady:false,
 });
}
