// 31.3–31.9: staging-only PostgreSQL account admission fence.
// Never exposed to a browser. This is not the original 18.3 world lease issuer.
import {randomUUID} from 'node:crypto';

export const ACCOUNT_FENCE_TABLE_313='game3d_private_account_fence_313';
export const ACCOUNT_CLAIM_SQL_313=`
 INSERT INTO game3d_private_account_fence_313
 (owner_id,character_id,world_instance_id,world_epoch,claim_nonce,
  generation,active,expires_at,updated_at)
 VALUES ($1,$2,$3,$4,$5::uuid,1,true,
  clock_timestamp()+($6::integer * interval '1 millisecond'),clock_timestamp())
 ON CONFLICT (owner_id) DO UPDATE SET
  character_id=EXCLUDED.character_id,
  world_instance_id=EXCLUDED.world_instance_id,
  world_epoch=EXCLUDED.world_epoch,
  claim_nonce=EXCLUDED.claim_nonce,
  generation=game3d_private_account_fence_313.generation+1,
  active=true,expires_at=EXCLUDED.expires_at,
  updated_at=clock_timestamp()
 WHERE NOT game3d_private_account_fence_313.active
    OR game3d_private_account_fence_313.expires_at<=clock_timestamp()
 RETURNING owner_id,character_id,world_instance_id,world_epoch,
  claim_nonce::text AS claim_nonce,generation,active,
  expires_at>clock_timestamp() AS not_expired`;
export const ACCOUNT_VERIFY_SQL_313=`
 SELECT owner_id,character_id,world_instance_id,world_epoch,
  claim_nonce::text AS claim_nonce,generation,active,
  expires_at>clock_timestamp() AS not_expired
 FROM game3d_private_account_fence_313
 WHERE owner_id=$1 AND claim_nonce=$2::uuid AND generation=$3`;
// 32.3: renew ONLY the current active, unexpired UUID+generation.
// No upsert; an expired or replaced owner can NEVER revive its old claim.
export const ACCOUNT_RENEW_SQL_323=`
 UPDATE game3d_private_account_fence_313
 SET expires_at=clock_timestamp()+($4::integer * interval '1 millisecond'),
     updated_at=clock_timestamp()
 WHERE owner_id=$1 AND claim_nonce=$2::uuid AND generation=$3
   AND active=true AND expires_at>clock_timestamp()
 RETURNING owner_id,character_id,world_instance_id,world_epoch,
  claim_nonce::text AS claim_nonce,generation,active,
  expires_at>clock_timestamp() AS not_expired`;
export const ACCOUNT_RELEASE_SQL_313=`
 UPDATE game3d_private_account_fence_313
 SET active=false,expires_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE owner_id=$1 AND claim_nonce=$2::uuid AND generation=$3 AND active=true
 RETURNING owner_id`;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const WORLD=/^[A-Za-z0-9_.:-]{8,128}$/;
const SCHEMA=/^[a-z][a-z0-9_]{0,62}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rowMatches=(r,scope,nonce,generation)=>r?.owner_id===scope.ownerId&&
 r.character_id===scope.characterId&&r.world_instance_id===scope.instanceId&&
 r.world_epoch===scope.instanceEpoch&&typeof r.claim_nonce==='string'&&
 r.claim_nonce.toLowerCase()===nonce&&
 Number.isSafeInteger(Number(r.generation))&&Number(r.generation)===generation&&
 r.active===true&&r.not_expired===true;

export async function createPrivateAccountFence313({enabled=false,pool,schema,scope,
 verifyOriginal,ttlMs=15000,connectionTimeoutMs=1000,statementTimeoutMs=1500,
 authTimeoutMs=1000,
 now=Date.now}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
   typeof pool?.connect!=='function'||!SCHEMA.test(schema)||
   !ID.test(scope?.ownerId)||!ID.test(scope?.characterId)||
   !WORLD.test(scope?.instanceId)||!WORLD.test(scope?.instanceEpoch)||
   typeof verifyOriginal!=='function'||typeof now!=='function'||
   !Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>30000||
   !Number.isInteger(connectionTimeoutMs)||connectionTimeoutMs<100||connectionTimeoutMs>3000||
   !Number.isInteger(statementTimeoutMs)||statementTimeoutMs<250||statementTimeoutMs>3000||
   !Number.isInteger(authTimeoutMs)||authTimeoutMs<100||authTimeoutMs>3000)
  throw Error('31.3 requires original authenticated scope and restricted staging PG pool');
 // Guard against accidentally using a different database/schema than the original world.
 let db;
 try{
  db=await pool.connect();
  const check=await db.query(`SELECT current_schema() AS schema_name,
    current_setting('is_superuser') AS superuser,
    to_regclass($1) IS NOT NULL AS fence_exists,
    has_table_privilege(current_user,$1,'SELECT') AS can_select,
    has_table_privilege(current_user,$1,'INSERT') AS can_insert,
    has_table_privilege(current_user,$1,'UPDATE') AS can_update,
    has_table_privilege(current_user,$1,'DELETE,TRUNCATE,TRIGGER') AS dangerous`,
   [schema+'.'+ACCOUNT_FENCE_TABLE_313]);
  const r=check.rows?.[0];
  if(check.rowCount!==1||r?.schema_name!==schema||r?.superuser!=='off'||
    r?.fence_exists!==true||r?.can_select!==true||r?.can_insert!==true||
    r?.can_update!==true||r?.dangerous!==false)
   throw Error('31.3 unsafe or absent account fence table/role');
 }catch{throw Error('31.3 original account fence readiness failed')}
 finally{try{db?.release()}catch{}}
 let stopped=false,stageLost=false,clockBad=false,lastClock=null,claim=null,
  pendingClaim=null,pendingRenewal=null,claimsAttempted=false,opCount=0;
 const stage=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !stopped&&!stageLost;
 };
 const clock=()=>{
  if(clockBad)return false;
  let t;try{t=now()}catch{clockBad=true;return false}
  if(!Number.isSafeInteger(t)||t<=0||(lastClock!==null&&t<lastClock)){
   clockBad=true;return false;
  }
  lastClock=t;return true;
 };
 const original=async()=>{
  if(!stage()||!clock())return false;
  let timeout;
  try{
   const allowed=await Promise.race([
    Promise.resolve().then(()=>verifyOriginal()),
    new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),authTimeoutMs)}),
   ]);
   return allowed===true&&stage()&&clock();
  }catch{return false}
  finally{clearTimeout(timeout)}
 };
 const query=async(sql,params=[])=>{
  let client,tx=false,expired=false,timer;
  try{
   const pending=Promise.resolve().then(()=>pool.connect());
   try{client=await Promise.race([pending,new Promise((_,reject)=>{
    timer=setTimeout(()=>{expired=true;reject(Error('31.3 connect deadline'))},
     connectionTimeoutMs);
   })])}
   catch(error){if(expired)void pending.then(c=>{try{c?.release()}catch{}},()=>{});throw error}
   finally{clearTimeout(timer)}
   await client.query('BEGIN');tx=true;
   await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
   const answer=await client.query(sql,params);
   await client.query('COMMIT');tx=false;
   return answer;
  }finally{
   if(tx)try{await client?.query('ROLLBACK')}catch{}
   try{client?.release()}catch{}
  }
 };
 const acquire=async()=>{
  if(!stage()||claimsAttempted||claim||pendingClaim||opCount>0)return false;
  claimsAttempted=true;
  pendingClaim=(async()=>{
   if(!await original())return false;
   const nonce=randomUUID().toLowerCase();
   let result;
   try{result=await query(ACCOUNT_CLAIM_SQL_313,[scope.ownerId,
    scope.characterId,scope.instanceId,scope.instanceEpoch,nonce,ttlMs])}
   catch{return false}
   const row=result?.rows?.[0],generation=Number(row?.generation);
   if(result?.rowCount!==1||!Number.isSafeInteger(generation)||generation<1||
      !rowMatches(row,scope,nonce,generation))return false;
   claim=Object.freeze({nonce,generation});
   if(!await original()){
    await release();return false;
   }
   return true;
  })();
  try{return await pendingClaim}finally{pendingClaim=null}
 };
 const verify=async()=>{
  if(!claim||!await original()||opCount>=4)return false;
  const current=claim;opCount++;
  try{
   const result=await query(ACCOUNT_VERIFY_SQL_313,[scope.ownerId,
    current.nonce,current.generation]);
   return claim===current&&result?.rowCount===1&&
    rowMatches(result.rows?.[0],scope,current.nonce,current.generation)&&
    await original();
  }catch{return false}
  finally{opCount--}
 };
// 32.4–32.7: explicit one-at-a-time bounded renewal. This is not a
 // heartbeat by itself; all identity proofs must still pass before/after.
 const renew=async()=>{
  if(!claim||pendingClaim||pendingRenewal||!stage()||!clock())return false;
  const current=claim;
  const task=(async()=>{
   try{
    if(!await original()||claim!==current)return false;
    const answer=await query(ACCOUNT_RENEW_SQL_323,[scope.ownerId,
     current.nonce,current.generation,ttlMs]);
    if(claim!==current||answer?.rowCount!==1||
       !rowMatches(answer.rows?.[0],scope,current.nonce,current.generation)||
       !await original()||claim!==current)return false;
    // A second DB-side read protects against lease takeover after COMMIT.
    return await verify()&&claim===current;
   }catch{return false}
  })();
  pendingRenewal=task;
  try{
   const ok=await task;
   const valid=ok&&claim===current&&stage()&&clock();
   if(!valid&&claim===current)await release();
   return valid;
  }finally{if(pendingRenewal===task)pendingRenewal=null}
 };
 const release=async()=>{
  const current=claim;claim=null;
  if(!current)return false;
  try{
   const result=await query(ACCOUNT_RELEASE_SQL_313,[scope.ownerId,
    current.nonce,current.generation]);
   return result?.rowCount===1&&result.rows?.[0]?.owner_id===scope.ownerId;
  }catch{return false}
 };
 const shutdown=async()=>{
  if(stopped)return false;
  stopped=true;
  if(pendingClaim)try{await pendingClaim}catch{}
  if(pendingRenewal)try{await pendingRenewal}catch{}
  await release();
  return true;
 };
 return Object.freeze({version:'31.3',acquire,verify,renew,release,shutdown,
  get active(){return claim!==null&&!stopped},
  privateServerOnly:true,publicRouteInstalled:false,
  migrationApplied:false,credentialsExposed:false,productionReady:false});
}
