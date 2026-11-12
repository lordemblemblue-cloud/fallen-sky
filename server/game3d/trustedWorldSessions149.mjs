// Combat Foundation 14.9 — private, instance-bound, privileged bearer lifecycle.
// This is an in-process trusted-server API, NOT a login or HTTP token endpoint.
// The original 14.1 lookup remains backward compatible; strict 14.9 readers
// refuse unbound legacy tokens and stale/untrusted world or character revisions.
import {randomBytes} from 'node:crypto';
import {digestPrivateWorldBearer141} from './trustedWorldSession141.mjs';
import {createGame3DPrivateWorldBootstrap143} from './privateWorldBootstrap143.mjs';

const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const INSTANCE=/^[A-Za-z0-9_.:-]{8,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const validWho=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__'].includes(x);
const validWorld=x=>typeof x==='string'&&INSTANCE.test(x);
const validScope=s=>s&&validWho(s.ownerId)&&validWho(s.characterId)&&
 validWorld(s.instanceId);
const fail=x=>{throw Error('14.9 '+x)};
const flags=Object.freeze({
 privateServerOnly:true,publicHTTPInstalled:false,
 productionReady:false,rewardWriterEnabled:false,
 lootWriterEnabled:false,marketWalletEnabled:false,
});
const subject=scope=>Object.freeze({
 authenticated:true,identitySource:'trusted-server-session',
 accountId:scope.ownerId,characterId:scope.characterId,
});
async function approved(callback,operation,scope){
 try{return await callback(Object.freeze({operation,
  ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId}))===true}
 catch{return false}
}

// Issuer must only be instantiated by the trusted authentication/operator
// service. It does not authenticate passwords, expose a browser route, or
// accept claimed client identity as proof of authorization.
export function createGame3DPrivateSessionAuthority149({
 pool,authorizeTrustedSession,
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeTrustedSession!=='function')
  fail('requires_server_issuer_and_postgresql');
 const issue=async({ownerId,characterId,instanceId,ttlSeconds=300}={})=>{
  const scope={ownerId,characterId,instanceId};
  if(!validScope(scope)||!Number.isInteger(ttlSeconds)||
     ttlSeconds<30||ttlSeconds>900)
   fail('invalid_issue_scope');
  if(!await approved(authorizeTrustedSession,
     'issue_private_world_session',scope))
   fail('issue_not_authorized');
  // 256 bits of OS randomness; plaintext exists only for this one return.
  const bearer=randomBytes(32).toString('base64url');
  const tokenSha256=digestPrivateWorldBearer141(bearer);
  if(!tokenSha256)fail('invalid_entropy_source');
  const client=await pool.connect();
  let started=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   started=true;
   // Lock the trusted character row to serialize session replacement.
   // The immutable seed must match the exact committed character revision.
   const seed=await client.query(
    'SELECT s.instance_id FROM game3d_private_world_seed_142 s '+
    'JOIN game3d_trusted_character c ON '+
    'c.owner_id=s.owner_id AND c.character_id=s.character_id '+
    'WHERE s.instance_id=$1 AND s.owner_id=$2 AND s.character_id=$3 '+
    'AND s.sealed=true AND s.character_revision IS NOT NULL '+
    'AND s.character_revision=c.revision FOR UPDATE OF c',
    [instanceId,ownerId,characterId]);
   if(seed.rowCount!==1)fail('sealed_world_or_character_unavailable');
   // Database-side revocation and new issuance share one serializable commit.
   await client.query(
    'UPDATE game3d_private_world_session_141 SET '+
    'revoked_at=clock_timestamp() WHERE owner_id=$1 AND character_id=$2 '+
    'AND world_instance_id=$3 AND revoked_at IS NULL',
    [ownerId,characterId,instanceId]);
   const inserted=await client.query(
    'INSERT INTO game3d_private_world_session_141 '+
    '(token_sha256,owner_id,character_id,expires_at,world_instance_id) '+
    "VALUES ($1,$2,$3,clock_timestamp()+($4::integer * interval '1 second'),$5) "+
    'ON CONFLICT (token_sha256) DO NOTHING RETURNING token_sha256',
    [tokenSha256,ownerId,characterId,ttlSeconds,instanceId]);
   if(inserted.rowCount!==1||
      inserted.rows[0]?.token_sha256!==tokenSha256)
    fail('token_digest_collision');
   await client.query('COMMIT');
   started=false;
   return Object.freeze({ok:true,token:bearer,tokenSha256,
    ownerId,characterId,instanceId,ttlSeconds,
    privateOnly:true,rewardsIssued:false});
  }catch(e){
   if(started)try{await client.query('ROLLBACK')}catch{}
   throw e;
  }finally{client.release()}
 };
 // Revocation can target one digest or all sessions for the precise world.
 // The digest is not a bearer and may only be used by a privileged operator.
 const revoke=async({ownerId,characterId,instanceId,tokenSha256=null}={})=>{
  const scope={ownerId,characterId,instanceId};
  if(!validScope(scope)||(tokenSha256!==null&&
     (typeof tokenSha256!=='string'||!SHA.test(tokenSha256))))
   fail('invalid_revoke_scope');
  if(!await approved(authorizeTrustedSession,
     'revoke_private_world_session',scope))
   fail('revoke_not_authorized');
  const client=await pool.connect();
  let begun=false;
  try{
   // Revoke and issue lock the exact SAME trusted character row, avoiding
   // a concurrent revoke-all racing a new bearer issuance.
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   begun=true;
   const row=await client.query(
    'SELECT owner_id FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',
    [ownerId,characterId]);
   if(row.rowCount!==1)fail('trusted_character_missing');
   const result=await client.query(
    'UPDATE game3d_private_world_session_141 SET '+
    'revoked_at=clock_timestamp() WHERE owner_id=$1 AND character_id=$2 '+
    'AND world_instance_id=$3 AND revoked_at IS NULL '+
    'AND ($4::text IS NULL OR token_sha256=$4)',
    [ownerId,characterId,instanceId,tokenSha256]);
   await client.query('COMMIT');
   begun=false;
   return Object.freeze({ok:true,revokedCount:result.rowCount,
    privateOnly:true,rewardsIssued:false});
  }catch(e){
   if(begun)try{await client.query('ROLLBACK')}catch{}
   throw e;
  }finally{client.release()}
 };
 return Object.freeze({version:'14.9',issue,revoke,
  issuesOneTimeBearer:true,sessionScope:'world_and_character',
  ...flags});
}

// Strict authenticator for one fixed trusted world identity. 14.1 legacy
// unbound sessions remain readable by 14.1, but are never accepted here.
export function createGame3DTrustedSessionAdapter149({pool,scope}={}){
 if(typeof pool?.connect!=='function'||!validScope(scope))
  fail('requires_pinned_world_scope');
 scope=Object.freeze({ownerId:scope.ownerId,
  characterId:scope.characterId,instanceId:scope.instanceId});
 const authenticateRequest=async(req)=>{
  const header=req?.headers?.authorization;
  if(typeof header!=='string'||!header.startsWith('Bearer '))
   return null;
  const digest=digestPrivateWorldBearer141(header.slice(7));
  if(!digest)return null;
  let client;
  try{
   client=await pool.connect();
   const r=await client.query(
    'SELECT sess.token_sha256 FROM game3d_private_world_session_141 sess '+
    'JOIN game3d_private_world_seed_142 seed ON '+
    'seed.instance_id=sess.world_instance_id AND '+
    'seed.owner_id=sess.owner_id AND seed.character_id=sess.character_id '+
    'JOIN game3d_trusted_character ch ON '+
    'ch.owner_id=seed.owner_id AND '+
    'ch.character_id=seed.character_id '+
    'WHERE sess.token_sha256=$1 AND sess.owner_id=$2 AND '+
    'sess.character_id=$3 AND sess.world_instance_id=$4 '+
    'AND sess.revoked_at IS NULL AND sess.expires_at>clock_timestamp() '+
    'AND seed.sealed=true AND seed.character_revision IS NOT NULL '+
    'AND seed.character_revision=ch.revision',
    [digest,scope.ownerId,scope.characterId,scope.instanceId]);
   return r.rowCount===1&&r.rows[0]?.token_sha256===digest?
    subject(scope):null;
  }catch{return null}
  finally{if(client)client.release()}
 };
 return Object.freeze({version:'14.9',authenticateRequest,
  ownerId:scope.ownerId,characterId:scope.characterId,
  instanceId:scope.instanceId,privateServerOnly:true,
  sessionMintingEnabled:false,tokenDigestOnly:true,
  ...flags});
}

// The 14.9 private wrapper is the only newly recommended integration path.
// It keeps the existing 14.3 PvE authority and 14.0 loopback-only transport.
export async function createGame3DPrivateWorldBootstrap149(args={}){
 const adapter=createGame3DTrustedSessionAdapter149({
  pool:args.pool,scope:args.scope,
 });
 const world=await createGame3DPrivateWorldBootstrap143({
  ...args,trustedSessionAdapter149:adapter,
 });
 return Object.freeze({...world,version:'14.9',
  instanceBoundBearerRequired:true,sessionIssuerMounted:false,
  ...flags});
}
