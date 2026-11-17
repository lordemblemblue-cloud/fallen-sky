// Near grass: every blade stays planted; far cells draw it with fewer segments.
/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WOLFVEIL_NEAR_GRASS_DETAIL,nearGrassBladeTriangles,nearGrassDetailLevel}
  from '../src/components/game3d/wolfveil/WolfveilNearGrassDetail.mjs';

test('a blade is 21 triangles up close, 9 at mid distance and 3 far away',()=>{
  assert.deepEqual(WOLFVEIL_NEAR_GRASS_DETAIL.segments.map(nearGrassBladeTriangles),[21,9,3]);
  assert.equal(nearGrassBladeTriangles(0),3,'never fewer than one triangle per shoot');
});

test('detail falls with distance and never flickers on an edge',()=>{
  const fresh=distance=>nearGrassDetailLevel(distance);
  assert.deepEqual([0,10,18,18.1,31.9,32.1,46,62].map(fresh),[0,0,0,1,1,2,2,2]);
  // Walking away: a full-detail cell holds on until 2 m past the edge.
  assert.equal(nearGrassDetailLevel(19.9,0),0);
  assert.equal(nearGrassDetailLevel(20.1,0),1);
  // Walking back: it only returns to full detail 2 m inside the edge.
  assert.equal(nearGrassDetailLevel(16.1,1),1);
  assert.equal(nearGrassDetailLevel(15.9,1),0);
  assert.equal(nearGrassDetailLevel(33.9,1),1);
  assert.equal(nearGrassDetailLevel(34.1,1),2);
  assert.equal(nearGrassDetailLevel(30.1,2),2);
  assert.equal(nearGrassDetailLevel(29.9,2),1);
  // A teleport skips straight to the right level.
  assert.equal(nearGrassDetailLevel(5,2),0);
  assert.equal(nearGrassDetailLevel(60,0),2);
  assert.equal(nearGrassDetailLevel(NaN,1),0,'unknown distance: full detail');
  // Standing still on an edge settles and stays.
  let level=nearGrassDetailLevel(18.5);
  for(let i=0;i<10;i++)level=nearGrassDetailLevel(18.5+(i%2?.4:-.4),level);
  assert.equal(level,1);
});

test('the lawn inside 46 m costs well under half of what it did',()=>{
  // Cells are 10 m squares within 46 m of the player, 900 blades each.
  const cost=detail=>{
    let triangles=0;
    for(let cx=-5;cx<=5;cx++)for(let cz=-5;cz<=5;cz++){
      const distance=Math.hypot((cx+.5)*10-3,(cz+.5)*10-4);
      if(distance>46)continue;
      const level=detail?nearGrassDetailLevel(distance):0;
      triangles+=900*nearGrassBladeTriangles(WOLFVEIL_NEAR_GRASS_DETAIL.segments[level]);
    }
    return triangles;
  };
  assert.ok(cost(true)<cost(false)*.45,cost(true)+' vs '+cost(false));
  assert.ok(cost(true)>cost(false)*.2,'still a full lawn near the player');
});

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('the stream swaps blade geometry by distance and keeps every blade planted',()=>{
  const stream=source('src/components/game3d/wolfveil/WolfveilNearGrassStream.js');
  assert.match(stream,/const levels = \[geometry, \.\.\.lighterGeometries\];/);
  assert.match(stream,/mesh\.geometry = levels\[level\];/);
  assert.match(stream,/PER_CELL = 900/,'the number of blades per cell is unchanged');
  assert.match(stream,/else if \(mesh\) \{ mesh\.visible = true; applyDetail\(mesh, distance\); \}/);
  assert.match(stream,/setDetailLevels\(enabled\) \{[\s\S]{0,260}mesh\.userData\.grassDetail = null;/);
  const blades=source('src/components/game3d/wolfveil/WolfveilIndividualGrassBlades.js');
  assert.match(blades,/createIndividualSumiEBladeGeometry\(\{ segments = 4 \} = \{\}\)/);
  assert.match(blades,/const segs = Math\.max\(1, Math\.floor\(segments\) \|\| 4\);/);
  assert.match(blades,/lighterGeometries: lighterBlades,/);
  assert.match(blades,/for \(const blade of lighterBlades\) blade\.dispose\(\);/);
});

test('sparse far grass tiles share 64 m chunks; near tiles keep 32 m',()=>{
  const tiles=source('src/components/game3d/wolfveil/WolfveilGrassTileReplacement.js');
  assert.match(tiles,/const chunked=\(geometry,material,spots,label,size=32\)=>\{/);
  assert.match(tiles,/Math\.floor\(root\.x\/size\)\+':'\+Math\.floor\(root\.z\/size\)/);
  assert.match(tiles,/chunked\(near\.geometry,nearMat,nearRoots,'SWV_Owner_LongGrass_Tile_2m_Near'\),/);
  assert.match(tiles,/chunked\(far\.geometry,farMat,farRoots,'SWV_Owner_LongGrass_Tile_2m_Far',64\),/);
});
