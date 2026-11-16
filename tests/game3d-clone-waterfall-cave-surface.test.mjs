import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWolfveilTerrain} from '../src/components/game3d/wolfveil/WolfveilGeometry.js';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  WOLFVEIL_EXPLORABLE_CAVES,WOLFVEIL_CAVE_CORRIDORS,
  sampleWolfveilCaveSpace,sampleWolfveilPlayerCaveFloorY,
  planWolfveilCaveInteraction,resolveWolfveilCaveWallCollision,
} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';

const source=path=>readFileSync('src/components/game3d/'+path,'utf8');

test('Waterfall hillside and all four cave roofs contain every genuine terrain triangle',()=>{
  // Caves are in a SECOND 3D layer. Never remove an entire quad from the
  // ONE surface heightfield to create a walkable hole into the cavern.
  const segments=155;
  const mesh=buildWolfveilTerrain({span:1100,segments,caveCutouts:true});
  assert.equal(mesh.index.count,segments*segments*6);
  assert.equal(mesh.getAttribute('position').count,(segments+1)**2);
  assert(mesh.index.count>0);
  mesh.dispose();
  const terrain=source('wolfveil/WolfveilGeometry.js');
  assert.doesNotMatch(terrain,/if\(isWolfveilCaveMouthCutout\(cx,cz\)\)continue/);
  assert.match(terrain,/idx\.push\(p,q,p\+1,q,q\+1,p\+1\)/);
});

test('Standing on the waterfall or above cave roofs never selects the underground floor',()=>{
  // Includes the real Crystal Vault near the high falls and other cave mouths.
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    for(const along of [-3,0,2,7,13,20]){
      for(const lateral of [-2,0,2]){
        const x=cave.mouth[0]+cave.dir[0]*along-cave.dir[1]*lateral;
        const z=cave.mouth[1]+cave.dir[1]*along+cave.dir[0]*lateral;
        const terrainY=wolfveilHeight(x,z);
        assert.equal(sampleWolfveilPlayerCaveFloorY(x,terrainY,z),null,
          'Outdoor standing at '+cave.id+' '+along+'/'+lateral);
        assert.equal(sampleWolfveilPlayerCaveFloorY(x,terrainY+.4,z),null,
          'Outdoor jump above '+cave.id);
      }
    }
  }
  const nature=source('wolfveil/WolfveilNature.js');
  assert.match(nature,/SWV_Waterfall_ContinuousSource_FallingSheet_Outlet/);
  assert.match(source('wolfveil/WolfveilCaveSystem.js'),/if\(!activeCaveId\)return null/);
});

test('E at every existing arch enters the same real connected cave and returns by explicit E exit',()=>{
  assert.equal(WOLFVEIL_EXPLORABLE_CAVES.length,4);
  assert.equal(WOLFVEIL_CAVE_CORRIDORS.filter(x=>x.kind==='tunnel').length,5);
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const surface={x:cave.threshold[0],y:cave.threshold[1],z:cave.threshold[2]};
    const enter=planWolfveilCaveInteraction(surface);
    assert.equal(enter?.action,'enter',cave.id);
    assert.equal(enter?.caveId,cave.id);
    assert(sampleWolfveilCaveSpace(enter.x,enter.z,.62),'Cave entry is walkable');
    const below=sampleWolfveilPlayerCaveFloorY(enter.x,enter.y,enter.z,{insideCave:true});
    assert(Number.isFinite(below),'Underground entry has real floor contact');
    const leave=planWolfveilCaveInteraction(enter,{insideCave:true});
    assert.equal(leave?.action,'exit',cave.id);
    assert.equal(leave?.caveId,cave.id);
    assert(Math.hypot(leave.x-cave.threshold[0],leave.z-cave.threshold[2])<.1);
    assert.equal(planWolfveilCaveInteraction(
      {x:surface.x,y:surface.y+30,z:surface.z}),null,
      'No portal from a high cliff above arch');
  }
  const world=source('GameWorld3D.jsx');
  assert.match(world,/wolfveilVillage\?\.interactCave\(model\.position\)/);
  assert.match(world,/!suigenActive&&!dedicatedMode/);
  assert.match(world,/!wolfveilVillage\?\.caveSystem\?\.isActive\?\.\(\)/);
});

test('Walking through a cave wall no longer grants free exit past its threshold',()=>{
  const cave=WOLFVEIL_EXPLORABLE_CAVES[0];
  const inside={x:cave.mouth[0]+cave.dir[0]*13,z:cave.mouth[1]+cave.dir[1]*13,
    y:cave.mouthY-4};
  const outside={x:cave.mouth[0]-cave.dir[0]*6,
    z:cave.mouth[1]-cave.dir[1]*6,y:inside.y};
  assert.equal(resolveWolfveilCaveWallCollision({...outside},{...inside},.62),true);
  const cs=source('wolfveil/WolfveilCaveSystem.js');
  assert.match(cs,/const travel=planWolfveilCaveInteraction/);
  assert.match(cs,/activeCaveId=travel\.action==='enter'\?travel\.caveId:null/);
  assert.match(cs,/if\(!activeCaveId \|\| !worldPos \|\| !prevWorldPos\) return false/);
  // A previously bugged below-ground checkpoint must not silently reactivate
  // a cave session. Only the explicit E entrance establishes that state.
  assert.doesNotMatch(cs,/restoreUndergroundCheckpoint/);
  assert.match(cs,/let activeCaveId = null/);
  assert.doesNotMatch(source('wolfveil/WolfveilCaveLayout.mjs'),
    /if \(along < 0\.5 && lateral < 4\.2\) return false/);
});
