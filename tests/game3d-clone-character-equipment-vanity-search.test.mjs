import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterInventoryWithSearch,matchesInventorySearch}
  from '../src/components/game3d/axe/services/AXEInventorySearch.mjs';

const EQUIPMENT=Object.freeze([
  {instanceId:'axe-1',name:'Wolfblade Sword',slot:'weapon',rarity:'legendary',itemLevel:47},
  {instanceId:'axe-2',name:'Moonlight Bow',slot:'weapon',rarity:'rare',itemLevel:14},
  {instanceId:'axe-3',name:'Celestial Helm',slot:'helm',rarity:'legendary',itemLevel:42},
]);
const VANITY=Object.freeze([
  {id:'v1',kind:'vanity',name:'Egyptian Gold Mask',slot:'head'},
  {id:'v2',kind:'vanity',name:'Blue Silk Chest',slot:'torso'},
  {id:'c1',kind:'costume',name:'Golden Royal Outfit',rarity:'unique'},
]);

test('Equipment search matches name and exact category without altering inventory',()=>{
  const result=filterInventoryWithSearch(EQUIPMENT,{search:'sword',category:'weapon'});
  assert.deepEqual(result.map(v=>v.instanceId),['axe-1']);
  assert.equal(EQUIPMENT.length,3);
});
test('Equipment dropdown category and rarity search work together',()=>{
  assert.deepEqual(filterInventoryWithSearch(EQUIPMENT,{category:'helm',search:'legendary'})
    .map(v=>v.instanceId),['axe-3']);
  assert.deepEqual(filterInventoryWithSearch(EQUIPMENT,{category:'All',search:'rare'})
    .map(v=>v.instanceId),['axe-2']);
});
test('Vanity dropdown and search, including multiple tokens, are case insensitive',()=>{
  assert.deepEqual(filterInventoryWithSearch(VANITY,{category:'vanity',categoryKey:'kind',search:'egyptian MASK'})
    .map(v=>v.id),['v1']);
  assert.deepEqual(filterInventoryWithSearch(VANITY,{category:'costume',categoryKey:'kind',search:'golden'})
    .map(v=>v.id),['c1']);
});
test('Clearing search and switching category restores real owned records',()=>{
  assert.equal(filterInventoryWithSearch(VANITY,{search:'xyz'}).length,0);
  assert.equal(filterInventoryWithSearch(VANITY,{category:'All',search:''}).length,3);
  assert.equal(matchesInventorySearch(EQUIPMENT[0],'  WOLF  '),true);
});
test('Character CSS retains 50/50 side-by-side split even at narrow widths',()=>{
  const css=readFileSync(new URL('../src/components/game3d/axe/services/AXECharacterWorkspace.css',import.meta.url),'utf8');
  const last=css.slice(css.indexOf('/* Character correction:'));
  assert.match(last,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(last,/@container \(max-width:555px\)/);
  assert.match(last,/\.axe-char-root \.axe-char-attribute-split::before \{display:block;/);
  assert.match(last,/border:1px solid rgba\(230,204,153,/);
});
test('Both inventory views expose working search and dropdown; no horizontal pill filters',()=>{
  const path='../src/components/game3d/axe/services/';
  for(const file of ['AXEAppearanceWorkspace.jsx','AXEGlassLoadoutPane.jsx']){
    const jsx=readFileSync(new URL(path+file,import.meta.url),'utf8');
    assert.match(jsx,/type="search"[\s\S]{0,150}value=\{search\}/);
    assert.match(jsx,/className="axe-app-inventory-category"/);
    assert.doesNotMatch(jsx,/className="axe-app-inventory-filters"/);
  }
});
