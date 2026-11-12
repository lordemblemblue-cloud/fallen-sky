import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';
import {projectCommittedDuelLifecycle} from '../../shared/duelJournalLifecycle.mjs';
import {validateCommittedDuelArchive} from '../../shared/duelArchiveProjection.mjs';

// Combat Foundation 4.0 — AUTHENTICATED READ-ONLY authoritative duel view.
// Base44 is NOT the owner of combat data in this isolated opt-in mode.
// This endpoint NEVER writes DuelSession, XP, inventory or duel rewards.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
}});
const hex=a=>[...a].map(n=>n.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return json({},200);
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  try{
    const secret=Deno.env.get('GAME3D_COMBAT_SECRET')||'';
    const gateway=Deno.env.get('GAME3D_COMBAT_READ_URL')||'';
    if(Deno.env.get('GAME3D_COMBAT_READ_ENABLED')!=='true'||
       secret.length<32||
       !/^https:\/\/[^?#\s]+\/internal\/game3d\/duel-state$/.test(gateway))
      return json({error:'Authoritative combat reads are disabled',code:'not_configured'},503);
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user?.id)return json({error:'Unauthorized'},401);
    const input=await req.json().catch(()=>({}));
    if(input?.action!=='read')return json({error:'Unsupported action'},422);
    const duelId=input?.data?.duelId;
    const lifecycleEnabled=Deno.env.get('GAME3D_COMBAT_LIFECYCLE_ENABLED')==='true';
    const archiveEnabled=Deno.env.get('GAME3D_COMBAT_ARCHIVE_ENABLED')==='true';
    if(archiveEnabled&&(!lifecycleEnabled||
       Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true'))
      return json({error:'Archive requires journal-only lifecycle reads',
        code:'archive_configuration_mismatch'},503);
    // This phase is exclusively for journal-only, read-only staging duels.
    if(lifecycleEnabled&&Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true')
      return json({error:'Journal lifecycle requires ledger-only authority',
        code:'lifecycle_config_mismatch'},503);
    if(typeof duelId!=='string'||duelId.length<1||duelId.length>160)
      return json({error:'Invalid duel ID'},422);
    const duel=await base44.asServiceRole.entities.DuelSession.get(duelId).catch(()=>null);
    const participants=[String(duel?.challenger_id||''),String(duel?.opponent_id||'')];
    if(!duel||!participants.includes(String(user.id)))
      return json({error:'Duel not found'},404);
    if(duel.dedicated_mode!=='dedicated'||!duel.dedicated_epoch)
      return json({error:'Dedicated duel authority is not active'},409);

    const url=new URL(gateway);
    url.searchParams.set('duelId',duelId);
    const timestamp=String(Date.now());
    const toSign=timestamp+'\nGET\n'+url.pathname+url.search;
    const key=await crypto.subtle.importKey('raw',
      new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const digest=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,
      new TextEncoder().encode(toSign))));
    const response=await fetch(url,{
      method:'GET',headers:{
        'x-game3d-read-time':timestamp,'x-game3d-read-signature':digest,
        'Accept':'application/json',
      },signal:AbortSignal.timeout(6000),
    });
    if(!response.ok)return json({error:'Authoritative combat state unavailable',
      code:'journal_unavailable'},503);
    const state=await response.json();
    const snap=state?.snapshot;
    if(!state?.authoritative||state.authority!=='postgres-journal'||
       state.duelId!==duelId||state.epoch!==duel.dedicated_epoch||
       !Number.isSafeInteger(state.reportSequence)||
       !Number.isSafeInteger(state.simulationSequence)||
       snap?.matchId!==duelId||
       !Array.isArray(snap.players)||snap.players.length!==2||
       new Set(snap.players.map(p=>String(p.id))).size!==2||
       !participants.every(id=>snap.players.some(p=>String(p.id)===id))||
       (snap.instanceId||null)!==(duel.dedicated_checkpoint?.instanceId||null)||
       (snap.mapId||null)!==(duel.dedicated_checkpoint?.mapId||null)||
       (snap.mapFingerprint||null)!==(duel.dedicated_checkpoint?.mapFingerprint||null))
      return json({error:'Authoritative state binding mismatch',
        code:'journal_mismatch'},409);
    let lifecycle=null;
    if(lifecycleEnabled){
      if(state.deliveryMode!=='journal-only')
        return json({error:'Journal lifecycle mode does not match committed state',
          code:'lifecycle_mode_mismatch'},409);
      const projected=projectCommittedDuelLifecycle({
        duelId,epoch:state.epoch,
        reportSequence:state.reportSequence,
        simulationSequence:state.simulationSequence,
        settled:state.settled===true,resultId:state.resultId??null,
        snapshot:snap,participants,
      });
      if(!projected.ok)return json({error:projected.reason,
        code:projected.reason},409);
      lifecycle=projected;
    }
    let archive=null;
    if(archiveEnabled){
      if(state.settled===true){
        const validated=validateCommittedDuelArchive({
          archive:state.lifecycleArchive,duel,snapshot:snap,
          epoch:state.epoch,resultId:state.resultId,
          reportSequence:state.reportSequence,
          simulationSequence:state.simulationSequence,
        });
        if(!validated.ok)return json({error:validated.reason,
          code:validated.reason},409);
        if(!lifecycle?.finished||lifecycle.winnerId!==validated.archive.winnerId||
           lifecycle.loserId!==validated.archive.loserId||
           lifecycle.resultId!==validated.archive.resultId)
          return json({error:'Archived result and journal lifecycle disagree',
            code:'archive_lifecycle_mismatch'},409);
        archive=validated.archive;
      }else if(state.lifecycleArchive){
        return json({error:'Unexpected archive for unfinished duel',
          code:'unexpected_archive'},409);
      }
    }
    return json({success:true,source:'postgres-journal',authoritative:true,
      ...(archive?{archive}:{}),
      authorityEpoch:state.epoch,
      ...(lifecycle?{lifecycle}:{}),
      reportSequence:state.reportSequence,
      simulationSequence:state.simulationSequence,
      projectionAcknowledged:state.projectionAcknowledged===true,
      deliveryAcknowledged:state.deliveryAcknowledged===true,
      deliveryMode:state.deliveryMode||'base44-projection',
      settled:state.settled===true,
      resultId:state.settled?state.resultId:null,
      snapshot:snap,
      // Always disclose stale/missing Base44 projection status to the UI;
      // never present Base44 stats as stronger than a committed journal.
      base44ProjectionMayLag:state.deliveryMode==='journal-only'||
        state.projectionAcknowledged!==true,
    });
  }catch(error){
    console.error('[game3dCombatRead] trusted read failed',error);
    return json({error:'Authoritative combat state unavailable'},503);
  }
});
