import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/fantasybattle/sapphireCharacterWorkspaces.css',import.meta.url),'utf8');
const screen=(id,next)=>source.slice(source.indexOf("    case '"+id+"':"),source.indexOf("    case '"+next+"':"));
const equipment=screen('06','07');
test('equipment selection only enables actions for items visible in the current filter',()=>{
 assert.match(equipment,/const selectedOwned=visibleEquipment.some/);
 assert.match(equipment,/const liveCompare=selectedOwned\?/);
 assert.match(equipment,/Boolean\(profile&&selectedOwned&&liveCompare&&!encounter/);
 assert.match(equipment,/Boolean\(profile&&!encounter&&selectedOwned/);
 assert.match(equipment,/if\(!canEquip\)return/);
 assert.match(equipment,/if\(canRemove\)transact/);
});
test('compact equipment uses same filter, equip, remove and comparison actions as original',()=>{
 assert.match(equipment,/const chooseSlot=key=>\{if\(!key\)return;setEquipmentFilter\('all'\);setItemId\(key\)/);
 assert.match(equipment,/listItems\(\(item,k\)=>visibleEquipment.some/);
 assert.equal((equipment.match(/onClick=\{equipSelected\}/g)||[]).length,2);
 assert.equal((equipment.match(/onClick=\{removeSelected\}/g)||[]).length,2);
 assert.equal((equipment.match(/\{comparisonHead\}\{comparisonRows\}/g)||[]).length,2);
 assert.match(equipment,/equipGear\(p,wearer,selectedItem.slot,itemId\)/);
 assert.match(equipment,/equipItem\(p,itemId\)/);
});
test('stat comparisons identify current, projected and signed deltas without manufacturing values',()=>{
 assert.match(equipment,/next=liveCompare\?\.candidate\?\.\[key\]/);
 assert.match(equipment,/delta=next==null\?null:next-value/);
 assert.match(equipment,/delta==null\?'—':\(delta>0\?'\+':''\)\+delta/);
 assert.match(equipment,/data-delta=\{delta==null\?'unknown':delta>0\?'gain':delta<0\?'loss':'same'\}/);
 assert.match(css,/\.fa-workspace-delta\[data-delta="gain"\]/);
 assert.match(css,/\.fa-workspace-delta\[data-delta="loss"\]/);
});
test('character overview uses live goddess portrait and labeled real health and XP',()=>{
 const character=screen('05','06');
 assert.match(character,/<ArcherPortrait profile=\{profile\} newHero\/>/);
 assert.match(character,/aria-label="Current character health" value=\{profile.hp\} max=\{stats.maxHp\}/);
 assert.match(character,/aria-label="Experience toward next level" value=\{profile.xp%100\} max=\{100\}/);
 assert.match(css,/\.fa-character-statistics h2\{white-space:normal;overflow-wrap:anywhere/);
});
test('skillbook marks locked abilities while keeping inspection available',()=>{
 const skill=source.slice(source.indexOf('function Skillbook('),source.indexOf('// Allocation is a local draft'));
 assert.match(skill,/data-learned=\{learned.includes\(id\)\?'true':'false'\}/);
 assert.match(skill,/onClick=\{\(\)=>setSelectedId\(id\)\}/);
 assert.match(skill,/aria-label="Learned abilities" value=\{learned.length\} max=\{ACTION_ORDER.length\}/);
 assert.match(skill,/No manual skill upgrades/);
 assert.match(css,/data-learned="false"/);
});
test('inventory selection remains readable and original panel positions unchanged',()=>{
 assert.match(source,/className="fa-item-inv-name" aria-live="polite"/);
 assert.match(css,/\.fa-item-inv-name\{overflow:auto/);
 assert.doesNotMatch(css,/\.fa-template\s*\{|inset:50%|177\.68vh/);
});
