// Combat 13.9 — FULL private encounter checkpoint store under PostgreSQL lease.
// No public transport, rewards, XP, loot or client-provided state.
import {createHash} from 'node:crypto';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const goodScope=s=>key(s?.instanceId)&&key(s?.instanceEpoch)&&
 key(s?.holderId)&&who(s?.ownerId)&&who(s?.characterId)&&
 hex(s?.mapFingerprint);
const token=x=>{
 const s=typeof x==='string'?x:
  typeof x==='bigint'?String(x):
  Number.isSafeInteger(x)?String(x):'';
 if(!/^[1-9][0-9]*$/.test(s))return null;
 const n=Number(s);
 return Number.isSafeInteger(n)?n:null;
};
const seq=x=>{
 const s=typeof x==='string'?x:
  Number.isSafeInteger(x)?String(x):'';
 if(!/^(0|[1-9][0-9]*)$/.test(s))return null;
 const n=Number(s);
 return Number.isSafeInteger(n)?n:null;
};
const params=s=>[s.instanceId,s.instanceEpoch,s.holderId,
 s.ownerId,s.characterId,s.mapFingerprint];
const canonical=value=>{
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'&&
    (Object.getPrototypeOf(value)===Object.prototype||
     Object.getPrototypeOf(value)===null)){
  const out={};
  for(const k of Object.keys(value).sort()){
   if(k==='__proto__'||k==='constructor'||k==='prototype')throw Error('unsafe checkpoint property');
   out[k]=canonical(value[k]);
  }
  return out;
 }
 throw Error('invalid checkpoint serialization');
};
export function checksumPrivateCheckpoint139(checkpoint){
 const json=JSON.stringify(canonical(checkpoint));
 if(!json||Buffer.byteLength(json,'utf8')>131072)
  throw Error('13.9 checkpoint too large');
 return {json,sha256:createHash('sha256').update(json).digest('hex')};
}
const writeSQL=`
 WITH active AS MATERIALIZED (
  SELECT instance_id FROM game3d_combat_world_instance_lease
  WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
   AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
   AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
  FOR UPDATE
 )
 INSERT INTO game3d_combat_world_recovery_139 AS prior (
  instance_id,instance_epoch,holder_id,owner_id,character_id,
  map_fingerprint,fencing_token,event_seq,checkpoint_json,checkpoint_sha256
 )
 SELECT instance_id,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,$9::jsonb,$10
 FROM active WHERE true
 ON CONFLICT (instance_id) DO UPDATE SET
  instance_epoch=EXCLUDED.instance_epoch,
  holder_id=EXCLUDED.holder_id,
  fencing_token=EXCLUDED.fencing_token,
  event_seq=EXCLUDED.event_seq,
  checkpoint_json=EXCLUDED.checkpoint_json,
  checkpoint_sha256=EXCLUDED.checkpoint_sha256,
  committed_at=clock_timestamp()
 WHERE prior.owner_id=EXCLUDED.owner_id
  AND prior.character_id=EXCLUDED.character_id
  AND prior.map_fingerprint=EXCLUDED.map_fingerprint
  AND (prior.fencing_token<EXCLUDED.fencing_token OR
   (prior.fencing_token=EXCLUDED.fencing_token
    AND prior.instance_epoch=EXCLUDED.instance_epoch
    AND prior.holder_id=EXCLUDED.holder_id
    AND prior.event_seq<=EXCLUDED.event_seq))
 RETURNING instance_id,instance_epoch,fencing_token::text AS fencing_token,
  event_seq::text AS event_seq,checkpoint_sha256`;
const readSQL=`
 WITH active AS MATERIALIZED (
  SELECT instance_id FROM game3d_combat_world_instance_lease
  WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
   AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
   AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
  FOR SHARE
 )
 SELECT r.instance_id,r.instance_epoch,r.holder_id,
  r.owner_id,r.character_id,r.map_fingerprint,
  r.fencing_token::text AS fencing_token,
  r.event_seq::text AS event_seq,
  r.checkpoint_json,r.checkpoint_sha256
 FROM game3d_combat_world_recovery_139 r
 JOIN active ON active.instance_id=r.instance_id`;

export function createGame3DRecoveryStore139({pool,authorizeServerOperation}={}){
 if(typeof pool?.connect!=='function'||typeof authorizeServerOperation!=='function')
  throw Error('13.9 requires private PostgreSQL and trusted server authority');
 const allowed=async(operation,scope)=>{
  if(!goodScope(scope))return false;
  try{return await authorizeServerOperation({operation,scope})===true}
  catch{return false}
 };
 const query=async(sql,args)=>{
  const db=await pool.connect();
  try{return await db.query(sql,args)}
  finally{db.release()}
 };
 const load=async({scope,fencingToken}={})=>{
  if(!token(fencingToken)||!await allowed('recovery_load',scope))
   throw Error('13.9 recovery read denied');
  const out=await query(readSQL,[...params(scope),fencingToken]);
  if(out.rowCount===0)return null;
  if(out.rowCount!==1)throw Error('13.9 ambiguous recovery row');
  const row=out.rows[0],saved=row?.checkpoint_json;
  if(row.instance_id!==scope.instanceId||row.owner_id!==scope.ownerId||
     row.character_id!==scope.characterId||
     row.map_fingerprint!==scope.mapFingerprint||
     !key(row.instance_epoch)||!key(row.holder_id)||
     !token(row.fencing_token)||token(row.fencing_token)>fencingToken||
     seq(row.event_seq)===null||
     !saved||typeof saved!=='object'||Array.isArray(saved)||
     saved.eventSeq!==seq(row.event_seq)||
     saved.instanceId!==scope.instanceId||
     saved.ownerId!==scope.ownerId||
     saved.characterId!==scope.characterId||
     saved.mapFingerprint!==scope.mapFingerprint||
     saved.xpAuthorized!==false||saved.lootAuthorized!==false||
     saved.currencyAuthorized!==false||saved.productionReady!==false)
    throw Error('13.9 invalid recovery identity');
  const hash=checksumPrivateCheckpoint139(saved);
  if(hash.sha256!==row.checkpoint_sha256)
   throw Error('13.9 checkpoint checksum mismatch');
  return saved;
 };
 const persist=async({scope,fencingToken,checkpoint}={})=>{
  if(!token(fencingToken)||!await allowed('recovery_persist',scope))
   return false;
  if(!checkpoint||checkpoint.schemaVersion!==1||
     checkpoint.instanceId!==scope.instanceId||
     checkpoint.ownerId!==scope.ownerId||
     checkpoint.characterId!==scope.characterId||
     checkpoint.mapFingerprint!==scope.mapFingerprint||
     checkpoint.xpAuthorized!==false||checkpoint.lootAuthorized!==false||
     checkpoint.currencyAuthorized!==false||
     checkpoint.productionReady!==false||
     seq(checkpoint.eventSeq)===null)return false;
  const hash=checksumPrivateCheckpoint139(checkpoint);
  const out=await query(writeSQL,[...params(scope),fencingToken,
   checkpoint.eventSeq,hash.json,hash.sha256]);
  const row=out.rows?.[0];
  return out.rowCount===1&&row?.instance_id===scope.instanceId&&
   row?.instance_epoch===scope.instanceEpoch&&
   token(row?.fencing_token)===fencingToken&&
   seq(row?.event_seq)===checkpoint.eventSeq&&
   row?.checkpoint_sha256===hash.sha256;
 };
 return Object.freeze({version:'13.9',load,persist,
  privateServerOnly:true,publicTransportInstalled:false,
  rewardWriterEnabled:false,productionReady:false});
}
