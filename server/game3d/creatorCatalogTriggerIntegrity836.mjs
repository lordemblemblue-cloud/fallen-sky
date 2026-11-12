/**
 * 83.6 — require the actual PostgreSQL trigger functions to match reviewed
 * private migrations 053, 054 and 055, not just matching trigger names.
 *
 * Uses SELECT only. A missing/modified migration file fails closed. Database
 * function body is compared with canonical authored PL/pgSQL after whitespace
 * normalization; this does not install DDL or invoke unsafe functions.
 */
import {readFileSync} from 'node:fs';

export const CREATOR_TRIGGER_CONTRACT_836='axe-game3d-trigger-integrity-836-v1';
export const CREATOR_TRIGGER_NAMES_836=Object.freeze([
  'game3d_creator_catalog_proposal_830_guard',
  'game3d_creator_catalog_review_830_guard',
  'creator_catalog_intake_audit_833_immutable',
  'creator_catalog_staff_grant_834_guard',
]);
export const CREATOR_TRIGGER_SOURCES_836=Object.freeze([
  'server/game3d/sql/053_creator_catalog_private_staging_830.sql',
  'server/game3d/sql/054_creator_catalog_intake_audit_833.sql',
  'server/game3d/sql/055_creator_catalog_staff_grants_834.sql',
]);
const normalize=body=>typeof body==='string'
  ?body.replace(/\s+/g,' ').trim():null;
const functionSource=(sql,name)=>{
  if(typeof sql!=='string'||sql.length<100||sql.length>100000)return null;
  // Only four hardcoded snake_case identifiers are ever interpolated here.
  if(!CREATOR_TRIGGER_NAMES_836.includes(name))return null;
  const pattern=new RegExp(
    'CREATE\\s+FUNCTION\\s+'+name+
    '\\(\\)\\s+RETURNS\\s+trigger\\s+LANGUAGE\\s+plpgsql\\s+AS\\s+'+
    '(\\$\\$|\\$[a-z_][a-z0-9_]*\\$)([\\s\\S]*?)\\1\\s*;', 'gi');
  const matches=[...sql.matchAll(pattern)];
  if(matches.length!==1)return null;
  const body=normalize(matches[0][2]);
  return body&&body.includes('BEGIN')&&body.includes('END;')?body:null;
};
export function collectCreatorTriggerContracts836(sources){
  if(!Array.isArray(sources)||sources.length!==3||
    sources.some(s=>typeof s!=='string'))return null;
  const result=Object.create(null);
  for(let i=0;i<CREATOR_TRIGGER_NAMES_836.length;i++){
    const name=CREATOR_TRIGGER_NAMES_836[i];
    const file=i<2?0:i===2?1:2;
    const body=functionSource(sources[file],name);
    if(!body)return null;
    result[name]=body;
  }
  return Object.freeze(result);
}
export function canonicalCreatorTriggerContracts836(){
  try{
    const sources=CREATOR_TRIGGER_SOURCES_836.map(path=>
      readFileSync(path,'utf8'));
    return collectCreatorTriggerContracts836(sources);
  }catch{return null}
}
/**
 * Caller has already opened a read-only, transaction-scoped, pinned-schema
 * PostgreSQL connection and checked the four functions' PUBLIC ACLs.
 * Verify the actual function definitions, language, arguments and security
 * mode. PostgreSQL may rewrite whitespace; no semantic rewriting is allowed.
 */
export async function verifyCreatorTriggerBodies836(client,schema){
  if(typeof schema!=='string'||
    !/^axe_creator_test_[a-z0-9_]{1,24}$/.test(schema)||
    typeof client?.query!=='function')
    return Object.freeze({ok:false,code:'trigger-contract-unavailable'});
  const expected=canonicalCreatorTriggerContracts836();
  if(!expected)return Object.freeze({ok:false,code:'trusted-trigger-source-missing'});
  try{
    const found=await client.query(
      'SELECT p.proname AS name,p.prosrc AS body,'+
      'p.prosecdef AS security_definer,p.pronargs::integer AS argument_count,'+
      'l.lanname AS language,n.nspname AS function_schema '+
      'FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace '+
      'JOIN pg_language l ON l.oid=p.prolang '+
      'WHERE n.nspname=$1 AND p.proname=ANY($2::text[])',
      [schema,CREATOR_TRIGGER_NAMES_836]);
    const rows=found?.rows;
    if(found?.rowCount!==4||!Array.isArray(rows)||rows.length!==4||
      new Set(rows.map(row=>row.name)).size!==4)
      return Object.freeze({ok:false,code:'trigger-function-shape-invalid'});
    for(const row of rows){
      if(!Object.hasOwn(expected,row.name)||
        row.language!=='plpgsql'||row.security_definer!==false||
        Number(row.argument_count)!==0||
        row.function_schema!==schema||
        normalize(row.body)!==expected[row.name])
        return Object.freeze({ok:false,code:'trigger-function-body-mismatch'});
    }
    return Object.freeze({ok:true,source:'reviewed-migration-sql',
      verifiedFunctions:CREATOR_TRIGGER_NAMES_836.length,readOnly:true});
  }catch{
    return Object.freeze({ok:false,code:'trigger-function-inspection-failed'});
  }
}
