// Deferred beta source test.
import test from 'node:test';import assert from 'node:assert/strict';
import {COMBAT9_MANUAL_MIGRATIONS} from '../combat9SchemaAudit.mjs';
test('new migration files follow 016 exactly',()=>{
 assert.deepEqual(COMBAT9_MANUAL_MIGRATIONS.map(x=>Number(x.slice(0,3))),
  [17,18]);
 assert.equal(new Set(COMBAT9_MANUAL_MIGRATIONS).size,2);
});
