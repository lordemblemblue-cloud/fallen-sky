/**
 * 83.1: conservative, source-only PostgreSQL migration sanity check.
 * Not a SQL parser. Actual PG16 execution is an independent acceptance gate.
 */
export const CREATOR_CATALOG_EXPECTED_BLOCKS_831=3;
export function inspectCreatorCatalogMigration831(source){
  if(typeof source!=='string'||!source.trim())
    return Object.freeze({ok:false,reasons:['SQL source missing'],blocks:0});
  const sql=source;
  const executable=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
  const paired=[...executable.matchAll(/\b(?:DO|AS)\s+\$\$([\s\S]*?)\$\$\s*;/g)];
  const reasons=[];
  const dollarCount=(executable.match(/\$\$/g)||[]).length;
  if(dollarCount!==CREATOR_CATALOG_EXPECTED_BLOCKS_831*2||
    paired.length!==CREATOR_CATALOG_EXPECTED_BLOCKS_831)
    reasons.push('Expected three paired PostgreSQL $$ code blocks');
  for(const [index,match] of paired.entries()){
    if(!/\bBEGIN\s*;?\s*[\s\S]*\bEND\s*;\s*$/.test(match[1]))
      reasons.push('PL/pgSQL block '+(index+1)+' is not terminated with END;');
  }
  if(/\b(?:DO|AS)\s+\$\s*(?!\$)/.test(executable)||
    /\bEND\s+\$\s*;/.test(executable))
    reasons.push('Found malformed single-dollar PL/pgSQL delimiter');
  if((executable.match(/\bRETURNS\s+trigger\s+LANGUAGE\s+plpgsql\s+AS\s+\$\$/gi)||[]).length!==2)
    reasons.push('Expected two dollar-quoted trigger functions');
  for(const name of [
    'game3d_creator_catalog_proposal_830',
    'game3d_creator_catalog_review_830',
  ]){
    if(!executable.includes('CREATE TABLE '+name+' ('))
      reasons.push('Missing required private staging table '+name);
    if(!executable.includes('REVOKE ALL ON '+name+' FROM PUBLIC;'))
      reasons.push('Missing PUBLIC permission revocation for '+name);
  }
  for(const name of [
    'game3d_creator_catalog_proposal_830_guard',
    'game3d_creator_catalog_review_830_guard',
  ]){
    if(!executable.includes('CREATE FUNCTION '+name+'()')||
      !executable.includes('REVOKE ALL ON FUNCTION '+name+'() FROM PUBLIC;'))
      reasons.push('Missing immutable trigger or PUBLIC revocation '+name);
  }
  if(!/\bcurrent_schema\(\)\s*=\s*'public'/.test(executable)||
    !/server_version_num/.test(executable))
    reasons.push('Private schema or PG16 guard missing');
  if(!/^BEGIN;\s*/.test(executable.trimStart())||
    !/\bCOMMIT;\s*$/.test(executable))
    reasons.push('Migration must be explicitly transaction-scoped');
  if(/\bGRANT\b[^;\n]*\bTO\s+(?:PUBLIC|authenticated)\b/i.test(executable)||
    /\b(?:DROP\s+TABLE|CREATE\s+EXTENSION|ALTER\s+ROLE)\b/i.test(executable))
    reasons.push('Dangerous grant, role, extension or destructive DDL');
  return Object.freeze({ok:reasons.length===0,reasons:Object.freeze(reasons),
    blocks:paired.length});
}
