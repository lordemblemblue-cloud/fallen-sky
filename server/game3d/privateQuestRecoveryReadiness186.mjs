// Combat / Quest 18.6 — read-only PG16 readiness for durable receipt replay.
// The projection role is NOT the world-kill issuer, session issuer or
// owner of the immutable binding table. No migration or GRANT is run.
import {assertGame3DPrivateQuestProgressionReadiness184}
 from './privateQuestProgressionReadiness184.mjs';

const fail=reason=>{throw Error(
 '18.6 private quest recovery readiness denied: '+reason);
};
export async function assertGame3DPrivateQuestRecoveryReadiness186({
 pool,schema,
}={}) {
 // Reuse the complete 18.4 allowlist (including no XP/economy writes).
 const restricted=await assertGame3DPrivateQuestProgressionReadiness184({
  pool,schema,
 });
 if(restricted?.ok!==true||restricted.noEconomyWrites!==true)
  fail('restricted_projection_writer_unverified');
 let db;
 try{
  db=await pool.connect();
  const rights=await db.query(`
   SELECT current_schema() AS schema_name,
    current_setting('server_version_num')::int AS pg_version,
    has_table_privilege(current_user,$1,'SELECT') AS can_select,
    has_table_privilege(current_user,$1,
     'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_mutate
  `,[schema+'.game3d_private_world_kill_lease_binding_185']);
  const role=rights.rows?.[0];
  if(rights.rowCount!==1||role?.schema_name!==schema||
     !Number.isInteger(role?.pg_version)||role.pg_version<160000||
     role.can_select!==true||role.can_mutate!==false)
   fail('immutable_binding_not_select_only');
  const integrity=await db.query(`
   SELECT c.conname,c.contype,c.convalidated
   FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname=$1 AND c.conname IN
    ('game3d_private_kill_receipt_binding_key_185',
     'game3d_quest_kill_credit_bound_receipt_185')
  `,[schema]);
  const constraints=new Map((integrity.rows||[]).map(row=>[row.conname,row]));
  if(constraints.get('game3d_private_kill_receipt_binding_key_185')
      ?.contype!=='u'||
     constraints.get('game3d_private_kill_receipt_binding_key_185')
      ?.convalidated!==true||
     constraints.get('game3d_quest_kill_credit_bound_receipt_185')
      ?.contype!=='f'||
     constraints.get('game3d_quest_kill_credit_bound_receipt_185')
      ?.convalidated!==true)
   fail('receipt_binding_integrity_not_validated');
  const trigger=await db.query(`
   SELECT t.tgenabled AS enabled
   FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname=$1
    AND r.relname='game3d_private_world_kill_lease_binding_185'
    AND t.tgname='game3d_private_world_kill_lease_binding_185_immutable'
    AND NOT t.tgisinternal
  `,[schema]);
  if(trigger.rowCount!==1||!['O','A'].includes(trigger.rows?.[0]?.enabled))
   fail('immutable_binding_trigger_missing');
  return Object.freeze({ok:true,version:'18.6',
   immutableReceiptsVerified:true,restrictedProjectionOnly:true,
   rewardsIssued:false,productionReady:false});
 }catch(error){
  if(String(error?.message).startsWith(
   '18.6 private quest recovery readiness denied:'))throw error;
  fail('read_only_pg_integrity_unavailable');
 }finally{db?.release()}
}
