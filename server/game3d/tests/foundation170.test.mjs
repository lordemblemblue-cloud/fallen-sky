import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServices17,CHARACTER_SERVICES_MANUAL_MIGRATIONS} from '../characterServices17.mjs';
import {upgradeConstraintGaps} from '../upgradeSchemaAudit.mjs';
test('17.0 source exports review only; trading and forge remain disabled',()=>{
 const service=createGame3DCharacterServices17({
  pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>null});
 assert.equal(service.version,'17.0');assert.equal(service.readOnly,true);
 assert.equal(service.publicTradingEnabled,false);
 for(const forbidden of ['performForge','executeTrade','debitAGP','issueItem'])
  assert.equal(forbidden in service,false);
 assert.equal(CHARACTER_SERVICES_MANUAL_MIGRATIONS.length,2);
});
test('upgrade operation audit needs composite owner keys',()=>{
 const gaps=upgradeConstraintGaps([{table_name:'game3d_item_upgrade_operation',
  kind:'f',definition:'FOREIGN KEY (item_instance_id) REFERENCES game3d_item_upgrade_state(item_instance_id)'}]);
 assert.ok(gaps.includes('upgrade_operation_state_owner_fk'));
});
