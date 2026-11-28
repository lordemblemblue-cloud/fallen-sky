// Source diagnostics: three cases document current gaps, not passing safety requirements.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enforceDiscoveryLedger,discoveryUnit,pendingAfterRestore} from '../../../base44/shared/explorationDiscoveries.ts';
import {GAME3D_LOOT_BAG_CAPACITY,GAME3D_LOOT_STORAGE_CAPACITY} from '../../../src/components/game3d/storage/game3dStorageModel.mjs';
const key='game_loot_inventory_v2',vault='axe_game3d_storage_v1';
const unit=discoveryUnit('mat_crystal','disc_fixture_1',2000);
const row={id:'fixture',discovery_id:'ft_spirit_vein',claims:1,first_claimed_at:new Date(2000).toISOString(),last_claimed_at:new Date(2000).toISOString(),pending:[unit],granted:[unit]};
const bag=n=>Array.from({length:n},(_,i)=>({id:'mat_crystal',dropId:'normal_'+i}));
const items=s=>JSON.parse(s[key]).material;
test('pending grant is recovered and replay does not duplicate within bag',()=>{const a=enforceDiscoveryLedger({[key]:JSON.stringify({material:[]})},null,[row]);const b=enforceDiscoveryLedger(a.data,a.data,[row]);assert.equal(items(a.data).length,1);assert.equal(items(b.data).length,1);});
test('diagnostic: full bag and full vault still receive pending item into bag',()=>{const s={[key]:JSON.stringify({material:bag(GAME3D_LOOT_BAG_CAPACITY)}),[vault]:JSON.stringify({version:1,items:bag(GAME3D_LOOT_STORAGE_CAPACITY)})};const r=enforceDiscoveryLedger(s,s,[row]);assert.equal(items(r.data).length,GAME3D_LOOT_BAG_CAPACITY+1);assert.deepEqual(r.delivered,['fixture']);});
test('diagnostic: item already in vault is duplicated into bag',()=>{const s={[key]:JSON.stringify({material:[]}),[vault]:JSON.stringify({version:1,items:[unit]})};const r=enforceDiscoveryLedger(s,s,[row]);assert.equal(items(r.data)[0].dropId,unit.dropId);assert.equal(JSON.parse(r.data[vault]).items[0].dropId,unit.dropId);});
test('diagnostic: restore considers item held in vault absent',()=>{const s={[key]:JSON.stringify({material:[]}),[vault]:JSON.stringify({version:1,items:[unit]})};assert.equal(pendingAfterRestore(s,[row],new Date(1000).toISOString())[0].pending[0].dropId,unit.dropId);});
