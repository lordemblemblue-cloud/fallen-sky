// Combat 10.5 — read-only progress and XP credits from private PostgreSQL.
// This requires a separately authenticated account-scoped server caller.
import {deriveCharacterLevel} from './progressionLevelPolicy.mjs';
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
export function createGame3DProgressionSnapshotReader({pool}={}){
 if(!pool?.connect)throw Error('Private PostgreSQL pool is required');
 const inspect=async({ownerId,characterId}={})=>{
  if(!who(ownerId)||!who(characterId))
   throw Error('Invalid progression owner scope');
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const r=await c.query('SELECT owner_id,character_id,revision,xp_total '+
    'FROM game3d_trusted_character WHERE owner_id=$1 AND character_id=$2',
    [ownerId,characterId]);
   if(r.rowCount!==1)throw Error('Unknown trusted progression character');
   const row=r.rows[0],level=deriveCharacterLevel(String(row.xp_total));
   const count=await c.query(
    'SELECT COUNT(*)::bigint AS credits FROM game3d_authoritative_xp_credit '+
    'WHERE owner_id=$1 AND character_id=$2',[ownerId,characterId]);
   await c.query('COMMIT');
   return {ownerId,characterId,revision:String(row.revision),
    totalXP:String(row.xp_total),creditCount:String(count.rows[0].credits),
    ...level,verifiedDerivedFromDatabase:true,
    gameplayAttesterDeployed:false,rewardsIssued:false};
  }catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
 };
 return Object.freeze({inspect});
}
