import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync('src/components/game3d/axe/services/'+name,'utf8');

test('Variety uses five real owned player appearance targets with matching viewer slots',()=>{
  const jsx=source('AXECompanionStylePane.jsx');
  assert.match(jsx,/VARIETY_VIEWER_SLOTS=Object\.freeze/);
  for(const id of ['head','torso','pelvis','leggings','costume'])
    assert.match(jsx,new RegExp("id:'"+id+"'"));
  assert.match(jsx,/VARIETY_VIEWER_SLOTS\.slice\(0,3\)\.map\(varietySlotCard\)/);
  assert.match(jsx,/VARIETY_VIEWER_SLOTS\.slice\(3\)\.map\(varietySlotCard\)/);
  assert.match(jsx,/aria-label=\{label\+' player wardrobe slot:/);
  assert.match(jsx,/varietySlot===id/);
  assert.match(jsx,/piece\.kind==='vanity'&&piece\.slot===varietySlot/);
});

test('Variety uses the original player equip stores and live preview, never binds borrowed cosmetics onto a companion',()=>{
  const jsx=source('AXECompanionStylePane.jsx');
  assert.match(jsx,/equipAXEVanityPiece\(piece\.id\)/);
  assert.match(jsx,/equipAXECostume\(piece\.id\)/);
  assert.match(jsx,/onDoubleClick=\{\(\)=>equipOwnedWardrobe\(piece\)\}/);
  assert.match(jsx,/isImbue\|\|previewOwner==='wardrobe'\?<PlayerModel\/>/);
  assert.match(jsx,/companionId=\{selectedModel\.id\}/);
  assert.match(jsx,/Compatible companion|Companion armor still needs compatible fitted meshes/);
  assert.doesNotMatch(jsx,/equipCompanionGear\(.+piece\.id/);
});

test('Equipment and Variety side rails have consistent corner alignment and five player boxes per side',()=>{
  const equip=source('AXEGlassLoadoutPane.jsx');
  const css=source('AXEGlassLoadoutPane.css');
  const varietyCSS=source('AXECompanionStylePane.css');
  assert.match(equip,/PLAYER_DISPLAY_SLOTS = Object\.freeze/);
  for(const slot of ['weapon','helm','chest','gloves','legs','boots','ring','necklace','cape'])
    assert.match(equip,new RegExp("'"+slot+"'"));
  assert.match(css,/grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/data-equipment-actor="player"/);
  assert.match(varietyCSS,/axe-comp-variety-rail/);
  assert.match(varietyCSS,/grid-template-columns:minmax\(54px,20%\)/);
});
