import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import {evaluateDedicatedAdmission} from '../../shared/duelAdmissionPreflight.mjs';
import {inspectStoredCharacterEvidence,validateDuelProvenancePair} from '../../shared/duelCharacterProvenance.mjs';
import {buildStandardizedDuelManifest} from '../../shared/duelBaselineLoadout.mjs';
import {inspectServerRolledUpgradeRecords,buildDuelUpgradeAudit}
  from '../../shared/duelUpgradeAudit.mjs';

// The ONLY ticket issuer for the isolated Game 3D duel authority.
// Never sign a client-supplied identity, opponent, duel status or stats.
// The same secret must be configured privately in Base44 and Railway.
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
};
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:cors});
const encodeBase64Url=value=>{
  const bytes=new TextEncoder().encode(value);
  let binary='';
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const sign=async(payload,secret)=>{
  const base=encodeBase64Url(JSON.stringify(payload));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(base)));
  let result='';
  for(const b of bytes)result+=String.fromCharCode(b);
  return base+'.'+btoa(result).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
    const secret=Deno.env.get('GAME3D_COMBAT_SECRET')||'';
    const gateway=Deno.env.get('GAME3D_COMBAT_WS_URL')||'';
    const enabled=Deno.env.get('GAME3D_COMBAT_AUTHORITY_ENABLED')==='true';
    if(!enabled||secret.length<32||!/^wss:\/\/[^?#\s]+\/game3d-duel$/.test(gateway))
      return reply({error:'Dedicated combat authority is not enabled',code:'not_configured'},503);
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user?.id)return reply({error:'Unauthorized'},401);
    const body=await req.json().catch(()=>({}));
    // callGameServer wraps function arguments as { action, data }.
    if(body?.action!=='ticket')return reply({error:'Unsupported action'},422);
    const duelId=String(body?.data?.duelId||'');
    if(!duelId||duelId.length>160)return reply({error:'Invalid duel ID'},422);
    const duel=await base44.asServiceRole.entities.DuelSession.get(duelId).catch(()=>null);
    const me=String(user.id);
    if(!duel||!['challenger_id','opponent_id'].some(key=>String(duel[key])===me))
      return reply({error:'Duel not found'},404);
    if(duel.status!=='active'||duel.dedicated_mode!=='dedicated'||
       typeof duel.dedicated_epoch!=='string'||!duel.dedicated_epoch)
      return reply({error:'Dedicated handoff is not active',code:'not_dedicated'},409);
    // 4.6: journal-only staging must ask the transactionally archived
    // database whether this duel has ALREADY finished before signing a new
    // reconnect ticket. A stale Base44 active row cannot override PostgreSQL.
    let preflightDecision=null;
    if(Deno.env.get('GAME3D_COMBAT_PREFLIGHT_ENABLED')==='true'){
      const preflightURL=Deno.env.get('GAME3D_COMBAT_PREFLIGHT_URL')||'';
      if(Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_ARCHIVE_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_READ_ENABLED')!=='true'||
         !/^https:\/\/[^?#\s]+\/internal\/game3d\/admission$/.test(preflightURL))
        return reply({error:'Dedicated admission preflight is not configured',
          code:'preflight_not_configured'},503);
      const url=new URL(preflightURL);
      url.searchParams.set('duelId',duelId);
      const at=String(Date.now());
      const canonical=at+'\nGET\n'+url.pathname+url.search;
      const key=await crypto.subtle.importKey('raw',
        new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,
        new TextEncoder().encode(canonical)));
      const signature=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
      let preflight;
      try{
        const check=await fetch(url,{
          method:'GET',headers:{
            'x-game3d-read-time':at,
            'x-game3d-read-signature':signature,
            'Accept':'application/json',
          },signal:AbortSignal.timeout(6000),
        });
        if(!check.ok)return reply({
          error:'Journal admission could not be verified',
          code:'admission_unavailable'},503);
        preflight=await check.json();
      }catch(error){
        console.warn('[Game 3D Ticket] Database preflight unavailable',error?.message);
        return reply({error:'Journal admission could not be verified',
          code:'admission_unavailable'},503);
      }
      const verdict=evaluateDedicatedAdmission({duel,preflight});
      if(!verdict.ok)return reply({
        error:verdict.code==='dedicated_match_archived'
          ?'Dedicated duel already completed in authoritative journal'
          :'Dedicated duel admission was rejected',
        code:verdict.code,
        authoritative:true,
      },409);
      // This claim is included in the HMAC-signed ticket and checked again
      // by the worker; a backend/worker flag mismatch cannot bypass preflight.
      preflightDecision={
        verified:true,status:preflight.status,
        epoch:preflight.status==='active'?preflight.epoch:null,
        reportSequence:preflight.status==='active'?preflight.reportSequence:0,
      };
    }
    let characterEvidence=null;
    if(Deno.env.get('GAME3D_COMBAT_CHARACTER_BINDING_ENABLED')==='true'){
      // This is an ownership / save-fingerprint check only. Character Vault
      // receives progress from the browser and cannot certify earned items.
      if(Deno.env.get('GAME3D_COMBAT_PREFLIGHT_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_ARCHIVE_ENABLED')!=='true')
        return reply({error:'Private character binding requires fenced journal admission',
          code:'character_provenance_not_configured'},503);
      const characterIds=[
        String(duel.challenger_character_id||''),
        String(duel.opponent_character_id||''),
      ];
      if(characterIds.some(id=>!/^[A-Za-z0-9_-]{1,128}$/.test(id)||
          ['__default__','__anon__'].includes(id)))
        return reply({error:'Both duelists must have saved characters bound',
          code:'character_provenance_missing'},409);
      let rows;
      try{
        rows=await Promise.all(
          [duel.challenger_id,duel.opponent_id].map((uid,i)=>
            base44.asServiceRole.entities.Game3DCharacterSave.filter(
              {owner_id:uid,character_id:characterIds[i]},
              '-created_date',2)
          ),
        );
      }catch(error){
        console.error('[Game 3D Ticket] Character vault lookup failed',error);
        return reply({error:'Character ownership verification unavailable',
          code:'character_provenance_unavailable'},503);
      }
      const challenger=inspectStoredCharacterEvidence({
        ownerId:duel.challenger_id,characterId:characterIds[0],rows:rows[0],
      });
      const opponent=inspectStoredCharacterEvidence({
        ownerId:duel.opponent_id,characterId:characterIds[1],rows:rows[1],
      });
      const verified=validateDuelProvenancePair({duel,challenger,opponent});
      if(!verified.ok)return reply({error:'Duel character evidence is not trustworthy',
        code:verified.code},409);
      characterEvidence={
        source:verified.source,
        challenger:verified.challenger,opponent:verified.opponent,
        combatStatsVerified:false,equipmentProvenanceVerified:false,
        rewardEligibility:'unverified_account',rewardsIssued:false,
      };
    }
    let combatLoadout=null;
    if(Deno.env.get('GAME3D_COMBAT_BASELINE_ENABLED')==='true'){
      if(Deno.env.get('GAME3D_COMBAT_CHARACTER_BINDING_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_PREFLIGHT_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true'||
         Deno.env.get('GAME3D_COMBAT_REVIEW_ENABLED')!=='true'||
         !characterEvidence)
        return reply({error:'4.8 standardized loadout requires private evidence and journal authority',
          code:'baseline_not_configured'},503);
      try{
        combatLoadout=buildStandardizedDuelManifest({
          duelId:duel.id,epoch:duel.dedicated_epoch,
          challengerId:String(duel.challenger_id),
          opponentId:String(duel.opponent_id),characterEvidence,
        });
      }catch(error){
        return reply({error:'Standardized combat build is not admissible',
          code:'baseline_validation_failed'},409);
      }
    }
    let upgradeAudit=null;
    if(Deno.env.get('GAME3D_COMBAT_UPGRADE_AUDIT_ENABLED')==='true'){
      if(Deno.env.get('GAME3D_COMBAT_BASELINE_ENABLED')!=='true'||
         !characterEvidence||!combatLoadout||!preflightDecision||
         Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')!=='true')
        return reply({error:'Server roll audit requires standardized journal-only duels',
          code:'upgrade_audit_not_configured'},503);
      let stored;
      try{
        stored=await Promise.all([
          [duel.challenger_id,duel.challenger_character_id],
          [duel.opponent_id,duel.opponent_character_id],
        ].map(([ownerId,characterId])=>
          base44.asServiceRole.entities.Game3DItemUpgrade.filter({
            owner_id:ownerId,character_id:characterId
          },'-created_date',251)));
      }catch(error){
        console.error('[Game 3D Ticket] Server upgrade ledger lookup failed',error);
        return reply({error:'Server upgrade evidence unavailable',
          code:'upgrade_evidence_unavailable'},503);
      }
      const [challenger,opponent]=await Promise.all(
        stored.map((rows,i)=>inspectServerRolledUpgradeRecords({
          ownerId:i===0?duel.challenger_id:duel.opponent_id,
          characterId:i===0?duel.challenger_character_id:duel.opponent_character_id,
          rows,
        })));
      if(!challenger.ok||!opponent.ok)
        return reply({error:'Upgrade records need review before a dedicated duel',
          code:challenger.code||opponent.code||'upgrade_audit_rejected'},409);
      try{
        upgradeAudit=buildDuelUpgradeAudit({
          duelId:duel.id,epoch:duel.dedicated_epoch,characterEvidence,
          challenger,opponent,
        });
      }catch(error){
        return reply({error:'Could not bind the server upgrade evidence',
          code:'upgrade_audit_mismatch'},409);
      }
    }
    const iat=Date.now();
    const payload={
      v:1,mode:'game3d-duel',duelId:duel.id,sub:me,
      challengerId:String(duel.challenger_id),
      opponentId:String(duel.opponent_id),
      // These are SERVER-READ, already clamped duel snapshot values.
      // A dedicated server clamps again. They are not verified
      // character progression and cannot authorize ranked rewards.
      challengerStats:duel.challenger_stats,
      opponentStats:duel.opponent_stats,
      authorityEpoch:duel.dedicated_epoch,
      ...(characterEvidence?{characterEvidence}:{}),
      ...(combatLoadout?{combatLoadout}:{}),
      ...(upgradeAudit?{upgradeAudit}:{}),
      ...(preflightDecision?{admissionPreflight:preflightDecision}:{}),
      instanceId:duel.dedicated_checkpoint?.instanceId||null,
      // Recovery snapshot was signed by the worker, never supplied by a
      // browser. A restarted worker restores server-owned HP/resources.
      checkpoint:duel.dedicated_checkpoint||null,
      iat,exp:iat+30000,nonce:crypto.randomUUID(),
    };
    if(!payload.challengerStats||!payload.opponentStats)
      return reply({error:'Duel combat stats unavailable'},409);
    const ticket=await sign(payload,secret);
    if(ticket.length>14000)return reply({error:'Checkpoint exceeds ticket size',code:'checkpoint_too_large'},503);
    return reply({success:true,protocol:1,webSocketUrl:gateway,
      ticket,expiresAt:payload.exp,mode:'opt-in-isolated'});
  }catch(error){
    console.error('[game3dCombatTicket] credential issuance failed',error);
    return reply({error:'Could not issue combat credential'},500);
  }
});
