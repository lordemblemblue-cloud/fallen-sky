import test from 'node:test';import assert from 'node:assert/strict';
import {validateSkillIntentEnvelope} from '../combatIntentEnvelope.mjs';
test('untrusted duplicate targets and invented skill are refused',()=>{
 assert.equal(validateSkillIntentEnvelope({participantId:'p1',authorityEpoch:'epoch',sequence:1,skillId:'single_hit',targetIds:['p2','p2']}).ok,false);
 assert.equal(validateSkillIntentEnvelope({participantId:'p1',authorityEpoch:'epoch',sequence:1,skillId:'fake',targetIds:[]}).ok,false);
});
