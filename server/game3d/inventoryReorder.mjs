import {parsePrivateInventoryRevision} from './inventorySlotRead.mjs';
// Foundation 13.0 — revision-fenced inventory slot move/swap.
// Do not expose without a trusted session resolver. Never transfers ownership.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {createGame3DAccountScopeGuard} from './accountScopeGuard.mjs';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const index=x=>Number.isSafeInteger(x)&&x>=0&&x<200;
const digest=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
export function createGame3DInventoryReorder({pool,resolveAuthenticatedSubject}={}){
 if(!pool?.connect||!pool?.query||
    typeof resolveAuthenticatedSubject!=='function')
  throw Error('Inventory rearrangement requires trusted account identity');
 const accounts=createGame3DAccountScopeGuard({pool,resolveAuthenticatedSubject});
 const move=async({serverRequestContext,characterId,operationId,
   expectedRevision,fromIndex,toIndex}={})=>{
  if(!valid(operationId)||!index(fromIndex)||!index(toIndex)||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<0)
   throw Error('Invalid inventory reorder request');
  const identity=await accounts.authorizeRead({
   serverRequestContext,characterId});
  if(!identity.ok)throw Error('Character inventory access denied');
  const ownerId=identity.accountId;
  const requestDigest=digest({ownerId,characterId,operationId,
   expectedRevision,fromIndex,toIndex});
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const state=await c.query(
    'SELECT revision FROM game3d_inventory_state '+
    'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',
    [ownerId,characterId]);
   if(state.rowCount!==1)throw Error('Inventory not initialized');
   const prior=await c.query(
    'SELECT request_digest,result_revision FROM game3d_inventory_operation '+
    'WHERE owner_id=$1 AND character_id=$2 AND operation_id=$3',
    [ownerId,characterId,operationId]);
   if(prior.rowCount){
    const replayRevision=parsePrivateInventoryRevision(prior.rows[0].result_revision);
    if(prior.rows[0].request_digest!==requestDigest||replayRevision===null)
     throw Error('Conflicting inventory operation replay');
    await c.query('COMMIT');
    return {replayed:true,revision:String(replayRevision)};
   }
   const storedRevision=parsePrivateInventoryRevision(state.rows[0].revision);
   if(storedRevision===null)throw Error('Invalid inventory revision');
   if(storedRevision!==expectedRevision)throw Error('Stale inventory revision');
   if(fromIndex===toIndex)throw Error('Move requires different slots');
   const existing=await c.query(
    'SELECT slot_index,item_instance_id FROM game3d_inventory_slot '+
    'WHERE owner_id=$1 AND character_id=$2 '+
    'AND slot_index IN($3,$4) FOR UPDATE',
    [ownerId,characterId,fromIndex,toIndex]);
   const from=existing.rows.find(r=>Number(r.slot_index)===fromIndex);
   const target=existing.rows.find(r=>Number(r.slot_index)===toIndex);
   if(!from)throw Error('Source slot is empty');
   // 14.4: a preview-reserved item must not be silently rearranged while
   // a market/forge review is referencing its inventory custody.
   const movedIds=[from.item_instance_id,...(target?[target.item_instance_id]:[])];
   const reserved=await c.query(
    'SELECT item_instance_id FROM game3d_market_listing_candidate '+
    'WHERE item_instance_id=ANY($1::uuid[]) LIMIT 1',
    [movedIds]);
   if(reserved.rowCount)throw Error('Market-reserved item cannot be moved');
   await c.query('DELETE FROM game3d_inventory_slot '+
    'WHERE owner_id=$1 AND character_id=$2 AND slot_index IN($3,$4)',
    [ownerId,characterId,fromIndex,toIndex]);
   // Delete + reinsert within the same transaction avoids temporary
   // unique slot conflicts during an occupied two-way swap.
   await c.query('INSERT INTO game3d_inventory_slot '+
    '(owner_id,character_id,slot_index,item_instance_id) '+
    'VALUES($1,$2,$3,$4)',[ownerId,characterId,toIndex,from.item_instance_id]);
   if(target)await c.query('INSERT INTO game3d_inventory_slot '+
    '(owner_id,character_id,slot_index,item_instance_id) '+
    'VALUES($1,$2,$3,$4)',[ownerId,characterId,fromIndex,target.item_instance_id]);
   const bump=await c.query('UPDATE game3d_inventory_state '+
    'SET revision=revision+1 WHERE owner_id=$1 AND character_id=$2 '+
    'RETURNING revision',[ownerId,characterId]);
   const nextRevision=parsePrivateInventoryRevision(bump.rows[0].revision);
   if(nextRevision===null||nextRevision!==expectedRevision+1)
    throw Error('Invalid inventory revision increment');
   const revision=String(nextRevision);
   await c.query('INSERT INTO game3d_inventory_operation '+
    '(owner_id,character_id,operation_id,request_digest,result_revision) '+
    'VALUES($1,$2,$3,$4,$5)',
    [ownerId,characterId,operationId,requestDigest,revision]);
   await c.query('COMMIT');
   return {replayed:false,revision,fromIndex,toIndex,
    itemTransferAuthorized:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({move});
}
