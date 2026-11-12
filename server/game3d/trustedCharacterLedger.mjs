// Combat Foundation 5.0 — an isolated PostgreSQL character event ledger.
// The browser, Character Vault, item-upgrade rows, and Base44 DuelSession
// NEVER call grantEvent(). A future server-owned gameplay producer must inject
// a verifier that checks an immutable event outside this ledger first.
// No verified event producer is connected in 5.0. No combat buffs or payouts.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';

const id=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max&&
  !/[\u0000-\u001f]/.test(v);
const hash=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
export const PREVIEW_ITEM_BLUEPRINT='training-blade-preview-v1';
const safeInt=v=>Number.isSafeInteger(v)&&v>=0;
export function validateTrustedGameEvent(e){
  if(!e||typeof e!=='object'||Array.isArray(e)||!id(e.eventId)||
     !id(e.ownerId)||!id(e.characterId,128)||
     !/^[A-Za-z0-9_-]{1,128}$/.test(e.characterId)||
     e.provenance!=='verified-gameplay-event'||
     !['xp','item_mint'].includes(e.type)||
     !id(e.sourceId)||!['dedicated-combat','server-quest'].includes(e.sourceType))
    return {ok:false,reason:'invalid_event_identity'};
  if(e.type==='xp'){
    if(!Number.isSafeInteger(e.amount)||e.amount<1||e.amount>100000||
       e.blueprintId!==undefined)
      return {ok:false,reason:'invalid_xp_grant'};
  }else if(e.blueprintId!==PREVIEW_ITEM_BLUEPRINT||
      e.amount!==undefined)
    return {ok:false,reason:'unapproved_item_blueprint'};
  const allowed=['eventId','ownerId','characterId','provenance','type',
    'sourceId','sourceType',...(e.type==='xp'?['amount']:['blueprintId'])];
  if(Object.keys(e).some(k=>!allowed.includes(k)))
    return {ok:false,reason:'unexpected_event_fields'};
  return {ok:true,digest:hash(e)};
}

export function createPgTrustedCharacterLedger({
  pool,verifyTrustedEvent=null,grantEnabled=false,
}={}){
  if(!pool?.connect||!pool?.query)throw Error('Provenance ledger needs a PostgreSQL pool');
  // The verifier must be a private server integration, NOT an HTTP parameter,
  // browser claim, or data from Character Vault.
  if(grantEnabled&&typeof verifyTrustedEvent!=='function')
    throw Error('Trusted grant mode requires an independent event verifier');
  const initialize=async()=>{
    await pool.query('SELECT owner_id FROM game3d_trusted_character LIMIT 0');
    await pool.query('SELECT event_id FROM game3d_trusted_grant_event LIMIT 0');
    await pool.query('SELECT item_instance_id FROM game3d_trusted_item LIMIT 0');
  };
  const grantEvent=async e=>{
    if(!grantEnabled||typeof verifyTrustedEvent!=='function')
      throw Error('Trusted event issuance is not connected');
    const checked=validateTrustedGameEvent(e);
    if(!checked.ok)throw Error(checked.reason);
    // An independently verified, immutable event must match the entire
    // submitted identity and digest. Source authorization is NOT inferred
    // merely from the HMAC used for combat ticket reads.
    const authorization=await verifyTrustedEvent(e,checked.digest);
    if(authorization?.verified!==true||
       authorization.eventId!==e.eventId||
       authorization.digest!==checked.digest)
      throw Error('Trusted game event issuer denied grant');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query(
        'INSERT INTO game3d_trusted_character(owner_id,character_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [e.ownerId,e.characterId]);
      const character=await c.query(
        'SELECT revision,xp_total FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',
        [e.ownerId,e.characterId]);
      if(character.rowCount!==1)throw Error('Trusted character lock missing');
      const prior=await c.query(
        'SELECT owner_id,character_id,event_type,event_digest FROM game3d_trusted_grant_event WHERE event_id=$1',
        [e.eventId]);
      const itemId=e.type==='item_mint'?'g3i-'+hash(e.eventId).slice(0,40):null;
      if(prior.rowCount){
        const old=prior.rows[0];
        if(old.owner_id!==e.ownerId||old.character_id!==e.characterId||
           old.event_type!==e.type||old.event_digest!==checked.digest)
          throw Error('Conflicting reuse of trusted gameplay event ID');
        if(itemId){
          const existing=await c.query(
            'SELECT owner_id,character_id,blueprint_id,mint_event_id FROM game3d_trusted_item WHERE item_instance_id=$1',
            [itemId]);
          if(existing.rowCount!==1||
             existing.rows[0].owner_id!==e.ownerId||
             existing.rows[0].character_id!==e.characterId||
             existing.rows[0].blueprint_id!==e.blueprintId||
             existing.rows[0].mint_event_id!==e.eventId)
            throw Error('Trusted item mint missing or inconsistent');
        }
        await c.query('COMMIT');
        return {applied:false,eventId:e.eventId,itemInstanceId:itemId};
      }
      await c.query(
        "INSERT INTO game3d_trusted_grant_event(event_id,owner_id,character_id,event_type,event_digest,provenance) VALUES($1,$2,$3,$4,$5,'verified-gameplay-event')",
        [e.eventId,e.ownerId,e.characterId,e.type,checked.digest]);
      if(e.type==='xp'){
        const total=BigInt(character.rows[0].xp_total)+BigInt(e.amount);
        if(total>BigInt(Number.MAX_SAFE_INTEGER))
          throw Error('Trusted XP balance exceeds safe numeric projection');
        await c.query(
          'UPDATE game3d_trusted_character SET xp_total=$3,revision=revision+1 WHERE owner_id=$1 AND character_id=$2',
          [e.ownerId,e.characterId,String(total)]);
      }else{
        await c.query(
          "INSERT INTO game3d_trusted_item(item_instance_id,mint_event_id,owner_id,character_id,blueprint_id) VALUES($1,$2,$3,$4,$5)",
          [itemId,e.eventId,e.ownerId,e.characterId,e.blueprintId]);
        await c.query(
          'UPDATE game3d_trusted_character SET revision=revision+1 WHERE owner_id=$1 AND character_id=$2',
          [e.ownerId,e.characterId]);
      }
      await c.query('COMMIT');
      return {applied:true,eventId:e.eventId,itemInstanceId:itemId};
    }catch(error){
      try{await c.query('ROLLBACK');}catch{}
      throw error;
    }finally{c.release();}
  };
  const readCharacter=async(ownerId,characterId)=>{
    if(!id(ownerId)||!id(characterId,128)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(characterId))
      throw Error('Invalid trusted character identity');
    // Use one consistent snapshot so items, revision and XP are from the
    // same committed database state; no writes or lock acquisition.
    const c=await pool.connect();
    try{
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const root=await c.query(
        'SELECT revision,xp_total FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
        [ownerId,characterId]);
      if(!root.rowCount){
        await c.query('COMMIT');
        return {status:'no-trusted-events',ownerId,characterId,
          trustedEventCount:0,earnedStatsAuthorized:false,
          equipmentEffectsAuthorized:false,rewardsEligible:false,rewardsIssued:false};
      }
      const events=await c.query(
        'SELECT event_id,event_type,event_digest FROM game3d_trusted_grant_event WHERE owner_id=$1 AND character_id=$2 ORDER BY event_id',
        [ownerId,characterId]);
      const items=await c.query(
        `SELECT i.item_instance_id,i.blueprint_id,i.mint_event_id
         FROM game3d_trusted_item i
         JOIN game3d_trusted_grant_event e ON e.event_id=i.mint_event_id
           AND e.owner_id=i.owner_id AND e.character_id=i.character_id
           AND e.event_type='item_mint'
         WHERE i.owner_id=$1 AND i.character_id=$2 ORDER BY i.item_instance_id`,
        [ownerId,characterId]);
      const rootRow=root.rows[0];
      const revision=Number(rootRow.revision),xpTotal=Number(rootRow.xp_total);
      if(!safeInt(revision)||!safeInt(xpTotal)||
         events.rowCount!==revision||items.rowCount>events.rowCount)
        throw Error('Trusted progression revision/event consistency failure');
      const itemEventIds=new Set();
      for(const item of items.rows){
        if(itemEventIds.has(item.mint_event_id)||
           !events.rows.some(e=>e.event_id===item.mint_event_id&&
             e.event_type==='item_mint'))
          throw Error('Trusted item provenance link invalid');
        itemEventIds.add(item.mint_event_id);
      }
      if(itemEventIds.size!==events.rows.filter(e=>e.event_type==='item_mint').length)
        throw Error('Trusted mint event missing item');
      const result={
        status:'trusted-event-records',ownerId,characterId,revision,xpTotal,
        trustedEventCount:events.rowCount,
        itemInstanceIds:items.rows.map(row=>row.item_instance_id),
        evidenceDigest:hash({
          revision,xpTotal,
          events:events.rows.map(e=>[e.event_id,e.event_type,e.event_digest]),
          items:items.rows.map(i=>[i.item_instance_id,i.blueprint_id,i.mint_event_id]),
        }),
        source:'postgres-verified-event-ledger',
        // The gameplay event issuer and equipment stat derivation are not
        // wired into PvP in 5.0, so these stay strictly false.
        earnedStatsAuthorized:false,equipmentEffectsAuthorized:false,
        rewardsEligible:false,rewardsIssued:false,
      };
      await c.query('COMMIT');
      return result;
    }catch(error){
      try{await c.query('ROLLBACK');}catch{}
      throw error;
    }finally{c.release();}
  };
  return Object.freeze({initialize,grantEvent,readCharacter,grantEnabled});
}
