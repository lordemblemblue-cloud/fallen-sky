// Combat Foundation 5.3 — internal, opt-in simulation receipt ledger.
// No browser routes or live quest hooks. Award generation is exclusively
// delegated to a trusted world simulator; the browser cannot attest itself.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {createGame3DCompletionSource} from './serverCompletionSource.mjs';

const name=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
  x!=='__anon__'&&x!=='__default__';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const kind=x=>['quest','encounter','craft'].includes(x);
const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const contextValid=x=>x&&who(x.ownerId)&&who(x.characterId)&&name(x.completionId)&&
  name(x.simulationId)&&kind(x.sourceKind)&&
  Number.isSafeInteger(x.simulationTick)&&x.simulationTick>=0;
function awardList(items) {
  if(!Array.isArray(items)||items.length<1||items.length>33)
    throw Error('Server award list must contain 1–33 entries');
  const a=items.map(item=>({awardIndex:item?.awardIndex,definitionId:item?.definitionId}));
  if(a.some(item=>!Number.isSafeInteger(item.awardIndex)||item.awardIndex<0||
    item.awardIndex>32||!name(item.definitionId))||
    new Set(a.map(x=>x.awardIndex)).size!==a.length)
    throw Error('Malformed or repeated server award index');
  return a.sort((x,y)=>x.awardIndex-y.awardIndex);
}
function canonical(x) {
  return {
    completionId:x.completionId,simulationId:x.simulationId,
    simulationTick:x.simulationTick,ownerId:x.ownerId,
    characterId:x.characterId,sourceKind:x.sourceKind,awards:x.awards,
    evidenceDigest:x.evidenceDigest,
  };
}
export function verifyCommittedSimulationReceipt(r) {
  if(!r)throw Error('Missing committed simulation receipt');
  const data={
    completionId:r.completion_id,simulationId:r.simulation_id,
    simulationTick:Number(r.simulation_tick),ownerId:r.owner_id,
    characterId:r.character_id,sourceKind:r.source_kind,
    awards:awardList(r.awards),evidenceDigest:r.evidence_digest,
  };
  if(!contextValid(data)||!sha(data.evidenceDigest)||
    hash(canonical(data))!==r.receipt_digest)
    throw Error('Corrupt committed simulation receipt');
  return {...data,receiptDigest:r.receipt_digest};
}
const withTxn=async(pool,fn)=>{
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const result=await fn(c);
    await c.query('COMMIT');
    return result;
  }catch(e){
    try{await c.query('ROLLBACK')}catch{}
    throw e;
  }finally{c.release()}
};

export function createGame3DSimulationReceiptLedger({pool,attestWorldOutcome}={}) {
  if(!pool?.connect||!pool?.query)throw Error('Simulation receipt ledger requires PostgreSQL pool');
  // attestWorldOutcome must check real committed game-server simulation state
  // under the passed PostgreSQL transaction, and compute deterministic awards.
  // An HTTP function accepting player submitted "complete" is NOT sufficient.
  const enabled=typeof attestWorldOutcome==='function';
  const record=async context=>{
    if(!contextValid(context))throw Error('Invalid server simulation context');
    if(!enabled)throw Error('Trusted world simulation attester is not installed');
    return withTxn(pool,async client=>{
      const evidence=await attestWorldOutcome({client,context:{
        completionId:context.completionId,simulationId:context.simulationId,
        simulationTick:context.simulationTick,ownerId:context.ownerId,
        characterId:context.characterId,sourceKind:context.sourceKind,
      }});
      if(evidence?.ok!==true||
         evidence.provenance!=='authoritative-world-simulation'||
         !sha(evidence.evidenceDigest)||
         !['completionId','simulationId','simulationTick','ownerId',
           'characterId','sourceKind'].every(k=>evidence[k]===context[k]))
        throw Error('World simulator did not attest this outcome');
      const awards=awardList(evidence.awards);
      const record={...context,awards,evidenceDigest:evidence.evidenceDigest};
      const digest=hash(canonical(record));
      const inserted=await client.query(
        'INSERT INTO game3d_simulation_completion_receipt '+
        '(completion_id,simulation_id,simulation_tick,owner_id,character_id,'+
        'source_kind,awards,evidence_digest,receipt_digest) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) '+
        'ON CONFLICT(completion_id) DO NOTHING RETURNING completion_id',
        [context.completionId,context.simulationId,context.simulationTick,
         context.ownerId,context.characterId,context.sourceKind,
         JSON.stringify(awards),evidence.evidenceDigest,digest]);
      if(inserted.rowCount===1)return {...record,receiptDigest:digest,created:true};
      const old=await client.query(
        'SELECT * FROM game3d_simulation_completion_receipt '+
        'WHERE completion_id=$1 FOR SHARE',[context.completionId]);
      if(old.rowCount!==1||verifyCommittedSimulationReceipt(old.rows[0]).receiptDigest!==digest)
        throw Error('Conflicting committed simulation outcome');
      return {...record,receiptDigest:digest,created:false};
    });
  };
  // The trusted 5.2 confirmSimulation adapter reads exactly the committed
  // receipt, including awards, with no separate user-supplied source.
  const confirmSimulation=async({client,context}={})=>{
    if(!client?.query||!context?.completionId||!who(context.ownerId)||
       !who(context.characterId)||!kind(context.sourceKind))
      throw Error('Invalid simulation completion lookup');
    const r=await client.query(
      'SELECT * FROM game3d_simulation_completion_receipt '+
      'WHERE completion_id=$1 FOR SHARE',[context.completionId]);
    if(r.rowCount!==1)throw Error('No sealed simulation outcome');
    const stored=verifyCommittedSimulationReceipt(r.rows[0]);
    if(stored.ownerId!==context.ownerId||
       stored.characterId!==context.characterId||
       stored.sourceKind!==context.sourceKind)
      throw Error('Simulation completion owner or source mismatch');
    return {...stored,ok:true,provenance:'committed-simulation-receipt'};
  };
  const completions=createGame3DCompletionSource({pool,confirmSimulation});
  const advanceCompletion=async context=>{
    const signed=await record(context);
    const accepted=await completions.commitCompletion({
      ownerId:signed.ownerId,characterId:signed.characterId,
      completionId:signed.completionId,sourceKind:signed.sourceKind,
    });
    // Only record source evidence, never auto-grant loot in this phase.
    return {simulationReceiptDigest:signed.receiptDigest,
      completionSourceDigest:accepted.sourceDigest,
      created:signed.created&&accepted.created,
      rewardsIssued:false};
  };
  return Object.freeze({enabled,record,confirmSimulation,advanceCompletion});
}
