import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const lunar=readFileSync(new URL('../src/components/game3d/dungeons/LunarCaveScene.js',import.meta.url),'utf8');
const astral=readFileSync(new URL('../src/components/game3d/dungeons/AstralDungeonScene.js',import.meta.url),'utf8');

test('remove complete standalone overhead crystal crown but leave natural cave mouth intact',()=>{
  assert.doesNotMatch(lunar,/const crown\s*=\s*new THREE\.Mesh/);
  assert.doesNotMatch(lunar,/root\.add\(crown\)/);
  assert.doesNotMatch(lunar,/crown\.position\.set\(0,10\.2,1\.25\)/);
  assert.match(lunar,/function entranceRockwork\(root,mats\)/);
  assert.match(lunar,/rock\(root,mats,0,10\.6,5\.2,6\.3,3\.25,5,617\)/);
  assert.match(lunar,/return colliders;/);
});
test('portal animation, gate transform, route entry and player collision remain',()=>{
  assert.match(lunar,/root\.name='AXE_LunarMountainGate_3D'/);
  assert.match(lunar,/const colliders=entranceRockwork\(root,mats\)/);
  assert.match(lunar,/const animatePortal=portal\(root,mats,0,4\.4,portalLocalZ,1\.05\)/);
  assert.match(lunar,/resolveCollision\(position,previous,radius=\.62\)/);
  assert.match(lunar,/animatePortal\(time\)/);
  assert.match(lunar,/const crossed=last&&last\.z<portalLocalZ&&now\.z>=portalLocalZ/);
  assert.match(lunar,/const inMouth=Math\.abs\(now\.x\)<3\.25/);
});
test('remove no unrelated astral/dungeon portal assets',()=>{
  assert.match(astral,/export function createAstralMountainGate/);
  assert.match(astral,/const animatePortal=createPortal\(root,0,4\.2,site\.portalZ-site\.z\)/);
  assert.match(lunar,/const startPortal=portal\(root,mats,0,4,-21,\.85\)/);
  assert.match(lunar,/const finalPortal=portal\(root,mats,LUNAR_CAVE_WATER_END\.x,4,LUNAR_CAVE_WATER_END\.returnPortalZ,\.9\)/);
});
