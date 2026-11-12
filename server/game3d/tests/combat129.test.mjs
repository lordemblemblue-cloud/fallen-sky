import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DDuelMatch} from '../authority.mjs';
import {
 assessCombatCharacterReview129,createGame3DCombatCharacterReview129
} from '../combatCharacterReview129.mjs';
import {validateResolvedStrike129} from '../combatResolverGuard129.mjs';
import {inspectMasteredCharge} from '../combatMasteryRules.mjs';

const actor={owner_id:'player1',character_id:'hero1',revision:'3',xp_total:'1200'};
const equipment={revision:'4'};
const mastery=[{owner_id:'player1',character_id:'hero1',
 skill_id:'axe_offensive_skill_5',candidate_revision:'2',
 observed_level:10,max_level:30,
 source_kind:'unverified_preview',server_authorized:false,
 competitive_enabled:false}];
test('12.4-12.6 account-scope observations never authorize mastered damage',()=>{
 const r=assessCombatCharacterReview129({actor,equipment,mastery,
  accountId:'player1',characterId:'hero1'});
 assert.equal(r.ok,true);
 assert.equal(r.skillCandidateCount,1);
 assert.equal(r.observedXP,'1200');
 assert.equal(r.equipmentRevision,'4');
 for(const field of ['trustedLoadoutAuthorized','competitiveMasteryVerified',
  'chargedBonusesEnabled','rankedEligible','rewardsEnabled','productionReady'])
  assert.equal(r[field],false,field);
});
test('12.5 denies malformed duplicated and forged skill candidate observations',()=>{
 for(const override of [
  {observed_level:31},{max_level:12},{server_authorized:true},
  {source_kind:'trusted'},{competitive_enabled:true},
  {owner_id:'enemy'},{candidate_revision:'-1'},
  {skill_id:'not_a_real_duel_skill'},
 ]){
  const r=assessCombatCharacterReview129({actor,equipment,
   mastery:[{...mastery[0],...override}],accountId:'player1',characterId:'hero1'});
  assert.equal(r.ok,false,JSON.stringify(override));
 }
 assert.equal(assessCombatCharacterReview129({actor,equipment,
  mastery:[mastery[0],mastery[0]],
  accountId:'player1',characterId:'hero1'}).ok,false);
 assert.equal(assessCombatCharacterReview129({
  actor:{...actor,owner_id:'enemy'},equipment,mastery,
  accountId:'player1',characterId:'hero1'}).ok,false);
});
function db({scopeOK=true,failAt='',candidateRows=mastery}={}){
 const calls=[];let released=0;
 const pool={connect:async()=>({
  query:async(sql,params)=>{
   calls.push({sql,params});
   if(failAt&&sql.startsWith(failAt))throw Error('PG offline');
   if(sql.startsWith('SELECT owner_id,character_id,revision,xp_total')){
    return {rowCount:1,rows:[{...actor,
     owner_id:scopeOK?'player1':'someoneElse'}]};
   }
   if(sql.startsWith('SELECT revision FROM game3d_character_equipment_revision'))
    return {rowCount:1,rows:[equipment]};
   if(sql.startsWith('SELECT DISTINCT ON (skill_id)'))
    return {rowCount:candidateRows.length,rows:candidateRows};
   return {rowCount:0,rows:[]};
  },
  release:()=>{released++}
 })};
 return {pool,calls,get released(){return released}};
}
const trusted=async()=>({
 authenticated:true,identitySource:'trusted-server-session',accountId:'player1',
});
test('12.6 uses one serializable private transaction and server session identity',async()=>{
 const d=db();
 const inspector=createGame3DCombatCharacterReview129({
  pool:d.pool,resolveAuthenticatedSubject:trusted});
 const r=await inspector.inspect({characterId:'hero1'});
 assert.equal(r.ok,true);
 assert.equal(d.calls[0].sql,'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
 assert.equal(d.calls.at(-1).sql,'COMMIT');
 assert.deepEqual(d.calls.slice(1,4).map(x=>x.params),
  [['player1','hero1'],['player1','hero1'],['player1','hero1']]);
 assert.equal(d.released,1);
 assert.ok(d.calls.every(x=>!/^(INSERT|UPDATE|DELETE)/.test(x.sql)));
 const wrong=db({scopeOK:false});
 const denied=await createGame3DCombatCharacterReview129({
  pool:wrong.pool,resolveAuthenticatedSubject:trusted}).inspect({characterId:'hero1'});
 assert.equal(denied.code,'character_owner_binding_missing');
 assert.equal(wrong.calls.some(x=>x.sql.startsWith('SELECT DISTINCT ON')),false);
});
test('12.6 rejects unauthenticated identities and rolls back failures',async()=>{
 const d=db();
 const inspector=createGame3DCombatCharacterReview129({
  pool:d.pool,resolveAuthenticatedSubject:async()=>null});
 assert.equal((await inspector.inspect({characterId:'hero1'})).ok,false);
 assert.equal((await inspector.inspect({characterId:'__anon__'})).ok,false);
 assert.equal(d.calls.length,0);
 const broken=db({failAt:'SELECT DISTINCT ON'});
 await assert.rejects(createGame3DCombatCharacterReview129({
  pool:broken.pool,resolveAuthenticatedSubject:trusted,
 }).inspect({characterId:'hero1'}),/PG offline/);
 assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
 assert.equal(broken.released,1);
});
test('12.7-12.9 validate pure server strike results with bounded finite values',()=>{
 assert.equal(validateResolvedStrike129({damage:50}).ok,true);
 for(const r of [
  null,[],{damage:-1},{damage:Infinity},{damage:NaN},
  {damage:100001},{damage:5,lifeSteal:-1},
  {damage:5,reflected:Infinity},{damage:5,critical:'yes'},
  {damage:5,blocked:1},
 ])assert.equal(validateResolvedStrike129(r).ok,false);
});
test('12.9 corrupt damage resolver cannot debit resources, HP or advance cast',()=>{
 let tick=1000;const C='player1',O='player2';
 const g=createGame3DDuelMatch({
  id:'test',challengerId:C,opponentId:O,
  challengerStats:{maxHP:100},opponentStats:{maxHP:100},
  now:()=>tick,resolveStrike:()=>({damage:Infinity,critical:'true'}),
 });
 g.setConnected(C,true);g.setConnected(O,true);
 g.setInput(C,{seq:1,x:0,z:0,facing:Math.PI/2});
 g.submit(C,{action:'basic',weaponPath:'damage',
  intentId:'intent_12345678',intentSeq:1});
 const result=g.tick(tick)[0];
 assert.equal(result.reason,'invalid_strike_result');
 assert.equal(g.get(C).stamina,100);
 assert.equal(g.get(O).hp,100);
 assert.equal(g.get(C).lastBasicAt,-Infinity);
});
test('12.4 policy preview permits charged singles but never authorizes damage',()=>{
 const single=inspectMasteredCharge({skillId:'single_hit',rank:10,holdMs:1000});
 assert.equal(single.chargeReady,true);
 assert.equal(single.chargeOnlyFinalTripleHit,false);
 assert.equal(single.mayChainSingleAfterFinalHit,false);
 assert.equal(single.clientCanAuthorizeDamage,false);
 assert.equal(single.serverMasteryAttested,false);
 const triple=inspectMasteredCharge({skillId:'triple_hit',rank:10,holdMs:1000});
 assert.equal(triple.chargeOnlyFinalTripleHit,true);
});
test('12.5 private beta schema prevents granting candidate mastery',()=>{
 const sql=readFileSync(new URL('../sql/026_combat129_mastery_candidates.sql',import.meta.url),'utf8');
 assert.match(sql,/CHECK\(server_authorized = false\)/);
 assert.match(sql,/CHECK\(competitive_enabled = false\)/);
 assert.match(sql,/game3d_combat_mastery_candidate_immutable/);
});
