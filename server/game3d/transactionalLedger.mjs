// Combat Foundation 3.8 — opt-in transactional staging ledger.
// PostgreSQL owns room leases and staged terminal records ONLY.
// Base44 DuelSession writes are still non-transactional: no ranked enablement.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {createTerminalLifecycleArchive,verifyStoredLifecycle} from './lifecycleArchive.mjs';
import {buildRewardReview,verifyRewardReviewRow} from './rewardEvidence.mjs';
import {verifyDuelUpgradeAudit} from '../../base44/shared/duelUpgradeAudit.mjs';

const valid=s=>typeof s==='string'&&s.length>0&&s.length<=160;
const digest=p=>createHash('sha256').update(stableJournalJSON(p)).digest('hex');
const terminal=p=>p?.kind==='settle'&&valid(p.duelId)&&valid(p.epoch)&&
  typeof p.resultId==='string'&&p.resultId.length>0&&p.resultId.length<=200&&
  Number.isSafeInteger(p.sequence)&&p.sequence>0&&
  p.snapshot?.status==='finished'&&p.checkpoint?.state?.status==='finished';
const LEASE_SECONDS=15;

export function createPgCombatLedger({pool,ownerId,journalEnabled=false,
  ledgerOnlyEnabled=false,lifecycleArchiveEnabled=false,
  rewardReviewEnabled=false,standardizedLoadoutEnabled=false,
  upgradeAuditEnabled=false}={}){
  if(!pool?.connect||!valid(ownerId))throw Error('PG ledger requires a pool and unique worker ID');
  if(ledgerOnlyEnabled&&!journalEnabled)throw Error('Ledger-only mode requires journal');
  if(lifecycleArchiveEnabled&&(!journalEnabled||!ledgerOnlyEnabled))
    throw Error('Lifecycle archive requires PG journal-only mode');
  if(rewardReviewEnabled&&!lifecycleArchiveEnabled)
    throw Error('Reward review requires archived journal-only duels');
  if(standardizedLoadoutEnabled&&(!ledgerOnlyEnabled||
      !lifecycleArchiveEnabled||!rewardReviewEnabled))
    throw Error('4.8 standardized loadouts require full PG journal/archive/review');
  if(upgradeAuditEnabled&&!standardizedLoadoutEnabled)
    throw Error('4.9 upgrade audit requires immutable standardized loadouts');
  const transaction=async fn=>{
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const value=await fn(c);
      await c.query('COMMIT');
      return value;
    }catch(err){
      try{await c.query('ROLLBACK');}catch{}
      throw err;
    }finally{c.release();}
  };
  const initialize=async()=>{
    // Schema is deliberately provisioned out of band, never mutated on boot.
    await pool.query('SELECT duel_id FROM game3d_duel_lease LIMIT 0');
    await pool.query('SELECT duel_id FROM game3d_duel_terminal LIMIT 0');
    if(standardizedLoadoutEnabled){
      await pool.query('SELECT duel_id FROM game3d_duel_loadout LIMIT 0');
      const older=await pool.query(
        'SELECT l.duel_id FROM game3d_duel_lease l WHERE NOT EXISTS(SELECT 1 FROM game3d_duel_loadout m WHERE m.duel_id=l.duel_id) LIMIT 1');
      if(older.rowCount)
        throw Error('4.8 requires fresh beta duels, not existing unbound leases');
      if(upgradeAuditEnabled){
        await pool.query('SELECT duel_id FROM game3d_duel_upgrade_audit LIMIT 0');
        const missing=await pool.query(
          'SELECT l.duel_id FROM game3d_duel_loadout l WHERE NOT EXISTS(SELECT 1 FROM game3d_duel_upgrade_audit a WHERE a.duel_id=l.duel_id) LIMIT 1');
        if(missing.rowCount)
          throw Error('4.9 cannot start with unreviewed existing standardized duels');
      }
    }
    if(journalEnabled){
      await pool.query('SELECT duel_id FROM game3d_duel_report_journal LIMIT 0');
      if(ledgerOnlyEnabled)
        await pool.query('SELECT ack_mode FROM game3d_duel_report_journal LIMIT 0');
      if(lifecycleArchiveEnabled){
        await pool.query('SELECT duel_id FROM game3d_duel_lifecycle_archive LIMIT 0');
        if(rewardReviewEnabled){
          await pool.query('SELECT duel_id FROM game3d_duel_reward_review LIMIT 0');
          // A missing historical review is not guessed from a legacy row.
          const orphan=await pool.query(
            'SELECT a.duel_id FROM game3d_duel_lifecycle_archive a WHERE NOT EXISTS (SELECT 1 FROM game3d_duel_reward_review r WHERE r.duel_id=a.duel_id AND r.result_id=a.result_id) LIMIT 1');
          if(orphan.rowCount)
            throw Error('Cannot enable reward review with unreviewed historic archives');
        }
        // This mode requires a fresh staging database or an externally
        // reviewed historical migration. Never reinterpret unarchived legacy
        // settlements as already archived or creditable.
        const legacy=await pool.query(
          'SELECT t.duel_id FROM game3d_duel_terminal t WHERE NOT EXISTS (SELECT 1 FROM game3d_duel_lifecycle_archive a WHERE a.duel_id=t.duel_id) LIMIT 1');
        if(legacy.rowCount)
          throw Error('Lifecycle archive cannot start with unarchived historic terminal rows');
      }
      // Never switch to journal mode with old 3.8 terminal rows that lack
      // corresponding journal entries: they cannot be safely acknowledged.
      const orphan=await pool.query(
        'SELECT t.duel_id FROM game3d_duel_terminal t WHERE t.acked=false AND NOT EXISTS (SELECT 1 FROM game3d_duel_report_journal j WHERE j.duel_id=t.duel_id AND j.report_kind=\'settle\') LIMIT 1');
      if(orphan.rowCount)throw Error('Unmigrated 3.8 terminal outbox must be settled before journal enablement');
    }
  };
  const acquire=async(duelId,epoch)=> {
    if(!valid(duelId)||!valid(epoch))throw Error('Invalid duel lease identity');
    return transaction(async c=>{
      const old=await c.query(
        'SELECT epoch, owner_id, fence, expires_at > clock_timestamp() AS active FROM game3d_duel_lease WHERE duel_id=$1 FOR UPDATE',
        [duelId]);
      // Persistent terminal results fence this duel ID even when acknowledged.
      // DuelSession IDs must never be reused after settlement.
      const terminalRow=await c.query(
        'SELECT 1 FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
      if(terminalRow.rowCount)return null;
      if(journalEnabled){
        const earlier=await c.query(
          'SELECT epoch FROM game3d_duel_report_journal WHERE duel_id=$1 LIMIT 1',[duelId]);
        if(earlier.rowCount&&earlier.rows[0].epoch!==epoch)return null;
      }
      if(!old.rowCount){
        // A primary-key conflict may occur if two workers try to insert a new
        // duel concurrently. An ON CONFLICT DO NOTHING loser is denied.
        const inserted=await c.query(
          "INSERT INTO game3d_duel_lease(duel_id,epoch,owner_id,fence,expires_at) VALUES($1,$2,$3,1,clock_timestamp()+interval '15 seconds') ON CONFLICT DO NOTHING RETURNING fence",
          [duelId,epoch,ownerId]);
        return inserted.rowCount?{duelId,epoch,ownerId,fence:String(inserted.rows[0].fence)}:null;
      }
      const previous=old.rows[0];
      if(previous.active&&(previous.owner_id!==ownerId||previous.epoch!==epoch))
        return null;
      // Reacquisition by this same live worker keeps its fencing token.
      const same=previous.active&&previous.owner_id===ownerId&&previous.epoch===epoch;
      const upgraded=await c.query(
        "UPDATE game3d_duel_lease SET epoch=$2,owner_id=$3,fence=fence+$4,expires_at=clock_timestamp()+interval '15 seconds',updated_at=clock_timestamp() WHERE duel_id=$1 RETURNING fence",
        [duelId,epoch,ownerId,same?0:1]);
      return {duelId,epoch,ownerId,fence:String(upgraded.rows[0].fence)};
    });
  };
  const renew=async lease=>{
    if(!lease||lease.ownerId!==ownerId)return false;
    const r=await pool.query(
      "UPDATE game3d_duel_lease SET expires_at=clock_timestamp()+interval '15 seconds',updated_at=clock_timestamp() WHERE duel_id=$1 AND epoch=$2 AND owner_id=$3 AND fence=$4 AND expires_at>clock_timestamp() RETURNING fence",
      [lease.duelId,lease.epoch,ownerId,lease.fence]);
    return r.rowCount===1;
  };
  const stage=async(payload,lease)=>{
    if(!terminal(payload)||!lease||lease.duelId!==payload.duelId||
       lease.epoch!==payload.epoch||lease.ownerId!==ownerId)
      throw Error('Invalid transactional terminal report');
    const payloadDigest=digest(payload);
    return transaction(async c=>{
      const existingLease=await c.query(
        'SELECT 1 FROM game3d_duel_lease WHERE duel_id=$1 AND epoch=$2 AND owner_id=$3 AND fence=$4 AND expires_at>clock_timestamp() FOR UPDATE',
        [lease.duelId,lease.epoch,ownerId,lease.fence]);
      if(existingLease.rowCount!==1)throw Error('Duel ownership lease lost');
      const stored=await c.query(
        'SELECT epoch,fence,result_id,payload_digest FROM game3d_duel_terminal WHERE duel_id=$1 FOR UPDATE',
        [payload.duelId]);
      if(stored.rowCount){
        const p=stored.rows[0];
        if(p.epoch!==payload.epoch||String(p.fence)!==lease.fence||
           p.result_id!==payload.resultId||p.payload_digest!==payloadDigest)
          throw Error('Conflicting transactional terminal result');
        return payload;
      }
      await c.query(
        'INSERT INTO game3d_duel_terminal(duel_id,epoch,fence,result_id,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
        [payload.duelId,payload.epoch,lease.fence,payload.resultId,payloadDigest,JSON.stringify(payload)]);
      return payload;
    });
  };
  const ack=async payload=>{
    if(!terminal(payload))throw Error('Invalid acknowledged terminal');
    const r=await pool.query(
      'UPDATE game3d_duel_terminal SET acked=true,acked_at=COALESCE(acked_at,clock_timestamp()) WHERE duel_id=$1 AND epoch=$2 AND result_id=$3 AND payload_digest=$4 RETURNING duel_id',
      [payload.duelId,payload.epoch,payload.resultId,digest(payload)]);
    if(r.rowCount!==1)throw Error('Terminal acknowledgment has no matching transaction');
  };
  const pending=async(limit=100)=>{
    const n=Math.max(1,Math.min(100,Math.floor(Number(limit)||100)));
    const r=await pool.query(
      'SELECT payload FROM game3d_duel_terminal WHERE acked=false ORDER BY staged_at ASC LIMIT $1',
      [n]);
    return r.rows.map(x=>x.payload);
  };
  // 3.9: the journal is authoritative for the *last committed report* in
  // isolated beta. Base44 remains a separately delivered projection.
  const reportValid=p=>p&&valid(p.duelId)&&valid(p.epoch)&&
    Number.isSafeInteger(p.sequence)&&p.sequence>0&&
    (p.kind==='checkpoint'||p.kind==='settle')&&
    Number.isSafeInteger(p.snapshot?.seq)&&p.snapshot.seq>=0&&
    p.snapshot.seq===p.checkpoint?.state?.sequence&&
    p.snapshot.status===p.checkpoint?.state?.status&&
    (p.kind==='settle'?terminal(p):p.snapshot.status!=='finished');
  const assertLease=async(c,lease)=>{
    if(!lease||lease.ownerId!==ownerId||!valid(lease.duelId)||
       !valid(lease.epoch)||!/^[1-9][0-9]*$/.test(String(lease.fence)))
      throw Error('Invalid journal owner lease');
    const owned=await c.query(
      'SELECT 1 FROM game3d_duel_lease WHERE duel_id=$1 AND epoch=$2 AND owner_id=$3 AND fence=$4 AND expires_at>clock_timestamp() FOR UPDATE',
      [lease.duelId,lease.epoch,ownerId,lease.fence]);
    if(owned.rowCount!==1)throw Error('Journal ownership lease lost');
  };
  // An owner may bind its standardized ticket once, under the same row lock
  // used by journal staging. A restarted worker may only rejoin with the
  // identical immutable manifest. No character save or item gets promoted.
  const bindLoadout=async(manifest,lease,{upgradeAudit=null}={})=>{
    if(!standardizedLoadoutEnabled||!manifest||
       manifest.version!==1||
       manifest.ruleset!=='game3d-standardized-preview-v1'||
       manifest.duelId!==lease?.duelId||manifest.epoch!==lease?.epoch||
       !Array.isArray(manifest.equipment)||manifest.equipment.length!==0||
       manifest.earnedProgressionVerified!==false||
       manifest.equipmentProvenanceVerified!==false||
       manifest.rewardsIssued!==false)
      throw Error('Invalid standardized loadout binding');
    const hash=digest(manifest);
    let auditDigest=null;
    if(upgradeAuditEnabled){
      const checked=verifyDuelUpgradeAudit({
        duelId:lease.duelId,authorityEpoch:lease.epoch,
        challengerId:manifest.challenger.ownerId,
        opponentId:manifest.opponent.ownerId,
        characterEvidence:{
          challenger:manifest.challenger,opponent:manifest.opponent,
        },
        upgradeAudit,
      });
      if(!checked.ok)throw Error('Invalid signed server upgrade evidence');
      auditDigest=digest(checked.audit);
    }else if(upgradeAudit!==null)
      throw Error('Upgrade evidence feature flags disagree');
    return transaction(async c=>{
      await assertLease(c,lease);
      const old=await c.query(
        'SELECT epoch,ruleset,manifest_version,manifest_digest,manifest FROM game3d_duel_loadout WHERE duel_id=$1 FOR UPDATE',
        [lease.duelId]);
      if(old.rowCount){
        const p=old.rows[0];
        if(p.epoch!==lease.epoch||p.ruleset!==manifest.ruleset||
           p.manifest_version!==1||p.manifest_digest!==hash||
           digest(p.manifest)!==hash)
          throw Error('Duel loadout changed after binding');
      }else{
        await c.query(
          'INSERT INTO game3d_duel_loadout(duel_id,epoch,ruleset,manifest_version,manifest_digest,manifest) VALUES($1,$2,$3,1,$4,$5::jsonb)',
          [lease.duelId,lease.epoch,manifest.ruleset,hash,JSON.stringify(manifest)]);
      }
      if(upgradeAuditEnabled){
        // Loadout and roll evidence must commit under a single lease lock,
        // never allow an unreviewed loadout to survive a partial write.
        const prior=await c.query(
          'SELECT epoch,loadout_digest,audit_digest,audit FROM game3d_duel_upgrade_audit WHERE duel_id=$1 FOR UPDATE',
          [lease.duelId]);
        if(prior.rowCount){
          const p=prior.rows[0];
          if(p.epoch!==lease.epoch||p.loadout_digest!==hash||
             p.audit_digest!==auditDigest||digest(p.audit)!==auditDigest)
            throw Error('Server upgrade evidence changed during duel');
        }else{
          if(old.rowCount)
            throw Error('Existing duel loadout has no upgrade evidence');
          await c.query(
            'INSERT INTO game3d_duel_upgrade_audit(duel_id,epoch,loadout_digest,audit_digest,audit_version,audit) VALUES($1,$2,$3,$4,1,$5::jsonb)',
            [lease.duelId,lease.epoch,hash,auditDigest,JSON.stringify(upgradeAudit)]);
        }
      }
      return hash;
    });
  };
  const restoreReport=async lease=>{
    if(!journalEnabled)throw Error('Report journal is disabled');
    return transaction(async c=>{
      await assertLease(c,lease);
      const result=await c.query(
        ledgerOnlyEnabled
          ?'SELECT epoch,report_sequence,simulation_sequence,payload,acked,ack_mode FROM game3d_duel_report_journal WHERE duel_id=$1 ORDER BY report_sequence DESC LIMIT 1'
          :'SELECT epoch,report_sequence,simulation_sequence,payload,acked FROM game3d_duel_report_journal WHERE duel_id=$1 ORDER BY report_sequence DESC LIMIT 1',
        [lease.duelId]);
      if(!result.rowCount)return null;
      const row=result.rows[0];
      if(ledgerOnlyEnabled&&row.acked===true&&row.ack_mode!=='journal-only')
        throw Error('Ledger-only mode requires fresh dedicated match history');
      if(row.epoch!==lease.epoch||!reportValid(row.payload)||
         Number(row.report_sequence)!==row.payload.sequence||
         Number(row.simulation_sequence)!==row.payload.snapshot.seq)
        throw Error('Persisted journal checkpoint does not match duel identity');
      return {payload:row.payload,acked:row.acked===true};
    });
  };
  const recordReport=async(payload,lease)=>{
    if(!journalEnabled)throw Error('Report journal is disabled');
    if(!reportValid(payload)||!lease||payload.duelId!==lease.duelId||
       payload.epoch!==lease.epoch)
      throw Error('Invalid journal report envelope');
    const sum=digest(payload);
    return transaction(async c=>{
      await assertLease(c,lease);
      const old=await c.query(
        'SELECT epoch,report_sequence,simulation_sequence,payload_digest,report_kind,acked FROM game3d_duel_report_journal WHERE duel_id=$1 ORDER BY report_sequence DESC LIMIT 1 FOR UPDATE',
        [payload.duelId]);
      if(old.rowCount){
        const p=old.rows[0],priorSeq=Number(p.report_sequence);
        if(p.epoch!==payload.epoch)throw Error('Different journal authority epoch');
        if(priorSeq===payload.sequence){
          if(p.payload_digest!==sum||p.report_kind!==payload.kind)
            throw Error('Conflicting same-sequence journal report');
          return payload;
        }
        if(p.acked!==true)throw Error('Previous journal report not acknowledged');
        if(payload.sequence!==priorSeq+1)throw Error('Out-of-order journal envelope');
        if(payload.snapshot.seq<Number(p.simulation_sequence))
          throw Error('Journal combat state moved backward');
        if(p.report_kind==='settle')throw Error('Journal duel already settled');
      }else if(payload.sequence!==1){
        throw Error('First journal report must start at sequence 1');
      }
      if(payload.kind==='settle'){
        // Validate before staging a terminal result in the transaction.
        if(lifecycleArchiveEnabled)createTerminalLifecycleArchive(payload);
        const existing=await c.query(
          'SELECT epoch,result_id,payload_digest FROM game3d_duel_terminal WHERE duel_id=$1 FOR UPDATE',
          [payload.duelId]);
        if(existing.rowCount)throw Error('Terminal already stored outside this journal');
        await c.query(
          'INSERT INTO game3d_duel_terminal (duel_id,epoch,fence,result_id,payload_digest,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
          [payload.duelId,payload.epoch,lease.fence,payload.resultId,sum,JSON.stringify(payload)]);
      }
      await c.query(
        'INSERT INTO game3d_duel_report_journal (duel_id,epoch,report_sequence,simulation_sequence,owner_fence,report_kind,payload_digest,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
        [payload.duelId,payload.epoch,payload.sequence,payload.snapshot.seq,
          lease.fence,payload.kind,sum,JSON.stringify(payload)]);
      // The terminal result, journal entry and one-per-duel lifecycle archive
      // commit in the SAME PostgreSQL transaction, guarded by owner fence.
      // No Base44 write and no account reward is permitted here.
      if(payload.kind==='settle'&&lifecycleArchiveEnabled){
        const archive=createTerminalLifecycleArchive(payload);
        await c.query(
          "INSERT INTO game3d_duel_lifecycle_archive (duel_id,epoch,result_id,report_sequence,simulation_sequence,player_a_id,player_b_id,winner_id,loser_id,finish_reason,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [archive.duelId,archive.epoch,archive.resultId,archive.reportSequence,
            archive.simulationSequence,archive.playerAId,archive.playerBId,
            archive.winnerId,archive.loserId,archive.finishReason,archive.outcome]);
        if(rewardReviewEnabled){
          const review=buildRewardReview(archive);
          await c.query(
            'INSERT INTO game3d_duel_reward_review(duel_id,result_id) VALUES ($1,$2)',
            [review.duelId,review.resultId]);
        }
      }
      return payload;
    });
  };
  const ackReport=async(payload,{mode='base44-projection'}={})=>{
    if(!journalEnabled)throw Error('Report journal is disabled');
    if(!reportValid(payload))throw Error('Invalid journal report acknowledgment');
    if(!['base44-projection','journal-only'].includes(mode)||
       (ledgerOnlyEnabled&&mode!=='journal-only')||
       (!ledgerOnlyEnabled&&mode!=='base44-projection'))
      throw Error('Mismatched journal acknowledgment mode');
    return transaction(async c=>{
      const marked=ledgerOnlyEnabled
        ?await c.query(
          "UPDATE game3d_duel_report_journal SET acked=true,ack_mode=$5,acked_at=COALESCE(acked_at,clock_timestamp()) WHERE duel_id=$1 AND epoch=$2 AND report_sequence=$3 AND payload_digest=$4 AND (acked=false OR ack_mode=$5) RETURNING duel_id",
          [payload.duelId,payload.epoch,payload.sequence,digest(payload),mode])
        :await c.query(
          'UPDATE game3d_duel_report_journal SET acked=true,acked_at=COALESCE(acked_at,clock_timestamp()) WHERE duel_id=$1 AND epoch=$2 AND report_sequence=$3 AND payload_digest=$4 RETURNING duel_id',
          [payload.duelId,payload.epoch,payload.sequence,digest(payload)]);
      if(marked.rowCount!==1)throw Error('Journal acknowledgment did not match saved payload');
      if(payload.kind==='settle'){
        const confirmed=await c.query(
          'UPDATE game3d_duel_terminal SET acked=true,acked_at=COALESCE(acked_at,clock_timestamp()) WHERE duel_id=$1 AND epoch=$2 AND result_id=$3 AND payload_digest=$4 RETURNING duel_id',
          [payload.duelId,payload.epoch,payload.resultId,digest(payload)]);
        if(confirmed.rowCount!==1)throw Error('Journal terminal acknowledgment mismatched');
      }
    });
  };
  // Proof of an exact immutable transactionally committed report. This is
  // read-only, keyed by duel ID + report sequence, and carries no reward.
  const proveReport=async(duelId,sequence)=>{
    if(!ledgerOnlyEnabled)throw Error('Ledger-only report proof is disabled');
    if(!valid(duelId)||!Number.isSafeInteger(sequence)||sequence<1)
      throw Error('Invalid journal report proof request');
    const r=await pool.query(
      'SELECT epoch,report_sequence,simulation_sequence,owner_fence,report_kind,payload_digest,payload FROM game3d_duel_report_journal WHERE duel_id=$1 AND report_sequence=$2',
      [duelId,sequence]);
    if(!r.rowCount)return null;
    const x=r.rows[0];
    if(!reportValid(x.payload)||x.payload.duelId!==duelId||
       x.payload.sequence!==sequence||x.payload.epoch!==x.epoch||
       x.payload.snapshot.seq!==Number(x.simulation_sequence)||
       digest(x.payload)!==x.payload_digest)
      throw Error('Unverifiable committed journal report');
    return {duelId,epoch:x.epoch,sequence,simulationSequence:Number(x.simulation_sequence),
      fence:String(x.owner_fence),kind:x.report_kind,
      payloadDigest:x.payload_digest,
      resultId:x.report_kind==='settle'?x.payload.resultId:null};
  };
  // Read-only authoritative projection from the committed PostgreSQL journal.
  // Works even when the current worker is not the lease owner. Do not serve
  // a browser directly; this method is exposed through an HMAC-only endpoint.
  const readLatest=async duelId=>{
    if(!journalEnabled)throw Error('Authoritative combat reads require journal mode');
    if(!valid(duelId))throw Error('Invalid duel ID');
    const r=await pool.query(
      ledgerOnlyEnabled
        ?'SELECT epoch,report_sequence,simulation_sequence,report_kind,owner_fence,acked,ack_mode,payload FROM game3d_duel_report_journal WHERE duel_id=$1 ORDER BY report_sequence DESC LIMIT 1'
        :'SELECT epoch,report_sequence,simulation_sequence,report_kind,owner_fence,acked,payload FROM game3d_duel_report_journal WHERE duel_id=$1 ORDER BY report_sequence DESC LIMIT 1',
      [duelId]);
    if(!r.rowCount)return null;
    const p=r.rows[0];
    if(!reportValid(p.payload)||p.payload.duelId!==duelId||
       p.payload.epoch!==p.epoch||
       p.payload.sequence!==Number(p.report_sequence)||
       p.payload.snapshot.seq!==Number(p.simulation_sequence))
      throw Error('Invalid committed combat journal state');
    const snapshot=p.payload.snapshot;
    let rewardReview=null,lifecycleArchive=null;
    if(lifecycleArchiveEnabled&&p.report_kind==='settle'){
      const archived=await pool.query(
        'SELECT * FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
      if(archived.rowCount!==1||
         !verifyStoredLifecycle(archived.rows[0],p.payload))
        throw Error('Committed terminal missing matching lifecycle archive');
      const a=archived.rows[0];
      if(rewardReviewEnabled){
        const reviewed=await pool.query(
          'SELECT * FROM game3d_duel_reward_review WHERE duel_id=$1',[duelId]);
        if(reviewed.rowCount!==1||!verifyRewardReviewRow(reviewed.rows[0],
          createTerminalLifecycleArchive(p.payload)))
          throw Error('Missing or inconsistent reward review');
        rewardReview=buildRewardReview(createTerminalLifecycleArchive(p.payload));
      }
      lifecycleArchive={
        duelId:a.duel_id,epoch:a.epoch,resultId:a.result_id,
        reportSequence:Number(a.report_sequence),
        simulationSequence:Number(a.simulation_sequence),
        players:[a.player_a_id,a.player_b_id],winnerId:a.winner_id,
        loserId:a.loser_id,draw:a.outcome==='draw',
        finishReason:a.finish_reason,status:'archived',
        rewardEligibility:'unverified_account',rewardsEligible:false,
        rewardsIssued:false,
      };
    }
    return {
      duelId,epoch:p.epoch,reportSequence:Number(p.report_sequence),
      simulationSequence:Number(p.simulation_sequence),
      kind:p.report_kind,settled:p.report_kind==='settle',
      resultId:p.report_kind==='settle'?p.payload.resultId:null,
      projectionAcknowledged:p.acked===true&&p.payload.ledgerOnly!==true&&
        (!ledgerOnlyEnabled||p.ack_mode==='base44-projection'),
      deliveryAcknowledged:p.acked===true,
      // The signed, committed record declares intent even before a receipt
      // is returned; do not call a journal-only delivery 'Base44 catching up'.
      deliveryMode:p.payload.ledgerOnly===true?'journal-only':'base44-projection',
      // This is DB committed, never raw client-submitted positions/HP.
      snapshot,
      ...(lifecycleArchive?{lifecycleArchive}:{}),
      ...(rewardReview?{rewardReview}:{}),
      authority:'postgres-journal',authoritative:true,
    };
  };
  // Combat Foundation 4.6: fail-closed cross-session admission preflight.
  // This is a read of committed PostgreSQL authority, NOT a fresh lease
  // claim or permission to pay rewards. The worker still claims the lease.
  // A single SQL statement gives one consistent committed snapshot of the
  // lease, latest journal entry, terminal outbox and lifecycle archive.
  const inspectAdmission=async duelId=>{
    if(!lifecycleArchiveEnabled||!ledgerOnlyEnabled)
      throw Error('Archive-backed admission requires ledger-only lifecycle');
    if(!valid(duelId))throw Error('Invalid duel admission identifier');
    const r=await pool.query(
      `SELECT l.epoch AS lease_epoch,
        l.fence AS lease_fence,
        l.expires_at > clock_timestamp() AS lease_active,
        j.epoch AS journal_epoch,
        j.report_sequence AS journal_sequence,
        j.report_kind AS journal_kind,
        j.payload AS journal_payload,
        j.payload_digest AS journal_digest,
        t.result_id AS terminal_result_id,
        t.payload AS terminal_payload,
        t.payload_digest AS terminal_digest,
        a.duel_id AS archived_duel_id,
        a.epoch AS archived_epoch,
        a.result_id AS archived_result_id,
        a.report_sequence AS archived_sequence,
        a.simulation_sequence AS archived_simulation_sequence,
        a.player_a_id,a.player_b_id,a.winner_id,a.loser_id,
        a.finish_reason,a.outcome,a.reward_eligibility,a.rewards_issued
      FROM game3d_duel_lease l
      LEFT JOIN LATERAL(
        SELECT epoch,report_sequence,report_kind,payload,payload_digest
        FROM game3d_duel_report_journal
        WHERE duel_id=l.duel_id ORDER BY report_sequence DESC LIMIT 1
      ) j ON true
      LEFT JOIN game3d_duel_terminal t ON t.duel_id=l.duel_id
      LEFT JOIN game3d_duel_lifecycle_archive a ON a.duel_id=l.duel_id
      WHERE l.duel_id=$1`,
      [duelId]);
    if(!r.rowCount)return {duelId,status:'absent',authoritative:true};
    const row=r.rows[0];
    if(!valid(row.lease_epoch)||!/^\d+$/.test(String(row.lease_fence)))
      throw Error('Invalid authority lease in admission preflight');
    if(row.journal_payload){
      const journal=row.journal_payload;
      if(journal.duelId!==duelId||journal.epoch!==row.lease_epoch||
         journal.sequence!==Number(row.journal_sequence)||
         journal.kind!==row.journal_kind||
         !reportValid(journal)||digest(journal)!==row.journal_digest)
        throw Error('Committed journal integrity failed');
    }
    const archived=!!row.archived_duel_id,terminalRow=!!row.terminal_result_id;
    if(archived!==terminalRow)
      throw Error('Partial terminal archive is not admissible');
    if(archived){
      if(!row.journal_payload||row.journal_kind!=='settle'||
         row.journal_epoch!==row.lease_epoch||
         row.archived_epoch!==row.lease_epoch||
         row.archived_result_id!==row.terminal_result_id||
         row.terminal_payload?.duelId!==duelId||
         row.terminal_payload?.resultId!==row.terminal_result_id||
         digest(row.terminal_payload)!==row.terminal_digest||
         digest(row.journal_payload)!==row.terminal_digest||
         !verifyStoredLifecycle({
           duel_id:row.archived_duel_id,epoch:row.archived_epoch,
           result_id:row.archived_result_id,
           report_sequence:row.archived_sequence,
           simulation_sequence:row.archived_simulation_sequence,
           player_a_id:row.player_a_id,player_b_id:row.player_b_id,
           winner_id:row.winner_id,loser_id:row.loser_id,
           finish_reason:row.finish_reason,outcome:row.outcome,
           reward_eligibility:row.reward_eligibility,
           rewards_issued:row.rewards_issued,
         },row.terminal_payload))
        throw Error('Committed archive integrity failed');
      return {
        duelId,status:'archived',authoritative:true,epoch:row.lease_epoch,
        resultId:row.archived_result_id,
        reportSequence:Number(row.archived_sequence),
        rewardsIssued:false,
      };
    }
    if(row.journal_kind==='settle')
      throw Error('Terminal journal exists without a matching archive');
    return {
      duelId,status:'active',authoritative:true,epoch:row.lease_epoch,
      reportSequence:row.journal_sequence===null?0:Number(row.journal_sequence),
    };
  };
  // 4.4 history: one shared PG source for server-wide archived duel lists.
  // Only expose through an HMAC-protected backend-to-backend route.
  const listArchivedForPlayer=async(playerId,limit=20)=>{
    if(!rewardReviewEnabled)throw Error('Reward review history disabled');
    if(!valid(playerId)||!Number.isSafeInteger(limit)||limit<1||limit>25)
      throw Error('Invalid history lookup');
    const r=await pool.query(
      `SELECT a.*,r.*,j.payload,j.payload_digest AS journal_digest,
         t.result_id AS terminal_result_id,t.payload_digest AS terminal_digest
       FROM game3d_duel_lifecycle_archive a
       JOIN game3d_duel_reward_review r ON r.duel_id=a.duel_id
       JOIN game3d_duel_report_journal j
         ON j.duel_id=a.duel_id AND j.report_sequence=a.report_sequence
         AND j.report_kind='settle'
       JOIN game3d_duel_terminal t ON t.duel_id=a.duel_id
       WHERE a.player_a_id=$1 OR a.player_b_id=$1
       ORDER BY a.archived_at DESC,a.duel_id DESC LIMIT $2`,
      [playerId,limit]);
    return r.rows.map(row=>{
      const payload=row.payload;
      if(!terminal(payload)||payload.duelId!==row.duel_id||
         payload.resultId!==row.result_id||
         row.result_id!==row.terminal_result_id||
         row.journal_digest!==digest(payload)||
         row.terminal_digest!==digest(payload)||
         !verifyStoredLifecycle(row,payload))
        throw Error('Invalid committed terminal history');
      const archive=createTerminalLifecycleArchive(payload);
      if(!verifyRewardReviewRow(row,archive))
        throw Error('Unverified archive reward evidence');
      if(row.player_a_id!==playerId&&row.player_b_id!==playerId)
        throw Error('Archived duel belongs to another player');
      return {
        duelId:row.duel_id,epoch:row.epoch,resultId:row.result_id,
        reportSequence:Number(row.report_sequence),
        simulationSequence:Number(row.simulation_sequence),
        opponentId:row.player_a_id===playerId?row.player_b_id:row.player_a_id,
        outcome:row.outcome,
        personalOutcome:row.winner_id===null?'draw':
          row.winner_id===playerId?'win':'loss',
        winnerId:row.winner_id,
        finishReason:row.finish_reason,
        archivedAt:new Date(row.archived_at).toISOString(),
        rewardReview:buildRewardReview(archive),
      };
    });
  };
  return Object.freeze({enabled:true,ownerId,leaseSeconds:LEASE_SECONDS,
    journalEnabled,ledgerOnlyEnabled,lifecycleArchiveEnabled,rewardReviewEnabled,
    standardizedLoadoutEnabled,upgradeAuditEnabled,
    restoreReport,recordReport,ackReport,readLatest,proveReport,
    listArchivedForPlayer,inspectAdmission,bindLoadout,initialize,acquire,renew,stage,ack,pending});
}
