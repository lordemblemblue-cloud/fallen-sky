// Combat Foundation 5.6 — private PostgreSQL read-only provenance audit pages.
// Only backend code may call this; no HTTP API or account selector exposed.
import {verifyItemProvenanceChain} from './itemProvenanceReview.mjs';

const identity=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__default__'&&x!=='__anon__';
const uuid=x=>typeof x==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const blocked=code=>({ok:false,code,readyForRewards:false,
 competitiveEquipmentVerified:false,rewardsIssued:false});
export function summarizeOwnerProvenanceAudit({
  ownerId,characterId,rows,limit
}={}){
  if(!identity(ownerId)||!identity(characterId)||
     !Number.isSafeInteger(limit)||limit<1||limit>25||
     !Array.isArray(rows)||rows.length>limit+1)
    return blocked('invalid_audit_page');
  const entries=[],seen=new Set();
  for(const row of rows.slice(0,limit)){
    const issued=row.issued;
    if(!issued||issued.owner_id!==ownerId||
       issued.character_id!==characterId||!uuid(String(issued.item_instance_id))||
       seen.has(String(issued.item_instance_id)))
      return blocked('owner_or_item_mismatch');
    seen.add(String(issued.item_instance_id));
    const verdict=verifyItemProvenanceChain({
      issued,event:row.event,completion:row.completion,
      simulation:row.simulation,
    });
    entries.push({
      itemInstanceId:String(issued.item_instance_id),
      sourceStatus:verdict.ok?'consistent':'review_required',
      ...(verdict.ok?{definitionId:verdict.definitionId}
        :{reason:verdict.code}),
      // Never treat a consistent hash chain as a grant permit.
      rewardsEligible:false,
    });
  }
  return {
    ok:true,ownerId,characterId,entries,
    nextCursor:rows.length>limit?entries.at(-1)?.itemInstanceId||null:null,
    more:rows.length>limit,
    requiresManualReview:entries.some(e=>e.sourceStatus!=='consistent'),
    source:'private-pg-provenance-audit',readyForRewards:false,
    competitiveEquipmentVerified:false,rewardsIssued:false,
  };
}
export function createGame3DProvenanceAudit({pool}={}){
  if(!pool?.connect)throw Error('Provenance audit requires private PG pool');
  const page=async({ownerId,characterId,cursor=null,limit=20}={})=>{
    if(!identity(ownerId)||!identity(characterId)||
       (cursor!==null&&!uuid(cursor))||
       !Number.isSafeInteger(limit)||limit<1||limit>25)
      throw Error('Invalid owner-scoped provenance audit query');
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const r=await client.query(
        'SELECT row_to_json(i) AS issued,row_to_json(e) AS event,'+
        'row_to_json(c) AS completion,row_to_json(s) AS simulation '+
        'FROM game3d_item_issuance i '+
        'LEFT JOIN game3d_verified_gameplay_event e '+
        'ON e.event_id::text=i.source_event_id '+
        'LEFT JOIN game3d_server_completion_source c '+
        'ON c.completion_id=e.completion_id '+
        'LEFT JOIN game3d_simulation_completion_receipt s '+
        'ON s.completion_id=c.completion_id '+
        'WHERE i.owner_id=$1 AND i.character_id=$2 '+
        'AND ($3::uuid IS NULL OR i.item_instance_id>$3::uuid) '+
        'ORDER BY i.item_instance_id LIMIT $4',
        [ownerId,characterId,cursor,limit+1]);
      const value=summarizeOwnerProvenanceAudit({
        ownerId,characterId,rows:r.rows,limit,
      });
      await client.query('COMMIT');
      return value;
    }catch(error){
      try{await client.query('ROLLBACK')}catch{}
      throw error;
    }finally{client.release()}
  };
  return Object.freeze({page});
}
