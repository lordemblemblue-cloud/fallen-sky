// Combat Foundation 4.7 — source-only deferred tests (beta verification).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectStoredCharacterEvidence,storedVaultFingerprint,
  validateDuelProvenancePair,verifySignedCharacterEvidence,
} from '../../../base44/shared/duelCharacterProvenance.mjs';

const row=(owner,character,changed={})=>{
  const data={wwm_player_progression_v1:JSON.stringify({
    level:12,xp:1500,baseStats:{strength:10,dexterity:3,constitution:5,focus:4},
    unspentPoints:0,
  })};
  return {owner_id:owner,character_id:character,revision:4,
    fingerprint:storedVaultFingerprint(data),saved_at:'2026-11-01T12:00:00Z',
    flags:[],flag_count:0,data,...changed};
};
const verify=(owner,character,changed={})=>inspectStoredCharacterEvidence({
  ownerId:owner,characterId:character,rows:[row(owner,character,changed)],
});
test('stored fingerprint and account identity are checked but earned stats remain unverified',()=>{
  const evidence=verify('player-one','hero-one');
  assert.equal(evidence.ok,true);
  assert.equal(evidence.ownerBindingVerified,true);
  assert.equal(evidence.saveConsistencyVerified,true);
  assert.equal(evidence.combatStatsVerified,false);
  assert.equal(evidence.equipmentProvenanceVerified,false);
  assert.equal(evidence.eligible,false);
});
test('missing duplicate forged and flagged vault saves fail closed',()=>{
  assert.equal(inspectStoredCharacterEvidence({
    ownerId:'one',characterId:'hero',rows:[]}).ok,false);
  assert.equal(inspectStoredCharacterEvidence({
    ownerId:'one',characterId:'hero',
    rows:[row('one','hero'),row('one','hero')]}).code,'duplicate_character_saves');
  assert.equal(inspectStoredCharacterEvidence({
    ownerId:'one',characterId:'hero',rows:[row('other','hero')]}).ok,false);
  assert.equal(verify('one','hero',{fingerprint:'tampered'}).ok,false);
  assert.equal(verify('one','hero',{flags:['fast_level_growth']}).ok,false);
  assert.equal(verify('one','__anon__').ok,false);
  assert.equal(verify('one','hero',{data:{malformed:123}}).ok,false);
});
test('duelist pair must match recorded character IDs, no fake reward verification',()=>{
  const duel={challenger_id:'one',opponent_id:'two',
    challenger_character_id:'hero-a',opponent_character_id:'hero-b'};
  const a=verify('one','hero-a'),b=verify('two','hero-b');
  const pair=validateDuelProvenancePair({duel,challenger:a,opponent:b});
  assert.equal(pair.ok,true);
  assert.equal(pair.combatStatsVerified,false);
  assert.equal(pair.rewardsIssued,false);
  assert.equal(validateDuelProvenancePair({
    duel,challenger:b,opponent:a}).ok,false);
  const ticket={challengerId:'one',opponentId:'two',
    characterEvidence:{source:pair.source,challenger:a,opponent:b,
      combatStatsVerified:false,equipmentProvenanceVerified:false,
      rewardEligibility:'unverified_account',rewardsIssued:false}};
  assert.equal(verifySignedCharacterEvidence(ticket).ok,true);
  assert.equal(verifySignedCharacterEvidence({
    ...ticket,characterEvidence:{...ticket.characterEvidence,
      rewardsIssued:true}}).ok,false);
  assert.equal(verifySignedCharacterEvidence({
    ...ticket,characterEvidence:{...ticket.characterEvidence,
      opponent:{...b,ownerId:'outside'}}}).ok,false);
});
