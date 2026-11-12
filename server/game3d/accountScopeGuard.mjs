// Combat Foundation 6.6 — server-side account/character read authorization.
// NEVER accept ownerId from an HTTP body as an authenticated subject.
// resolveAuthenticatedSubject must use trusted framework identity on server.
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const denied=code=>({ok:false,code,readOnlyAllowed:false,
 itemGrantsAllowed:false,rewardWritesAllowed:false});
export function validateAccountCharacterScope({subject,characterRow}={}){
 if(!subject||subject.authenticated!==true||
    subject.identitySource!=='trusted-server-session'||!id(subject.accountId))
  return denied('unverified_authentication');
 if(!characterRow||!id(characterRow.owner_id)||
    !id(characterRow.character_id)||
    characterRow.owner_id!==subject.accountId||
    !Number.isSafeInteger(Number(characterRow.revision))||
    Number(characterRow.revision)<0)
  return denied('character_owner_binding_missing');
 return {ok:true,accountId:subject.accountId,
  characterId:characterRow.character_id,
  characterRevision:Number(characterRow.revision),
  readOnlyAllowed:true,itemGrantsAllowed:false,
  rewardWritesAllowed:false};
}
export function createGame3DAccountScopeGuard({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.query||typeof resolveAuthenticatedSubject!=='function')
  throw Error('Requires private PG and real server authentication resolver');
 const authorizeRead=async({serverRequestContext,characterId}={})=>{
  if(!id(characterId))return denied('invalid_character');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  // Do not send client-chosen owner IDs to query; account comes from
  // server-resolved authenticated session only.
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||
     !id(subject.accountId))return denied('unverified_authentication');
  const result=await pool.query(
   'SELECT owner_id,character_id,revision '+
   'FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
   [subject.accountId,characterId]);
  if(result.rowCount!==1)return denied('character_owner_binding_missing');
  return validateAccountCharacterScope({subject,characterRow:result.rows[0]});
 };
 return Object.freeze({authorizeRead});
}
