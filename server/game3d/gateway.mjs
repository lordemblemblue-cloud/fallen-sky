import {combatFoundationHealthDisclosure} from './combatFoundationManifest.mjs';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createGame3DDuelMatch, MATCH_RULES } from './authority.mjs';
import { verifyGame3DDuelTicket } from './ticket.mjs';
import { createDuelReportSender } from './reporting.mjs';
import { createTerminalOutbox } from './terminalOutbox.mjs';
import { configuredGame3DMapCollision } from './mapCollision.mjs';
import {verifyCombatRead} from './authoritativeRead.mjs';
import {verifySignedCharacterEvidence} from '../../base44/shared/duelCharacterProvenance.mjs';
import {verifyStandardizedDuelManifest} from '../../base44/shared/duelBaselineLoadout.mjs';
import {verifyDuelUpgradeAudit} from '../../base44/shared/duelUpgradeAudit.mjs';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {duelWorldSpawnPreset,validateDuelWorldSpawnPreset} from '../../base44/shared/duelWorldSpawnPreset.mjs';
import { axeStrikeOutcomes, clampAXEDuelStats, rollAXEStrike } from '../../base44/shared/axePowerBudget.ts';

const MAX_PACKET_BYTES=16384;
const MAX_COMMAND_BYTES=4096;
const MAX_PACKETS_PER_SEC=45;
const HELLO_TIMEOUT_MS=9000;
const RETAIN_MATCH_MS=180000;
const MAX_MATCHES=100;

function resolveSharedAxeStrike({attacker,defender,skillMultiplier,isSkill,targetHpPct,
  criticalAllowed}){
  const hero={...attacker};
  if(criticalAllowed===false)hero.critChance=0;
  const strike=rollAXEStrike(axeStrikeOutcomes(hero,defender,{
    pvp:true,skillMultiplier,isSkill,targetHpPct,
  }),Math.random());
  return {
    damage:strike.kind==='hit'?strike.damage:0,
    critical:!!strike.critical,blocked:!!strike.blocked,
    reflected:strike.reflected||0,lifeSteal:strike.lifeSteal||0,
  };
}

export function createGame3DDuelGateway({
  secret,origins=[],reportUrl,mapId=null,requireInstanceBinding=false,
  spawnPresetId=null,outboxDir=null,transactionalLedger=null,
  authoritativeReadsEnabled=false,ledgerOnlyEnabled=false,
  lifecycleArchiveEnabled=false,rewardReviewEnabled=false,
  admissionPreflightEnabled=false,
  characterBindingEnabled=false,standardizedLoadoutEnabled=false,
  upgradeAuditEnabled=false,
  questbookRoute=null,questActionRoute=null,
  reportFetch=fetch,port=0,host='0.0.0.0',now=Date.now,
  resolveStrike=resolveSharedAxeStrike,
}={}){
  if(typeof secret!=='string'||secret.length<32)
    throw Error('GAME3D_COMBAT_SECRET (32+ characters) required');
  if(!Array.isArray(origins)||!origins.length)
    throw Error('GAME3D_ALLOWED_ORIGINS must explicitly allow browser origins');
  const report=createDuelReportSender({
    url:reportUrl,secret,fetchImpl:reportFetch,now,
  });
  // Never select a map based on browser packets. The private deployment
  // configuration must match the Base44 checkpoint's signed map binding.
  const mapWorld=configuredGame3DMapCollision(mapId);
  if(spawnPresetId && (!requireInstanceBinding||
      !duelWorldSpawnPreset(spawnPresetId)||
      duelWorldSpawnPreset(spawnPresetId).mapId!==mapWorld?.id))
    throw Error('Trusted spawn preset requires matching map and instance binding');
  // A local outbox is not a cross-replica transaction. Refuse ambiguous
  // dual staging destinations rather than silently preferring one.
  if(transactionalLedger&&outboxDir)
    throw Error('PG transactional ledger and local outbox cannot be combined');
  if(transactionalLedger&&!requireInstanceBinding)
    throw Error('PG staging ledger requires signed duel-instance binding');
  if(authoritativeReadsEnabled&&(!transactionalLedger?.journalEnabled))
    throw Error('Authoritative read mode requires committed PG journal');
  if(ledgerOnlyEnabled&&(!transactionalLedger?.journalEnabled||
      !transactionalLedger?.ledgerOnlyEnabled||!authoritativeReadsEnabled||
      !requireInstanceBinding))
    throw Error('Ledger-only requires PG journal, signed reads and instance binding');
  if(lifecycleArchiveEnabled&&(!ledgerOnlyEnabled||
      !transactionalLedger?.lifecycleArchiveEnabled||
      !authoritativeReadsEnabled))
    throw Error('Lifecycle archive requires enabled journal-only authority and reads');
  if(rewardReviewEnabled&&(!lifecycleArchiveEnabled||
      !transactionalLedger?.rewardReviewEnabled||!authoritativeReadsEnabled||
      !ledgerOnlyEnabled))
    throw Error('4.4 reward review requires private archive and journal-only reads');
  if(admissionPreflightEnabled&&(!lifecycleArchiveEnabled||
      !ledgerOnlyEnabled||!transactionalLedger?.inspectAdmission||
      !authoritativeReadsEnabled||!requireInstanceBinding))
    throw Error('4.6 admission preflight requires private archived journal authority');
  if(characterBindingEnabled&&(!admissionPreflightEnabled||
      !requireInstanceBinding||!ledgerOnlyEnabled))
    throw Error('4.7 character binding requires fenced signed journal admission');
  if(standardizedLoadoutEnabled&&(!characterBindingEnabled||
      !transactionalLedger?.standardizedLoadoutEnabled||
      !admissionPreflightEnabled||!ledgerOnlyEnabled||
      !lifecycleArchiveEnabled||!rewardReviewEnabled))
    throw Error('4.8 baseline requires private PG journal, archive, account binding and reward review');
  if(upgradeAuditEnabled&&(!standardizedLoadoutEnabled||
      !transactionalLedger?.upgradeAuditEnabled||!ledgerOnlyEnabled||
      !characterBindingEnabled||!admissionPreflightEnabled))
    throw Error('4.9 upgrade audit requires signed standardized PG authority');
  if(questbookRoute!==null&&
     (questbookRoute.version!=='17.0'||typeof questbookRoute.handle!=='function'||
      questbookRoute.requiresSignedBackend!==true||
      questbookRoute.publicBrowserCredentialAccepted!==false||
      questbookRoute.questWritesEnabled!==false))
    throw Error('17.0 Questbook mount must be signed and read-only');
  if(questActionRoute!==null&&
     (questActionRoute.version!=='17.4'||
      typeof questActionRoute.handle!=='function'||
      questActionRoute.requiresSignedBackend!==true||
      questActionRoute.publicBrowserCredentialAccepted!==false||
      questActionRoute.rewardsIssued!==false||
      !questbookRoute))
    throw Error('17.4 requires signed private actions and enabled Questbook reads');
  const outbox=createTerminalOutbox({directory:outboxDir,report});
  const revokeRoom=(id,room)=>{
    room.leaseValidUntil=0;
    for(const socket of room.clients.values())deny(socket,'Duel ownership lost');
    games.delete(id);
  };
  let replayActive=false;
  const replayRestored=async()=>{
    if(replayActive)return;
    replayActive=true;
    try{
      if(transactionalLedger){
        for(const pending of await transactionalLedger.pending()){
          // A live room is already handling its own terminal retry.
          if([...games.values()].some(r=>r.pendingReport?.resultId===pending.resultId))
            continue;
          try{
            const answer=await report(pending);
            if(answer.settled!==true||
                (ledgerOnlyEnabled&&answer.mode!=='journal-only'))
              throw Error('Terminal acknowledgment authority mismatch');
            if(transactionalLedger.journalEnabled)
              await transactionalLedger.ackReport(pending,
                {mode:ledgerOnlyEnabled?'journal-only':'base44-projection'});
            else await transactionalLedger.ack(pending);
          }catch(error){
            console.warn('[Game 3D Authority] PG settlement replay pending',error?.message);
          }
        }
      }else await outbox.replayRestored();
    }catch(err){
      console.error('[Game 3D Authority] terminal outbox replay deferred',err?.message);
    }finally{replayActive=false;}
  };
  const allowedOrigins=new Set(origins);
  const games=new Map(), consumed=new Map(), sessions=new Map();
  const creating=new Set();
  const send=(ws,message)=>{
    if(ws.readyState!==WebSocket.OPEN)return false;
    if(ws.bufferedAmount>262144){
      ws.close(1013,'Slow consumer');return false;
    }
    try{ws.send(JSON.stringify(message));return true;}catch{return false;}
  };
  const deny=(ws,message)=>{
    send(ws,{t:'error',reason:message});
    ws.close(1008,String(message).slice(0,100));
  };
  const http=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    // 17.4: separate HMAC-only POST for explicit server-authorized intent.
    // Never expose the write service through the browser's duel socket.
    if(req.url?.startsWith('/internal/game3d/quest-action')){
      if(!questActionRoute){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      try{await questActionRoute.handle(req,res)}
      catch{
        if(!res.headersSent){
         res.writeHead(503);
         res.end(JSON.stringify({error:'Quest action authority unavailable'}));
        }
      }
      return;
    }
    // 17.0 is a server-to-server, HMAC-only POST boundary. Never fall back
    // to browser tokens or duel WebSocket identity for Questbook ownership.
    if(req.url?.startsWith('/internal/game3d/questbook')){
      if(!questbookRoute){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      try{await questbookRoute.handle(req,res)}
      catch{
        if(!res.headersSent){
         res.writeHead(503);
         res.end(JSON.stringify({error:'Questbook authority unavailable'}));
        }
      }
      return;
    }
    // The ticket issuer calls this BEFORE issuing an admission credential.
    // HMAC blocks browser access; database failures deny tickets, never
    // fall back to the potentially stale Base44 DuelSession active status.
    if(req.method==='GET'&&req.url?.startsWith('/internal/game3d/admission?')){
      if(!admissionPreflightEnabled||!verifyCombatRead(req,secret,{now})){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      try{
        const u=new URL(req.url,'http://localhost');
        const keys=[...u.searchParams.keys()];
        const duelId=u.searchParams.get('duelId');
        if(keys.length!==1||keys[0]!=='duelId'||
           !duelId||duelId.length>160){
          res.writeHead(422);res.end(JSON.stringify({error:'Invalid duel ID'}));return;
        }
        const admission=await transactionalLedger.inspectAdmission(duelId);
        res.writeHead(200);res.end(JSON.stringify(admission));return;
      }catch(error){
        console.error('[Game 3D Authority] Admission preflight denied',error?.message);
        res.writeHead(503);res.end(JSON.stringify({error:'Admission authority unavailable'}));return;
      }
    }
    // 4.4 participant history is served ONLY to a signed backend. The
    // public browser never chooses an identity on this route; Base44 uses
    // its authenticated account and signs the exact request target.
    if(req.method==='GET'&&req.url?.startsWith('/internal/game3d/archive-history?')){
      if(!rewardReviewEnabled||!verifyCombatRead(req,secret,{now})){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      try{
        const u=new URL(req.url,'http://localhost');
        const keys=[...u.searchParams.keys()];
        const playerId=u.searchParams.get('playerId');
        const limitValue=u.searchParams.get('limit');
        const limit=Number(limitValue);
        if(keys.length!==2||keys[0]!=='playerId'||keys[1]!=='limit'||
           !playerId||playerId.length>160||
           !/^[1-9][0-9]*$/.test(limitValue||'')||
           !Number.isSafeInteger(limit)||limit>25){
          res.writeHead(422);res.end(JSON.stringify({error:'Invalid history query'}));return;
        }
        const history=await transactionalLedger.listArchivedForPlayer(playerId,limit);
        res.writeHead(200);res.end(JSON.stringify({
          source:'postgres-archive',authoritative:true,
          rewardsEnabled:false,history,
        }));return;
      }catch(error){
        console.error('[Game 3D Authority] History read failed',error?.message);
        res.writeHead(503);res.end(JSON.stringify({error:'Archived history unavailable'}));return;
      }
    }
    // The Base44 receipt endpoint validates this committed row BEFORE
    // acknowledging delivery. No Base44 combat state is written in this
    // isolated 4.1 opt-in mode.
    if(req.method==='GET'&&req.url?.startsWith('/internal/game3d/report-proof?')){
      if(!ledgerOnlyEnabled||!verifyCombatRead(req,secret,{now})){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      try{
        const url=new URL(req.url,'http://localhost');
        const params=[...url.searchParams.keys()];
        const duelId=url.searchParams.get('duelId');
        const sequence=Number(url.searchParams.get('sequence'));
        if(params.length!==2||params[0]!=='duelId'||params[1]!=='sequence'||
           !duelId||duelId.length>160||!Number.isSafeInteger(sequence)||sequence<1){
          res.writeHead(422);res.end(JSON.stringify({error:'Invalid report identity'}));return;
        }
        const proof=await transactionalLedger.proveReport(duelId,sequence);
        if(!proof){res.writeHead(404);res.end(JSON.stringify({error:'Uncommitted report'}));return;}
        res.writeHead(200);res.end(JSON.stringify({success:true,...proof}));return;
      }catch(error){
        console.error('[Game 3D Authority] Report proof failed',error?.message);
        res.writeHead(503);res.end(JSON.stringify({error:'Proof unavailable'}));return;
      }
    }
    // Only the authenticated Base44 backend may read the journal. This
    // endpoint never accepts a browser access token or client-chosen stats.
    if(req.method==='GET'&&req.url?.startsWith('/internal/game3d/duel-state?')){
      if(!authoritativeReadsEnabled||!verifyCombatRead(req,secret,{now})){
        res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;
      }
      let url;
      try{url=new URL(req.url,'http://localhost');}
      catch{res.writeHead(422);res.end(JSON.stringify({error:'Invalid path'}));return;}
      const names=[...url.searchParams.keys()];
      const duelId=url.searchParams.get('duelId');
      if(names.length!==1||names[0]!=='duelId'||typeof duelId!=='string'||
         duelId.length<1||duelId.length>160){
        res.writeHead(422);res.end(JSON.stringify({error:'Invalid duel ID'}));return;
      }
      try{
        const state=await transactionalLedger.readLatest(duelId);
        if(!state){res.writeHead(404);res.end(JSON.stringify({error:'No committed combat state'}));return;}
        res.writeHead(200);res.end(JSON.stringify(state));return;
      }catch(error){
        console.error('[Game 3D Authority] Journal read failed',error?.message);
        res.writeHead(503);res.end(JSON.stringify({error:'Authoritative state unavailable'}));return;
      }
    }
    if(req.method==='GET'&&req.url==='/health'){
      res.writeHead(200);res.end(JSON.stringify({
        ...combatFoundationHealthDisclosure(),
        ready:true,protocol:2,mode:'dedicated-consensual',
        mapId:mapWorld?.id||null,
        mapFingerprint:mapWorld?.fingerprint||null,
        instanceBindingRequired:requireInstanceBinding,
        spawnPresetId,
        reportConfigured:true,activeMatches:games.size,
        transactionalLedger:transactionalLedger?'staging-only':'disabled',
        checkpointJournal:transactionalLedger?.journalEnabled?'staging-only':'disabled',
        authoritativeReadsEnabled,
        ledgerOnlyEnabled,
        lifecycleArchiveEnabled,rewardReviewEnabled,
        admissionPreflightEnabled,
        characterBindingEnabled,
        standardizedLoadoutEnabled,upgradeAuditEnabled,
        settlementOutbox:outbox.enabled?'configured':'disabled',
        pendingSettlementRecords:outbox.pendingCount(),
        waitingForDurability:[...games.values()].filter(r=>
          r.game.status()==='finished'&&!r.reportedFinal).length,
      }));
    }else{res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));}
  });
  const wss=new WebSocketServer({
    noServer:true,maxPayload:MAX_PACKET_BYTES,perMessageDeflate:false,
  });
  http.on('upgrade',(req,socket,head)=>{
    let url;
    try{url=new URL(req.url,'http://localhost');}catch{socket.destroy();return;}
    if(url.pathname!=='/game3d-duel'||url.search||!allowedOrigins.has(req.headers.origin)){
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  const listeners=new Set();
  wss.on('connection',ws=>{
    listeners.add(ws);
    let uid=null,room=null,packetWindow=now(),packetCount=0,admitting=false;
    const timeout=setTimeout(()=>{if(!uid)deny(ws,'Authentication timeout');},HELLO_TIMEOUT_MS);
    ws.on('message',async data=>{
      try{
      if(data.length>MAX_PACKET_BYTES)return deny(ws,'Message too large');
      if(uid&&data.length>MAX_COMMAND_BYTES)return deny(ws,'Command too large');
      const current=now();
      if(current-packetWindow>=1000){packetWindow=current;packetCount=0;}
      if(++packetCount>MAX_PACKETS_PER_SEC)return deny(ws,'Rate limit exceeded');
      let packet;
      try{packet=JSON.parse(data.toString('utf8'));}
      catch{return deny(ws,'Malformed JSON');}
      if(!packet||typeof packet!=='object'||Array.isArray(packet))
        return deny(ws,'Invalid packet');
      if(!uid){
        if(admitting)return deny(ws,'Admission in progress');
        admitting=true;
        try{
        if(packet.t!=='hello'||packet.protocol!==1)return deny(ws,'Hello required');
        let ticket;
        try{ticket=verifyGame3DDuelTicket(packet.ticket,secret,{now,seen:consumed});}
        catch{return deny(ws,'Invalid duel credential');}
        if(characterBindingEnabled){
          const validEvidence=verifySignedCharacterEvidence(ticket);
          if(!validEvidence.ok)
            return deny(ws,'Unverified duelist character binding');
        }else if(ticket.characterEvidence!==undefined){
          return deny(ws,'Character binding mode mismatch');
        }
        let loadout=null;
        if(standardizedLoadoutEnabled){
          const verified=verifyStandardizedDuelManifest(ticket);
          if(!verified.ok)return deny(ws,'Invalid or modified fixed combat manifest');
          loadout=verified.manifest;
        }else if(ticket.combatLoadout!==undefined){
          return deny(ws,'Combat loadout flag mismatch');
        }
        let upgradeAudit=null;
        if(upgradeAuditEnabled){
          const checked=verifyDuelUpgradeAudit(ticket);
          if(!checked.ok)return deny(ws,'Invalid server-held item upgrade audit');
          upgradeAudit=checked.audit;
        }else if(ticket.upgradeAudit!==undefined){
          return deny(ws,'Item upgrade audit flag mismatch');
        }
        const preflight=ticket.admissionPreflight;
        if(admissionPreflightEnabled){
          if(preflight?.verified!==true||
             !['absent','active'].includes(preflight.status)||
             !Number.isSafeInteger(preflight.reportSequence)||
             preflight.reportSequence<0||
             (preflight.status==='active'&&(
               preflight.epoch!==ticket.authorityEpoch))||
             (preflight.status==='absent'&&(
               preflight.epoch!==null||preflight.reportSequence!==0)))
            return deny(ws,'Signed journal preflight missing or invalid');
        }else if(preflight!==undefined){
          return deny(ws,'Admission preflight configuration mismatch');
        }
        room=games.get(ticket.duelId);
        if(standardizedLoadoutEnabled&&room&&
           room.loadoutCanonical!==stableJournalJSON(loadout))
          return deny(ws,'Character build changed during active duel');
        if(upgradeAuditEnabled&&room&&
           room.upgradeAuditCanonical!==stableJournalJSON(upgradeAudit))
          return deny(ws,'Server item upgrade history changed during duel');
        // A short-lived preflighted ticket may predate the terminal tick.
        // Never let it rejoin an already-finished in-memory room.
        if(admissionPreflightEnabled&&room?.game?.status()==='finished')
          return deny(ws,'Duel has already finished');
        // Fail closed on absent/mismatched backend-signed map context.
        // No fallback to flat arena if this worker is configured for maps.
        if((ticket.checkpoint?.mapId||null)!==(mapWorld?.id||null))
          return deny(ws,'Dedicated map binding mismatch');
        if(requireInstanceBinding && (
          typeof ticket.instanceId!=='string' ||
          ticket.instanceId!==ticket.checkpoint?.instanceId ||
          !/^[a-zA-Z0-9_-]{12,72}$/.test(ticket.instanceId) ||
          (mapWorld && ticket.checkpoint?.mapFingerprint!==mapWorld.fingerprint)
        ))return deny(ws,'Dedicated instance or map revision mismatch');
        const verifiedSpawn=validateDuelWorldSpawnPreset(ticket.checkpoint,
          spawnPresetId,[ticket.challengerId,ticket.opponentId]);
        if(!verifiedSpawn.ok)return deny(ws,'Dedicated spawn preset mismatch');
        if(!room && outbox.hasPendingDuel(ticket.duelId))
          return deny(ws,'Settlement recovery is pending');
        if(!room){
          if(transactionalLedger&&creating.has(ticket.duelId))
            return deny(ws,'Duel admission already in progress');
          if(transactionalLedger)creating.add(ticket.duelId);
          try{
          if(games.size>=MAX_MATCHES)return deny(ws,'Match capacity reached');
          // The standardized worker ruleset replaces, rather than clamps,
          // previously client-reported competitive stats in 4.8 preview.
          const attacker=clampAXEDuelStats(standardizedLoadoutEnabled
            ?loadout.stats:ticket.challengerStats);
          const defender=clampAXEDuelStats(standardizedLoadoutEnabled
            ?loadout.stats:ticket.opponentStats);
          let lease=null,stored=null;
          if(transactionalLedger){
            lease=await transactionalLedger.acquire(ticket.duelId,
              ticket.authorityEpoch);
            if(!lease)return deny(ws,'Duel owned or previously settled');
            if(ws.readyState!==WebSocket.OPEN)return;
            if(standardizedLoadoutEnabled)
              await transactionalLedger.bindLoadout(loadout,lease,
                {upgradeAudit});
            if(transactionalLedger.journalEnabled)
              stored=await transactionalLedger.restoreReport(lease);
          }
          let checkpoint=ticket.checkpoint;
          if(transactionalLedger?.journalEnabled){
            if(stored){
              const p=stored.payload;
              // The signed ticket binds immutable instance/map context, while
              // the database supplies the latest *server-written* actor state.
              // Never use a checkpoint from another map or another duel pair.
              const trusted=ticket.checkpoint;
              const old=p.checkpoint;
              const pair=[ticket.challengerId,ticket.opponentId];
              if(p.duelId!==ticket.duelId||p.epoch!==ticket.authorityEpoch||
                 old?.instanceId!==trusted?.instanceId||
                 old?.mapId!==trusted?.mapId||
                 old?.mapFingerprint!==trusted?.mapFingerprint||
                 old?.spawnPresetId!==trusted?.spawnPresetId||
                 old?.worldOrigin?.x!==trusted?.worldOrigin?.x||
                 old?.worldOrigin?.z!==trusted?.worldOrigin?.z||
                 !Array.isArray(old?.state?.actors)||
                 old.state.actors.length!==2||
                 !pair.every(id=>old.state.actors.some(a=>a.id===id))||
                 !Array.isArray(p.snapshot?.players)||
                 p.snapshot.players.length!==2||
                 !pair.every(id=>p.snapshot.players.some(a=>a.id===id))||
                 p.snapshot?.matchId!==ticket.duelId||
                 p.snapshot?.status==='finished')
                return deny(ws,'Persisted duel checkpoint binding mismatch');
              checkpoint={...old,reportSequence:p.sequence};
            }else if(Number(ticket.checkpoint?.reportSequence||0)!==0){
              // Do not silently migrate a partially completed 3.8 match
              // into an empty 3.9 journal with an older initial state.
              return deny(ws,'New journal requires a fresh dedicated duel');
            }
          }
          // 4.8 standardized *fresh* duels never import browser-derived
          // legacy HP/shields/cooldowns. Prior authoritative PG journal
          // checkpoints remain the only recovery source for an existing duel.
          if(standardizedLoadoutEnabled&&!stored){
            if(checkpoint?.state?.sequence!==0||
               checkpoint?.reportSequence!==0||
               checkpoint?.state?.status!=='active'||
               !Array.isArray(checkpoint.state.actors)||
               checkpoint.state.actors.length!==2||
               ![ticket.challengerId,ticket.opponentId].every(id=>
                 checkpoint.state.actors.some(a=>a.id===id)))
              return deny(ws,'Standardized preview requires a fresh dedicated checkpoint');
            checkpoint={...checkpoint,state:{
              ...checkpoint.state,winnerId:null,
              actors:checkpoint.state.actors.map(a=>({
                ...a,hp:loadout.stats.maxHP,stamina:100,will:100,
                shield:null,shieldReadyAt:0,lastBasicAt:0,lastIntentSeq:0,
                cooldowns:[],
              })),
            }};
          }
          let game;
          try{
            game=createGame3DDuelMatch({
              id:ticket.duelId,challengerId:ticket.challengerId,
              opponentId:ticket.opponentId,challengerStats:attacker,
              opponentStats:defender,checkpoint,
              mapWorld,resolveStrike,now,
            });
          }catch{
            return deny(ws,'Invalid dedicated map checkpoint');
          }
          room={game,clients:new Map(),authorityEpoch:ticket.authorityEpoch,
            ...(standardizedLoadoutEnabled?{
              loadoutCanonical:stableJournalJSON(loadout)}:{}),
            ...(upgradeAuditEnabled?{
              upgradeAuditCanonical:stableJournalJSON(upgradeAudit)}:{}),
            lease,leaseValidUntil:lease?now()+6000:0,
            lastBroadcastSeq:0,lastSnapshotAt:0,createdAt:current,lastSeenAt:current,
            reportSeq:stored?(stored.acked?stored.payload.sequence:stored.payload.sequence-1):
              Number(checkpoint?.reportSequence)||0,
            lastReportAt:0,reporting:false,reportedFinal:false,retryAt:0,
            pendingReport:stored&&!stored.acked?stored.payload:null,
            recovering:!!(stored&&!stored.acked)};
          games.set(ticket.duelId,room);
          }finally{if(transactionalLedger)creating.delete(ticket.duelId);}
        }else if(room.authorityEpoch!==ticket.authorityEpoch||
          room.game.instanceId!==(ticket.checkpoint?.instanceId||null)||
          room.game.mapFingerprint!==(ticket.checkpoint?.mapFingerprint||null)||
          room.game.spawnPresetId!==(ticket.checkpoint?.spawnPresetId||null)||
          !room.game.get(ticket.sub)||
          !room.game.get(ticket.challengerId)||!room.game.get(ticket.opponentId))
          return deny(ws,'Duel participant mismatch');
        if(transactionalLedger&&(!room.lease||now()>=room.leaseValidUntil))
          return deny(ws,'Duel ownership expired during admission');
        uid=ticket.sub;
        const previous=room.clients.get(uid);
        // New verified ticket replaces a stale connection; only that socket
        // may subsequently move or attack as this participant.
        room.clients.set(uid,ws);
        sessions.set(ws,{uid,room});
        room.game.setConnected(uid,true);
        room.lastSeenAt=current;
        if(previous&&previous!==ws)previous.close(4001,'Reconnected elsewhere');
        clearTimeout(timeout);
        send(ws,{t:'welcome',protocol:1,playerId:uid,matchId:ticket.duelId,
          snapshot:room.game.snapshot(),events:room.game.getEventsAfter(0)});
        return;
        }finally{admitting=false;}
      }
      if(transactionalLedger&&(!room?.lease||now()>=room.leaseValidUntil))
        return deny(ws,'Duel ownership lease expired');
      if(room.clients.get(uid)!==ws)return deny(ws,'Superseded connection');
      if(room.recovering&&(packet.t==='input'||packet.t==='command')){
        send(ws,{t:'rejected',reason:'Persisted checkpoint reconciliation pending'});
        return;
      }
      room.lastSeenAt=current;
      if(packet.t==='input'){
        const result=room.game.setInput(uid,packet);
        if(!result.ok)send(ws,{t:'rejected',source:'input',reason:result.reason});
      }else if(packet.t==='command'){
        const result=room.game.submit(uid,packet.command);
        if(!result.ok)send(ws,{t:'rejected',source:'command',
          intentId:packet.command?.intentId||null,reason:result.reason});
      }else if(packet.t==='ping'){
        send(ws,{t:'pong',serverTime:current,
          id:Number.isSafeInteger(packet.id)?packet.id:null});
      }else if(packet.t==='events'){
        const seq=Number.isSafeInteger(packet.afterSeq)&&packet.afterSeq>=0?
          packet.afterSeq:0;
        send(ws,{t:'events',events:room.game.getEventsAfter(seq)});
      }else if(packet.t==='leave')ws.close(1000,'Duel closed');
      else send(ws,{t:'error',reason:'Unsupported command'});
      }catch(err){
        console.error('[Game 3D Authority] admission/command rejected',err?.message);
        deny(ws,'Combat authority unavailable');
      }
    });
    ws.on('close',()=>{
      clearTimeout(timeout);
      listeners.delete(ws);
      const session=sessions.get(ws);
      sessions.delete(ws);
      if(session&&session.room.clients.get(session.uid)===ws){
        session.room.clients.delete(session.uid);
        session.room.game.setConnected(session.uid,false);
        session.room.lastSeenAt=now();
      }
    });
    ws.on('error',()=>{});
  });
  const sim=setInterval(()=>{
    const time=now();
    for(const [id,room] of games){
      // Fail closed locally well before the database's 15s lease deadline.
      // A stalled process cannot keep simulating on a stale lease.
      if(transactionalLedger&&time>=room.leaseValidUntil){
        revokeRoom(id,room);continue;
      }
      const results=room.recovering?[]:room.game.tick(time);
      for(const result of results){
        const ws=room.clients.get(result.uid);
        if(ws)send(ws,{t:'command_result',...result});
      }
      const events=room.game.getEventsAfter(room.lastBroadcastSeq);
      if(events.length){
        room.lastBroadcastSeq=events.at(-1).seq;
        for(const ws of room.clients.values())send(ws,{t:'events',events});
      }
      const finished=room.game.status()==='finished';
      if(!room.reporting&&time>=room.retryAt&&
          ((finished&&!room.reportedFinal)||room.pendingReport||
           (!finished&&time-room.lastReportAt>=2000))) {
        room.reporting=true;
        // Keep a single *identical* report while its HTTP acknowledgment is
        // uncertain. If a checkpoint is pending when combat ends, finish
        // acknowledging it before creating the terminal record with seq+1.
        const sequence=room.reportSeq+1;
        if(!room.pendingReport){
          const snapshot=room.game.snapshot();
          const kind=finished?'settle':'checkpoint';
          room.pendingReport={
            duelId:id,epoch:room.authorityEpoch,kind,sequence,
            ...(ledgerOnlyEnabled?{ledgerOnly:true}:{}),
            snapshot,checkpoint:{
              state:room.game.checkpointState(),
              worldOrigin:room.game.worldOrigin,mapId:room.game.mapId,
              ...(room.game.instanceId?{instanceId:room.game.instanceId}:{}),
              ...(room.game.mapFingerprint?{mapFingerprint:room.game.mapFingerprint}:{}),
              ...(room.game.spawnPresetId?{spawnPresetId:room.game.spawnPresetId}:{}),
            },
            ...(finished?{resultId:id+':'+room.authorityEpoch+':'+snapshot.seq}:{}),
          };
        }
        const payload=room.pendingReport;
        const settling=payload.kind==='settle';
        // Stage terminal result on the configured persistent volume BEFORE
        // the HTTP attempt. A restart can then replay it without resurrecting
        // a duel from an older backend checkpoint.
        Promise.resolve().then(async()=>{
          if(transactionalLedger&&time>=room.leaseValidUntil)
            throw Error('Expired ownership lease');
          const stable=transactionalLedger?.journalEnabled
            ?await transactionalLedger.recordReport(payload,room.lease)
            :(settling
              ?(transactionalLedger
                ? await transactionalLedger.stage(payload,room.lease)
                : outbox.stage(payload)):payload);
          // This check is conservative but cannot fence Base44 itself;
          // its reporting endpoint still lacks atomic database verification.
          if(transactionalLedger&&now()>=room.leaseValidUntil)
            throw Error('Ownership lease expired before report');
          return report(stable).then(async result=>{
            if(ledgerOnlyEnabled&&result.mode!=='journal-only')
              throw Error('Expected journal-only receipt, Base44 projection not allowed');
            if(settling && !result.settled)throw Error('Terminal report not acknowledged');
            if(settling){
              if(transactionalLedger?.journalEnabled)
                await transactionalLedger.ackReport(stable,
                  {mode:ledgerOnlyEnabled?'journal-only':'base44-projection'});
              else if(transactionalLedger)await transactionalLedger.ack(stable);
              else outbox.ack(stable);
            }
            if(transactionalLedger?.journalEnabled&&!settling)
              await transactionalLedger.ackReport(stable,
                {mode:ledgerOnlyEnabled?'journal-only':'base44-projection'});
            room.pendingReport=null;
            room.recovering=false;
            room.reportSeq=payload.sequence;
            room.lastReportAt=now();
            room.retryAt=0;
            if(settling)room.reportedFinal=true;
          });
        }).catch(err=>{
          // Never treat an unacknowledged knockout as durably settled.
          room.retryAt=now()+3000;
          console.error('[Game 3D Authority] Duel checkpoint/settlement pending',
            id,err?.message);
        }).finally(()=>{room.reporting=false;});
      }
      if(time-room.lastSnapshotAt>=MATCH_RULES.snapshotMs){
        const state=room.game.snapshot();
        for(const ws of room.clients.values())send(ws,state);
        room.lastSnapshotAt=time;
      }
      if(room.clients.size===0&&time-room.lastSeenAt>RETAIN_MATCH_MS&&
          (room.game.status()!=='finished'||room.reportedFinal))
        games.delete(id);
    }
    for(const [nonce,expiry] of consumed)if(expiry<=time)consumed.delete(nonce);
  },MATCH_RULES.tickMs);
  sim.unref?.();
  const recoveryTimer=setInterval(()=>{void replayRestored();},3000);
  recoveryTimer.unref?.();
  let heartbeatBusy=false;
  const leaseTimer=transactionalLedger?setInterval(async()=>{
    if(heartbeatBusy)return;
    heartbeatBusy=true;
    try{
      for(const [id,room] of games){
        try{
          if(!room.lease || now()>=room.leaseValidUntil ||
              !await transactionalLedger.renew(room.lease)){
            revokeRoom(id,room);continue;
          }
          room.leaseValidUntil=now()+6000;
        }catch(err){
          console.error('[Game 3D Authority] lease renewal failed',id,err?.message);
          revokeRoom(id,room);
        }
      }
    }finally{heartbeatBusy=false;}
  },3000):null;
  leaseTimer?.unref?.();
  return {
    games,
    listen:async()=>{
      // Read and validate the persisted outbox BEFORE accepting WebSockets.
      // Failure to load the outbox is a hard startup failure in configured mode.
      outbox.initialize();
      if(transactionalLedger)await transactionalLedger.initialize();
      const address=await new Promise((resolve,reject)=>{
        http.once('error',reject);
        http.listen(port,host,()=>{http.off('error',reject);resolve(http.address());});
      });
      void replayRestored();
      return address;
    },
    close:()=>new Promise(resolve=>{
      clearInterval(sim);
      clearInterval(recoveryTimer);
      if(leaseTimer)clearInterval(leaseTimer);
      for(const ws of listeners)ws.terminate();
      wss.close(()=>http.close(()=>resolve()));
    }),
  };
}
