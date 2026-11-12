import test from 'node:test';import assert from 'node:assert/strict';
import {upgradeConstraintGaps} from '../upgradeSchemaAudit.mjs';
test('upgrade table requires actual source owner FK and bounded stage constraints',()=>{
 const gaps=upgradeConstraintGaps([]);
 assert.ok(gaps.includes('upgrade_state_source_item_owner_fk'));
 assert.ok(gaps.includes('upgrade_state_ascend_stage_bounds'));
});
