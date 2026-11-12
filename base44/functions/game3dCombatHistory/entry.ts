import {createClientFromRequest} from 'npm:@base44/sdk@0.8.23';

// Combat Foundation 4.4 — the user can read ONLY their own server-archived
// dedicated duels. No Base44 DuelSession writes, inventory, XP or rewards.
const headers={
  'Content-Type':'application/json','Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const hex=a=>[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return respond({},200);
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  try{
    const configured=Deno.env.get('GAME3D_COMBAT_HISTORY_ENABLED')==='true'&&
      Deno.env.get('GAME3D_COMBAT_REVIEW_ENABLED')==='true'&&
      Deno.env.get('GAME3D_COMBAT_ARCHIVE_ENABLED')==='true'&&
      Deno.env.get('GAME3D_COMBAT_LEDGER_ONLY_ENABLED')==='true';
    const keyText=Deno.env.get('GAME3D_COMBAT_SECRET')||'';
    const worker=Deno.env.get('GAME3D_COMBAT_HISTORY_URL')||'';
    if(!configured||keyText.length<32||
       !/^https:\/\/[^?#\s]+\/internal\/game3d\/archive-history$/.test(worker))
      return respond({error:'Archived duel history unavailable',code:'not_configured'},503);
    const sdk=createClientFromRequest(req);
    const user=await sdk.auth.me();
    if(!user?.id||typeof user.id!=='string'||user.id.length>160)
      return respond({error:'Unauthorized'},401);
    const input=await req.json().catch(()=>({}));
    if(input?.action!=='list'||input?.data?.userId!==undefined||
       input?.data?.playerId!==undefined)
      return respond({error:'Invalid history action'},422);
    const requested=input?.data?.limit;
    const limit=requested===undefined?10:requested;
    if(!Number.isSafeInteger(limit)||limit<1||limit>25)
      return respond({error:'Invalid history limit'},422);
    const url=new URL(worker);
    url.searchParams.set('playerId',user.id); // NEVER client controlled
    url.searchParams.set('limit',String(limit));
    const at=String(Date.now());
    const canonical=at+'\nGET\n'+url.pathname+url.search;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(keyText),
      {name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,
      new TextEncoder().encode(canonical))));
    const response=await fetch(url,{method:'GET',headers:{
      'x-game3d-read-time':at,'x-game3d-read-signature':signature,
      'Accept':'application/json',
    },signal:AbortSignal.timeout(6000)});
    if(!response.ok)
      return respond({error:'PostgreSQL archive unavailable',code:'archive_unavailable'},503);
    const data=await response.json();
    if(data?.source!=='postgres-archive'||data.authoritative!==true||
       data.rewardsEnabled!==false||!Array.isArray(data.history)||
       data.history.length>limit)
      return respond({error:'Invalid authoritative history response'},409);
    const history=[];
    const ids=new Set();
    for(const item of data.history){
      const review=item?.rewardReview;
      if(typeof item?.duelId!=='string'||!item.duelId||
         typeof item.resultId!=='string'||!item.resultId||
         typeof item.opponentId!=='string'||!item.opponentId||
         item.opponentId===user.id||
         !['win','loss','draw'].includes(item.personalOutcome)||
         !['win','draw'].includes(item.outcome)||
         (item.personalOutcome==='draw')!==(item.outcome==='draw')||
         item.personalOutcome==='win'&&item.winnerId!==user.id||
         item.personalOutcome==='loss'&&item.winnerId!==item.opponentId||
         item.personalOutcome==='draw'&&item.winnerId!==null||
         !Number.isSafeInteger(item.reportSequence)||item.reportSequence<1||
         !Number.isSafeInteger(item.simulationSequence)||item.simulationSequence<0||
         typeof item.archivedAt!=='string'||!Number.isFinite(Date.parse(item.archivedAt))||
         !review?.outcomeVerified||review.duelId!==item.duelId||
         review.resultId!==item.resultId||
         review.eligible!==false||review.rewardsIssued!==false||
         review.reviewStatus!=='blocked_account_unverified'||
         !Array.isArray(review.blockers)||review.blockers.length!==3||
         !['account_stats_not_verified','equipment_provenance_not_verified',
           'ranked_reward_policy_disabled'].every(x=>review.blockers.includes(x))||
         ids.has(item.duelId))
        return respond({error:'Inconsistent archived history'},409);
      ids.add(item.duelId);
      // Explicitly allowlist fields: no auth credentials, private worker
      // addresses, inventory details, stats or raw combat journals leak.
      history.push({
        duelId:item.duelId,resultId:item.resultId,
        opponentId:item.opponentId,outcome:item.personalOutcome,
        winnerId:item.winnerId,finishReason:item.finishReason,
        archivedAt:item.archivedAt,reportSequence:item.reportSequence,
        rewardStatus:'blocked_account_unverified',
        rewardBlockers:review.blockers,
        rewardsIssued:false,
      });
    }
    return respond({success:true,source:'postgres-archive',history,
      rewardPayoutsEnabled:false,
      base44SessionStatusNotUpdated:true});
  }catch(error){
    console.error('[game3dCombatHistory] secured archive read failed',error);
    return respond({error:'Archived duel history unavailable'},503);
  }
});
