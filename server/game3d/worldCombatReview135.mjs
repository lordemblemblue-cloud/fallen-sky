// Combat 13.3–13.5: authenticated review of source-only candidate kills.
// This is NOT world PvE authority. A hash-consistent engine outcome and
// positions from candidate tables cannot certify physical simulation.
import {engineOutcomeBody,engineOutcomeDigest} from './engineOutcomeStore.mjs';
import {validateAccountCharacterScope} from './accountScopeGuard.mjs';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const denied=code=>({ok:false,code,version:'13.5',reviewOnly:true,
 engineOutcomeDigestConsistent:false,worldGeometryVerified:false,
 authoritativePvEEnabled:false,combatAuthorized:false,
 xpAuthorized:false,lootAuthorized:false,rankedEligible:false,
 productionReady:false});

export function assessGame3DWorldCombatCandidate135({
 candidate,outcome,ownerId,characterId,instanceId,eventId
}={}){
 if(!who(ownerId)||!who(characterId)||!id(instanceId)||!id(eventId)||
    !candidate||!outcome||
    candidate.owner_id!==ownerId||candidate.character_id!==characterId||
    candidate.instance_id!==instanceId||candidate.event_id!==eventId||
    candidate.record_kind!=='unverified_world_combat'||
    candidate.combat_authorized!==false||
    candidate.reward_authorized!==false||
    !id(candidate.enemy_id))
  return denied('invalid_or_unsafe_world_combat_candidate');
 let body;
 try{
  const tick=Number(outcome.server_tick);
  if(!Number.isSafeInteger(tick)||tick<0)throw Error('invalid tick');
  body=engineOutcomeBody({
   eventId:outcome.event_id,instanceId:outcome.instance_id,
   ownerId:outcome.owner_id,characterId:outcome.character_id,
   type:outcome.event_type,serverTick:tick,
   tier:outcome.tier,location:outcome.location,
  },outcome.evidence_digest);
 }catch{return denied('invalid_committed_engine_outcome')}
 if(body.eventId!==eventId||body.instanceId!==instanceId||
    body.ownerId!==ownerId||body.characterId!==characterId||
    body.type!=='enemy_killed'||
    candidate.server_tick==null||
    String(candidate.server_tick)!==String(body.serverTick)||
    engineOutcomeDigest(body)!==outcome.outcome_digest)
  return denied('world_combat_outcome_provenance_mismatch');
 const kind=candidate.strike_kind,path=candidate.weapon_path;
 const paths={damage:3,defense:3,ranged:7};
 const count=Number(candidate.target_count),hits=Number(candidate.hit_count);
 const before=Number(candidate.observed_enemy_hp_before);
 const after=Number(candidate.observed_enemy_hp_after);
 const damage=Number(candidate.observed_damage);
 const validCount=Number.isSafeInteger(count)&&count>=1&&count<=12&&
    (kind==='aoe'||count===1);
 const validHits=Number.isSafeInteger(hits)&&hits>=1&&hits<=3&&
    (kind==='triple'?hits===3:hits===1);
 if(!['single','triple','aoe'].includes(kind)||
    !Object.hasOwn(paths,path)||!validCount||!validHits||
    !Number.isSafeInteger(before)||before<1||before>100000||
    after!==0||!Number.isSafeInteger(damage)||damage<before||
    damage>100000)
  return denied('invalid_world_combat_damage_or_target_count');
 const x=candidate.player_x,z=candidate.player_z,
   ex=candidate.enemy_x,ez=candidate.enemy_z,
   yaw=candidate.player_facing;
 // A null or string input must never be coerced into a valid world position.
 // PostgreSQL row_to_json represents float8 columns as JSON numbers.
 if(![x,z,ex,ez,yaw].every(finite)||[x,z,ex,ez].some(n=>Math.abs(n)>100000)||
    Math.abs(yaw)>2*Math.PI)
  return denied('invalid_world_combat_pose');
 const dx=ex-x,dz=ez-z,d=Math.hypot(dx,dz);
 const range=kind==='aoe'?12:paths[path];
 if(!finite(d)||d>range+0.75)
  return denied('world_combat_candidate_out_of_range');
 const dot=d<0.05?1:(dx*Math.sin(yaw)+dz*Math.cos(yaw))/d;
 if(dot<Math.cos(75*Math.PI/180))
  return denied('world_combat_candidate_facing_mismatch');
 return {ok:true,version:'13.5',reviewOnly:true,
  eventId,instanceId,ownerId,characterId,
  candidateStrikeKind:kind,observedEnemyId:candidate.enemy_id,
  engineOutcomeDigestConsistent:true,
  previewDistance:d,previewTargetCount:count,
  // All positions and damage remain candidate data without a real engine
  // attester and physical collision/AI ownership. DO NOT credit a kill.
  worldGeometryVerified:false,authoritativePvEEnabled:false,
  combatAuthorized:false,xpAuthorized:false,lootAuthorized:false,
  rankedEligible:false,productionReady:false};
}

export function createGame3DWorldCombatReviewer135({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('13.5 needs private PostgreSQL and server authentication');
 const inspect=async({serverRequestContext,characterId,instanceId,eventId}={})=>{
  if(!who(characterId)||!id(instanceId)||!id(eventId))
   return denied('invalid_world_combat_review_scope');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||!who(subject.accountId))
   return denied('unauthenticated_world_combat_review');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const owner=await c.query(
    'SELECT owner_id,character_id,revision FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   const auth=owner.rowCount===1?
    validateAccountCharacterScope({subject,characterRow:owner.rows[0]}):
    {ok:false};
   if(!auth.ok||auth.characterId!==characterId){
    await c.query('COMMIT');
    return denied('world_combat_account_scope_denied');
   }
   const records=await c.query(
    'SELECT row_to_json(w) AS candidate,row_to_json(o) AS outcome '+
    'FROM game3d_combat_world_kill_candidate w '+
    'LEFT JOIN game3d_engine_outcome o ON o.event_id=w.event_id '+
    'AND o.owner_id=w.owner_id AND o.character_id=w.character_id '+
    'AND o.instance_id=w.instance_id '+
    'WHERE w.event_id=$1 AND w.instance_id=$2 '+
    'AND w.owner_id=$3 AND w.character_id=$4',
    [eventId,instanceId,subject.accountId,characterId]);
   const result=records.rowCount===1?
    assessGame3DWorldCombatCandidate135({
     ...records.rows[0],ownerId:subject.accountId,
     characterId,instanceId,eventId,
    }):denied('world_combat_candidate_not_found_or_ambiguous');
   await c.query('COMMIT');
   return result;
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,combatWritesEnabled:false});
}
