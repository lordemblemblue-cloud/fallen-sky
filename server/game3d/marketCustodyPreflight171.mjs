// Marketplace Foundation 17.1 — authenticated, transaction-consistent
// seller custody preflight. READ ONLY. Not a reservation or settlement writer.
import {validateAccountCharacterScope} from './accountScopeGuard.mjs';
import {reviewPrivateMarketPreview} from './marketListingPreview.mjs';
import {inspectMarketplaceItemSource} from './marketplaceSourceAudit.mjs';
import {isPrivateMarketCustodyConsistent} from './marketPreviewAudit.mjs';
import {inspectGame3DMarketPrice} from './marketPricePolicy.mjs';
import {compareGame3DSellerPreviewSnapshot} from './marketSnapshot170.mjs';

const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const deny=code=>({ok:false,code,preflightOnly:true,
 listingAuthorized:false,tradeAuthorized:false,transferAuthorized:false,
 paymentAuthorized:false,escrowAuthorized:false,custodyReserved:false,
 settlementAuthorized:false,productionReady:false});

// The expected hash is a *staleness comparison*, never an authorization token.
// An existing intent is a conflict signal, not proof that an item was locked.
// A successful result is deliberately still ineligible for settlement.
export function assessGame3DCustodyPreflight171({
 quote,expectedFingerprint,existingIntentId=null
}={}){
 if(!digest(expectedFingerprint))
  return deny('invalid_expected_fingerprint');
 const result=compareGame3DSellerPreviewSnapshot({
  quote,expectedFingerprint,
 });
 if(!result.ok)return deny(result.code);
 if(result.matchesExpectedFingerprint!==true)
  return {...deny('seller_snapshot_changed'),changedSinceLastPreview:true};
 if(existingIntentId!==null)
  return deny('item_has_existing_custody_intent');
 return {ok:true,preflightOnly:true,version:'17.1',
  snapshotFingerprint:result.snapshotFingerprint,
  itemInstanceId:result.itemInstanceId,inventorySlot:result.inventorySlot,
  askAGP:result.askAGP,isAuction:result.isAuction,
  durationHours:result.durationHours,
  sellerSnapshotMatches:true,sourceConsistencyObserved:true,
  inventoryAllocationObserved:true,unequippedObserved:true,
  noExistingIntentObserved:true,
  // An unchanged read is NOT a lock. This API never reserves or transfers.
  verifiedGameplayEarned:false,currencyLedgerVerified:false,
  buyerBalanceVerified:false,buyerCapacityVerified:false,
  listingAuthorized:false,tradeAuthorized:false,transferAuthorized:false,
  paymentAuthorized:false,escrowAuthorized:false,custodyReserved:false,
  settlementAuthorized:false,productionReady:false};
}

export function createGame3DMarketCustodyPreflight171({
 pool,resolveAuthenticatedSubject
}={}){
 if(!pool?.connect||typeof resolveAuthenticatedSubject!=='function')
  throw Error('17.1 preflight needs private PostgreSQL and trusted session resolver');
 const inspect=async({
  serverRequestContext,characterId,listingId,askAGP,
  isAuction=false,durationHours=null,expectedFingerprint
 }={})=>{
  if(!key(characterId)||!uuid(listingId)||!digest(expectedFingerprint))
   return deny('invalid_custody_preflight_identity');
  const price=inspectGame3DMarketPrice({askAGP,isAuction,durationHours});
  if(!price.ok)return deny(price.code);
  // Never accept a caller-provided owner/account ID as proof of identity.
  const subject=await resolveAuthenticatedSubject(serverRequestContext);
  if(!subject||subject.authenticated!==true||
     subject.identitySource!=='trusted-server-session'||!key(subject.accountId))
   return deny('unverified_authentication');
  const c=await pool.connect();
  try{
   // All ownership, issuance, slot, equipment and intent reads are in ONE
   // consistent transaction. Serializable READ ONLY cannot claim a lock.
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const owner=await c.query(
    'SELECT owner_id,character_id,revision FROM game3d_trusted_character '+
    'WHERE owner_id=$1 AND character_id=$2',
    [subject.accountId,characterId]);
   const auth=owner.rowCount===1?
    validateAccountCharacterScope({subject,characterRow:owner.rows[0]}):
    {ok:false};
   if(!auth.ok){
    await c.query('COMMIT');
    return deny('character_owner_binding_missing');
   }
   // Migration 021 supplies the intent table. Its row uniqueness is a
   // future writer primitive, not a substitute for transactional custody.
   const r=await c.query(
    'SELECT row_to_json(l) AS listing,row_to_json(i) AS issued,'+
    'row_to_json(e) AS event,row_to_json(s) AS completion,'+
    'row_to_json(sim) AS simulation,'+
    'eq.item_instance_id AS equipped_id,inv.slot_index AS inventory_slot,'+
    'ci.claim_id AS existing_intent_id '+
    'FROM game3d_market_listing_candidate l '+
    'LEFT JOIN game3d_item_issuance i ON i.item_instance_id=l.item_instance_id '+
    'AND i.owner_id=l.owner_id AND i.character_id=l.character_id '+
    'LEFT JOIN game3d_verified_gameplay_event e '+
    'ON e.event_id::text=i.source_event_id '+
    'LEFT JOIN game3d_server_completion_source s '+
    'ON s.completion_id=e.completion_id '+
    'LEFT JOIN game3d_simulation_completion_receipt sim '+
    'ON sim.completion_id=s.completion_id '+
    'LEFT JOIN game3d_character_equipment eq '+
    'ON eq.item_instance_id=l.item_instance_id '+
    'AND eq.owner_id=l.owner_id AND eq.character_id=l.character_id '+
    'LEFT JOIN game3d_inventory_slot inv '+
    'ON inv.item_instance_id=l.item_instance_id '+
    'AND inv.owner_id=l.owner_id AND inv.character_id=l.character_id '+
    'LEFT JOIN game3d_market_custody_intent ci '+
    'ON ci.item_instance_id=l.item_instance_id '+
    'WHERE l.listing_id=$1 AND l.owner_id=$2 AND l.character_id=$3',
    [listingId,subject.accountId,characterId]);
   if(r.rowCount!==1){
    await c.query('COMMIT');
    return deny('non_unique_or_missing_seller_source');
   }
   const row=r.rows[0],itemInstanceId=row?.listing?
    String(row.listing.item_instance_id):'';
   const listing=reviewPrivateMarketPreview({
    row:row?.listing,ownerId:subject.accountId,
    characterId,itemInstanceId,
   });
   const source=inspectMarketplaceItemSource({
    ownerId:subject.accountId,characterId,itemInstanceId,
    evidence:{issued:row?.issued,event:row?.event,
     completion:row?.completion,simulation:row?.simulation},
   });
   const custody=isPrivateMarketCustodyConsistent({
    inventorySlot:row?.inventory_slot,equippedId:row?.equipped_id,
   });
   if(!listing.ok||!source.ok||!custody){
    await c.query('COMMIT');
    return deny('seller_source_or_inventory_inconsistent');
   }
   const quote={
    ok:true,previewOnly:true,ownerId:subject.accountId,characterId,
    listingId,itemInstanceId,sourceIntegrityDigest:source.sourceIntegrityDigest,
    inventorySlot:Number(row.inventory_slot),askAGP:price.askAGP,
    isAuction:price.isAuction,durationHours:price.durationHours,
    provenanceConsistent:true,originalInventoryAssigned:true,
    originalItemUnequipped:true,
    listingAuthorized:false,paymentAuthorized:false,
    escrowAuthorized:false,marketplaceTradingEnabled:false,
    currencyDebited:false,
   };
   const result=assessGame3DCustodyPreflight171({
    quote,expectedFingerprint,
    existingIntentId:row.existing_intent_id,
   });
   await c.query('COMMIT');
   return result;
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({inspect,readOnly:true,settlementEnabled:false});
}
