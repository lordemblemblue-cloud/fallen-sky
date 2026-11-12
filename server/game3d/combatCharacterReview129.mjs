// Combat 12.4–12.6: authenticated character/equipment/skill *observations*.
// All records read in a single PG snapshot, but skill candidates are not
// server-earned mastery proofs. Never use this to enable ranked bonuses.
import {validateAccountCharacterScope} from './accountScopeGuard.mjs';
import {duelSkillProfile} from '../../base44/shared/duelComboPolicy.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const number=x=>{
 const s=typeof x==='string'?x:typeof x==='bigint'?String(x):
  typeof x==='number'&&Number.isSafeInteger(x)?String(x):null;
 if(!s||!/^(0|[1-9][0-9]*)$/.test(s))return null;
 const n=BigInt(s);return n<=9223372036854775807n?n:null;
};
const deny=code=>({ok:false,code,reviewOnly:true,accountBound:false,
 trustedLoadoutAuthorized:false,competitiveMasteryVerified:false,
 chargedBonusesEnabled:false,rankedEligible:false,
 rewardsEnabled:false,productionReady:false});
export function assessCombatCharacterReview129({actor,equipment,mastery,accountId,characterId}={}){
 if(!id(accountId)||!id(characterId)||!actor||
  actor.owner_id!==accountId||actor.character_id!==characterId||
  number(actor.revision)===null||
  number(actor.xp_total)===null||
  !equipment||number(equipment.revision)===null||
  !Array.isArray(mastery)||mastery.length>64)
  return deny('invalid_character_evidence');
 const seen=new Set(),skills=[];
 for(const row of mastery){
  if(row.owner_id!==accountId||row.character_id!==characterId||
    typeof row.skill_id!=='string'||!duelSkillProfile(row.skill_id)||
    seen.has(row.skill_id)||number(row.candidate_revision)===null||
    number(row.candidate_revision)===0n||
    !Number.isInteger(Number(row.observed_level))||
    ![10,30].includes(Number(row.max_level))||
    Number(row.observed_level)<1||
    Number(row.observed_level)>Number(row.max_level)||
    row.source_kind!=='unverified_preview'||
    row.server_authorized!==false||row.competitive_enabled!==false)
   return deny('untrusted_mastery_candidate');
  seen.add(row.skill_id);
  skills.push({skillId:row.skill_id,
   observedLevel:Number(row.observed_level),
   maxLevel:Number(row.max_level)});
 }
 return {ok:true,version:'12.6',reviewOnly:true,accountBound:true,
  ownerId:accountId,characterId,observedXP:actor.xp_total.toString(),
  characterRevision:actor.revision.toString(),
  equipmentRevision:equipment.revision.toString(),skillCandidates:skills,
  skillCandidateCount:skills.length,sourceConsistencyObserved:true,
  // Inventory/equipment is still original-owner-based. No trusted stat
  // derivation, ownership transfer or server-earned mastery award exists.
  trustedLoadoutAuthorized:false,competitiveMasteryVerified:false,
  chargedBonusesEnabled:false,rankedEligible:false,
  rewardsEnabled:false,productionReady:false};
}
export function createGame3DCombatCharacterReview129({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('12.6 requires private PG and a trusted session resolver');
 const inspect=async({serverRequestContext,characterId}={})=>{
  if(!id(characterId))return deny('invalid_character_id');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||!id(subject.accountId))
   return deny('unverified_character_session');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const actor=await c.query(
    'SELECT owner_id,character_id,revision,xp_total FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   if(actor.rowCount!==1||!validateAccountCharacterScope({
    subject,characterRow:actor.rows[0]}).ok){
    await c.query('COMMIT');return deny('character_owner_binding_missing');
   }
   const equip=await c.query(
    'SELECT revision FROM game3d_character_equipment_revision '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   if(equip.rowCount!==1){
    await c.query('COMMIT');return deny('equipment_revision_missing');
   }
   // Latest candidate per skill, no externally-supplied mastery numbers.
   const records=await c.query(
    'SELECT DISTINCT ON (skill_id) owner_id,character_id,skill_id,'+
    'candidate_revision,observed_level,max_level,source_kind,'+
    'server_authorized,competitive_enabled '+
    'FROM game3d_combat_mastery_candidate '+
    'WHERE owner_id=$1 AND character_id=$2 '+
    'ORDER BY skill_id,candidate_revision DESC LIMIT 65',
    [subject.accountId,characterId]);
   const result=assessCombatCharacterReview129({
    actor:actor.rows[0],equipment:equip.rows[0],mastery:records.rows,
    accountId:subject.accountId,characterId,
   });
   await c.query('COMMIT');
   return result;
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,rankedEnabled:false});
}
