import test from 'node:test';import assert from 'node:assert/strict';
import {COMBAT_LATE_MIGRATIONS} from '../lateBetaSchemaAudit.mjs';
test('late migration numbering preserves unique ordered filenames',()=>{
 assert.deepEqual(COMBAT_LATE_MIGRATIONS.map(x=>Number(x.slice(0,3))),[14,15,16]);
 assert.equal(new Set(COMBAT_LATE_MIGRATIONS).size,3);
});
