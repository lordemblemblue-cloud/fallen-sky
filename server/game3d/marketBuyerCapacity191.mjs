// Marketplace 19.1 — authenticated buyer inventory vacancy review.
// Read-only, point-in-time observation. It never reserves a destination slot.
import {validateAccountCharacterScope} from './accountScopeGuard.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const slot=x=>Number.isSafeInteger(x)&&x>=0&&x<200;
const natural=x=>{
 if(typeof x==='number')return Number.isSafeInteger(x)&&x>=0?x:null;
 if(typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)){
  const n=Number(x);
  return Number.isSafeInteger(n)?n:null;
 }
 return null;
};
const denied=code=>({ok:false,code,reviewOnly:true,
 buyerIdentityVerified:false,inventoryCapacityObserved:false,
 destinationSlotReserved:false,buyerFundsVerified:false,
 itemTransferAuthorized:false,paymentAuthorized:false,
 settlementAuthorized:false,productionReady:false});

// Do not accept observed capacity or occupied slots from browser callers.
// This helper only classifies data supplied by a trusted private DB read.
export function assessGame3DBuyerCapacity191({
 state,slots,requestedSlot=null
}={}){
 if(requestedSlot!==null&&!slot(requestedSlot))
  return denied('invalid_requested_slot');
 if(!state||natural(state.capacity)!==200||
    natural(state.revision)===null||!Array.isArray(slots)||
    slots.length>200)
  return denied('invalid_inventory_state');
 const seen=new Set();
 for(const row of slots){
  const index=natural(row?.slot_index);
  if(!slot(index)||seen.has(index))
   return denied('invalid_or_duplicate_inventory_slot');
  seen.add(index);
 }
 if(seen.size===200)return denied('buyer_inventory_full');
 const firstFree=Array.from({length:200},(_,i)=>i).find(i=>!seen.has(i));
 const proposedSlot=requestedSlot===null?firstFree:requestedSlot;
 if(seen.has(proposedSlot))return denied('buyer_requested_slot_occupied');
 return {ok:true,version:'19.1',reviewOnly:true,
  inventoryCapacity:200,inventoryCount:seen.size,
  inventoryRevision:natural(state.revision),
  freeSlots:200-seen.size,proposedSlot,
  buyerIdentityVerified:false,inventoryCapacityObserved:true,
  destinationSlotReserved:false,buyerFundsVerified:false,
  itemTransferAuthorized:false,paymentAuthorized:false,
  settlementAuthorized:false,productionReady:false};
}

export function createGame3DBuyerCapacityReviewer191({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('19.1 requires private PG and a trusted server session resolver');
 const inspect=async({serverRequestContext,characterId,requestedSlot=null}={})=>{
  if(!key(characterId)||(requestedSlot!==null&&!slot(requestedSlot)))
   return denied('invalid_buyer_inventory_request');
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||
     !key(subject.accountId))
   return denied('unverified_buyer_session');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const owner=await c.query(
    'SELECT owner_id,character_id,revision FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   const auth=owner.rowCount===1?
    validateAccountCharacterScope({subject,characterRow:owner.rows[0]}):
    {ok:false};
   if(!auth.ok||auth.characterId!==characterId){
    await c.query('COMMIT');
    return denied('unverified_buyer_character');
   }
   const state=await c.query(
    'SELECT capacity,revision FROM game3d_inventory_state '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   if(state.rowCount!==1){
    await c.query('COMMIT');
    return denied('buyer_inventory_state_missing');
   }
   // Return ONLY indices; never expose a different owner's items or
   // untrusted client inventory counts.
   const inventory=await c.query(
    'SELECT slot_index FROM game3d_inventory_slot '+
    'WHERE owner_id=$1 AND character_id=$2 ORDER BY slot_index ASC',
    [subject.accountId,characterId]);
   const result=assessGame3DBuyerCapacity191({
    state:state.rows[0],slots:inventory.rows,
    requestedSlot,
   });
   await c.query('COMMIT');
   if(!result.ok)return result;
   return {...result,buyerIdentityVerified:true,
    buyerCharacterId:characterId,buyerAccountId:subject.accountId,
    // Snapshot can become stale immediately after committing.
    liveReservation:false,inventoryMutationPerformed:false};
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,settlementEnabled:false});
}
