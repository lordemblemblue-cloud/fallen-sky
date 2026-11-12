// Combat Foundation 4.8 — beta-only source tests. NOT run in this phase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  buildStandardizedDuelManifest,verifyStandardizedDuelManifest,
  DUEL_BASELINE_STATS,DUEL_BASELINE_VERSION,
} from '../../../base44/shared/duelBaselineLoadout.mjs';
import {createPgCombatLedger} from '../transactionalLedger.mjs';

function evidence(owner,character){
  return {
    ok:true,ownerId:owner,characterId:character,revision:5,
    fingerprint:'fingerprint-'+owner,source:'browser-synced-character-vault',
    ownerBindingVerified:true,saveConsistencyVerified:true,
    combatStatsVerified:false,equipmentProvenanceVerified:false,
    eligible:false,rewardsIssued:false,
  };
}
const ticket=duelId=>({
  duelId,authorityEpoch:'cf48-epoch',challengerId:'alpha',opponentId:'bravo',
  characterEvidence:{
    source:'browser-synced-character-vault',
    challenger:evidence('alpha','hero1'),
    opponent:evidence('bravo','hero2'),
    combatStatsVerified:false,equipmentProvenanceVerified:false,
    rewardEligibility:'unverified_account',rewardsIssued:false,
  },
});
const loadout=t=>{
  return buildStandardizedDuelManifest({
    duelId:t.duelId,epoch:t.authorityEpoch,
    challengerId:t.challengerId,opponentId:t.opponentId,
    characterEvidence:t.characterEvidence,
  });
};
test('standardized manifest uses only server baseline, not browser stats or gear',()=>{
  const t=ticket('cf48-intro');
  t.challengerStats={level:100,damage:100000,maxHP:999999};
  t.opponentStats={level:1,damage:1,maxHP:1};
  const first=loadout(t);
  assert.equal(first.ruleset,DUEL_BASELINE_VERSION);
  assert.deepEqual(first.stats,DUEL_BASELINE_STATS);
  assert.deepEqual(first.equipment,[]);
  assert.equal(first.earnedProgressionVerified,false);
  assert.equal(first.equipmentProvenanceVerified,false);
  assert.equal(first.rewardsIssued,false);
  assert.equal(verifyStandardizedDuelManifest({...t,combatLoadout:first}).ok,true);
  assert.equal(verifyStandardizedDuelManifest({...t,
    combatLoadout:{...first,stats:{...first.stats,damage:999}}}).ok,false);
  assert.equal(verifyStandardizedDuelManifest({...t,
    combatLoadout:{...first,equipment:['fake-legendary']}}).ok,false);
  assert.equal(verifyStandardizedDuelManifest({...t,
    combatLoadout:{...first,rewardsIssued:true}}).ok,false);
});
test('character evidence mismatch or changed save revision refuses manifest',()=>{
  const t=ticket('cf48-owner');
  const manifest=loadout(t);
  assert.equal(verifyStandardizedDuelManifest({...t,
    characterEvidence:{...t.characterEvidence,
      opponent:{...t.characterEvidence.opponent,revision:6}},
    combatLoadout:manifest}).ok,false);
  assert.throws(()=>loadout({...t,
    characterEvidence:{...t.characterEvidence,
      challenger:{...t.characterEvidence.challenger,ownerId:'stranger'}}}),
    /participant evidence/);
});
const beta=process.env.GAME3D_TEST_PG_URL?test:test.skip;
beta('lease-fenced PostgreSQL pins one immutable loadout per duel',async()=>{
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:process.env.GAME3D_TEST_PG_URL,max:3});
  const duelId='cf48-'+randomUUID(),t=ticket(duelId);
  const first=loadout(t);
  const ledger=createPgCombatLedger({
    pool,ownerId:'cf48-owner-'+randomUUID(),
    journalEnabled:true,ledgerOnlyEnabled:true,
    lifecycleArchiveEnabled:true,rewardReviewEnabled:true,
    standardizedLoadoutEnabled:true,
  });
  try{
    await ledger.initialize();
    const lease=await ledger.acquire(duelId,t.authorityEpoch);
    assert.ok(lease);
    const hash=await ledger.bindLoadout(first,lease);
    assert.match(hash,/^[0-9a-f]{64}$/);
    assert.equal(await ledger.bindLoadout(first,lease),hash);
    await assert.rejects(()=>ledger.bindLoadout({
      ...first,challenger:{...first.challenger,vaultRevision:999},
    },lease),/changed after binding/);
    await pool.query(
      "UPDATE game3d_duel_lease SET expires_at=clock_timestamp()-interval '1 second' WHERE duel_id=$1",
      [duelId]);
    await assert.rejects(()=>ledger.bindLoadout(first,lease),/lease lost/);
  }finally{
    await pool.query('DELETE FROM game3d_duel_loadout WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_reward_review WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lifecycle_archive WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_report_journal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_terminal WHERE duel_id=$1',[duelId]);
    await pool.query('DELETE FROM game3d_duel_lease WHERE duel_id=$1',[duelId]);
    await pool.end();
  }
});
