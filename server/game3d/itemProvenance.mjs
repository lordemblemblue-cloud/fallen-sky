// Combat Foundation 5.0 — private beta provenance primitives.
// Internal server-only module. Do not expose these methods through a browser API.
// No source validator or equipment authorizer is wired in production yet.
import {createHash, randomUUID} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';

const identity = value => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
  !['__default__', '__anon__'].includes(value);
const key = value => typeof value === 'string' &&
  /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const slot = value => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,32}$/.test(value);
const hash = value => createHash('sha256')
  .update(stableJournalJSON(value)).digest('hex');
const sha256 = value => typeof value === 'string' &&
  /^[0-9a-f]{64}$/.test(value);
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sourceKinds = new Set(['encounter', 'quest', 'craft']);

export function validateItemIssuanceClaim(claim) {
  return !!claim && identity(claim.ownerId) && identity(claim.characterId) &&
    key(claim.sourceEventId) && key(claim.definitionId) &&
    sourceKinds.has(claim.sourceKind) &&
    Number.isSafeInteger(claim.awardIndex) && claim.awardIndex >= 0 &&
    claim.awardIndex <= 32;
}

// An idempotent retry is safe only if the committed source digest still
// matches the complete original issuance claim. Do not trust row existence.
export function verifyItemIssuanceReplay(row,claim,sourceDigest) {
  if(!row || !validateItemIssuanceClaim(claim)||!sha256(sourceDigest))
    return false;
  const expected=hash({...claim,sourceDigest});
  return row.owner_id===claim.ownerId &&
    row.character_id===claim.characterId &&
    row.source_event_id===claim.sourceEventId &&
    row.definition_id===claim.definitionId &&
    row.source_kind===claim.sourceKind &&
    Number(row.award_index)===claim.awardIndex &&
    row.source_digest===sourceDigest &&
    row.claim_digest===expected;
}

export function createPgItemProvenance({pool, verifySource, authorizeEquipment, authorizeIssuance} = {}) {
  if (!pool?.connect || !pool?.query)
    throw Error('5.0 requires a dedicated PostgreSQL pool');
  // Deliberately do not provide a permissive default: Character Vault saves,
  // itemUpgrade rows and client inventory are NOT trusted issuance events.
  const transaction = async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  };
  const initialize = async () => {
    await pool.query('SELECT item_instance_id FROM game3d_item_issuance LIMIT 0');
    await pool.query('SELECT owner_id FROM game3d_character_equipment_revision LIMIT 0');
    await pool.query('SELECT item_instance_id FROM game3d_character_equipment LIMIT 0');
    await pool.query('SELECT operation_id FROM game3d_equipment_operation LIMIT 0');
  };

  const issueItem = async claim => {
    if (!validateItemIssuanceClaim(claim))
      throw Error('Invalid server item issuance claim');
    if (typeof verifySource !== 'function')
      throw Error('5.0 issuance requires an installed trusted server-event verifier');
    const {ownerId, characterId, sourceEventId, definitionId, sourceKind, awardIndex} = claim;
    return transaction(async client => {
      // 7.2: recheck source existence and digest on BOTH first issuance and
      // idempotent replay. A conflicting stored row is not sufficient proof.
      const proof = await verifySource({client, claim:{
        ownerId, characterId, sourceEventId, definitionId, sourceKind, awardIndex
      }});
      if (proof?.ok !== true || proof.ownerId !== ownerId ||
          proof.characterId !== characterId || !sha256(proof.sourceDigest))
        throw Error('No trusted, committed source for item issuance');
      const sourceDigest=proof.sourceDigest;
      // 10.2: authorize *inside this same transaction* as item UUID mint.
      // A preflight in another connection is vulnerable to state changes.
      if(authorizeIssuance!==undefined &&
         (typeof authorizeIssuance!=='function' ||
         await authorizeIssuance({client,claim:{
           ownerId,characterId,sourceEventId,definitionId,sourceKind,awardIndex
         },sourceDigest})!==true))
        throw Error('Server item issuance authorization denied');
      const replayClaim={ownerId,characterId,sourceEventId,
        definitionId,sourceKind,awardIndex};
      const claimDigest=hash({...replayClaim,sourceDigest});
      const find = () => client.query(
        'SELECT * FROM game3d_item_issuance WHERE source_event_id=$1 AND award_index=$2 FOR UPDATE',
        [sourceEventId, awardIndex]);
      const existing = await find();
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (!verifyItemIssuanceReplay(row,replayClaim,sourceDigest))
          throw Error('Conflicting item issuance event replay');
        return {itemInstanceId:row.item_instance_id,sourceDigest,created:false};
      }
      const id = randomUUID();
      const inserted = await client.query(
        'INSERT INTO game3d_item_issuance ' +
        '(item_instance_id,owner_id,character_id,source_event_id,award_index,' +
        'definition_id,source_kind,source_digest,claim_digest) ' +
        'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT ' +
        '(source_event_id,award_index) DO NOTHING RETURNING item_instance_id',
        [id,ownerId,characterId,sourceEventId,awardIndex,definitionId,
          sourceKind,sourceDigest,claimDigest]);
      if (inserted.rowCount)
        return {itemInstanceId:id,sourceDigest,created:true};
      // Concurrent retry: never award a second item for one source event slot.
      const raced = await find();
      if (raced.rowCount !== 1 ||
          !verifyItemIssuanceReplay(raced.rows[0],replayClaim,sourceDigest))
        throw Error('Competing item issuance disagrees with committed event');
      return {itemInstanceId:raced.rows[0].item_instance_id,sourceDigest,created:false};
    });
  };

  // A strictly account-bound equipment projection. No bonuses are derived from
  // equipment here, and no client-submitted slot change is authorized by default.
  const changeEquipment = async ({ownerId,characterId,operationId,
    expectedRevision, equipmentSlot, itemInstanceId=null} = {}) => {
    if (!identity(ownerId) || !identity(characterId) || !key(operationId) ||
        !slot(equipmentSlot) || !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 || (itemInstanceId !== null && !uuid(itemInstanceId)))
      throw Error('Invalid equipment operation');
    if (typeof authorizeEquipment !== 'function')
      throw Error('5.0 equipment changes require trusted account authorization');
    const operationDigest=hash({ownerId,characterId,operationId,
      expectedRevision,equipmentSlot,itemInstanceId});
    return transaction(async client => {
      await client.query(
        'INSERT INTO game3d_character_equipment_revision(owner_id,character_id,revision) ' +
        'VALUES($1,$2,0) ON CONFLICT DO NOTHING',[ownerId,characterId]);
      const version=await client.query(
        'SELECT revision FROM game3d_character_equipment_revision ' +
        'WHERE owner_id=$1 AND character_id=$2 FOR UPDATE',[ownerId,characterId]);
      const previous=await client.query(
        'SELECT request_digest,result_revision FROM game3d_equipment_operation ' +
        'WHERE owner_id=$1 AND character_id=$2 AND operation_id=$3',
        [ownerId,characterId,operationId]);
      if (previous.rowCount) {
        if (previous.rows[0].request_digest !== operationDigest)
          throw Error('Conflicting equipment operation replay');
        return {revision:Number(previous.rows[0].result_revision),replayed:true};
      }
      if (Number(version.rows[0].revision) !== expectedRevision)
        throw Error('Stale equipment revision');
      if (await authorizeEquipment({client,ownerId,characterId,equipmentSlot,
        itemInstanceId,operationId}) !== true)
        throw Error('Equipment authorization denied');
      if (itemInstanceId !== null) {
        const issued=await client.query(
          'SELECT item_instance_id FROM game3d_item_issuance ' +
          'WHERE item_instance_id=$1 AND owner_id=$2 AND character_id=$3 FOR SHARE',
          [itemInstanceId,ownerId,characterId]);
        if (issued.rowCount !== 1)throw Error('Item not issued to this character');
        const already=await client.query(
          'SELECT equipment_slot FROM game3d_character_equipment ' +
          'WHERE item_instance_id=$1',[itemInstanceId]);
        if (already.rowCount && already.rows[0].equipment_slot !== equipmentSlot)
          throw Error('Issued item already equipped in another slot');
        await client.query(
          'INSERT INTO game3d_character_equipment' +
          '(owner_id,character_id,equipment_slot,item_instance_id) VALUES($1,$2,$3,$4) ' +
          'ON CONFLICT(owner_id,character_id,equipment_slot) ' +
          'DO UPDATE SET item_instance_id=EXCLUDED.item_instance_id',
          [ownerId,characterId,equipmentSlot,itemInstanceId]);
      } else {
        await client.query('DELETE FROM game3d_character_equipment ' +
          'WHERE owner_id=$1 AND character_id=$2 AND equipment_slot=$3',
          [ownerId,characterId,equipmentSlot]);
      }
      const updated=await client.query(
        'UPDATE game3d_character_equipment_revision SET revision=revision+1 ' +
        'WHERE owner_id=$1 AND character_id=$2 RETURNING revision',
        [ownerId,characterId]);
      const revision=Number(updated.rows[0].revision);
      await client.query(
        'INSERT INTO game3d_equipment_operation ' +
        '(owner_id,character_id,operation_id,request_digest,result_revision,' +
        'equipment_slot,item_instance_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [ownerId,characterId,operationId,operationDigest,revision,
          equipmentSlot,itemInstanceId]);
      return {revision,replayed:false};
    });
  };

  const readEquipment = async ({ownerId,characterId} = {}) => {
    if (!identity(ownerId)||!identity(characterId))
      throw Error('Invalid equipment owner');
    // This is an internal database read, NOT an account-facing endpoint.
    return transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const state=await client.query(
        'SELECT revision FROM game3d_character_equipment_revision ' +
        'WHERE owner_id=$1 AND character_id=$2',[ownerId,characterId]);
      const issued=await client.query(
        'SELECT e.equipment_slot,e.item_instance_id,i.definition_id,' +
        'i.source_kind,i.source_digest FROM game3d_character_equipment e ' +
        'JOIN game3d_item_issuance i ON i.item_instance_id=e.item_instance_id ' +
        'AND i.owner_id=e.owner_id AND i.character_id=e.character_id ' +
        'WHERE e.owner_id=$1 AND e.character_id=$2 ORDER BY e.equipment_slot',
        [ownerId,characterId]);
      return {ownerId,characterId,revision:Number(state.rows[0]?.revision||0),
        equipped:issued.rows.map(row=>({
          slot:row.equipment_slot,itemInstanceId:row.item_instance_id,
          definitionId:row.definition_id,sourceKind:row.source_kind,
          sourceDigest:row.source_digest,
        })),
        // These flags remain false until full progression and derivation exist.
        combatStatsVerified:false,rewardEligible:false,rewardsIssued:false};
    });
  };
  return {initialize,issueItem,changeEquipment,readEquipment};
}
