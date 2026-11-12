// Combat / Quest 15.4 — disposable PostgreSQL 16 only, not live accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readFileSync} from 'node:fs';
import {readFile as readAsync} from 'node:fs/promises';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {PRIVATE_QUEST_CATALOG_154,
 PRIVATE_QUEST_CATALOG_REVISION_154} from '../privateQuestCatalog154.mjs';

const pgUrl=process.env.GAME3D_154_DISPOSABLE_PG_URL;
const a={ownerId:'owner154',characterId:'hero154'};
const b={ownerId:'owner154b',characterId:'hero154b'};
const receipt=async(pool,id,ownerId,characterId,tier='normal')=>
 pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
 map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,server_kill_committed)
 VALUES ($1,$2,$3,'world-154','epoch-154',
 '${'c'.repeat(64)}',$4,$5,$6,'server-committed-private-pve-kill',true)`,
 [id,ownerId,characterId,Number(id.split('-').at(-1)),`foe_${id}`,tier]);

test('15.4 real PostgreSQL: server-owned quest acceptance and durable kill handoff',
 {skip:!pgUrl,timeout:120000},async(t)=>{
 const {default:pg}=await import('pg');
 const schema='g3d_accept_154_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:pgUrl,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:pgUrl,max:12,
   options:'-c search_path='+schema});
  await pool.query(`CREATE TABLE game3d_trusted_character (
   owner_id text NOT NULL,character_id text NOT NULL,
   xp_total bigint NOT NULL DEFAULT 0,
   revision bigint NOT NULL DEFAULT 0,
   PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
   RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'immutable private ledger'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
   (owner_id,character_id,xp_total) VALUES
   ($1,$2,0),($3,$4,0)`,
   [a.ownerId,a.characterId,b.ownerId,b.characterId]);
  for(const name of [
   '035_combat152_private_quest_credits.sql',
   '036_combat154_private_quest_acceptance.sql'
  ])await pool.query(await readAsync(
   new URL('../sql/'+name,import.meta.url),'utf8'));

  const permit=({operation,ownerId,characterId,questId})=>
   ownerId===a.ownerId&&characterId===a.characterId&&
   (operation==='accept_private_server_quest'&&
    ['axe_q_first_patrol','axe_q_first_elite'].includes(questId)||
    operation==='read_private_server_quests');
  const writer=createGame3DPrivateQuestAcceptance154({
   pool,authorizeServerOperation:async info=>permit(info)});
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:async({ownerId,characterId})=>
    ownerId===a.ownerId&&characterId===a.characterId
  });

  await t.test('unknown quests, wrong character and browser reward/objective payload fail',async()=>{
   assert.equal((await writer.accept({...a,questId:'forged_quest_154'})).reason,
    'quest_not_in_private_server_catalog');
   assert.equal((await writer.accept({...b,questId:'axe_q_first_patrol'})).reason,
    'private_quest_acceptance_unauthorized');
   assert.equal((await writer.readAccepted(b)).ok,false);
   assert.equal((await writer.accept({...a,questId:'axe_q_first_elite'})).reason,
    'quest_prerequisite_unfinished');
   assert.equal((await pool.query(
    'SELECT count(*)::int AS n FROM game3d_private_quest_objective_binding_152'
   )).rows[0].n,0);
  });
  await t.test('first accepted patrol creates canonical server objectives atomically',async()=>{
   const result=await writer.accept({...a,questId:'axe_q_first_patrol',
    objectives:[{id:'fake',type:'kill',count:1}],
    level:100,claimedReward:{xp:999999}});
   assert.equal(result.ok,true);
   assert.equal(result.accepted,true);
   assert.equal(result.objectiveCount,1);
   assert.equal(result.catalogRevision,PRIVATE_QUEST_CATALOG_REVISION_154);
   assert.equal(result.rewardAuthorized,false);
   const q=(await writer.readAccepted(a)).quests;
   assert.equal(q.length,1);
   assert.equal(q[0].id,'axe_q_first_patrol');
   assert.deepEqual(q[0].objectives.map(o=>[o.id,o.type,o.count]),
    [['patrol_kills','kill',3]]);
   const db=await pool.query(`SELECT o.accepted_at,a.accepted_at AS root_time
    FROM game3d_private_quest_objective_binding_152 o
    JOIN game3d_private_quest_acceptance_154 a USING
     (owner_id,character_id,quest_id)`);
   assert.equal(new Date(db.rows[0].accepted_at).getTime(),
    new Date(db.rows[0].root_time).getTime());
   assert.equal((await writer.accept({...a,questId:'axe_q_first_patrol'})).reason,
    'nonrepeatable_quest_already_registered');
  });
  await t.test('foreign-key restriction blocks objective inserted without accepted root',async()=>{
   await assert.rejects(pool.query(`
    INSERT INTO game3d_private_quest_objective_binding_152
    (owner_id,character_id,quest_id,objective_id,objective_type,
    required_count,status,accepted_at)
    VALUES($1,$2,'injected_quest','fake_kill','kill',1,
    'accepted',clock_timestamp())`,[a.ownerId,a.characterId]));
  });
  await t.test('real committed kill receipt counts only accepted objective, no payout',async()=>{
   await receipt(pool,'receipt-154-1',a.ownerId,a.characterId);
   const result=await ledger.project({...a,receiptId:'receipt-154-1'});
   assert.equal(result.ok,true);
   assert.deepEqual(result.credited.map(x=>[x.questId,x.objectiveId,x.required]),
    [['axe_q_first_patrol','patrol_kills',3]]);
   assert.equal(result.rewardAuthorized,false);
   assert.equal((await ledger.project({...a,receiptId:'receipt-154-1'})).credited.length,0);
   const snap=await ledger.readProgress(a);
   assert.equal(snap.objectives[0].current,1);
   assert.equal(snap.objectives[0].required,3);
  });
  await t.test('simultaneous acceptance and repeat attempts never generate duplicate heads',async()=>{
   const again=await Promise.all([
    writer.accept({...a,questId:'axe_q_first_patrol'}),
    writer.accept({...a,questId:'axe_q_first_patrol'})
   ]);
   assert(again.every(x=>!x.ok));
   const n=await pool.query(`SELECT COUNT(*)::int AS n
    FROM game3d_private_quest_acceptance_154`);
   assert.equal(n.rows[0].n,1);
  });
  await t.test('completed prerequisite gates the elite objective; repeatable re-accept stays disabled',async()=>{
   await pool.query(`UPDATE game3d_private_quest_acceptance_154
    SET status='completed'
    WHERE owner_id=$1 AND character_id=$2
     AND quest_id='axe_q_first_patrol'`,[a.ownerId,a.characterId]);
   await pool.query(`UPDATE game3d_private_quest_objective_binding_152
    SET status='completed'
    WHERE owner_id=$1 AND character_id=$2
     AND quest_id='axe_q_first_patrol'`,[a.ownerId,a.characterId]);
   const elite=await writer.accept({...a,questId:'axe_q_first_elite',
    tier:'normal',objectives:[{id:'elite_kill',count:999}]});
   assert.equal(elite.ok,true);
   const rows=await pool.query(`
    SELECT objective_id,objective_type,enemy_tier,required_count
    FROM game3d_private_quest_objective_binding_152
    WHERE quest_id='axe_q_first_elite'`);
   assert.deepEqual(rows.rows.map(r=>[r.objective_id,r.objective_type,
    r.enemy_tier,r.required_count]),[['elite_kill','kill_tier','elite',1]]);
   assert.equal((await writer.accept({...a,questId:'axe_q_first_elite'})).reason,
    'nonrepeatable_quest_already_registered');
   await receipt(pool,'receipt-154-2',a.ownerId,a.characterId,'normal');
   assert.equal((await ledger.project({...a,receiptId:'receipt-154-2'})).credited.length,0);
   await receipt(pool,'receipt-154-3',a.ownerId,a.characterId,'elite');
   const credited=await ledger.project({...a,receiptId:'receipt-154-3'});
   assert.deepEqual(credited.credited.map(x=>x.questId),['axe_q_first_elite']);
  });
  await t.test('genuine simultaneous first acceptance serializes by character row',async()=>{
   const other=createGame3DPrivateQuestAcceptance154({
    pool,authorizeServerOperation:async({ownerId,characterId,operation})=>
     ownerId===b.ownerId&&characterId===b.characterId&&
     operation==='accept_private_server_quest'
   });
   const result=await Promise.all([
    other.accept({...b,questId:'axe_q_first_patrol'}),
    other.accept({...b,questId:'axe_q_first_patrol'})
   ]);
   assert.equal(result.filter(x=>x.accepted===true).length,1);
   assert.equal(result.filter(x=>x.reason==='nonrepeatable_quest_already_registered').length,1);
   const heads=await pool.query(`SELECT COUNT(*)::int AS n
    FROM game3d_private_quest_acceptance_154
    WHERE owner_id=$1 AND character_id=$2`,[b.ownerId,b.characterId]);
   const objectives=await pool.query(`SELECT COUNT(*)::int AS n
    FROM game3d_private_quest_objective_binding_152
    WHERE owner_id=$1 AND character_id=$2`,[b.ownerId,b.characterId]);
   assert.equal(heads.rows[0].n,1);
   assert.equal(objectives.rows[0].n,1);
  });
  await t.test('authorizer failure forbids reads and acceptance without leaking history',async()=>{
   const denied=createGame3DPrivateQuestAcceptance154({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await denied.readAccepted(a)).ok,false);
   assert.equal((await denied.accept({...a,questId:'axe_q_first_patrol'})).ok,false);
   assert.equal(denied.rewardWriterEnabled,false);
   assert.equal(denied.publicQuestEndpointInstalled,false);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});

test('15.4 catalog matches existing author-authored AXE patrol and elite narrative contract',()=>{
 const source=readFileSync(new URL('../../../src/components/game3d/axe/quests/AXEQuestFramework.js',
  import.meta.url),'utf8');
 for(const [id,q] of Object.entries(PRIVATE_QUEST_CATALOG_154)){
  assert.match(source,new RegExp("id: '"+id+"'"));
  for(const o of q.objectives){
   assert.match(source,new RegExp("id: '"+o.id+"', type: '"+o.type+"'"));
   if(o.tier)assert.match(source,new RegExp("tier: '"+o.tier+"'"));
  }
  assert.equal(q.repeatable,false);
 }
});
test('15.4 accepts only IDs from private server catalog and has no user reward API',()=>{
 const source=readFileSync(new URL('../privateQuestAcceptance154.mjs',import.meta.url),'utf8');
 assert.match(source,/getPrivateQuestDefinition154\(questId\)/);
 assert.match(source,/FOR UPDATE/);
 assert.match(source,/deriveCharacterLevel/);
 assert.doesNotMatch(source,/awardXP\(|grantQuestReward\(|grantItem\(|addGold\(|window\.|localStorage|createServer\(/);
});
