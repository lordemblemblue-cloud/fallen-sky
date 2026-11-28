// R158: private preview only, no database or live gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AXE_LEVEL_CAP,getAXEParHero,getAXEEnemyStats,axeStrikeOutcomes,rollAXEStrike} from '../../../base44/shared/axePowerBudget.ts';
import {MAX_CHARACTER_LEVEL,deriveCharacterLevel,xpForNextLevel} from '../progressionLevelPolicy.mjs';
import {deriveGame3DBaseStats} from '../combatStatsPreview.mjs';
import {createGame3DPrivateAXEPveResolvers143} from '../privateAXEPveResolver143.mjs';
const toLevel = level => Array.from({length:level-1},(_,i)=>100n+25n*BigInt(i)).reduce((a,b)=>a+b,0n);
test('private progression shares the cap and preserves every original XP boundary',()=>{
 assert.equal(MAX_CHARACTER_LEVEL,AXE_LEVEL_CAP);assert.equal(AXE_LEVEL_CAP,155);
 for(let l=1;l<=155;l++){
  const x=deriveCharacterLevel(toLevel(l));assert.equal(x.level,l);assert.equal(x.xpIntoLevel,'0');
  assert.equal(x.capped,l===155);assert.equal(x.combatStatsCertified,false);assert.equal(x.rankedEligible,false);
  if(l<155){assert.equal(xpForNextLevel(l),100n+25n*BigInt(l-1));assert.equal(deriveCharacterLevel(toLevel(l+1)-1n).level,l);}
 }
 assert.equal(deriveCharacterLevel(toLevel(155)+10000n).level,155);
 assert.throws(()=>xpForNextLevel(155));assert.throws(()=>xpForNextLevel(156));
 assert.throws(()=>deriveCharacterLevel('9223372036854775808'));
});
test('private stats preserve old growth and refuse invalid levels',()=>{
 for(let l=1;l<=155;l++){
  const x=deriveGame3DBaseStats(l),g=l-1;
  assert.deepEqual(x.stats,{maxHP:100+12*g,strength:10+2*g,spirit:10+2*g,defense:8+g,dexterity:10+g,critResistance:5+Math.floor(g/2),dodge:5+Math.floor(g/3),attackSpeed:100+Math.floor(g/5)});
  assert.equal(x.competitiveApproved,false);assert.equal(x.rankedLoadoutAuthorized,false);assert.equal(x.equipmentBonusesIncluded,false);
 }
 for(const l of [0,156,1.5,'155',NaN,Infinity])assert.throws(()=>deriveGame3DBaseStats(l));
});
test('private PvE outcomes at 100, 101 and 155 match the shared formula in both directions',()=>{
 for(const level of [100,101,155]){
  const hero=getAXEParHero(level),enemy=getAXEEnemyStats(level,'normal');
  for(const roll of [0,.5,.99]){
   const resolver=createGame3DPrivateAXEPveResolvers143({randomRoll:()=>roll});
   for(const [a,d,method] of [[hero,enemy,'resolvePlayerStrike'],[enemy,hero,'resolveEnemyStrike']]){
    const expected=rollAXEStrike(axeStrikeOutcomes(a,d,{pvp:false,isSkill:false,skillMultiplier:1,targetHpPct:1}),roll);
    const actual=resolver[method]({attacker:a,defender:d,skillMultiplier:1,isSkill:false,targetHpPct:1});
    assert.equal(actual.damage,expected.damage);assert.equal(actual.reflected,0);assert.equal(actual.lifeSteal,0);
   }
   assert.equal(resolver.productionReady,false);assert.equal(resolver.privateServerOnly,true);assert.equal(resolver.equipmentBonusesAuthorized,false);
  }
 }
});
test('private resolver rejects invalid level on either side before rolling',()=>{
 let rolls=0;const r=createGame3DPrivateAXEPveResolvers143({randomRoll:()=>{rolls++;return .5;}});
 const hero=getAXEParHero(155),enemy=getAXEEnemyStats(155,'normal');
 for(const l of [0,156,1.5,'155',Infinity]){
  const call=(attacker,defender)=>r.resolvePlayerStrike({attacker,defender,skillMultiplier:1,isSkill:false,targetHpPct:1});
  assert.throws(()=>call({...hero,level:l},enemy),/invalid private/);
  assert.throws(()=>call(hero,{...enemy,level:l}),/invalid private/);
 }
 assert.equal(rolls,0);
});
