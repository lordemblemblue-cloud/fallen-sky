/**
 * Game 3D 83.5 — READ-ONLY PostgreSQL 16 three-role private catalog audit.
 * Verifies 053/054/055 deployment and least-privilege role separation.
 * No DDL, grants, proposals, reviews, audit insertions, or gameplay writes.
 */
import {verifyCreatorTriggerBodies836} from './creatorCatalogTriggerIntegrity836.mjs';
export const CREATOR_PG_READINESS_SCHEMA_835='axe-game3d-pg-readiness-835-v1';
export const CREATOR_PG_READINESS_TABLES_835=Object.freeze([
  'game3d_creator_catalog_proposal_830',
  'game3d_creator_catalog_review_830',
  'game3d_creator_catalog_intake_audit_833',
  'game3d_creator_catalog_staff_grant_834',
]);
const TRIGGERS=Object.freeze([
  'game3d_creator_catalog_proposal_830_immutable',
  'game3d_creator_catalog_review_830_immutable',
  'creator_catalog_intake_audit_833_no_update_delete',
  'creator_catalog_staff_grant_834_immutable',
]);
const FUNCTIONS=Object.freeze([
  'game3d_creator_catalog_proposal_830_guard',
  'game3d_creator_catalog_review_830_guard',
  'creator_catalog_intake_audit_833_immutable',
  'creator_catalog_staff_grant_834_guard',
]);
const OPS=Object.freeze(['SELECT','INSERT','UPDATE','DELETE',
  'TRUNCATE','REFERENCES','TRIGGER']);
const ALLOWED=Object.freeze({
  staging:Object.freeze(['SELECT,INSERT,UPDATE','SELECT,INSERT', '', '']),
  audit:Object.freeze(['','','SELECT,INSERT','']),
  policy:Object.freeze(['','','','SELECT']),
});
const stage=()=>process.env.GAME3D_PRIVATE_STAGING_ENV==='staging';
const fail=code=>Object.freeze({ok:false,code,readOnly:true,
  schemaApplied:false,rolesVerified:false,
  catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false});
const shape=pool=>pool!==null&&typeof pool==='object'&&
  typeof pool.connect==='function';

async function inspectRole(pool,schema,role){
  let client,begun=false;
  try{
    client=await pool.connect();
    if(typeof client?.query!=='function'||typeof client?.release!=='function')
      return {code:'connection-unavailable'};
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun=true;
    await client.query("SELECT set_config('search_path', $1, true)",[schema]);

    const who=await client.query(
      "SELECT current_setting('server_version_num')::integer AS version,"+
      'current_user AS role_name,ro.rolsuper AS superuser,'+
      'ro.rolbypassrls AS bypass_rls,ro.rolcreatedb AS create_db,'+
      'ro.rolcreaterole AS create_role '+
      'FROM pg_roles ro WHERE ro.rolname=current_user');
    const identity=who?.rowCount===1?who.rows?.[0]:null;
    if(!identity||Number(identity.version)<160000||
      typeof identity.role_name!=='string'||!identity.role_name||
      identity.superuser!==false||identity.bypass_rls!==false||
      identity.create_db!==false||identity.create_role!==false)
      return {code:'privileged-or-unsupported-role'};
    const schemaRight=await client.query(
      "SELECT has_schema_privilege($1,'USAGE') AS can_use,"+
      "has_schema_privilege($1,'CREATE') AS can_create",
      [schema]);
    if(schemaRight?.rowCount!==1||
      schemaRight.rows?.[0]?.can_use!==true||
      schemaRight.rows?.[0]?.can_create!==false)
      return {code:'schema-permissions-unsafe'};

    const names=CREATOR_PG_READINESS_TABLES_835;
    const tableResult=await client.query(
      'SELECT c.relname AS name,c.relkind AS kind,'+
      'pg_get_userbyid(c.relowner) AS owner '+
      'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace '+
      'WHERE n.nspname=$1 AND c.relname=ANY($2::text[])',
      [schema,names]);
    if(tableResult?.rowCount!==4||tableResult.rows?.length!==4||
      tableResult.rows.some(item=>!names.includes(item.name)||
        item.kind!=='r'||item.owner===identity.role_name)||
      new Set(tableResult.rows.map(item=>item.name)).size!==4)
      return {code:'migration-tables-unverified'};

    // Inspect actual ACLs, including an absent explicit ACL (defaults).
    const acl=await client.query(
      'SELECT c.relname AS name,count(a.grantee)::integer AS public_grants '+
      'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace '+
      "LEFT JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a "+
      'ON a.grantee=0 '+
      'WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) '+
      'GROUP BY c.relname',
      [schema,names]);
    if(acl?.rowCount!==4||acl.rows?.length!==4||
      acl.rows.some(item=>!names.includes(item.name)||
        Number(item.public_grants)!==0))
      return {code:'public-table-grants-detected'};

    const perms=[];
    for(let i=0;i<names.length;i++){
      const p=await client.query(
        'SELECT '+OPS.map((operation,j)=>
          "has_table_privilege(format('%I.%I',$1,$2),$"+(j+3)+
          ") AS p"+j).join(','),
        [schema,names[i],...OPS]);
      if(p?.rowCount!==1||p.rows?.length!==1)
        return {code:'table-rights-unverified'};
      const expected=new Set(ALLOWED[role][i].split(',').filter(Boolean));
      const exact=OPS.every((operation,j)=>
        p.rows[0]['p'+j]===(expected.has(operation)));
      if(!exact)return {code:'role-table-rights-unsafe'};
      perms.push(true);
    }

    const triggers=await client.query(
      'SELECT t.tgname AS name,t.tgenabled AS enabled,'+
      't.tgtype::integer AS trigger_type,c.relname AS table_name,'+
      'p.proname AS function_name,fn.nspname AS function_schema '+
      'FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid '+
      'JOIN pg_namespace n ON n.oid=c.relnamespace '+
      'JOIN pg_proc p ON p.oid=t.tgfoid '+
      'JOIN pg_namespace fn ON fn.oid=p.pronamespace '+
      'WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) '+
      'AND NOT t.tgisinternal',
      [schema,names]);
    // Require an actual enabled, row-level BEFORE UPDATE OR DELETE trigger
    // on its exact table; matching a disabled or misbound name is not enough.
    if(!Array.isArray(triggers?.rows)||
      TRIGGERS.some((name,i)=>!triggers.rows.some(t=>
        t.name===name&&t.table_name===names[i]&&
        t.function_name===FUNCTIONS[i]&&t.function_schema===schema&&
        ['O','A'].includes(t.enabled)&&
        Number.isSafeInteger(Number(t.trigger_type))&&
        (Number(t.trigger_type)&27)===27)))
      return {code:'immutable-triggers-missing'};

    const fnAcl=await client.query(
      'SELECT p.proname AS name,count(a.grantee)::integer AS public_grants '+
      'FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace '+
      "LEFT JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "+
      'ON a.grantee=0 '+
      'WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) '+
      'GROUP BY p.proname',
      [schema,FUNCTIONS]);
    if(fnAcl?.rowCount!==4||fnAcl.rows?.length!==4||
      fnAcl.rows.some(x=>!FUNCTIONS.includes(x.name)||
        Number(x.public_grants)!==0))
      return {code:'public-trigger-function-grants-detected'};

    // A trigger with a reviewed name may still point to a no-op replacement.
    // Verify the actual bound PL/pgSQL function bodies against committed SQL.
    const bodies=await verifyCreatorTriggerBodies836(client,schema);
    if(!bodies.ok)return {code:bodies.code};

    await client.query('COMMIT');begun=false;
    return {code:'ok',roleName:identity.role_name};
  }catch{
    return {code:'read-only-database-check-failed'};
  }finally{
    if(begun)try{await client?.query('ROLLBACK')}catch{}
    try{client?.release?.()}catch{}
  }
}
export async function auditCreatorCatalogPgReadiness835({
  stagingPool,auditPool,policyPool,schema,enabled=false,scope='disabled',
}={}){
  if(enabled!==true||scope!=='private-staging'||!stage()||
    typeof schema!=='string'||
    !/^axe_creator_test_[a-z0-9_]{1,24}$/.test(schema)||
    ![stagingPool,auditPool,policyPool].every(shape)||
    new Set([stagingPool,auditPool,policyPool]).size!==3)
    return fail('explicit-disposable-three-role-staging-required');
  const roles=[
    ['staging',stagingPool],['audit',auditPool],['policy',policyPool],
  ];
  const checked=await Promise.all(roles.map(
    ([role,pool])=>inspectRole(pool,schema,role)));
  if(checked.some(x=>x.code!=='ok')){
    const failed=checked.find(x=>x.code!=='ok');
    return fail(failed.code);
  }
  if(new Set(checked.map(item=>item.roleName)).size!==3)
    return fail('database-role-separation-failed');
  return Object.freeze({
    ok:true,version:CREATOR_PG_READINESS_SCHEMA_835,
    readOnly:true,rolesVerified:true,schemaApplied:true,
    tableCount:CREATOR_PG_READINESS_TABLES_835.length,
    immutableTriggersVerified:TRIGGERS.length,
    publicTableGrants:0,
    catalogPublished:false,eligibleForIssuance:false,rewardsIssued:false,
  });
}
