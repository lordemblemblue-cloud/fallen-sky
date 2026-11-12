// Combat / Quest 17.0 — opted-in authenticated Base44 read handoff.
// Never use browser-stored quest state as trusted completion or rewards.
// The Base44 function authenticates the account and independently verifies
// character ownership before signing a private PostgreSQL-backed read.
import {callGameServer} from '../../social/socialServer';
import {getActiveId} from '../../characterStorage';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const verifiedEnabled=import.meta.env.VITE_GAME3D_QUESTBOOK_VERIFIED_READ==='true';

async function readAuthenticatedQuestbook(query={}){
 const characterId=getActiveId();
 if(typeof characterId!=='string'||!ID.test(characterId)||
    ['__default__','__anon__'].includes(characterId))
  throw Error('A saved, selected character is required for verified Questbook');
 if(query?.action!=='read'||
    !(query.knownRevision===null||
      typeof query.knownRevision==='string'&&SHA.test(query.knownRevision))||
    !(query.knownViewId===null||
      typeof query.knownViewId==='string'&&UUID.test(query.knownViewId)))
  throw Error('Invalid verified Questbook request');
 const result=await callGameServer('game3dQuestbookRead','read',{
  characterId,knownRevision:query.knownRevision,
  knownViewId:query.knownViewId
 });
 if(result?.ok!==true||result.version!=='16.9'||
    result.readOnly!==true||result.rewardsIssued!==false)
  throw Error('Verified Questbook read unavailable');
 // The 16.9 UI reconciler validates full entries, counters, NPC leads,
 // Rival privacy, reconnect generation and revision before displaying.
 return result;
}
// Disabled by default; no new public browser-to-worker network connection.
export const verifiedQuestbookReader170=verifiedEnabled
 ?readAuthenticatedQuestbook:null;
