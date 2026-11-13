import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WOLFVEIL_FOREST_TRAIL_STUDY,forestTrailDistanceFromEdge,
  forestTrailShoulderWeight,forestTrailIsProtected,
  applyWolfveilForestTrailPigment,refineWolfveilForestTrailPlanting,
  planWolfveilForestTrailAccents,
} from '../src/components/game3d/wolfveil/WolfveilForestTrailLandscape.mjs';

const pos=(points)=>({count:points.length,
  getX:i=>points[i][0],getZ:i=>points[i][1]});
const color=(points)=>{
  const values=points.map(()=>[.5,.5,.5]);
  return {count:points.length,values,needsUpdate:false,
    getX:i=>values[i][0],getY:i=>values[i][1],getZ:i=>values[i][2],
    setXYZ(i,x,y,z){values[i]=[x,y,z];}};
};
test('forest mapping affects original western routes, not unrelated biomes',()=>{
  assert.deepEqual([...WOLFVEIL_FOREST_TRAIL_STUDY.routes].sort(),[
    'training_forest','west_woodland_fork']);
  assert(forestTrailShoulderWeight(-320,73)>.1);
  assert(forestTrailDistanceFromEdge(-320,65)<0);
  assert.equal(forestTrailShoulderWeight(350,200),0);
  assert.equal(WOLFVEIL_FOREST_TRAIL_STUDY.collidersAdded,0);
});
test('owned 5m squares and 100m owner callbacks remain excluded',()=>{
  for(const point of [[-348,68],[-303,17],[-228,102],[-318,32],[-205,115]])
    assert(forestTrailIsProtected(...point));
  assert(forestTrailIsProtected(-405,0,2,()=>true));
  assert(!forestTrailIsProtected(-320,73,1,()=>false));
});
test('muted forest pigment changes only the original terrain color channel',()=>{
  const points=[[-320,73],[-348,68],[360,200]];
  const c=color(points),g={getAttribute:key=>key==='position'?pos(points):c};
  const result=applyWolfveilForestTrailPigment(g,{enabled:true,
    riverDistance:()=>100});
  assert(result.applied);assert(result.vertices>=1);
  assert.notDeepEqual(c.values[0],[.5,.5,.5]);
  assert.deepEqual(c.values[1],[.5,.5,.5]);
  assert.deepEqual(c.values[2],[.5,.5,.5]);
  assert(c.needsUpdate);
  assert.equal(result.terrainHeightsChanged,false);
  assert.equal(result.collidersAdded,0);
  const other=color(points),g2={getAttribute:key=>key==='position'?pos(points):other};
  assert.equal(applyWolfveilForestTrailPigment(g2).applied,false);
  assert.deepEqual(other.values[0],[.5,.5,.5]);
});
test('existing grass roots are unchanged; trailing blades stay short',()=>{
  const raw={grass:[
    {x:-320,y:17,z:73,height:1.0,width:.95,shade:4,route:'west_woodland_fork'},
    {x:330,y:10,z:200,height:1,width:.95,shade:0,route:'quarry_approach'},
    {x:-348,y:3,z:68,height:1,width:.95,shade:2,route:'west_woodland_fork'},
  ]};
  const roots=raw.grass.map(p=>[p.x,p.y,p.z]);
  const result=refineWolfveilForestTrailPlanting(raw);
  assert.equal(result.styled,1);
  assert.deepEqual(raw.grass.map(p=>[p.x,p.y,p.z]),roots);
  assert(raw.grass[0].height<=.49&&raw.grass[0].forestReferenceStyle);
  assert.equal(raw.grass[1].height,1);
  assert.equal(raw.grass[2].height,1);
});
test('staggered embedded stones are terrain-safe, deterministic and budgeted',()=>{
  const inputs={heightAt:()=>6,clearOf:()=>true,
    riverDistance:()=>100,trees:[],maxStones:60};
  const a=planWolfveilForestTrailAccents(inputs),b=planWolfveilForestTrailAccents(inputs);
  assert.deepEqual(a,b);
  assert(a.length>0&&a.length<=60);
  for(const s of a){
    assert(!forestTrailIsProtected(s.x,s.z,2));
    assert(forestTrailDistanceFromEdge(s.x,s.z)>1.4);
    assert(s.size>=.16&&s.size<=.31);
    assert(s.y>6&&s.y<6.1);
  }
  assert.deepEqual(planWolfveilForestTrailAccents({...inputs,heightAt:()=>NaN}),[]);
});
test('the visual pass is opted into Game 3D only and creates no new floor',()=>{
  const scene=readFileSync('src/components/game3d/wolfveil/WolfveilScene.js','utf8');
  const cover=readFileSync('src/components/game3d/wolfveil/WolfveilGroundCover.js','utf8');
  assert(scene.includes('if(options.originAtMarket&&options.groundCover)\n    applyWolfveilForestTrailPigment'));
  assert(cover.includes('const geoForestEnabled=options.precisionTileWorldOffsetZ===70'));
  assert(cover.includes('planWolfveilForestTrailAccents('));
  assert(cover.includes('refineWolfveilForestTrailPlanting('));
  assert(!WOLFVEIL_FOREST_TRAIL_STUDY.terrainHeightsChanged);
});
