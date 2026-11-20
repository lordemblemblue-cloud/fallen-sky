import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game3dPauseGraphicsDefaults,activateCloneUltraWorldGraphics}
  from '../src/components/game3d/game3dPauseMenuModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('retired Ultra-Sumi preferences are migrated without disturbing other choices',()=>{
  const kv=new Map([['game_graphics_settings',JSON.stringify({
    artStyle:'atomic-ultra-sumi',quality:'medium',fpsCap:144,shadows:true,
  })]]);
  const storage={getItem:key=>kv.get(key)||null,setItem:(k,v)=>kv.set(k,v)};
  const updated=activateCloneUltraWorldGraphics(storage);
  assert.equal(updated.artStyle,'original');
  assert.equal(updated.quality,'medium');
  assert.equal(updated.fpsCap,144);
  assert.equal(updated.shadows,true);
  assert.equal(JSON.parse(kv.get('game_graphics_settings')).artStyle,'original');
});
test('first launch selects performance graphics, not Ultra-Sumi',()=>{
  const kv=new Map(),storage={getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v)};
  const options=activateCloneUltraWorldGraphics(storage);
  assert.equal(options.artStyle,'original');
  assert.equal(options.quality,'low');
  assert.equal(options.shadows,false);
  assert.equal(game3dPauseGraphicsDefaults({artStyle:'ink'}).artStyle,'ink');
});
test('retired processor is not mounted in the live game',()=>{
  const world=read('src/components/game3d/GameWorld3D.jsx');
  const menu=read('src/components/game3d/PauseMenu.jsx');
  const staticGrass=read('src/components/game3d/wolfveil/WolfveilIndividualGrassBlades.js');
  assert.doesNotMatch(world,/createAtomicUltraSumiMode/);
  assert.doesNotMatch(menu,/ULTRA MAX · Living Ultra-Sumi/);
  assert.doesNotMatch(staticGrass,/createWolfveilNearGrassStream/);
  assert.match(staticGrass,/inst\.frustumCulled = true/);
  assert.match(world,/createWolfveilAreaLoader/);
});
