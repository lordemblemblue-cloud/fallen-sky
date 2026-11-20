import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeFactionOverview,formatFactionMetric,computeFactionPower,
} from '../src/components/game3d/axe/factions/factionOverviewModel.mjs';
const factions=['AXE_Faction_1','AXE_Faction_2','AXE_Faction_3'];

test('faction UI never invents world populations, leader names or buffs',()=>{
 const rows=normalizeFactionOverview(null,factions);
 assert.equal(rows.length,3);
 for(const row of rows){
  assert.equal(row.online,null);assert.equal(row.power,null);
  assert.equal(row.leader,null);assert.deepEqual(row.deputies,[]);
  assert.deepEqual(row.bonuses,[]);
 }
 assert.equal(formatFactionMetric(null),'—');
 assert.equal(formatFactionMetric(undefined),'—');
});
test('only official faction IDs are projected from the supplied server response',()=>{
 const rows=normalizeFactionOverview({factions:[
  {id:'AXE_Faction_1',online:12,members:42,power:25000,leader:'Captain Dawn',
   deputies:['Vice A','Vice B'],bonuses:[{label:'Fortress XP',percent:15}]},
  {id:'fake_client_faction',online:999999,power:99999999},
 ]},factions);
 assert.equal(rows[0].online,12);assert.equal(rows[0].power,25000);
 assert.equal(rows[0].leader,'Captain Dawn');
 assert.deepEqual(rows[0].deputies,['Vice A','Vice B']);
 assert.deepEqual(rows[0].bonuses,[{label:'Fortress XP',percent:15}]);
 assert.equal(rows[1].online,null);
});
test('invalid, unbounded and negative server values are not displayed as bonuses',()=>{
 const rows=normalizeFactionOverview({factions:[{
  id:factions[0],power:-99,members:NaN,online:'500',
  deputies:Array(50).fill('A'.repeat(100)),
  bonuses:[{label:'Huge bonus',percent:900},{label:'Valid',percent:5}],
 }]},factions);
 assert.equal(rows[0].power,null);assert.equal(rows[0].online,null);
 assert.equal(rows[0].deputies.length,12);assert.equal(rows[0].deputies[0].length,48);
 assert.deepEqual(rows[0].bonuses,[{label:'Valid',percent:5}]);
});
test('server totals can sum verified gear-score contributions without trusting the browser',()=>{
 assert.equal(computeFactionPower([{verifiedGearScore:120},{verifiedGearScore:50.6},{verifiedGearScore:-1}]),170);
 assert.equal(computeFactionPower(null),null);
 assert.equal(formatFactionMetric(123456.7),'123,456');
});
