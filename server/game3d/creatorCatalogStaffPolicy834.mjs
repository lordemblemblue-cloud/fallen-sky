/**
 * Game 3D 83.4 — private PG16 server-owned staff capability reader.
 * NO public endpoint, self-service grant, role update, gameplay item issuance,
 * world-session authority, credential storage or catalog publication.
 */
export const CREATOR_STAFF_POLICY_SCHEMA_834='axe-game3d-staff-policy-834-v1';
const SCHEMA=/^axe_creator_test_[a-z0-9_]{1,24}$/;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const SESSION=/^[A-Za-z0-9_.:-]{8,128}$/;
const OPS=new Set(['submit','status','review']);
const stage=()=>process.env.GAME3D_PRIVATE_STAGING_ENV==='staging';
const validId=value=>typeof value==='string'&&ID.test(value)&&
  !['__anon__','__default__'].includes(value);
const blocked=()=>Object.freeze({allowed:false,
  identitySource:'no-staff-policy-grant'});
export function createCreatorCatalogStaffPolicy834({
  pool,schema,enabled=false,scope='disabled',now=Date.now,
}={}){
  if(enabled!==true||scope!=='private-staging'||!stage()||
    typeof schema!=='string'||!SCHEMA.test(schema)||
    typeof pool?.connect!=='function'||typeof now!=='function')
    throw Error('83.4 requires private disposable staff policy reader');
  let verifiedRole=null,ready=false;
  async function transact(fn){
    let client,begun=false;
    try{
      client=await pool.connect();
      if(typeof client?.query!=='function'||typeof client?.release!=='function')
        return null;
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
      begun=true;
      await client.query("SELECT set_config('search_path', $1, true)",[schema]);
      const value=await fn(client);
      await client.query('COMMIT');
      begun=false;
      return value;
    }catch{
      if(begun)try{await client.query('ROLLBACK')}catch{}
      return null;
    }finally{try{client?.release?.()}catch{}}
  }
  const assertReady=async()=>{
    if(!stage()){ready=false;return Object.freeze({ok:false})}
    const role=await transact(async client=>{
      const who=await client.query(
        'SELECT current_user AS role_name,'+
        '(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser');
      if(who?.rowCount!==1||who.rows?.[0]?.superuser!==false||
        !validId(who.rows[0].role_name))return null;
      const roleName=who.rows[0].role_name;
      const table=await client.query(
        'SELECT pg_get_userbyid(c.relowner) AS owner '+
        'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace '+
        'WHERE n.nspname=$1 AND c.relname=$2',
        [schema,'game3d_creator_catalog_staff_grant_834']);
      if(table?.rowCount!==1||table.rows[0].owner===roleName)
        return null;
      const privilege=await client.query(
        'SELECT '+
        "has_schema_privilege($1,'USAGE') AS schema_usage,"+
        "has_table_privilege(format('%I.%I',$1,$2),'SELECT') AS staff_select,"+
        "has_table_privilege(format('%I.%I',$1,$2),'INSERT') AS staff_insert,"+
        "has_table_privilege(format('%I.%I',$1,$2),'UPDATE') AS staff_update,"+
        "has_table_privilege(format('%I.%I',$1,$2),'DELETE') AS staff_delete,"+
        "has_table_privilege(format('%I.%I',$1,$3),'SELECT') AS proposal_select,"+
        "has_table_privilege(format('%I.%I',$1,$4),'SELECT') AS review_select,"+
        "has_table_privilege(format('%I.%I',$1,$5),'SELECT') AS audit_select,"+
        "has_table_privilege(format('%I.%I',$1,$3),'INSERT') AS proposal_insert,"+
        "has_table_privilege(format('%I.%I',$1,$3),'UPDATE') AS proposal_update,"+
        "has_table_privilege(format('%I.%I',$1,$3),'DELETE') AS proposal_delete,"+
        "has_table_privilege(format('%I.%I',$1,$4),'INSERT') AS review_insert,"+
        "has_table_privilege(format('%I.%I',$1,$4),'UPDATE') AS review_update,"+
        "has_table_privilege(format('%I.%I',$1,$4),'DELETE') AS review_delete,"+
        "has_table_privilege(format('%I.%I',$1,$5),'INSERT') AS audit_insert,"+
        "has_table_privilege(format('%I.%I',$1,$5),'UPDATE') AS audit_update,"+
        "has_table_privilege(format('%I.%I',$1,$5),'DELETE') AS audit_delete,"+
        "has_table_privilege(format('%I.%I',$1,$2),'TRUNCATE') AS staff_truncate,"+
        "has_table_privilege(format('%I.%I',$1,$2),'TRIGGER') AS staff_trigger",
        [schema,'game3d_creator_catalog_staff_grant_834',
          'game3d_creator_catalog_proposal_830',
          'game3d_creator_catalog_review_830',
          'game3d_creator_catalog_intake_audit_833']);
      const grants=privilege?.rowCount===1?privilege.rows?.[0]:null;
      if(!grants||grants.schema_usage!==true||grants.staff_select!==true||
        grants.staff_insert!==false||grants.staff_update!==false||
        grants.staff_delete!==false||grants.proposal_select!==false||
        grants.review_select!==false||grants.audit_select!==false||
        ['proposal_insert','proposal_update','proposal_delete',
         'review_insert','review_update','review_delete',
         'audit_insert','audit_update','audit_delete',
         'staff_truncate','staff_trigger'].some(key=>grants[key]!==false))
        return null;
      return roleName;
    });
    ready=typeof role==='string'&&validId(role);
    verifiedRole=ready?role:null;
    return Object.freeze({ok:ready,roleName:verifiedRole});
  };
  const resolveStaffPermission=async({
    accountId,operation,serverSessionId,
  }={})=>{
    if(!stage()||!ready||!validId(accountId)||!OPS.has(operation)||
      typeof serverSessionId!=='string'||!SESSION.test(serverSessionId))
      return blocked();
    const t=now();
    if(!Number.isSafeInteger(t)||t<=0)return blocked();
    const capability='creator-catalog:'+operation;
    const permitted=await transact(async client=>{
      // Ensure the pool has not silently switched to another database role.
      const role=await client.query('SELECT current_user AS role_name');
      if(role?.rowCount!==1||role.rows?.[0]?.role_name!==verifiedRole)
        return false;
      const match=await client.query(
        'SELECT account_id,capability,expires_at '+
        'FROM game3d_creator_catalog_staff_grant_834 '+
        'WHERE account_id=$1 AND capability=$2 '+
        'AND revoked_at IS NULL AND expires_at>clock_timestamp()',
        [accountId,capability]);
      if(match?.rowCount!==1||!Array.isArray(match.rows)||
        match.rows.length!==1)return false;
      const grant=match.rows[0],expiration=
        grant.expires_at instanceof Date?grant.expires_at.getTime():
        typeof grant.expires_at==='string'?Date.parse(grant.expires_at):NaN;
      return grant.account_id===accountId&&grant.capability===capability&&
        Number.isFinite(expiration)&&expiration>t&&
        expiration<=t+30*86400000&&stage();
    });
    return permitted===true?Object.freeze({
      allowed:true,identitySource:'server-owned-creator-catalog-policy',
      accountId,capability,
    }):blocked();
  };
  return Object.freeze({
    version:CREATOR_STAFF_POLICY_SCHEMA_834,
    assertReady,resolveStaffPermission,
    privateServerOnly:true,publicRouteInstalled:false,
    productionReady:false,autoMigration:false,
    grantsWritable:false,eligibleForIssuance:false,
    catalogPublished:false,rewardsIssued:false,
  });
}
