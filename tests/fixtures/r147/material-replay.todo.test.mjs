// R147 known compatibility gap; pending production-safe reconciliation design.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceUpgradeLedger, lootUnits } from '../../../base44/shared/itemUpgradeLedger.ts';

test('known gap: applying the same spent receipt twice must not consume another legacy duplicate', { todo: 'Resolve stable material identity and receipt application semantics before production integration' }, () => {
  const save={game_loot_inventory_v2:JSON.stringify({material:[
    {id:'mat_reinforce',dropId:'dup'},
    {id:'mat_reinforce',dropId:'dup'},
  ]})};
  const rows=[{item_id:'a',service:'reinforcement',record:{percent:5},spent:['dup']}];
  const first=enforceUpgradeLedger(save,null,rows);
  const second=enforceUpgradeLedger(first.data,null,rows);
  assert.equal(lootUnits(first.data).length,1);
  assert.equal(lootUnits(second.data).length,1);
});
