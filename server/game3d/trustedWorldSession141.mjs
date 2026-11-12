// Combat Foundation 14.1: private PostgreSQL-backed bearer digest lookup.
// This code DOES NOT mint or accept a browser-declared account/character.
// Only a separate privileged trusted identity service may provision digest
// rows. The session lookup checks revocation and expiry using the DB clock.
import {createHash} from 'node:crypto';

const TOKEN=/^[A-Za-z0-9_-]{43,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const authorizedId=x=>typeof x==='string'&&WHO.test(x)&&
 x!=='__anon__'&&x!=='__default__';
export function digestPrivateWorldBearer141(token){
 if(typeof token!=='string'||!TOKEN.test(token))return null;
 return createHash('sha256').update(token,'utf8').digest('hex');
}
export function createGame3DTrustedSessionAdapter141({pool}={}){
 if(typeof pool?.connect!=='function')
  throw Error('14.1 requires trusted private PostgreSQL');
 const authenticateRequest=async(req)=>{
  const value=req?.headers?.authorization;
  if(typeof value!=='string'||!value.startsWith('Bearer '))return null;
  const digest=digestPrivateWorldBearer141(value.slice(7));
  if(!digest)return null;
  const client=await pool.connect();
  try{
   const rows=await client.query(`
    SELECT owner_id,character_id
    FROM game3d_private_world_session_141
    WHERE token_sha256=$1 AND revoked_at IS NULL
      AND expires_at>clock_timestamp()
   `,[digest]);
   if(rows.rowCount!==1)return null;
   const row=rows.rows[0];
   if(!authorizedId(row?.owner_id)||!authorizedId(row?.character_id))
    return null;
   return Object.freeze({
    authenticated:true,identitySource:'trusted-server-session',
    accountId:row.owner_id,characterId:row.character_id
   });
  }catch{return null}
  finally{client.release()}
 };
 return Object.freeze({
  version:'14.1',authenticateRequest,
  privateServerOnly:true,sessionMintingEnabled:false,
  tokenDigestOnly:true,publicTransportInstalled:false,
  rewardWriterEnabled:false,productionReady:false
 });
}
