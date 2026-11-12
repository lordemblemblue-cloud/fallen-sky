import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServicesPreview,
 CHARACTER_SERVICES_FOUNDATION_VERSION} from '../characterServices14.mjs';
test('15.0 exports an authenticated inventory pager and read-only equipment reconciler',()=>{
 const privatePool={connect:async()=>{},query:async()=>{}};
 const hub=createGame3DCharacterServicesPreview({
  pool:privatePool,
  resolveAuthenticatedSubject:async()=>null,
  readServerUpgradeState:async()=>null});
 assert.equal(CHARACTER_SERVICES_FOUNDATION_VERSION,'15.0');
 assert.equal(hub.readOnly,true);
 assert.equal(hub.productionReleaseAuthorized,false);
 assert.equal(typeof hub.inspectInventoryPage,'function');
 assert.equal(typeof hub.inspectEquipmentConsistency,'function');
});
test('missing revision denies equipment integrity review before database access',async()=>{
 const hub=createGame3DCharacterServicesPreview({
  pool:{connect:async()=>{throw Error('unexpected DB')},query:async()=>{throw Error('unexpected DB')}},
  resolveAuthenticatedSubject:async()=>null,
  readServerUpgradeState:async()=>null});
 const result=await hub.inspectEquipmentConsistency({
  characterId:'hero1',expectedEquipmentRevision:-1});
 assert.equal(result.ok,false);
 assert.equal(result.marketplaceTradingEnabled,false);
});
