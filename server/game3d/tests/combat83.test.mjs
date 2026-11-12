import test from 'node:test';import assert from 'node:assert/strict';
import {createAccountQuestEvidenceAudit} from '../accountQuestEvidenceAudit.mjs';
test('account adapter cannot be omitted',()=>{
 assert.throws(()=>createAccountQuestEvidenceAudit({pool:{query:async()=>{},connect:async()=>{}}}),/server session identity/);
});
