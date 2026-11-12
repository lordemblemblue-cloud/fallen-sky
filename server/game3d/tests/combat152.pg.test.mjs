// Only run with a disposable PostgreSQL instance. No player/account DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';

const PG_URL=process.env.GAME3D_152_DISPOSABLE_PG_URL;
const ownerA='owner152',heroA='hero152';
const ownerB='owner152b',heroB='hero152b';
const committed='2026-11-02T00:00:00.000Z';
const received='2026-11-01T00:00:00.000Z';
const scope={ownerId:ownerA,characterId:heroA};
const createReceipt=(pool,id,seq,tier='normal',ownerId=ownerA,characterId=heroA,
 when=committed)=>pool.query(`
 INSERT INTO game3d_private_world_kill_receipt_152
 (receipt_id,owner_id,character_id,instance_id,instance_epoch,
  map_fingerprint,event_seq,enemy_id,enemy_tier,source_kind,
  server_kill_committed,committed_at)
 VALUES ($1,$2,$3,'world-152','epoch-152','${'a'.repeat(64)}',
  $4,$5,$6,'server-committed-private-pve-kill',true,$7)`,
 [id,ownerId,characterId,seq,`wolf_${seq}`,tier,when]);
const bind=(pool,quest,objective,type,count,{
 tier=null,enemyId=null,status='accepted',at=received,
 ownerId=ownerA,characterId=heroA
}={})=>pool.query(`
 INSERT INTO game3d_private_quest_objective_binding_152
 (owner_id,character_id,quest_id,objective_id,objective_type,
  enemy_tier,enemy_id,required_count,status,accepted_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
 [ownerId,characterId,quest,objective,type,tier,enemyId,count,status,at]);
const credits=async(pool,ownerId=ownerA,characterId=heroA)=>{
 const r=await pool.query(`SELECT receipt_id,quest_id,objective_id
 FROM game3d_private_quest_kill_credit_152
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY receipt_id,quest_id,objective_id`,[ownerId,characterId]);
 return r.rows;
};

test('15.2 private disposable PostgreSQL: real transactional quest-kill journal',
 {skip:!PG_URL},async(t)=>{
 const {default:pg}=await import('pg');
 const schema='g3d_quest_152_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:PG_URL,max:2});
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:PG_URL,
   options:'-c search_path='+schema,max:12});
  // Minimal fixtures for the required schema-001 canonical character and its
  // append-only trigger. Migration 035 itself is loaded verbatim.
  await pool.query(`CREATE TABLE game3d_trusted_character (
    owner_id text NOT NULL,character_id text NOT NULL,
    PRIMARY KEY(owner_id,character_id))`);
  await pool.query(`CREATE FUNCTION game3d_item_provenance_immutable()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'private immutable journal'; END;$$`);
  await pool.query(`INSERT INTO game3d_trusted_character
    VALUES ($1,$2),($3,$4)`,[ownerA,heroA,ownerB,heroB]);
  const ddl=await readFile(
   new URL('../sql/035_combat152_private_quest_credits.sql',import.meta.url),
   'utf8');
  await pool.query(ddl);

  const accepted=true;
  const auth=async({operation,ownerId,characterId})=>
   accepted&&ownerId===ownerA&&characterId===heroA&&
   ['project_committed_quest_kill','read_committed_quest_progress'].includes(operation);
  const ledger=createGame3DPrivateCommittedQuestCredits152({
   pool,authorizeServerOperation:auth});
  await t.test('private adapter cannot mint receipts, give rewards or open routes',()=>{
   assert.equal(ledger.privateServerOnly,true);
   assert.equal(ledger.committedReceiptWriterInstalled,false);
   assert.equal(ledger.trustedQuestAcceptanceWriterInstalled,false);
   assert.equal(ledger.questTurnInWriterEnabled,false);
   assert.equal(ledger.rewardWriterEnabled,false);
   assert.equal(ledger.productionReady,false);
   assert.equal(typeof ledger.grantXP,'undefined');
   assert.equal(typeof ledger.recordKill,'undefined');
  });
  await bind(pool,'patrol','kill_3','kill',2);
  await bind(pool,'elite','elite_1','kill_tier',1,{tier:'elite'});
  await bind(pool,'cave','cave_entry','kill',1,{enemyId:'never_this_enemy'});
  await bind(pool,'later','late_kill','kill',1,{at:'2026-11-03T00:00:00Z'});
  await bind(pool,'declined','no_credit','kill',1,{status:'abandoned'});
  await bind(pool,'other_account','hidden','kill',1,
   {ownerId:ownerB,characterId:heroB});

  await t.test('missing or wrong-owner receipts fail with no side effects',async()=>{
   assert.equal((await ledger.project({...scope,receiptId:'missing-152-01'})).reason,
    'committed_server_kill_receipt_missing');
   await createReceipt(pool,'receipt-152-b',88,'normal',ownerB,heroB);
   assert.equal((await ledger.project({...scope,receiptId:'receipt-152-b'})).reason,
    'committed_server_kill_receipt_missing');
   assert.equal((await ledger.project({
    ownerId:ownerB,characterId:heroB,receiptId:'receipt-152-b'
   })).reason,'unverified_private_quest_projection');
   assert.deepEqual(await credits(pool),[]);
  });
  await t.test('committed DB receipt credits only accepted matching objectives',async()=>{
   await createReceipt(pool,'receipt-152-01',1,'normal');
   const first=await ledger.project({...scope,receiptId:'receipt-152-01'});
   assert.equal(first.ok,true);
   assert.equal(first.killCreditCommitted,true);
   assert.deepEqual(first.credited.map(x=>x.questId),['patrol']);
   assert.equal(first.credited[0].count,1);
   assert.equal(first.credited[0].readyForTurnIn,false);
   assert.equal(first.rewardAuthorized,false);
   assert.equal(first.questTurnInCommitted,false);
   const again=await ledger.project({...scope,receiptId:'receipt-152-01'});
   assert.equal(again.ok,true);
   assert.equal(again.killCreditCommitted,false);
   assert.deepEqual(again.credited,[]);
   assert.equal((await credits(pool)).length,1);
  });
  await t.test('distinct receipts fill objective cap, tier match only from DB',async()=>{
   await createReceipt(pool,'receipt-152-02',2,'normal');
   await createReceipt(pool,'receipt-152-03',3,'normal');
   await createReceipt(pool,'receipt-152-04',4,'elite');
   const a=await ledger.project({...scope,receiptId:'receipt-152-02'});
   assert.equal(a.credited[0].readyForTurnIn,true);
   assert.deepEqual((await ledger.project({...scope,receiptId:'receipt-152-03'})).credited,[]);
   const elite=await ledger.project({...scope,receiptId:'receipt-152-04'});
   assert.deepEqual(elite.credited.map(x=>x.questId),['elite']);
   const snapshot=await ledger.readProgress(scope);
   assert.equal(snapshot.ok,true);
   assert.deepEqual(snapshot.objectives.filter(x=>x.current>0)
    .map(x=>[x.questId,x.current,x.required]),
    [['elite',1,1],['patrol',2,2]]);
   assert.equal(snapshot.rewardAuthorized,false);
  });
  await t.test('database unique keys, composite FKs and immutability stop replays',async()=>{
   await assert.rejects(createReceipt(pool,'receipt-152-01',1,'normal'));
   await assert.rejects(createReceipt(pool,'receipt-152-duplicate-seq',1,'normal'));
   await assert.rejects(pool.query(`UPDATE game3d_private_world_kill_receipt_152
    SET enemy_tier='elite' WHERE receipt_id='receipt-152-01'`));
   await assert.rejects(pool.query(`DELETE FROM game3d_private_quest_kill_credit_152
    WHERE receipt_id='receipt-152-01'`));
   await assert.rejects(pool.query(`INSERT INTO game3d_private_quest_kill_credit_152
    (receipt_id,owner_id,character_id,quest_id,objective_id)
    VALUES ('receipt-152-01',$1,$2,'other_account','hidden')`,
    [ownerB,heroB]));
   assert.equal((await credits(pool)).length,3);
  });
  await t.test('two competing valid receipts never over-credit an objective',async()=>{
   await bind(pool,'one_shot','one_kill','kill',1);
   await createReceipt(pool,'receipt-152-05',5,'normal');
   await createReceipt(pool,'receipt-152-06',6,'normal');
   const results=await Promise.all([
    ledger.project({...scope,receiptId:'receipt-152-05'}),
    ledger.project({...scope,receiptId:'receipt-152-06'}),
   ]);
   assert(results.every(x=>x.ok===true));
   assert.equal(results.reduce((n,x)=>n+x.credited.filter(
    q=>q.questId==='one_shot').length,0),1);
   const row=await ledger.readProgress(scope);
   assert.equal(row.objectives.find(x=>x.questId==='one_shot').current,1);
  });
  await t.test('deny-by-default server operation prevents reads and projections',async()=>{
   const blocked=createGame3DPrivateCommittedQuestCredits152({
    pool,authorizeServerOperation:async()=>false});
   assert.equal((await blocked.readProgress(scope)).ok,false);
   assert.equal((await blocked.project({...scope,
    receiptId:'receipt-152-01'})).ok,false);
  });
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await admin.end();
 }
});

test('15.2 source remains private and cannot turn client candidates into grants',()=>{
 const source=readFileSync(new URL('../privateCommittedQuestCredits152.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/from ['"].*GameWorld3D/);
 assert.doesNotMatch(source,/awardXP\(|grantQuestReward\(|addGold\(|grantItem\(/);
 assert.match(source,/committedReceiptWriterInstalled:false/);
 assert.match(source,/questTurnInWriterEnabled:false/);
});