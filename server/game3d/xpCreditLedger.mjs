// Combat Foundation 9.5 — transactional XP credit *only* for a committed
// server simulation receipt. Disabled by default without trusted authorizer.
// Not connected to public account endpoint or existing browser progression.
import {verifyCommittedSimulationReceipt} from './simulationReceipts.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function createGame3DXPCreditLedger({pool,authorizeCredit}={}){
 if(!pool?.connect)throw Error('9.5 requires private PG');
 const enabled=typeof authorizeCredit==='function';
 const credit=async completionId=>{
  if(!id(completionId))throw Error('Invalid XP completion');
  if(!enabled)throw Error('Server XP ruleset authorizer not installed');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const receipt=await c.query(
    'SELECT * FROM game3d_simulation_completion_receipt '+
    'WHERE completion_id=$1 FOR SHARE',[completionId]);
   if(receipt.rowCount!==1)throw Error('No committed simulation completion');
   const source=receipt.rows[0];
   // A well-formed digest alone is insufficient: verify canonical content.
   verifyCommittedSimulationReceipt(source);
   if(!sha(source.receipt_digest))throw Error('Invalid simulation receipt digest');
   // Must check independent gameplay attestation and calculate XP using
   // trusted server rules; caller cannot supply amount or owner ID.
   const proof=await authorizeCredit({client:c,completion:source});
   const amount=proof?.xpAmount;
   if(proof?.ok!==true||proof.source!=='server-progression-rules'||
      proof.completionId!==completionId||
      proof.ownerId!==source.owner_id||proof.characterId!==source.character_id||
      proof.receiptDigest!==source.receipt_digest||
      !Number.isSafeInteger(amount)||amount<1||amount>10000)
    throw Error('XP was not authorized by server progression rules');
   const actor=await c.query(
    'SELECT xp_total FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',
    [source.owner_id,source.character_id]);
   if(actor.rowCount!==1)throw Error('Trusted character missing');
   const inserted=await c.query(
    'INSERT INTO game3d_authoritative_xp_credit '+
    '(completion_id,owner_id,character_id,credited_xp,receipt_digest) '+
    'VALUES($1,$2,$3,$4,$5) ON CONFLICT(completion_id) DO NOTHING '+
    'RETURNING completion_id',
    [completionId,source.owner_id,source.character_id,
      amount,source.receipt_digest]);
   let xpTotal=BigInt(actor.rows[0].xp_total);
   if(inserted.rowCount){
    xpTotal+=BigInt(amount);
    if(xpTotal>9223372036854775807n)throw Error('XP total overflow');
    const updated=await c.query(
     'UPDATE game3d_trusted_character SET xp_total=$3,revision=revision+1 '+
     'WHERE owner_id=$1 AND character_id=$2 RETURNING xp_total',
     [source.owner_id,source.character_id,xpTotal.toString()]);
    if(updated.rowCount!==1)throw Error('Failed trusted XP credit');
   }else{
    const existing=await c.query(
     'SELECT * FROM game3d_authoritative_xp_credit '+
     'WHERE completion_id=$1',[completionId]);
    const row=existing.rows[0];
    if(existing.rowCount!==1||row.owner_id!==source.owner_id||
       row.character_id!==source.character_id||
       Number(row.credited_xp)!==amount||
       row.receipt_digest!==source.receipt_digest)
     throw Error('Conflicting XP credit replay');
   }
   await c.query('COMMIT');
   return {completionId,ownerId:source.owner_id,
    characterId:source.character_id,creditedXP:amount,
    totalXP:xpTotal.toString(),created:inserted.rowCount===1,
    rankedRewardsAuthorized:false};
  }catch(error){try{await c.query('ROLLBACK')}catch{}throw error}
  finally{c.release()}
 };
 return Object.freeze({enabled,credit});
}
