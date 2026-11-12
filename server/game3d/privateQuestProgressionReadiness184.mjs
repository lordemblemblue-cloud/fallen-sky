// Combat / Quest 18.4 — fail-closed, READ-ONLY PG role readiness inspection.
// Dedicated progression writer may insert only server-authored kill-credit and
// turn-in journal columns, update only quest status, and lock the 18.3 lease.
// It must never be superuser, BYPASSRLS, own a schema or mutate XP/rewards.
const SCHEMA=/^[a-z][a-z0-9_]{0,62}$/;
const REQUIRED=Object.freeze([
 'game3d_trusted_character',
 'game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
]);
const INSERT=Object.freeze({
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id','objective_id',
  'reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision','source_kind',
  'rewards_issued',
 ],
});
const UPDATE=Object.freeze({
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
});
const fail=reason=>{throw Error('18.4 quest progression PG readiness denied: '+reason)};
const isRequiredColumn=(columns,table,column)=>
 columns[table]?.includes(column)===true;

export async function assertGame3DPrivateQuestProgressionReadiness184({
 pool,schema
}={}) {
 if(typeof pool?.connect!=='function'||typeof schema!=='string'||
    !SCHEMA.test(schema))fail('dedicated_schema_required');
 let db;
 try{
  db=await pool.connect();
  const role=await db.query(`
   SELECT current_user AS role_name,current_schema() AS schema_name,
    current_setting('is_superuser') AS superuser,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
    (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS can_create_role,
    (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS can_create_db,
    (SELECT rolreplication FROM pg_roles WHERE rolname=current_user) AS replication_role,
    has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create
  `);
  const roleInfo=role.rows?.[0];
  if(role.rowCount!==1||!roleInfo||roleInfo.schema_name!==schema||
     roleInfo.superuser!=='off'||roleInfo.bypass_rls!==false||
     roleInfo.can_create_role!==false||roleInfo.can_create_db!==false||
     roleInfo.replication_role!==false||roleInfo.schema_create!==false||
     roleInfo.database_create!==false)
   fail('privileged_progression_writer');

  const tableInfo=await db.query(`
   SELECT table_name,
    has_table_privilege(current_user,
     format('%I.%I',table_schema,table_name),'SELECT') AS can_select,
    has_table_privilege(current_user,
     format('%I.%I',table_schema,table_name),
     'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS dangerous
   FROM information_schema.tables
   WHERE table_schema=$1 AND table_type='BASE TABLE'
  `,[schema]);
  const tables=new Map((tableInfo.rows||[]).map(x=>[x.table_name,x]));
  if(REQUIRED.some(table=>!tables.has(table)||
     tables.get(table).can_select!==true||
     tables.get(table).dangerous!==false)||
     [...tables.values()].some(row=>row.dangerous===true))
   fail('missing_table_or_unsafe_grants');

  const columns=await db.query(`
   SELECT table_name,column_name,
    has_column_privilege(current_user,
     format('%I.%I',table_schema,table_name),
     column_name,'UPDATE') AS can_update,
    has_column_privilege(current_user,
     format('%I.%I',table_schema,table_name),
     column_name,'INSERT') AS can_insert
   FROM information_schema.columns WHERE table_schema=$1
  `,[schema]);
  const listed=new Set();
  for(const row of columns.rows||[]){
   listed.add(row.table_name+'.'+row.column_name);
   if((row.can_update===true&&
       !isRequiredColumn(UPDATE,row.table_name,row.column_name))||
      (row.can_insert===true&&
       !isRequiredColumn(INSERT,row.table_name,row.column_name)))
    fail('unexpected_progression_write_privilege');
  }
  const requiredUpdate=Object.entries(UPDATE).flatMap(([table,list])=>
   list.map(column=>table+'.'+column));
  const requiredInsert=Object.entries(INSERT).flatMap(([table,list])=>
   list.map(column=>table+'.'+column));
  if([...requiredUpdate,...requiredInsert].some(x=>!listed.has(x))||
     requiredUpdate.some(x=>!columns.rows.some(row=>
      row.table_name+'.'+row.column_name===x&&row.can_update===true))||
     requiredInsert.some(x=>!columns.rows.some(row=>
      row.table_name+'.'+row.column_name===x&&row.can_insert===true)))
   fail('required_progression_column_privilege_missing');
  return Object.freeze({ok:true,version:'18.4',
   restrictedRole:true,noEconomyWrites:true,privateServerOnly:true,
   productionReady:false,rewardsIssued:false});
 }catch(error){
  if(String(error?.message).startsWith(
   '18.4 quest progression PG readiness denied:'))throw error;
  fail('progression_database_unavailable');
 }finally{db?.release()}
}
