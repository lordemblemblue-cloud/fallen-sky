import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game3dPauseGraphicsDefaults} from '../src/components/game3d/game3dPauseMenuModel.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('new characters start with Classic and lowest-cost graphical defaults',()=>{
  const settings=game3dPauseGraphicsDefaults(null);
  assert.equal(settings.artStyle,'original');
  assert.equal(settings.quality,'low');
  assert.equal(settings.shadows,false);
  assert.equal(settings.fpsCap,60);
});
test('removed Ultra-Sumi settings safely migrate to Classic',()=>{
  assert.equal(game3dPauseGraphicsDefaults({artStyle:'atomic-ultra-sumi'}).artStyle,'original');
  assert.equal(game3dPauseGraphicsDefaults({artStyle:'ink'}).artStyle,'ink');
  assert.equal(game3dPauseGraphicsDefaults({artStyle:'original'}).artStyle,'original');
});
test('graphics menu has no Ultra-Sumi option and world does not initialize its renderer',()=>{
  const menu=read('src/components/game3d/PauseMenu.jsx');
  const world=read('src/components/game3d/GameWorld3D.jsx');
  assert.doesNotMatch(menu,/id:'atomic-ultra-sumi'/);
  assert.doesNotMatch(world,/createAtomicUltraSumiMode|atomicLook\?\.render|atomicLook\?\.update/);
  assert.match(world,/inkLook\.render\(scene,activeCamera\)/);
});
