// Game 3D 16.6: durable PRIVATE PvP outcome and Rival proof store.
// Works with 16.4's resolveTrustedRivalLead interface, replacing ephemeral
// 15.1 lead memory with PostgreSQL evidence. An ACTUAL independently trusted
// PvP adjudicator is still required; this does not create a live PvP source.
import {createHash} from 'node:crypto';

const proofKind='trusted-private-pvp-candidate-151';
const outcomeKind='trusted-private-pvp-outcome';
const proofSource='durable-private-pvp-proof-166';
const DAY=24*60*60*1000, WINDOW=7*DAY;
const allowedId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const allowedReceipt=x=>typeof x==='string'&&
 /^[A-Za-z0-9_.:-]{8,160}$/.test(x);
const allowedWho=x=>typeof x==='string'&&
 /^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const error=reason=>Object.freeze({ok:false,version:'16.6',reason,
 outcomeCommitted:false,proofIssued:false,privateServerOnly:true,
 livePvPAuthorityInstalled:false,productionReady:false});
const hash=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const leadKey=(a,b,c,d)=>'rival166-'+hash(['pvp-pair-166',a,b,c,d]).slice(0,64);
function validateOutcome(r,receiptId,ownerId,characterId,now){
 return r&&r.kind==='verified_pvp_defeat'&&r.sourceKind===outcomeKind&&
 r.receiptId===receiptId&&allowedReceipt(r.receiptId)&&
 allowedWho(r.killerAccountId)&&allowedWho(r.killerCharacterId)&&
 allowedWho(r.victimAccountId)&&allowedWho(r.victimCharacterId)&&
 r.killerAccountId===ownerId&&r.killerCharacterId===characterId&&
 r.victimAccountId!==ownerId&&r.victimCharacterId!==characterId&&
 allowedId(r.worldInstanceId)&&allowedId(r.matchId)&&
 allowedId(r.encounterId)&&digest(r.evidenceDigest)&&
 Number.isSafeInteger(r.occurredAt)&&
 r.occurredAt<=now&&now-r.occurredAt>=0&&now-r.occurredAt<=WINDOW;
}
const lockActorsSQL=`
 SELECT owner_id,character_id FROM game3d_trusted_character
 WHERE (owner_id=$1 AND character_id=$2) OR
       (owner_id=$3 AND character_id=$4)
 ORDER BY owner_id,character_id FOR UPDATE
`;
const writeOutcomeSQL=`
 INSERT INTO game3d_private_pvp_outcome_166
 (receipt_id,owner_id,character_id,counterpart_owner_id,
  counterpart_character_id,world_instance_id,match_id,encounter_id,
  occurred_at,evidence_digest,source_kind)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::bigint/1000.0),$10,
 'trusted-private-pvp-outcome')
 ON CONFLICT DO NOTHING RETURNING receipt_id
`;
const readOutcomeSQL=`
 SELECT receipt_id,owner_id,character_id,counterpart_owner_id,
 counterpart_character_id,world_instance_id,match_id,encounter_id,
 occurred_at,evidence_digest,source_kind
 FROM game3d_private_pvp_outcome_166 WHERE receipt_id=$1 FOR SHARE
`;
const pairEvidenceSQL=`
 SELECT receipt_id,owner_id,character_id,counterpart_owner_id,
 counterpart_character_id,world_instance_id,match_id,encounter_id,
 occurred_at,evidence_digest,source_kind
 FROM game3d_private_pvp_outcome_166
 WHERE owner_id=$1 AND character_id=$2 AND
 counterpart_owner_id=$3 AND counterpart_character_id=$4
 AND occurred_at>=to_timestamp($5::bigint/1000.0)
 AND occurred_at<=to_timestamp($6::bigint/1000.0)
 ORDER BY occurred_at,receipt_id FOR SHARE
`;
const proofSQL=`
 SELECT lead_id,owner_id,character_id,counterpart_owner_id,
 counterpart_character_id,evidence_kind,verified_defeats,
 distinct_matches,evidence_digest,issued_at,expires_at,source_kind
 FROM game3d_private_rival_proof_166
 WHERE lead_id=$1 FOR SHARE
`;
const proofReadSQL=proofSQL.replace(' FOR SHARE','');
const writeProofSQL=`
 INSERT INTO game3d_private_rival_proof_166
 (lead_id,owner_id,character_id,counterpart_owner_id,
 counterpart_character_id,evidence_kind,verified_defeats,
 distinct_matches,evidence_digest,issued_at,expires_at,source_kind)
 VALUES($1,$2,$3,$4,$5,$6,3,3,$7,
 to_timestamp($8::bigint/1000.0),to_timestamp($9::bigint/1000.0),$10)
 RETURNING lead_id
`;
const writeLinksSQL=`
 INSERT INTO game3d_private_rival_proof_receipt_166
 (lead_id,receipt_id,proof_order)
 VALUES($1,$2,$3)
`;
const linksSQL=`
 SELECT l.proof_order,e.receipt_id,e.owner_id,e.character_id,
 e.counterpart_owner_id,e.counterpart_character_id,
 e.world_instance_id,e.match_id,e.encounter_id,e.occurred_at,
 e.evidence_digest,e.source_kind
 FROM game3d_private_rival_proof_receipt_166 l
 JOIN game3d_private_pvp_outcome_166 e ON e.receipt_id=l.receipt_id
 WHERE l.lead_id=$1 ORDER BY l.proof_order
`;
const ms=x=>new Date(x).getTime();
function canonical(e){
 return [
  e.receipt_id,e.owner_id,e.character_id,
  e.counterpart_owner_id,e.counterpart_character_id,
  e.world_instance_id,e.match_id,e.encounter_id,
  ms(e.occurred_at),e.evidence_digest
 ];
}
const proofDigest=(leadId,rows)=>hash([
 'durable-private-pvp-proof-166-v1',leadId,...rows.map(canonical)
]);
function matchOutcome(row,r){
 return row?.receipt_id===r.receiptId&&row.owner_id===r.killerAccountId&&
 row.character_id===r.killerCharacterId&&
 row.counterpart_owner_id===r.victimAccountId&&
 row.counterpart_character_id===r.victimCharacterId&&
 row.world_instance_id===r.worldInstanceId&&row.match_id===r.matchId&&
 row.encounter_id===r.encounterId&&
 ms(row.occurred_at)===r.occurredAt&&
 row.evidence_digest===r.evidenceDigest&&row.source_kind===outcomeKind;
}
const distinctThree=rows=>{
 const matches=new Set(),sample=[];
 for(const row of rows){
  if(matches.has(row.match_id))continue;
  matches.add(row.match_id);sample.push(row);
  if(sample.length===3)break;
 }
 return sample.length===3?sample:null;
};
function verifiedProof(row,links,now){
 if(!row||row.source_kind!==proofSource||
 row.evidence_kind!==proofKind||Number(row.verified_defeats)!==3||
 Number(row.distinct_matches)!==3||!digest(row.evidence_digest)||
 !allowedId(row.lead_id)||!allowedWho(row.owner_id)||
 !allowedWho(row.character_id)||!allowedWho(row.counterpart_owner_id)||
 !allowedWho(row.counterpart_character_id)||
 leadKey(row.owner_id,row.character_id,
  row.counterpart_owner_id,row.counterpart_character_id)!==row.lead_id||
 links.length!==3||!Number.isSafeInteger(now)||
 ms(row.issued_at)>now||now>=ms(row.expires_at)||
 ms(row.expires_at)-ms(row.issued_at)!==WINDOW)return false;
 const matches=new Set(),ids=new Set();
 for(let i=0;i<links.length;i++){
  const e=links[i];
  if(Number(e.proof_order)!==i+1||ids.has(e.receipt_id)||
   matches.has(e.match_id)||e.owner_id!==row.owner_id||
   e.character_id!==row.character_id||
   e.counterpart_owner_id!==row.counterpart_owner_id||
   e.counterpart_character_id!==row.counterpart_character_id||
   e.source_kind!==outcomeKind||!digest(e.evidence_digest)||
   ms(e.occurred_at)>ms(row.issued_at)||
   ms(e.occurred_at)<ms(row.issued_at)-WINDOW)
   return false;
  matches.add(e.match_id);ids.add(e.receipt_id);
 }
 return matches.size===3&&
  proofDigest(row.lead_id,links)===row.evidence_digest;
}
function toLead(r){
 return Object.freeze({
  status:'candidate',leadId:r.lead_id,evidenceKind:proofKind,
  initiatorOwnerId:r.owner_id,initiatorCharacterId:r.character_id,
  counterpartOwnerId:r.counterpart_owner_id,
  counterpartCharacterId:r.counterpart_character_id,
  verifiedDefeats:3,distinctMatches:3,evidenceDigest:r.evidence_digest,
  issuedAt:ms(r.issued_at),privateServerOnly:true,
  noAutomaticRelationship:true,noRewards:true
 });
}
export function createGame3DPrivateRivalEvidence166({
 pool,authorizeServerOperation,resolveTrustedPvPOutcome,now=Date.now
}={}){
 if(typeof pool?.connect!=='function'||
  typeof authorizeServerOperation!=='function'||typeof now!=='function')
  throw Error('16.6 requires private DB, operator and clock');
 const allowed=async(operation,ownerId,characterId,receiptId=null)=>{
  if(!allowedWho(ownerId)||!allowedWho(characterId))return false;
  try{return await authorizeServerOperation({operation,ownerId,characterId,
    ...(receiptId===null?{}:{receiptId})})===true}
  catch{return false}
 };
 const commitDefeat=async({ownerId,characterId,receiptId}={})=>{
  if(!allowedReceipt(receiptId))
   return error('invalid_private_pvp_receipt');
  if(!await allowed('commit_trusted_private_pvp_outcome',
     ownerId,characterId,receiptId))
   return error('private_pvp_outcome_unauthorized');
  if(typeof resolveTrustedPvPOutcome!=='function')
   return error('trusted_private_pvp_adjudicator_not_installed');
  let r;
  try{r=await resolveTrustedPvPOutcome({receiptId})}
  catch{return error('trusted_private_pvp_outcome_unavailable')}
  const at=now();
  if(!validateOutcome(r,receiptId,ownerId,characterId,at))
   return error('unverified_private_pvp_outcome');

  const db=await pool.connect();let started=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');started=true;
   const actors=await db.query(lockActorsSQL,[
    ownerId,characterId,r.victimAccountId,r.victimCharacterId
   ]);
   if(actors.rowCount!==2){
    await db.query('ROLLBACK');started=false;
    return error('trusted_private_pvp_character_missing');
   }
   const inserted=await db.query(writeOutcomeSQL,[
    receiptId,ownerId,characterId,r.victimAccountId,r.victimCharacterId,
    r.worldInstanceId,r.matchId,r.encounterId,r.occurredAt,r.evidenceDigest
   ]);
   const existing=await db.query(readOutcomeSQL,[receiptId]);
   if(existing.rowCount!==1||!matchOutcome(existing.rows[0],r)){
    await db.query('ROLLBACK');started=false;
    return error('conflicting_private_pvp_evidence');
   }
   const leadId=leadKey(ownerId,characterId,
     r.victimAccountId,r.victimCharacterId);
   const old=await db.query(proofSQL,[leadId]);
   let proofIssued=false;
   if(old.rowCount===0){
    const records=await db.query(pairEvidenceSQL,[
      ownerId,characterId,r.victimAccountId,r.victimCharacterId,
      at-WINDOW,at
    ]);
    const firstThree=distinctThree(records.rows);
    if(firstThree){
     const evidenceDigest=proofDigest(leadId,firstThree);
     const p=await db.query(writeProofSQL,[
      leadId,ownerId,characterId,r.victimAccountId,r.victimCharacterId,
      proofKind,evidenceDigest,at,at+WINDOW,proofSource
     ]);
     if(p.rowCount!==1)throw Error('Private Rival proof insert rejected');
     for(let i=0;i<firstThree.length;i++){
      const link=await db.query(writeLinksSQL,[
        leadId,firstThree[i].receipt_id,i+1
      ]);
      if(link.rowCount!==1)throw Error('Private Rival proof link failed');
     }
     proofIssued=true;
    }
   }
   const verified=await db.query(proofSQL,[leadId]);
   const links=verified.rowCount===1
    ?await db.query(linksSQL,[leadId]):{rows:[]};
   const usable=verified.rowCount===1&&
    verifiedProof(verified.rows[0],links.rows,at);
   if(verified.rowCount===1&&!usable&&
      at<ms(verified.rows[0].expires_at))
    throw Error('Private Rival proof integrity mismatch');
   await db.query('COMMIT');started=false;
   return Object.freeze({ok:true,version:'16.6',receiptId,
    outcomeCommitted:inserted.rowCount===1,
    leadId:usable?leadId:null,proofIssued,
    proofAvailable:usable,noAutomaticRelationship:true,
    privateServerOnly:true,livePvPAuthorityInstalled:false,
    rewardsIssued:false,productionReady:false});
  }catch{
   if(started)try{await db.query('ROLLBACK')}catch{}
   return error('private_pvp_outcome_commit_failed');
  }finally{db.release()}
 };
 const resolveLead=async({leadId}={})=>{
  if(!allowedId(leadId))return null;
  const db=await pool.connect();let txn=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');txn=true;
   const proof=await db.query(proofReadSQL,[leadId]);
   if(proof.rowCount!==1){
    await db.query('ROLLBACK');txn=false;
    return null;
   }
   const row=proof.rows[0];
   if(!await allowed('resolve_trusted_private_rival_lead',
     row.owner_id,row.character_id,leadId)){
    await db.query('ROLLBACK');txn=false;
    return null;
   }
   const links=await db.query(linksSQL,[leadId]);
   const valid=verifiedProof(row,links.rows,now());
   await db.query('COMMIT');txn=false;
   return valid?toLead(row):null;
  }catch{
   if(txn)try{await db.query('ROLLBACK')}catch{}
   return null;
  }finally{db.release()}
 };
 return Object.freeze({
  version:'16.6',commitDefeat,resolveLead,
  privateServerOnly:true,publicRouteInstalled:false,
  privatePvPWorldResultSourceInstalled:
    typeof resolveTrustedPvPOutcome==='function',
  livePvPAuthorityInstalled:false,automaticMeetingEnabled:false,
  automaticRelationshipEnabled:false,rewardWriterEnabled:false,
  productionReady:false,
 });
}
