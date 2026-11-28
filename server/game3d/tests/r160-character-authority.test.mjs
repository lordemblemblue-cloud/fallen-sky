// R160: source-only checks, no authentication or data-service bypass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCharacterSave,fingerprintCharacterSave} from '../../../base44/shared/characterSaveRules.ts';
import {inspectStoredCharacterEvidence,storedVaultFingerprint,validateDuelProvenancePair,verifySignedCharacterEvidence} from '../../../base44/shared/duelCharacterProvenance.mjs';
import {buildStandardizedDuelManifest,verifyStandardizedDuelManifest,DUEL_BASELINE_STATS} from '../../../base44/shared/duelBaselineLoadout.mjs';
const make=(owner,character,level,revision=4)=>{
 const data={wwm_player_progression_v1:JSON.stringify({level,xp:0,baseStats:{strength:0,dexterity:0,constitution:0,focus:0},unspentPoints:0})};
 return {owner_id:owner,character_id:character,revision,data,fingerprint:storedVaultFingerprint(data),saved_at:'2026-11-27T12:00:00Z',flags:[],flag_count:0};
};
const inspect=row=>inspectStoredCharacterEvidence({ownerId:row.owner_id,characterId:row.character_id,rows:[row]});
const makeTicket=(a,b)=>{
 const pair=validateDuelProvenancePair({duel:{challenger_id:a.ownerId,opponent_id:b.ownerId,challenger_character_id:a.characterId,opponent_character_id:b.characterId},challenger:a,opponent:b});
 assert.equal(pair.ok,true);
 return {duelId:'fixture-duel',authorityEpoch:'fixture-epoch',challengerId:a.ownerId,opponentId:b.ownerId,characterEvidence:pair};
};
const manifest=t=>buildStandardizedDuelManifest({duelId:t.duelId,epoch:t.authorityEpoch,challengerId:t.challengerId,opponentId:t.opponentId,characterEvidence:t.characterEvidence});
test('matching fingerprints and valid level 155 never certify earned character power',()=>{
 const row=make('owner-a','hero-a',155);assert.equal(checkCharacterSave(row.data).ok,true);
 assert.equal(fingerprintCharacterSave(row.data),row.fingerprint);
 const e=inspect(row);assert.equal(e.ok,true);assert.equal(e.combatStatsVerified,false);assert.equal(e.equipmentProvenanceVerified,false);assert.equal(e.eligible,false);
 assert.equal(Object.hasOwn(e,'level'),false);
});
test('diagnostic: even invalid hero level with matching fingerprint remains only consistency evidence',()=>{
 const row=make('owner-a','hero-a',156);assert.equal(checkCharacterSave(row.data).ok,false);
 const e=inspect(row);assert.equal(e.ok,true);assert.equal(e.combatStatsVerified,false);assert.equal(e.eligible,false);
});
test('different browser levels yield identical standardized stats without equipment or rewards',()=>{
 const a=inspect(make('owner-a','hero-a',1)),b=inspect(make('owner-b','hero-b',155));
 const t=makeTicket(a,b),m=manifest(t);
 assert.deepEqual(m.stats,DUEL_BASELINE_STATS);assert.deepEqual(m.equipment,[]);assert.equal(m.earnedProgressionVerified,false);assert.equal(m.rewardsIssued,false);
 assert.equal(verifySignedCharacterEvidence(t).ok,true);assert.equal(verifyStandardizedDuelManifest({...t,combatLoadout:m}).ok,true);
 const changed=makeTicket(inspect(make('owner-a','hero-a',155,5)),b);
 assert.deepEqual(manifest(changed).stats,m.stats);
 assert.equal(verifyStandardizedDuelManifest({...changed,combatLoadout:m}).ok,false);
});
test('forged eligibility cannot be promoted into a standardized manifest or signed evidence',()=>{
 const t=makeTicket(inspect(make('owner-a','hero-a',155)),inspect(make('owner-b','hero-b',155)));
 for(const field of ['combatStatsVerified','equipmentProvenanceVerified','eligible','rewardsIssued']){
  const bad={...t,characterEvidence:{...t.characterEvidence,challenger:{...t.characterEvidence.challenger,[field]:true}}};
  assert.equal(verifySignedCharacterEvidence(bad).ok,false);assert.throws(()=>manifest(bad));
 }
});
