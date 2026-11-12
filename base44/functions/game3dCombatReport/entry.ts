import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { validateDedicatedReport } from '../../shared/duelDedicatedHandoff.mjs';
import {journalPayloadFromDelivery,journalPayloadSHA256} from '../../shared/duelJournalProof.mjs';
import {validateLedgerOnlyReceipt} from '../../shared/duelLedgerReceiptPolicy.mjs';

// Dedicated worker -> Base44 only. Authenticated using an HMAC over raw body,
// not with a client access token. Workers never get Base44 service-role keys.
const headers={
  'Content-Type':'application/json','Cache-Control':'no-store',
};
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const constantCompare=(left,right)=>{
  if(left.length!==right.length)return false;
  let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
};
const hex=bytes=>[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
  if(req.method!=='POST')return result({error:'Method not allowed'},405);
  const secret=Deno.env.get('GAME3D_COMBAT_SECRET')||'';
  if(secret.length<32||Deno.env.get('GAME3D_COMBAT_AUTHORITY_ENABLED')!=='true')
    return result({error:'Reporting disabled'},503);
  try{
    const body=await req.text();
    if(body.length>16000)return result({error:'Report too large'},413);
    const signature=req.headers.get('x-game3d-signature')||'';
    if(!/^[a-f0-9]{64}$/.test(signature))return result({error:'Unauthorized'},401);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
      {name:'HMAC',hash:'SHA-256'},false,['sign']);
    const actual=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,
      new TextEncoder().encode(body))));
    if(!constantCompare(new TextEncoder().encode(signature),
      new TextEncoder().encode(actual)))return result({error:'Unauthorized'},401);
    const report=JSON.parse(body);
    if(!Number.isSafeInteger(report.at)||
       Math.abs(Date.now()-report.at)>60000)
      return result({error:'Expired report'},401);
    if(!['checkpoint','settle'].includes(report.kind)||
       typeof report.duelId!=='string'||report.duelId.length>160)
      return result({error:'Invalid report'},422);
    const base44=createClientFromRequest(req);
    const svc=base44.asServiceRole.entities;
    const duel=await svc.DuelSession.get(report.duelId).catch(()=>null);
    const ledgerOnly=Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')==='true';
    // 4.1 never allows a mismatched worker/backend pair to silently
    // downgrade a committed PostgreSQL report to a Base44 database write.
    if(ledgerOnly!== (report.ledgerOnly===true))
      return result({error:'Ledger-only authority configuration mismatch',
        code:'authority_mode_mismatch'},409);
    if(ledgerOnly){
      const proofUrl=Deno.env.get('GAME3D_COMBAT_PROOF_URL')||'';
      if(Deno.env.get('GAME3D_COMBAT_READ_ENABLED')!=='true'||
         !/^https:\/\/[^?#\s]+\/internal\/game3d\/report-proof$/.test(proofUrl))
        return result({error:'Private journal proof URL is not configured',
          code:'proof_not_configured'},503);
      if(!duel||duel.dedicated_mode!=='dedicated'||duel.status!=='active'||
         duel.dedicated_epoch!==report.epoch)
        return result({error:'Dedicated duel binding mismatch',
          code:'authority_mismatch'},409);
      const payload=journalPayloadFromDelivery(report);
      const expectedDigest=await journalPayloadSHA256(payload);
      const url=new URL(proofUrl);
      url.searchParams.set('duelId',report.duelId);
      url.searchParams.set('sequence',String(report.sequence));
      const timestamp=String(Date.now());
      const toSign=timestamp+'\nGET\n'+url.pathname+url.search;
      const requestSignature=hex(new Uint8Array(await crypto.subtle.sign('HMAC',
        key,new TextEncoder().encode(toSign))));
      const response=await fetch(url,{
        method:'GET',headers:{
          'x-game3d-read-time':timestamp,
          'x-game3d-read-signature':requestSignature,
          'Accept':'application/json',
        },signal:AbortSignal.timeout(6000),
      });
      if(!response.ok)return result({
        error:'Committed journal proof unavailable',code:'proof_unavailable',
      },503);
      const proof=await response.json();
      const verified=validateLedgerOnlyReceipt({
        duel,delivery:payload,proof,payloadDigest:expectedDigest,
      });
      if(!verified.ok)return result({error:verified.reason,
        code:verified.reason},409);
      // The durable PostgreSQL record is the source of truth. Base44 does
      // not update DuelSession, HP, winner, inventory, or XP in this mode.
      // The response merely acknowledges the exact committed journal row.
      return result({success:true,mode:'journal-only',
        projectionAcknowledged:false,
        settled:verified.settled,
        sequence:verified.sequence,resultId:verified.resultId});
    }
    const valid=validateDedicatedReport({
      duel,epoch:report.epoch,sequence:report.sequence,
      snapshot:report.snapshot,checkpoint:report.checkpoint,
      resultId:report.resultId,
    });
    if(!valid.ok)return result({error:valid.reason,code:valid.reason},409);
    if(valid.replay)return result({success:true,replay:true,
      settled:duel.status==='finished',sequence:duel.dedicated_sequence||0,
      resultId:duel.dedicated_result_id||null});
    if(report.kind==='settle'&&report.snapshot.status!=='finished')
      return result({error:'Not a terminal snapshot'},422);
    if(report.kind==='checkpoint'&&report.snapshot.status==='finished')
      return result({error:'Terminal state requires settlement'},422);
    const state=report.snapshot;
    const challenger=state.players.find(p=>p.id===duel.challenger_id);
    const opponent=state.players.find(p=>p.id===duel.opponent_id);
    if(!challenger||!opponent)return result({error:'Invalid participants'},422);
    const patch:Record<string,unknown>={
      dedicated_sequence:report.sequence,
      dedicated_checkpoint:{...report.checkpoint,snapshot:state,
        reportSequence:report.sequence},
      challenger_hp:challenger.hp,
      opponent_hp:opponent.hp,
      // Mirror worker-owned shield and position state for persistence
      // and post-match inspection; no legacy damage may change these.
      duel_shields:Object.fromEntries(state.players.map(p=>{
        const saved=report.checkpoint?.state?.actors?.find(a=>a.id===p.id);
        return [p.id,{
          current:Math.max(0,Number(p.shield)||0),
          expiresAt:Number(saved?.shield?.expiresAt)||0,
        }];
      })),
      challenger_position:{x:challenger.x,y:0,z:challenger.z,at:report.at},
      opponent_position:{x:opponent.x,y:0,z:opponent.z,at:report.at},
      last_action_at:new Date(report.at).toISOString(),
    };
    if(report.kind==='settle'){
      patch.status='finished';
      patch.finish_reason=['knockout','forfeit','timeout'].includes(state.finishReason)
        ?state.finishReason:(state.winnerId?'knockout':'timeout');
      if(state.winnerId){
        patch.winner_id=state.winnerId;
        patch.loser_id=state.winnerId===duel.challenger_id
          ?duel.opponent_id:duel.challenger_id;
      }
      patch.dedicated_result_id=report.resultId;
    }
    await svc.DuelSession.update(duel.id,patch);
    return result({success:true,settled:report.kind==='settle',
      sequence:report.sequence,resultId:report.resultId||null});
  }catch(error){
    console.error('[game3dCombatReport] reporting failed',error);
    return result({error:'Unable to persist duel report'},500);
  }
});
