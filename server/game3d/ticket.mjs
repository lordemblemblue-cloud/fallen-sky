// One-use, short-lived HMAC credentials issued only by an authenticated
// Base44 duel ticket endpoint. NEVER accept user IDs from unsigned messages.
import { createHmac, timingSafeEqual } from 'node:crypto';
const safeString=v=>typeof v==='string'&&v.length>0&&v.length<=160;
export function verifyGame3DDuelTicket(ticket,secret,{now=Date.now,seen}={}) {
  if(typeof secret!=='string'||secret.length<32)throw Error('Missing combat authority secret');
  if(typeof ticket!=='string'||ticket.length>14000)throw Error('Invalid ticket');
  const parts=ticket.split('.');
  if(parts.length!==2||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))
    throw Error('Invalid ticket encoding');
  const expected=createHmac('sha256',secret).update(parts[0]).digest();
  const submitted=Buffer.from(parts[1],'base64url');
  if(submitted.length!==expected.length||!timingSafeEqual(submitted,expected))
    throw Error('Invalid ticket signature');
  let data;
  try{data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}
  catch{throw Error('Invalid ticket JSON');}
  const time=typeof now==='function'?now():now;
  if(data?.v!==1||data.mode!=='game3d-duel'||!safeString(data.duelId)||
      !safeString(data.sub)||!safeString(data.challengerId)||!safeString(data.opponentId)||
      data.challengerId===data.opponentId||
      ![data.challengerId,data.opponentId].includes(data.sub)||
      !safeString(data.nonce)||!safeString(data.authorityEpoch)||
      !Number.isSafeInteger(data.iat)||
      !Number.isSafeInteger(data.exp)||data.exp<=time||
      data.iat>time+10000||data.exp-data.iat>30000||
      !data.challengerStats||!data.opponentStats)
    throw Error('Expired or invalid duel credential');
  // Never accept arbitrary physics, level or XP data from a packet after join.
  if(seen){
    if(seen.has(data.nonce))throw Error('Duel ticket already consumed');
    seen.set(data.nonce,data.exp);
  }
  return data;
}
