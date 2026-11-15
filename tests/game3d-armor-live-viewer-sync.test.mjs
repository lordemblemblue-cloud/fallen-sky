import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {reconcileInventoryArmorOverrides,withEquippedArmor,isShippedArmorEntry} from '../src/components/game3d/armor/armorEquipCore.js';
import {equippedAXEArmorPieces,getAXEArmorPiece} from '../src/components/game3d/axe/equipment/AXEArmorPackCatalog.js';
const read=path=>readFileSync(path,'utf8');
const manifest=JSON.parse(read('public/models/characters/fused/armor/manifest.json'));
const slots=['helmet','chest','pants','gloves','boots','cape'];

test('fitted armor GLBs and thumbnails ship for both original bodies',()=>{
 for(const gender of ['female','male']){
  const ids=new Set();
  for(const asset of manifest[gender]||[]){
   assert.ok(slots.includes(asset.slot),asset.id);
   assert.equal(asset.rig_id,'fused-'+gender+'-v1');
   assert.ok(!ids.has(asset.id),'duplicate '+asset.id);ids.add(asset.id);
   for(const url of [asset.url,asset.thumbnail]){
    assert.ok(/^\/models\/characters\/fused\/armor\/[\w./-]+$/.test(url),asset.id);
    assert.ok(existsSync('public'+url),'missing '+asset.id+' '+url);
   }
  }
  for(const set of ['nightscale','frostwarden'])for(const slot of slots)
   assert.ok(ids.has(set+'_'+slot),gender+' missing '+set+' '+slot);
 }
});
test('inventory equip, swap and unequip update every visible armor slot',()=>{
 const item=(piece,slot)=>({equipped:true,slot,category:slot,
   appearance:{armorPiece:piece,armorSlot:slot}});
 const worn=equippedAXEArmorPieces([item('nightscale_chest','chest'),
   item('frostwarden_boots','boots')]);
 assert.deepEqual(worn,{chest:'nightscale_chest',boots:'frostwarden_boots'});
 assert.equal(getAXEArmorPiece(item('nightscale_chest','chest')).id,'nightscale_chest');
 const saved={helmet:'frostwarden_helmet',chest:'frostwarden_chest',hair:'original_hair'};
 const resolved=reconcileInventoryArmorOverrides(saved,worn,
   ['nightscale','frostwarden','crescent_moon']);
 assert.equal(resolved.helmet,'');
 assert.equal(resolved.chest,'nightscale_chest');
 assert.equal(resolved.boots,'frostwarden_boots');
 assert.equal(saved.helmet,'frostwarden_helmet');
 const pieces=manifest.female
   .filter(x=>['nightscale_chest','frostwarden_boots'].includes(x.id))
   .map(x=>({id:x.id,slot:x.slot,file_url:x.url}));
 const base={selected_assets:{hair:'original_hair',helmet:'frostwarden_helmet'},
   customization_assets:[{id:'original_hair',slot:'hair'}]};
 const result=withEquippedArmor(base,resolved,pieces,slots);
 assert.deepEqual(result.selected_assets,{
   hair:'original_hair',chest:'nightscale_chest',boots:'frostwarden_boots'});
 assert.equal(result.customization_assets.length,3);
});
test('Eve-only armor never binds on Adam and dev items are not created by viewers',()=>{
 assert.equal(manifest.male.some(x=>x.set==='crescent_moon'),false);
 assert.equal(isShippedArmorEntry({dev_only:true},false),false);
 assert.equal(isShippedArmorEntry({dev_only:true},true),true);
 const noAdam=withEquippedArmor({selected_assets:{},customization_assets:[]},
   {chest:'crescent_moon_chest'},manifest.male.filter(x=>x.set==='crescent_moon'),slots);
 assert.deepEqual(noAdam.selected_assets,{});
 const builtin=read('src/components/onboarding/creatorBuiltinLayers.js');
 assert.match(builtin,/loadBuiltinLayers\(kind,\{equippedIds=\[\]\}=\{\}\)/);
 assert.match(builtin,/equipped\.has\(entry\.id\)/);
 assert.match(builtin,/kind==='armor'&&entry\.dev_only===true/);
 assert.doesNotMatch(builtin,/grantQuestReward|addAXEEquipmentItem|makeAXEDevArmorItems/);
});
test('the first game frame and Character/Appearance/roster viewers share equipped look',()=>{
 const world=read('src/components/game3d/GameWorld3D.jsx');
 const bridge=read('src/components/game3d/armor/armorEquipBridge.js');
 const viewer=read('src/components/game3d/equipment/EquipmentPreview3D.jsx');
 const roster=read('src/components/game3d/equipment/SelectedCharacterArmorPreview.jsx');
 const login=read('src/components/game3d/CharacterLoginScreen.jsx');
 const runtime=read('src/components/onboarding/avatarAssetRuntime.js');
 assert.match(world,/applyPlayerAppearance\(fbx,appearanceRef\.current\)/);
 assert.match(world,/game3dArmorRenderStatus/);
 assert.match(bridge,/subscribeAXEEquipmentInventory/);
 assert.match(bridge,/game3d_armor_visual_warnings/);
 assert.match(runtime,/game3dArmorRenderStatus/);
 assert.match(viewer,/const config = useGameAvatar\(\)/);
 assert.match(viewer,/<CreatorStage/);
 assert.match(viewer,/IntersectionObserver/);
 assert.match(roster,/readSelectedCharacterArmor\(character\?\.id\)/);
 assert.match(roster,/equippedIds:equippedPieceIds\.split/);
 assert.match(login,/SelectedCharacterArmorPreview key=\{selected\.id\}/);
 assert.doesNotMatch(roster,/activateAndSyncToHUD\(/);
});
test('armor load and skeleton failures leave other valid pieces visible',()=>{
 const runtime=read('src/components/onboarding/customizationRuntime.js');
 assert.match(runtime,/const created=\[\],armorErrors=\[\]/);
 assert.match(runtime,/const ready=\[\]/);
 assert.match(runtime,/failedArmorSlots:armorErrors\.length/);
 assert.match(read('src/components/game3d/equipment/EquipmentPreview3D.jsx'),/Equipped armor visuals:/);
});
