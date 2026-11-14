import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { reconcileInventoryArmorOverrides, withEquippedArmor } from '../src/components/game3d/armor/armorEquipCore.js';

const read = path => readFileSync(path, 'utf8');
const manifest = JSON.parse(read('public/models/characters/fused/armor/manifest.json'));
const slots = ['helmet','chest','pants','gloves','boots','cape'];

test('all shipped inventory armor parts and matching thumbnails exist for the rig in the built app', () => {
  for (const gender of ['female','male']) {
    for (const piece of manifest[gender] || []) {
      assert.ok(slots.includes(piece.slot),piece.id+' slot');
      assert.ok(piece.url?.startsWith('/models/characters/fused/armor/'),piece.id+' safe url');
      assert.ok(existsSync('public'+piece.url),gender+' missing GLB '+piece.url);
      assert.ok(existsSync('public'+piece.thumbnail),gender+' missing thumbnail '+piece.thumbnail);
      assert.equal(piece.rig_id,'fused-'+gender+'-v1');
    }
  }
  for (const set of ['nightscale','frostwarden']) {
    for (const gender of ['female','male'])
      for (const slot of slots)
        assert.ok(manifest[gender].some(asset=>asset.id===set+'_'+slot),
          gender+' '+set+'_'+slot+' missing from armor manifest');
  }
});

test('inventory equipment wins over stale saved pack armor without changing original creator hair', () => {
  const previous={helmet:'nightscale_helmet',chest:'frostwarden_chest',hair:'creator_hair'};
  const worn={chest:'nightscale_chest',boots:'nightscale_boots'};
  const resolved=reconcileInventoryArmorOverrides(previous,worn,['nightscale','frostwarden']);
  assert.deepEqual(resolved,{helmet:'',chest:'nightscale_chest',hair:'creator_hair',boots:'nightscale_boots'});
  assert.equal(previous.helmet,'nightscale_helmet');
  const female=manifest.female.find(x=>x.id==='nightscale_chest');
  const piece={id:female.id,slot:female.slot,file_url:female.url};
  const base={selected_assets:{hair:'creator_hair'},
    customization_assets:[{id:'creator_hair',slot:'hair'}]};
  const result=withEquippedArmor(base,resolved,[piece],slots);
  assert.equal(result.selected_assets.chest,'nightscale_chest');
  assert.equal(result.customization_assets.find(x=>x.slot==='chest').file_url,female.url);
  assert.equal(result.selected_assets.hair,'creator_hair');
});

test('Appearance, Character and world Play share one inventory-owned armor appearance',()=>{
  const viewer=read('src/components/game3d/equipment/EquipmentPreview3D.jsx');
  const world=read('src/components/game3d/GameWorld3D.jsx');
  const bridge=read('src/components/game3d/armor/armorEquipBridge.js');
  const appearance=read('src/components/game3d/axe/services/AXEAppearanceWorkspace.jsx');
  const character=read('src/components/game3d/axe/services/AXECharacterWorkspace.jsx');
  assert.match(appearance,/EquipmentPreview3D/);
  assert.match(character,/EquipmentPreview3D/);
  assert.match(viewer,/const config = useGameAvatar\(\)/);
  assert.match(viewer,/creatorBody\(config\)/);
  assert.match(viewer,/<CreatorStage/);
  assert.match(viewer,/IntersectionObserver/);
  assert.match(world,/const avatarConfig=useGameAvatar\(\)/);
  assert.match(world,/applyPlayerAppearance\(modelRef\.current,avatarConfig\)/);
  assert.match(bridge,/subscribeAXEEquipmentInventory/);
  assert.match(bridge,/reconcileInventoryArmorOverrides\(equipped, inventoryWorn, PACK_SET_IDS\)/);
});

test('phone service previews lazy mount to prevent invisible WebGL contexts',()=>{
  const source=read('src/components/game3d/equipment/EquipmentPreview3D.jsx');
  assert.match(source,/const \[visible, setVisible\] = useState/);
  assert.match(source,/observer\.observe\(host\)/);
  assert.match(source,/observer\.disconnect\(\)/);
  assert.match(source,/visible && \(body/);
});
