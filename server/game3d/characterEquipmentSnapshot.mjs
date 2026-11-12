// Combat Foundation 5.5 — read-only, versioned account equipment review.
// The verified chain proves DB consistency, never earned combat stats.
// No browser route and no equipment mutation. This cannot grant rewards.
import {createHash} from 'node:crypto';
import {stableJournalJSON} from '../../base44/shared/duelJournalProof.mjs';
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';

const owner=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
  x!=='__anon__'&&x!=='__default__';
const slot=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(x);
const revision=x=>Number.isSafeInteger(x)&&x>=0;
const digest=x=>createHash('sha256').update(stableJournalJSON(x)).digest('hex');
const blocked=(reason)=>({
  ok:false,reason,
  loadoutEligible:false,competitiveBonusesEnabled:false,
  authenticityVerified:false,rewardsEligible:false,rewardsIssued:false,
});
// Pure projection that treats malformed, missing or partial evidence as
// blocking the snapshot, NOT as an invitation to fall back to browser saves.
export function reviewCharacterEquipmentSnapshot({
  ownerId,characterId,expectedRevision,rows
}={}){
  if(!owner(ownerId)||!owner(characterId)||!revision(expectedRevision))
    return blocked('invalid_character_revision_binding');
  if(!Array.isArray(rows)||!rows.length||rows.length>25)
    return blocked('equipment_snapshot_unavailable');
  const actual=Number(rows[0].revision);
  if(!revision(actual)||actual!==expectedRevision||
     rows.some(r=>Number(r.revision)!==actual))
    return blocked('equipment_revision_conflict');
  const equipped=rows.filter(r=>r.equipment_slot!==null);
  // A nullable left-join row is valid only for an empty loadout.
  if(equipped.length===0 && rows.length!==1)
    return blocked('invalid_empty_equipment_projection');
  if(equipped.length>24||
    rows.some(r=>r.equipment_slot===null && rows.length!==1))
    return blocked('equipment_slot_limit_exceeded');
  const slots=new Set(),items=new Set(),evidence=[];
  for(const row of equipped){
    if(!slot(row.equipment_slot)||slots.has(row.equipment_slot)||
       !row.issued||row.issued.owner_id!==ownerId||
       row.issued.character_id!==characterId||
       String(row.equipped_item_id)!==String(row.issued.item_instance_id)||
       items.has(String(row.issued.item_instance_id)))
      return blocked('cross_character_or_duplicate_equipment');
    slots.add(row.equipment_slot);
    items.add(String(row.issued.item_instance_id));
    const proof=verifyItemProvenanceChain({
      issued:row.issued,event:row.event,
      completion:row.completion,simulation:row.simulation,
    });
    if(!proof.ok)return blocked('equipped_item_'+proof.code);
    evidence.push({
      slot:row.equipment_slot,
      itemInstanceId:proof.itemInstanceId,
      definitionId:proof.definitionId,
      sourceDigest:proof.sourceDigest,
      simulationReceiptDigest:proof.simulationReceiptDigest,
    });
  }
  evidence.sort((a,b)=>a.slot.localeCompare(b.slot,'en'));
  const binding={ownerId,characterId,revision:actual,equipped:evidence};
  return {
    ok:true,...binding,digest:digest(binding),
    source:'private-postgres-equipment-snapshot',
    equipmentOwnershipConsistent:true,
    // A trusted *runtime* game attester still has to be installed first.
    authenticityVerified:false,statsVerified:false,
    loadoutEligible:false,competitiveBonusesEnabled:false,
    rewardsEligible:false,rewardsIssued:false,
  };
}

export function createGame3DEquipmentSnapshotReader({pool}={}){
  if(!pool?.connect)throw Error('5.5 requires private PostgreSQL pool');
  const inspect=async({ownerId,characterId,expectedRevision}={})=>{
    if(!owner(ownerId)||!owner(characterId)||!revision(expectedRevision))
      throw Error('Invalid equipment snapshot request');
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result=await client.query(
        'SELECT r.revision, eq.equipment_slot, '+
        'eq.item_instance_id AS equipped_item_id, '+
        'row_to_json(i) AS issued, row_to_json(e) AS event, '+
        'row_to_json(c) AS completion, row_to_json(s) AS simulation '+
        'FROM game3d_character_equipment_revision r '+
        'LEFT JOIN game3d_character_equipment eq '+
        'ON eq.owner_id=r.owner_id AND eq.character_id=r.character_id '+
        'LEFT JOIN game3d_item_issuance i ON i.item_instance_id=eq.item_instance_id '+
        'AND i.owner_id=r.owner_id AND i.character_id=r.character_id '+
        'LEFT JOIN game3d_verified_gameplay_event e ON e.event_id::text=i.source_event_id '+
        'LEFT JOIN game3d_server_completion_source c ON c.completion_id=e.completion_id '+
        'LEFT JOIN game3d_simulation_completion_receipt s ON s.completion_id=c.completion_id '+
        'WHERE r.owner_id=$1 AND r.character_id=$2 '+
        'ORDER BY eq.equipment_slot NULLS FIRST LIMIT 25',
        [ownerId,characterId]);
      const reviewed=reviewCharacterEquipmentSnapshot({
        ownerId,characterId,expectedRevision,rows:result.rows,
      });
      await client.query('COMMIT');
      return reviewed;
    }catch(error){
      try{await client.query('ROLLBACK')}catch{}
      throw error;
    }finally{client.release()}
  };
  return Object.freeze({inspect});
}
