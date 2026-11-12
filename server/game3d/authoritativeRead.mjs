// Combat Foundation 4.0: backend-only HMAC request verification for reads.
// Browser traffic is never authorized to query the authoritative database.
import {createHmac,timingSafeEqual} from 'node:crypto';

export const READ_WINDOW_MS=30000;
export function signedCombatReadInput(timestamp,pathAndQuery){
  return String(timestamp)+'\nGET\n'+pathAndQuery;
}
export function verifyCombatRead(req,secret,{now=Date.now}={}){
  const timestamp=req.headers['x-game3d-read-time'];
  const provided=req.headers['x-game3d-read-signature'];
  if(typeof secret!=='string'||secret.length<32||
     typeof timestamp!=='string'||!/^\d{13}$/.test(timestamp)||
     Math.abs(now()-Number(timestamp))>READ_WINDOW_MS||
     typeof provided!=='string'||!/^[a-f0-9]{64}$/.test(provided))
    return false;
  const expected=createHmac('sha256',secret)
    .update(signedCombatReadInput(timestamp,req.url)).digest();
  const found=Buffer.from(provided,'hex');
  return found.length===expected.length&&timingSafeEqual(found,expected);
}
