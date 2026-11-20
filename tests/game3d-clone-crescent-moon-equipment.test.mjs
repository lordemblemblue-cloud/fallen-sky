import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
import {
 AXE_ARMOR_PACK_SETS, AXE_DEV_ARMOR_SETS, makeAXEDevArmorItems,
 getAXEArmorPiece, equippedAXEArmorPieces,
} from '../src/components/game3d/axe/equipment/AXEArmorPackCatalog.js';

const root='public/models/characters/fused/armor/crescent_moon/';
const manifest=JSON.parse(fs.readFileSync('public/models/characters/fused/armor/manifest.json','utf8'));
const slots=['helmet','chest','pants','gloves','boots','cape'];
const actualVisuals=['helmet','chest','pants','gloves','boots','cape'];
const read=path=>fs.readFileSync(path,'utf8');

test('Crescent Moon is six independent legendary armor items with real stats',()=>{
 const set=AXE_DEV_ARMOR_SETS.find(s=>s.id==='crescent_moon');
 assert.ok(set);
 assert.equal(set.rarity,'legendary');
 assert.equal(set.pieces.length,6);
 const items=makeAXEDevArmorItems();
 assert.deepEqual(items.map(x=>x.appearance.armorSlot),slots);
 assert.equal(new Set(items.map(x=>x.id)).size,6);
 for(const item of items){
  assert.deepEqual(getAXEArmorPiece(item),{slot:item.appearance.armorSlot,id:'crescent_moon_'+item.appearance.armorSlot});
  assert.ok(Object.values(item.baseStats).some(v=>Number(v)>0));
  assert.equal(item.equipped,false);
  assert.equal(item.tradeable,false);
  assert.equal(item.rarity,'legendary');
  assert.equal(item.reinforcement.percent,0);
  assert.equal(item.enchantment.level,0);
  assert.match(item.iconUrl,/^\/models\/characters\/fused\/armor\/crescent_moon\/female_(?:helmet|chest|pants|gloves|boots|cape)\.jpg$/);
  const bytes=fs.readFileSync('public'+item.iconUrl);
  assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8');
 }
 assert.ok(!AXE_ARMOR_PACK_SETS.some(s=>s.id==='crescent_moon'),'preview set must not enter drop list');
});

test('equipping and removing individual slots emits independent worn armor mapping',()=>{
 const items=makeAXEDevArmorItems();
 const selected=items.map(i=>({...i,equipped:['helmet','cape'].includes(i.appearance.armorSlot)}));
 assert.deepEqual(equippedAXEArmorPieces(selected),{helmet:'crescent_moon_helmet',cape:'crescent_moon_cape'});
 assert.deepEqual(equippedAXEArmorPieces(selected.map(i=>({...i,equipped:false}))),{});
});

test('clone-only V3 starter migration seeds six items and retains old upgrade code',()=>{
 const inventory=read('src/components/game3d/equipment/inventoryData.jsx');
 const store=read('src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js');
 const equip=read('src/components/game3d/useGameAvatar.js');
 assert.match(inventory,/for \(const item of makeAXEDevArmorItems\(\)\)/);
 assert.match(inventory,/introducedVersion: 3/);
 assert.match(inventory,/source: 'clone_crescent_moon_preview'/);
 assert.match(store,/CURRENT_STARTER_CATALOG_VERSION = [3-9]\b/); // later catalog versions (4: weapon pack) keep V3's one-time grant
 assert.match(store,/previousCatalogVersion < Number\(starter.introducedVersion/);
 assert.match(equip,/useArmoredAppearance\(/);
 assert.match(read('src/components/game3d/equipment/enchantmentStore.jsx'),/export const reinforceItem = /);
 // Blacksmith v2: combat reads the one per-item breakdown, which applies the same enhancement share
 assert.match(read('src/components/game3d/axe/equipment/AXEEquipmentRuntimeStats.js'),/computeAXEItemStatBreakdown/);
 assert.match(read('src/components/game3d/axe/equipment/AXEItemStatBreakdown.mjs'),/getAXEEnhancementStatMultiplier/);
});

test('real upgrade algorithm increases ordinary armor piece stats after success',async()=>{
 const ts=read('base44/shared/axeItemEnhancement.ts');
 const js=(await transform(ts,{loader:'ts',format:'esm'})).code;
 const code='data:text/javascript;base64,'+Buffer.from(js).toString('base64');
 const rules=await import(code);
 const item=makeAXEDevArmorItems().find(x=>x.appearance.armorSlot==='chest');
 assert.equal(rules.getAXEReinforcementCap(item),200); // Blacksmith v2: every rarity reaches Enchant 200 %
 const initial=rules.getAXEEnhancementStatMultiplier({reinforcement:{percent:0}});
 const upgrade=rules.resolveReinforcement({percent:0},{item,roll:0});
 assert.equal(upgrade.ok,true);
 assert.equal(upgrade.record.percent,5);
 const after=rules.getAXEEnhancementStatMultiplier({reinforcement:upgrade.record});
 assert.equal(initial,1);
 assert.equal(after,1.05);
 assert.ok(item.baseStats.defense*after>item.baseStats.defense*initial);
 const enchant=rules.getAXEEnhancementStatMultiplier({reinforcement:upgrade.record,enchantments:[1,0,0,0]});
 assert.equal(enchant,1.06);
});

test('clone manifest ships all six original 3D models and excludes Adam-only fallback',()=>{
 const enabled=new Set(manifest.sets.map(s=>s.id));
 for(const set of ['crescent_moon','nightscale','frostwarden','moonfeather'])
  assert.ok(enabled.has(set),'clone must retain '+set);
 const crescent=manifest.female.filter(e=>e.set==='crescent_moon');
 assert.deepEqual(crescent.map(e=>e.slot).sort(),actualVisuals.slice().sort());
 assert.equal(manifest.male.some(e=>e.set==='crescent_moon'),false);
 for(const entry of crescent){
  assert.equal(entry.gender,'female');
  assert.equal(entry.rig_id,'fused-female-v1');
  assert.equal(entry.dev_only,true,'clone preserves existing development only policy');
  const data=fs.readFileSync('public'+entry.url);
  assert.equal(data.subarray(0,4).toString(),'glTF');
  assert.ok(data.length>10000);
 }
 assert.equal(crescent.length,6);
 for(const gender of ['female','male'])for(const set of ['nightscale','frostwarden'])
  for(const slot of slots){
   const entry=manifest[gender].find(x=>x.id===set+'_'+slot);
   assert.ok(entry,set+' '+gender+' '+slot+' must have a GLB entry');
   assert.ok(fs.existsSync('public'+entry.url));
   assert.ok(fs.existsSync('public'+entry.thumbnail));
  }
 for(const slot of slots)assert.ok(fs.existsSync(root+'female_'+slot+'.glb'));
});
