// Combat Foundation 4.9 — source-only beta contracts. DO NOT run until beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  inspectServerRolledUpgradeRecords,buildDuelUpgradeAudit,verifyDuelUpgradeAudit,
} from '../../../base44/shared/duelUpgradeAudit.mjs';
import {buildStandardizedDuelManifest}
  from '../../../base44/shared/duelBaselineLoadout.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

const evidence=(owner,character)=>({
  ok:true,ownerId:owner,characterId:character,revision:2,
  fingerprint:'cf49-'+owner,
  source:'browser-synced-character-vault',
  ownerBindingVerified:true,saveConsistencyVerified:true,
  combatStatsVerified:false,equipmentProvenanceVerified:false,
  eligible:false,rewardsIssued:false,
});
const ticket=duelId=>({
  duelId,authorityEpoch:'cf49-epoch',
  challengerId:'a',opponentId:'b',
  characterEvidence:{
    challenger:evidence('a','hero-a'),opponent:evidence('b','hero-b'),
    source:'browser-synced-character-vault',
    combatStatsVerified:false,equipmentProvenanceVerified:false,
    rewardEligibility:'unverified_account',rewardsIssued:false,
  },
});
const row=(owner,char,item,service)=>({
  owner_id:owner,character_id:char,item_id:item,service,
  record:service==='refine'?{level:1}:{percent:3},
  attempts:1,spent:['drop-id-1'],rolled_at:'2026-10-01T12:00:00Z',
});
async function complete(t,arr=[row('a','hero-a','blade-1','reinforcement')]){
  const a=await inspectServerRolledUpgradeRecords({
    ownerId:'a',characterId:'hero-a',rows:arr,
  });
  const b=await inspectServerRolledUpgradeRecords({
    ownerId:'b',characterId:'hero-b',rows:[],
  });
  return buildDuelUpgradeAudit({
    duelId:t.duelId,epoch:t.authorityEpoch,
    characterEvidence:t.characterEvidence,challenger:a,opponent:b,
  });
}
const manifest=t=>buildStandardizedDuelManifest({
  duelId:t.duelId,epoch:t.authorityEpoch,
  challengerId:t.challengerId,opponentId:t.opponentId,
  characterEvidence:t.characterEvidence,
});
test('server-held roll audit is deterministic but never verifies base item minting',async()=>{
  const first=await inspectServerRolledUpgradeRecords({
    ownerId:'a',characterId:'hero-a',
    rows:[row('a','hero-a','z','refine'),row('a','hero-a','a','reinforcement')],
  });
  const second=await inspectServerRolledUpgradeRecords({
    ownerId:'a',characterId:'hero-a',
    rows:[row('a','hero-a','a','reinforcement'),row('a','hero-a','z','refine')],
  });
  assert.equal(first.ok,true);
  assert.equal(first.recordsDigest,second.recordsDigest);
  assert.equal(first.recordCount,2);
  assert.equal(first.baseItemIssuanceVerified,false);
  assert.equal(first.equipmentProvenanceVerified,false);
  assert.equal(first.eligible,false);
});
test('wrong owner, duplicate same service and altered server roll refuse admission',async()=>{
  const inspect=rows=>inspectServerRolledUpgradeRecords({
    ownerId:'a',characterId:'hero-a',rows,
  });
  const good=row('a','hero-a','weapon','over_enchant');
  assert.equal((await inspect([good,good])).code,'duplicate_upgrade_records');
  assert.equal((await inspect([{...good,owner_id:'outside'}])).ok,false);
  assert.equal((await inspect([{...good,attempts:-1}])).ok,false);
  assert.equal((await inspect([{...good,service:'unverified_gear'}])).ok,false);
  const r1=await inspect([good]);
  const r2=await inspect([{...good,record:{level:300}}]);
  assert.notEqual(r1.recordsDigest,r2.recordsDigest);
});
test('signed roll review cannot claim verified equipment or another character',async()=>{
  const t=ticket('cf49-test'),audit=await complete(t);
  assert.equal(verifyDuelUpgradeAudit({...t,upgradeAudit:audit}).ok,true);
  assert.equal(verifyDuelUpgradeAudit({...t,upgradeAudit:{
    ...audit,equipmentProvenanceVerified:true,
  }}).ok,false);
  assert.equal(verifyDuelUpgradeAudit({...t,upgradeAudit:{
    ...audit,opponent:{...audit.opponent,characterId:'somebody-else'},
  }}).ok,false);
  assert.equal(verifyDuelUpgradeAudit({...t,upgradeAudit:{
    ...audit,rewardsIssued:true,
  }}).ok,false);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('lease-fenced baseline and roll evidence commit together without gear awards',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf49-'+randomUUID(),t=ticket(duelId);
  const loadout=manifest(t),audit=await complete(t);
  const ledger=createPgCombatLedger({
    pool,ownerId:'cf49-worker-'+randomUUID(),
    journalEnabled:true,ledgerOnlyEnabled:true,lifecycleArchiveEnabled:true,
    rewardReviewEnabled:true,standardizedLoadoutEnabled:true,
    upgradeAuditEnabled:true,
  });
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(duelId,t.authorityEpoch);
    assert.ok(lease);
    const hash=await ledger.bindLoadout(loadout,lease,{upgradeAudit:audit});
    assert.match(hash,/^[0-9a-f]{64}$/);
    assert.equal(await ledger.bindLoadout(loadout,lease,{upgradeAudit:audit}),hash);
    const changed={...audit,challenger:{
      ...audit.challenger,recordsDigest:'a'.repeat(64),
    }};
    await assert.rejects(
      ()=>ledger.bindLoadout(loadout,lease,{upgradeAudit:changed}),/changed/);
    const original=await pool.query(
      'SELECT COUNT(*)::int AS n FROM game3d_duel_upgrade_audit WHERE duel_id=$1',
      [duelId]);
    assert.equal(original.rows[0].n,1);
    assert.equal(loadout.equipment.length,0);
    assert.equal(audit.equipmentProvenanceVerified,false);
    await pool.query(
      "UPDATE game3d_duel_lease SET expires_at=clock_timestamp()-interval '1 second' WHERE duel_id=$1",
      [duelId]);
    await assert.rejects(
      ()=>ledger.bindLoadout(loadout,lease,{upgradeAudit:audit}),/lease lost/);
  }finally{
    await pool.query('DELETE FROM game3d_duel_upgrade_audit WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_loadout WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_reward_review WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
