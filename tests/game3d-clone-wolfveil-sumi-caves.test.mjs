// The owner's sumi-e cave kit, made light: painted walls, merged batches and
// the hallway laid along Wolfveil's cave tunnels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUMI_WALL_PERIOD,SUMI_BRICK_TONES,sumiWallSeamY,planSumiWallBond,paintSumiWall,
  sumiWallPictureSize,sumiWallPanels} from '../src/components/game3d/wolfveil/caves/SumiWallPaint.mjs';
import {mergeSumiTriangles,sumiTriangleBounds} from '../src/components/game3d/wolfveil/caves/SumiCaveBake.mjs';
import {WOLFVEIL_SUMI_HALL as HALL,planWolfveilSumiHalls,sumiHallPoint}
  from '../src/components/game3d/wolfveil/caves/WolfveilSumiHallPlan.mjs';
import {sampleWolfveilCaveSpace,WOLFVEIL_CAVE_HUB,WOLFVEIL_DUNGEON_FLOOR_Y}
  from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_MODULAR_JUNCTION,WOLFVEIL_MODULAR_TREASURE_ROOM,WOLFVEIL_MODULAR_CANYON}
  from '../src/components/game3d/wolfveil/WolfveilModularCaveKit.mjs';
import {createWolfveilTerrainSurfaceSampler} from '../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';

/* global URL */
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const KIT='src/components/game3d/wolfveil/caves/SumiCorridorKit.js';

test('the wall picture follows the owner\'s own seam curve',()=>{
  // The owner's getHallwaySeamY, lifted out of the generated kit as text.
  const kit=source(KIT);
  const start=kit.indexOf('    getHallwaySeamY(s, rowIdx');
  const end=kit.indexOf('\n    }\n',start);
  assert.ok(start>0&&end>start,'the owner\'s seam curve is in the kit');
  const body=kit.slice(kit.indexOf('{',start)+1,end);
  const owners=new Function('s','rowIdx','rows=9','wallHeight=3.9','baseOffset=0.16',body);
  for(const [rows,height] of [[9,3.9],[12,6.4],[14,7.4],[22,38]])
    for(let row=0;row<=rows;row++)for(let s=-30;s<30;s+=.173)
      assert.equal(sumiWallSeamY(s,row,rows,height),owners(s,row,rows,height));
  // The courses repeat along the wall, so one picture can run its length.
  for(let row=1;row<9;row++)for(let s=0;s<3;s+=.31)
    assert.ok(Math.abs(sumiWallSeamY(s,row)-sumiWallSeamY(s+SUMI_WALL_PERIOD,row))<1e-9);
  // Courses never cross.
  for(let s=0;s<SUMI_WALL_PERIOD;s+=.05)for(let row=0;row<9;row++)
    assert.ok(sumiWallSeamY(s,row+1)-sumiWallSeamY(s,row)>.1,'courses keep their order at '+s);
});

test('each course of bricks closes on itself with the owner\'s brick lengths',()=>{
  for(const rows of [9,12,14,22]){
    const bond=planSumiWallBond({rows,seed:909+rows});
    assert.equal(bond.length,rows);
    bond.forEach((course,row)=>{
      const joints=course.joints;
      assert.ok(joints.length>=7&&joints.length<=10,'bricks in a course: '+joints.length);
      assert.equal(course.tones.length,joints.length);
      assert.ok(course.tones.every(tone=>tone>=0&&tone<SUMI_BRICK_TONES.length));
      let total=0;
      joints.forEach((joint,i)=>{
        assert.ok(joint>=0&&joint<SUMI_WALL_PERIOD);
        const length=((joints[(i+1)%joints.length]-joint)%SUMI_WALL_PERIOD+SUMI_WALL_PERIOD)%SUMI_WALL_PERIOD;
        assert.ok(length>1&&length<1.7,'brick '+length.toFixed(2)+' m in course '+row);
        total+=length;
      });
      assert.ok(Math.abs(total-SUMI_WALL_PERIOD)<1e-6);
    });
    // Running bond: joints of neighbouring courses do not line up.
    assert.notDeepEqual(bond[0].joints,bond[1].joints);
  }
  assert.deepEqual(planSumiWallBond({rows:9,seed:5}),planSumiWallBond({rows:9,seed:5}),'the same wall every time');
});

test('the painted wall is brick with gold and silver inlay, and repeats without a seam',()=>{
  const picture=paintSumiWall({width:256,height:128});
  assert.equal(picture.data.length,256*128*4);
  let gold=0,silver=0,brick=0;
  for(let i=0;i<picture.data.length;i+=4){
    const [r,g,b,a]=picture.data.slice(i,i+4);
    assert.equal(a,255);
    if(r>170&&g>120&&b<130&&r-b>70)gold++;
    else if(Math.abs(r-b)<40&&r>120)silver++;
    else if(r>g&&g>b)brick++;
  }
  const pixels=256*128;
  assert.ok(brick/pixels>.6,'mostly brick: '+(brick/pixels).toFixed(2));
  assert.ok(gold/pixels>.02&&gold/pixels<.2,'gold inlay: '+(gold/pixels).toFixed(3));
  assert.ok(silver/pixels>.005&&silver<gold,'silver inlay, less than gold: '+(silver/pixels).toFixed(3));
  // The first and last columns are neighbours when the picture repeats.
  let jump=0;
  for(let y=0;y<128;y++){
    const left=(y*256)*4,right=(y*256+255)*4;
    if(Math.abs(picture.data[left]-picture.data[right])>70)jump++;
  }
  assert.ok(jump<128*.25,'rows that change across the repeat: '+jump);
  assert.deepEqual(sumiWallPictureSize(3.9),{width:1024,height:512});
  assert.deepEqual(sumiWallPictureSize(7.4),{width:1024,height:1024});
  assert.deepEqual(sumiWallPictureSize(38),{width:512,height:2048});
});

test('a wall is a few flat panels, split at doorways',()=>{
  assert.deepEqual(sumiWallPanels({spanMin:-12,spanMax:12,wallHeight:3.9}),[{s0:-12,s1:12,y0:0,y1:3.9}]);
  const open=sumiWallPanels({spanMin:-12,spanMax:12,wallHeight:3.9,openings:[{min:-2,max:2}]});
  assert.deepEqual(open,[{s0:-12,s1:-2,y0:0,y1:3.9},{s0:2,s1:12,y0:0,y1:3.9}],'a full-height doorway leaves two panels');
  const door=sumiWallPanels({spanMin:-12,spanMax:12,wallHeight:6.4,openings:[{min:-2,max:2,maxY:3}]});
  assert.deepEqual(door.at(-1),{s0:-2,s1:2,y0:3,y1:6.4},'a low doorway keeps the wall above it');
  assert.equal(door.length,3);
  assert.deepEqual(sumiWallPanels({spanMin:0,spanMax:5,openings:[{min:-1,max:6}]}),[],'a doorway as wide as the wall leaves nothing');
});

test('many meshes merge into one list: moved, mirrored, indexed or not',()=>{
  const triangle={position:[0,0,0, 1,0,0, 0,1,0],normal:[0,0,1, 0,0,1, 0,0,1],uv:[0,0, 1,0, 0,1]};
  const moved=[1,0,0,0, 0,1,0,0, 0,0,1,0, 5,6,7,1];
  const mirrored=[-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const quad={position:[0,0,0, 1,0,0, 1,1,0, 0,1,0],index:[0,1,2, 0,2,3]};
  const merged=mergeSumiTriangles([{...triangle,matrix:moved},{...triangle,matrix:mirrored},quad]);
  assert.equal(merged.triangles,4);
  assert.deepEqual([...merged.position.slice(0,9)],[5,6,7, 6,6,7, 5,7,7],'moved by its transform');
  assert.deepEqual([...merged.normal.slice(0,3)],[0,0,1]);
  assert.deepEqual([...merged.uv.slice(0,6)],[0,0, 1,0, 0,1]);
  // Mirrored: corners swap so the triangle still faces its normal.
  const p=merged.position.slice(9,18);
  assert.deepEqual([...p],[0,0,0, 0,1,0, -1,0,0]);
  const facing=(p[3]-p[0])*(p[7]-p[1])-(p[4]-p[1])*(p[6]-p[0]);
  assert.ok(facing>0&&merged.normal[11]>0,'a mirrored triangle faces the way its normal points');
  // Indexed, no normals given: each triangle gets the normal it is wound to.
  assert.deepEqual([...merged.normal.slice(18,21)],[0,0,1]);
  assert.deepEqual([...merged.position.slice(27,36)],[0,0,0, 1,1,0, 0,1,0]);
  assert.deepEqual(sumiTriangleBounds(merged.position),{min:[-1,0,0],max:[6,7,7]});
  assert.equal(mergeSumiTriangles([]).triangles,0);
});

test('the hallway runs from the rotunda to the junction, the vault and the canyon',()=>{
  const plan=planWolfveilSumiHalls(),[stem,bar,...onward]=plan.runs;
  assert.equal(HALL.halfWidth,2.42,'the owner\'s hallway is as wide as the tunnels cut for it');
  assert.equal(plan.floorY,WOLFVEIL_DUNGEON_FLOOR_Y);
  assert.ok(plan.meters>180&&plan.meters<210,'metres of hallway: '+plan.meters.toFixed(1));
  // The stem leaves the rotunda's rim and ends at the crossbar's wall line.
  assert.deepEqual(stem.from,[WOLFVEIL_CAVE_HUB.x,WOLFVEIL_CAVE_HUB.z-WOLFVEIL_CAVE_HUB.radius]);
  assert.deepEqual(stem.to,[WOLFVEIL_MODULAR_JUNCTION.x,WOLFVEIL_MODULAR_JUNCTION.z+HALL.halfWidth]);
  // The crossbar runs from the vault's rim; the stem walks in through a doorway in it.
  assert.deepEqual(bar.from,[WOLFVEIL_MODULAR_TREASURE_ROOM.x+WOLFVEIL_MODULAR_TREASURE_ROOM.radius,WOLFVEIL_MODULAR_JUNCTION.z]);
  const doors=[...bar.left.openings,...bar.right.openings];
  assert.equal(doors.length,1);
  const wall=bar.left.openings.length?-1:1;
  const [doorFrom,doorTo]=[doors[0].min,doors[0].max].map(s=>sumiHallPoint(bar,wall*HALL.halfWidth,s));
  assert.ok(Math.abs(doorFrom[1]-stem.to[1])<1e-9&&Math.abs(doorTo[1]-stem.to[1])<1e-9,'the doorway is in the wall the stem meets');
  assert.ok(Math.abs(Math.min(doorFrom[0],doorTo[0])-(stem.to[0]-HALL.halfWidth))<1e-9);
  assert.ok(Math.abs(Math.max(doorFrom[0],doorTo[0])-(stem.to[0]+HALL.halfWidth))<1e-9,'the doorway is exactly as wide as the stem');
  // It stops where the canyon's own floor begins.
  assert.ok(Math.abs(onward.at(-1).to[0]-WOLFVEIL_MODULAR_CANYON.minX)<1e-9);
  // A gold frame at every open end: rotunda, vault, canyon.
  assert.equal(plan.runs.reduce((sum,run)=>sum+run.frames.length,0),3);
});

test('at every bend the walls meet and the floors do not overlap',()=>{
  const {runs}=planWolfveilSumiHalls();
  let bends=0;
  for(let i=1;i+1<runs.length;i++){
    const before=runs[i],after=runs[i+1];
    assert.deepEqual(before.to,after.from);
    bends++;
    for(const [side,name] of [[-1,'left'],[1,'right']]){
      const end=sumiHallPoint(before,side*HALL.halfWidth,before[name].span[1]);
      const start=sumiHallPoint(after,side*HALL.halfWidth,after[name].span[0]);
      assert.ok(Math.hypot(end[0]-start[0],end[1]-start[1])<1e-6,name+' walls meet at bend '+i);
    }
    // One wall runs on past the corner, the other stops short of it.
    const reach=[before.left.span[1],before.right.span[1]].map(s=>s-before.length/2);
    assert.ok(reach[0]*reach[1]<0,'outer wall longer, inner wall shorter');
    // Floors: each stops short of the corner by the same cut.
    assert.ok(before.floor[1]<before.length/2&&after.floor[0]>-after.length/2);
    const gap=sumiHallPoint(before,0,before.floor[1]),resume=sumiHallPoint(after,0,after.floor[0]);
    assert.ok(Math.hypot(gap[0]-resume[0],gap[1]-resume[1])<2*HALL.halfWidth,'the untiled corner is smaller than the hall is wide');
  }
  assert.equal(bends,2);
});

test('the hallway lies on walkable cave floor, deep under the ground',()=>{
  const {runs,floorY}=planWolfveilSumiHalls(),ground=createWolfveilTerrainSurfaceSampler();
  const top=floorY+HALL.tileLift-HALL.tileTop+HALL.wallHeight+.4;
  let points=0;
  for(const run of runs)for(let s=run.floor[0]+.3;s<=run.floor[1]-.3;s+=.5)for(const across of [-1.7,0,1.7]){
    const [x,z]=sumiHallPoint(run,across,s),space=sampleWolfveilCaveSpace(x,z,0);
    assert.ok(space?.inside,'hall floor outside the cave at '+x.toFixed(1)+', '+z.toFixed(1));
    assert.ok(Math.abs(space.floorY-floorY)<.3,'hall floor off the cave floor at '+x.toFixed(1)+', '+z.toFixed(1));
    assert.ok(ground(x,z)-top>10,'the hallway is far under the surface at '+x.toFixed(1)+', '+z.toFixed(1));
    points++;
  }
  assert.ok(points>1000);
  // Tiles stand a little proud of the stone floor; a walker's feet stay on stone.
  assert.ok(HALL.tileLift>.03&&HALL.tileLift<=.1);
});

test('the owner\'s builder code is carried over whole, without the viewer page',()=>{
  const kit=source(KIT);
  assert.match(kit,/^\/\/ GENERATED by scripts\/extract-sumi-corridor-kit\.mjs/);
  assert.match(kit,/export function createSumiCorridorKit\(\{THREE,document\}\)/);
  for(const method of ['createHallwayStandaloneModule','createHallwayAttachedModule','createDetachedTJunctionModule',
    'createDetachedCaveCanyonModule','createDetachedSunkenSanctuaryCaveModule','populateStraightPathwaySegment',
    'populateArchitecturalBrickWall','buildSecretChamber','buildMagicalStaircaseChamber'])
    assert.match(kit,new RegExp('\\n    '+method+'\\('),method+' is in the kit');
  for(const gone of ['WebGLRenderer','OrbitControls','requestAnimationFrame','getElementById','window.'])
    assert.ok(!kit.includes(gone),'the viewer page\'s '+gone+' is left out');
});

test('the caves build the hallway, keep it out of play and fail open',()=>{
  const caves=source('src/components/game3d/wolfveil/WolfveilCaveSystem.js');
  assert.match(caves,/sumiHalls = buildWolfveilSumiHalls\(\{ THREE \}\);\s+group\.add\(sumiHalls\.object\);/);
  assert.match(caves,/sumi-e hallway unavailable; tunnels stay bare rock/);
  assert.ok(caves.indexOf('buildWolfveilSumiHalls({ THREE })')<caves.indexOf('installWolfveilCaveDrawBudget({'),
    'built before the draw budget, so it is only drawn underground');
  assert.match(caves,/sumiHalls\?\.dispose\(\)/);
  const halls=source('src/components/game3d/wolfveil/caves/WolfveilSumiCaveHalls.js');
  assert.match(halls,/node\.raycast=\(\)=>\{\}/,'never a floor, a wall or a click target');
  const light=source('src/components/game3d/wolfveil/caves/SumiCaveLightKit.js');
  assert.doesNotMatch(light,/from 'three'/,'Three.js is handed in');
  assert.match(light,/kit\.populateArchitecturalBrickWall=function/);
});
