import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WOLFVEIL_CAVE_LANDSCAPE_LIMITS, WOLFVEIL_CAVE_LANDSCAPE_THEMES,
  planWolfveilCaveEntranceLandscaping,
} from '../src/components/game3d/wolfveil/WolfveilCaveLandscapePlan.mjs';
import { WOLFVEIL_CAVE_APPROACHES, isWolfveilCaveApproachReserved }
  from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import { wolfveilHeight } from '../src/components/game3d/wolfveil/WolfveilLayout.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8');
const sample = Object.freeze([{
  id:'access_synthetic', caveId:'synthetic', style:'cedar_lantern',
  points:[
    {x:0,y:0,z:0}, {x:0,y:0,z:70},
  ],
}]);
const options = {
  heightAt: () => 0,
  reservedAt: (x) => Math.abs(x) <= 3,
};

test('visual-only cave landscaping flanks, never obstructs, the authored path', () => {
  const a = planWolfveilCaveEntranceLandscaping(sample, options);
  assert(a.length >= 4, 'expect multiple low-poly verge accents');
  assert.equal(new Set(a.map(p=>p.id)).size,a.length);
  for(const prop of a) {
    assert.equal(prop.caveId,'synthetic');
    assert.equal(prop.collision,false);
    assert.equal(prop.walkable,false);
    assert.equal(prop.decorative,true);
    assert(Math.abs(prop.x)>WOLFVEIL_CAVE_LANDSCAPE_LIMITS.minSideOffset-1.5,
      'leave walking tread and shoulders unobstructed');
    assert([prop.x,prop.y,prop.z,prop.scale,prop.yaw].every(Number.isFinite));
    assert(Object.isFrozen(prop));
  }
  assert(Object.isFrozen(a));
  assert.deepEqual(a,planWolfveilCaveEntranceLandscaping(sample,options),
    'same map must have the same visual placements on every run');
});
test('protected cave apron and other reserved terrain are NEVER decorated', () => {
  assert.deepEqual(planWolfveilCaveEntranceLandscaping(sample,{
    heightAt:()=>0,reservedAt:()=>true,
  }),[]);
  assert.deepEqual(planWolfveilCaveEntranceLandscaping(sample,{
    heightAt:()=>0,routeClearance:()=>-1,
  }),[]);
  assert.deepEqual(planWolfveilCaveEntranceLandscaping(sample,{
    heightAt:()=>0,riverDistance:()=>2,
  }),[]);
  assert.deepEqual(planWolfveilCaveEntranceLandscaping(sample,{
    heightAt:()=>0,clearAt:()=>false,
  }),[]);
});
test('four actual cave trails keep data-driven styles, positions and bounded detail',()=>{
  assert.equal(WOLFVEIL_CAVE_APPROACHES.length,4);
  assert.equal(Object.keys(WOLFVEIL_CAVE_LANDSCAPE_THEMES).length,4);
  const plan=planWolfveilCaveEntranceLandscaping(WOLFVEIL_CAVE_APPROACHES,{
    heightAt:wolfveilHeight,
    reservedAt:isWolfveilCaveApproachReserved,
  });
  assert(plan.length>0,'real cave environment must get actual landscaping');
  assert(plan.length<=WOLFVEIL_CAVE_LANDSCAPE_LIMITS.maxPlacements);
  for(const p of plan){
    const cave=WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===p.caveId);
    assert(cave,'unknown cave '+p.caveId);
    assert.equal(p.theme,cave.style);
    assert(!isWolfveilCaveApproachReserved(p.x,p.z,1),
      p.caveId+' decor overlaps protected cave tread/apron');
    assert([p.x,p.y,p.z,p.scale].every(Number.isFinite));
  }
});
test('scenic meshes cannot change cave physics, underground transitions or frame',()=>{
  const visuals=read('src/components/game3d/wolfveil/WolfveilCaveLandscapeVisuals.js');
  const cave=read('src/components/game3d/wolfveil/WolfveilCaveSystem.js');
  assert.match(visuals,/new THREE.InstancedMesh/);
  assert.match(visuals,/mesh\.raycast = \(\) => \{\}/);
  assert.match(visuals,/noCollision: true, doesNotModifyCaveFloor: true/);
  assert.match(visuals,/world\.ownedMaterials\.push\(material\)/);
  assert.match(cave,/installWolfveilCaveEntranceLandscaping\(world,group\)/);
  assert.match(cave,/appendWolfveilCaveAccessFloor\(pavementTris\)/);
  assert.match(cave,/resolveWolfveilCaveEntranceRailCollision/);
  assert.match(cave,/planWolfveilCaveInteraction/);
  assert.doesNotMatch(visuals,/walkableSurfaces\.push|sampleWolfveilPlayerCaveFloorY|enterFromMouth|activeCaveId\s*=/);
});
