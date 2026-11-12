/**
 * 83.3 — PRIVATE staff catalog host composition.
 * Integrates the 83.0 PostgreSQL staging service, 83.2 in-process intake
 * and 83.3 immutable audit writer. Does not install ANY HTTP/WS/other route.
 *
 * Existing world-lease verification is PLAYER authentication, NOT staff
 * catalog permission. This host requires a separate server-owned staff grant.
 */
import {createGame3DCreatorCatalogStaging830}
  from './creatorCatalogStaging830.mjs';
import {createGame3DCreatorPrivateIntake832}
  from './creatorCatalogPrivateIntake832.mjs';
import {createCreatorCatalogPgAudit833}
  from './creatorCatalogPgAudit833.mjs';

export const CREATOR_HOST_SCHEMA_833='axe-game3d-creator-host-833-v1';
const SUBJECT=/^[A-Za-z0-9_.:-]{1,128}$/;
const SESSION=/^[A-Za-z0-9_.:-]{8,128}$/;
const SCHEMA=/^axe_creator_test_[a-z0-9_]{1,24}$/;
const STAGING=()=>process.env.GAME3D_PRIVATE_STAGING_ENV==='staging';
const allowedSubject=x=>typeof x==='string'&&SUBJECT.test(x)&&
  !['__anon__','__default__'].includes(x);
const denied=code=>Object.freeze({ok:false,code,
  stagingOnly:true,catalogPublished:false,
  eligibleForIssuance:false,rewardsIssued:false});
async function poolRole(pool){
  let client;
  try{
    client=await pool.connect();
    if(typeof client?.query!=='function'||typeof client?.release!=='function')
      return null;
    const r=await client.query('SELECT current_user AS role_name, '+
      '(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser');
    const row=r?.rowCount===1?r.rows?.[0]:null;
    return row?.superuser===false&&
      typeof row.role_name==='string'&&SESSION.test(row.role_name)
      ?row.role_name:null;
  }catch{return null}finally{try{client?.release?.()}catch{}}
}
export function createGame3DCreatorTrustedHost833({
  stagingPool,auditPool,schema,
  resolveAuthenticatedSubject,verifySessionActive,resolveStaffPermission,
  staffPolicy=null,enabled=false,scope='disabled',now=Date.now,
}={}){
  if(enabled!==true||scope!=='private-staging'||!STAGING()||
    typeof schema!=='string'||!SCHEMA.test(schema)||
    typeof stagingPool?.connect!=='function'||
    typeof auditPool?.connect!=='function'||
    stagingPool===auditPool||
    typeof resolveAuthenticatedSubject!=='function'||
    typeof verifySessionActive!=='function'||
    (staffPolicy!==null&&
      (staffPolicy?.version!=='axe-game3d-staff-policy-834-v1'||
       staffPolicy.privateServerOnly!==true||
       staffPolicy.publicRouteInstalled!==false||
       staffPolicy.productionReady!==false||
       staffPolicy.grantsWritable!==false||
       typeof staffPolicy.assertReady!=='function'||
       typeof staffPolicy.resolveStaffPermission!=='function'))||
    (staffPolicy===null&&typeof resolveStaffPermission!=='function')||
    (staffPolicy!==null&&resolveStaffPermission!==undefined)||
    typeof now!=='function')
    throw Error('83.3 requires dedicated staging/audit pools and independent staff permission authority');

  // Re-verify from the real server on EVERY request. Neither session metadata
  // nor staff permissions may be read from a client-supplied JSON or role flag.
  async function attest(serverContext,operation){
    if(!STAGING()||!['submit','status','review'].includes(operation))
      return null;
    let principal,active,permission;
    try{
      principal=await resolveAuthenticatedSubject(serverContext);
      const before=now();
      if(principal?.authenticated!==true||
        principal.identitySource!=='trusted-server-session'||
        !allowedSubject(principal.accountId)||
        typeof principal.serverSessionId!=='string'||
        !SESSION.test(principal.serverSessionId)||
        !Number.isSafeInteger(principal.expiresAtMs)||
        !Number.isSafeInteger(before)||
        principal.expiresAtMs<=before||
        principal.expiresAtMs>before+900000)
        return null;
      active=await verifySessionActive(Object.freeze({
        accountId:principal.accountId,
        serverSessionId:principal.serverSessionId,
        serverContext,
      }));
      if(active!==true)return null;
      permission=await (staffPolicy?staffPolicy.resolveStaffPermission:
        resolveStaffPermission)(Object.freeze({
        accountId:principal.accountId,
        operation,
        serverSessionId:principal.serverSessionId,
        serverContext,
      }));
      const after=now();
      if(!Number.isSafeInteger(after)||after<before||
        principal.expiresAtMs<=after||after>before+900000||
        permission?.allowed!==true||
        permission.identitySource!=='server-owned-creator-catalog-policy'||
        permission.accountId!==principal.accountId||
        permission.capability!=='creator-catalog:'+operation)
        return null;
      return Object.freeze({
        authorized:true,identitySource:'trusted-server-session',
        capability:'creator-catalog:'+operation,
        principalId:principal.accountId,
        expiresAtMs:principal.expiresAtMs,
      });
    }catch{return null}
  }
  const staging=createGame3DCreatorCatalogStaging830({
    pool:stagingPool,schema,enabled:true,scope:'private-staging',
    authorizeCreator:async(ctx,operation)=>{
      const a=await attest(ctx,operation);
      return Object.freeze({authorized:Boolean(a),
        creatorId:a?.principalId||null});
    },
    authorizeReviewer:async ctx=>{
      const a=await attest(ctx,'review');
      return Object.freeze({authorized:Boolean(a),
        reviewerId:a?.principalId||null});
    },
  });
  const audit=createCreatorCatalogPgAudit833({
    pool:auditPool,schema,enabled:true,scope:'private-staging',
  });
  const intake=createGame3DCreatorPrivateIntake832({
    staging,authenticateServerSession:attest,
    auditEvent:audit.auditEvent,
    now,enabled:true,scope:'private-staging',
  });
  let ready=false,closed=false,initPending=null;
  async function initialize(){
    if(!STAGING()||closed)return denied('staging-disabled');
    if(ready)return Object.freeze({ok:true,privateReady:true});
    if(initPending)return initPending;
    initPending=(async()=>{
      try{
        const [stagingRole,auditRole]=await Promise.all([
          poolRole(stagingPool),poolRole(auditPool),
        ]);
        if(!stagingRole||!auditRole||stagingRole===auditRole)
          return denied('staging-role-isolation-unverified');
        if(staffPolicy){
          const policy=await staffPolicy.assertReady();
          if(policy?.ok!==true||typeof policy.roleName!=='string'||
             policy.roleName===stagingRole||policy.roleName===auditRole)
            return denied('staff-policy-role-isolation-unverified');
        }
        if(!await staging.assertSchema()||!await audit.assertSchema())
          return denied('staging-schema-unavailable');
        if(!STAGING()||closed)return denied('staging-disabled');
        ready=true;
        return Object.freeze({ok:true,privateReady:true});
      }catch{return denied('staging-readiness-failed')}
    })();
    try{return await initPending}finally{initPending=null}
  }
  const execute=async request=>{
    if(!STAGING()||closed)return denied('staging-disabled');
    if(!ready)return denied('private-staging-not-initialized');
    return intake.execute(request);
  };
  const shutdown=()=>{ready=false;closed=true};
  return Object.freeze({
    version:CREATOR_HOST_SCHEMA_833,initialize,execute,shutdown,
    privateServerOnly:true,publicRouteInstalled:false,
    autoMigration:false,productionReady:false,
    catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false,
  });
}
