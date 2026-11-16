import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  WOLFVEIL_CAVE_APPROACHES, WOLFVEIL_CAVE_APRON_HALF_WIDTH,
  getWolfveilCaveApproach,isWolfveilCaveApproachReserved,
  resolveWolfveilCaveEntranceRailCollision,
} from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {
  WOLFVEIL_EXPLORABLE_CAVES,WOLFVEIL_CAVE_CORRIDORS,
  isWolfveilCaveMouthCutout,sampleWolfveilCaveSpace,
  sampleWolfveilPlayerCaveFloorY,
} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {appendWolfveilCaveAccessFloor}
  from '../src/components/game3d/wolfveil/WolfveilCaveAccessGeometry.mjs';
import {WOLFVEIL_ROUTES,WOLFVEIL_BRIDGES,wolfveilHeight}
  from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  shouldRejectCaveGroundStep,CAVE_RIM_BUFFER_METRES,
} from '../src/components/game3d/dungeons/CaveRimSafety.mjs';

const xz=(v)=>[v.x,v.z];
const eps=1e-5;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function insideTriangle(x,z,vertices){
  const [a,b,c]=vertices.map(v=>[v[0],v[2]]),p=[x,z];
  const values=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];
  return values.every(v=>v>=-eps)||values.every(v=>v<=eps);
}
function pathTriangles(){
  const triangles=[],visibleTriangles=[];
  const collect={
    quad(a,b,c,d){triangles.push([a,b,c],[a,c,d]);visibleTriangles.push([a,b,c,d]);},
    tri(a,b,c){triangles.push([a,b,c]);visibleTriangles.push([a,b,c]);},
  };
  const stats=appendWolfveilCaveAccessFloor(collect);
  return {triangles,visibleTriangles,stats};
}
test('exactly four named cave access paths originate at authored existing trails/bridge',()=>{
  assert.equal(WOLFVEIL_CAVE_APPROACHES.length,4);
  assert.deepEqual(new Set(WOLFVEIL_CAVE_APPROACHES.map(a=>a.caveId)),
    new Set(WOLFVEIL_EXPLORABLE_CAVES.map(c=>c.id)));
  const known=new Set(WOLFVEIL_ROUTES.flatMap(r=>r.points.map(p=>p.join(','))));
  WOLFVEIL_BRIDGES.forEach(b=>{
    known.add(b.from.join(','));known.add(b.to.join(','));
  });
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    assert.ok(known.has(xz(approach.points[0]).join(',')),
      approach.id+' must start on an actual existing trail or bridge');
    assert.equal(approach.points.length,4);
    assert.ok(approach.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
    assert.ok(approach.entrance.x===approach.mouth[0]);
    assert.ok(approach.entrance.z===approach.mouth[1]);
    assert.equal(getWolfveilCaveApproach(approach.caveId),approach);
  }
});
test('each path connects seamlessly to old bidirectional entry ramp and a cave chamber',()=>{
  const {triangles,stats}=pathTriangles();
  assert.equal(stats.approaches,4);
  assert.equal(stats.rampAprons,4);
  assert.ok(stats.walkQuads>200);
  assert.ok(stats.shoulderQuads>=100);
  assert.ok(triangles.every(vertices=>vertices.every(p=>
    p.length===3&&p.every(Number.isFinite))));
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const cave=WOLFVEIL_EXPLORABLE_CAVES.find(c=>c.id===approach.caveId);
    const ramp=WOLFVEIL_CAVE_CORRIDORS.find(c=>c.id==='entry_'+cave.id);
    assert.ok(ramp,'real existing underground entry ramp is linked');
    const end=approach.points.at(-1);
    assert.ok(Math.hypot(end.x-cave.threshold[0],end.z-cave.threshold[2])<.0001);
    assert.ok(Math.abs(end.y-cave.threshold[1])<.0001);
    assert.ok(Math.abs(end.y-ramp.waypoints[0][1])<.0001);
    assert.deepEqual(ramp.waypoints.at(-1),[
      cave.chamber.x,cave.chamber.y,cave.chamber.z]);
    for(const seg of ramp.segments){
      assert.ok(seg.lenXZ>0,'not a zero-length stair/drop');
      assert.ok(Number.isFinite(seg.ay)&&Number.isFinite(seg.by));
    }
    assert.ok(isWolfveilCaveApproachReserved(end.x,end.z,1.2));
  }
});
test('no open floor at ANY of the four removed terrain-hole tiles (25 points per tile)',()=>{
  const {triangles}=pathTriangles();
  const span=1100,segments=310,step=span/segments;
  let cutTiles=0,verified=0;
  for(let zi=0;zi<segments;zi++)for(let xi=0;xi<segments;xi++){
    const cx=((xi+.5)/segments-.5)*span,cz=((zi+.5)/segments-.5)*span;
    if(!isWolfveilCaveMouthCutout(cx,cz))continue;
    cutTiles++;
    for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){
      const x=cx+(i/4-.5)*step,z=cz+(j/4-.5)*step;
      const realUndergroundFloor=sampleWolfveilCaveSpace(x,z);
      const apron=triangles.some(t=>insideTriangle(x,z,t));
      assert.ok(realUndergroundFloor||apron,
        'void cell at '+x.toFixed(2)+', '+z.toFixed(2));
      verified++;
    }
  }
  assert.equal(cutTiles,18,'existing Wolfveil cutout footprint unexpectedly changed');
  assert.equal(verified,18*25);
  assert.ok(WOLFVEIL_CAVE_APRON_HALF_WIDTH>=6.8);
});
test('7-foot cave-edge guard blocks voids but not legal gradual walks on the actual path',()=>{
  const point=WOLFVEIL_CAVE_APPROACHES[0].entrance;
  const at={x:point.x,z:point.z+70};
  assert.ok(CAVE_RIM_BUFFER_METRES>=2.1);
  assert.equal(shouldRejectCaveGroundStep({from:at,to:at,
    fromGroundY:15,toGroundY:null,variant:'classic'}),true);
  assert.equal(shouldRejectCaveGroundStep({from:at,to:at,
    fromGroundY:15,toGroundY:14.65,variant:'classic'}),false);
});
test('approach side rail stops sideways cliff slips without blocking descent or exit',()=>{
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const nx=-cave.dir[1],nz=cave.dir[0],
      base={x:cave.mouth[0],z:cave.mouth[1]};
    const at=(f,side)=>({x:base.x+cave.dir[0]*f+nx*side,
      z:base.z+cave.dir[1]*f+nz*side});
    const centerStart=at(-2,0),centerEnd=at(2,0);
    assert.equal(resolveWolfveilCaveEntranceRailCollision(
      {...centerEnd},centerStart,.62),false);
    assert.equal(resolveWolfveilCaveEntranceRailCollision(
      {...centerStart},centerEnd,.62),false,'walk out is permitted');
    const outside=at(3,5.7),inside=at(3,4.1);
    const blocked={...outside};
    assert.equal(resolveWolfveilCaveEntranceRailCollision(blocked,inside,.62),true);
    assert.ok(Math.hypot(blocked.x-inside.x,blocked.z-inside.z)<1e-6);
    const far=at(-18,5.7);
    assert.equal(resolveWolfveilCaveEntranceRailCollision(
      {...far},at(-18,4.1),.62),false,'outside cliff is not an infinite invisible wall');
  }
});
test('enclosed cave floor remains sampleable at each chamber and entrance ramp',()=>{
  for(const c of WOLFVEIL_EXPLORABLE_CAVES){
    assert.ok(Number.isFinite(sampleWolfveilPlayerCaveFloorY(
      c.chamber.x,c.chamber.y+1,c.chamber.z)));
    const r=WOLFVEIL_CAVE_CORRIDORS.find(v=>v.id==='entry_'+c.id);
    const mid=r.waypoints[2];
    assert.ok(Number.isFinite(sampleWolfveilPlayerCaveFloorY(
      mid[0],mid[1]+1,mid[2])));
  }
});
test('live Game 3D cave builder mounts the physical path on its real raycast floor',()=>{
  const source=readFileSync(new URL('../src/components/game3d/wolfveil/WolfveilCaveSystem.js',import.meta.url),'utf8');
  const scene=readFileSync(new URL('../src/components/game3d/wolfveil/WolfveilScene.js',import.meta.url),'utf8');
  const world=readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx',import.meta.url),'utf8');
  const map=readFileSync(new URL('../src/components/game3d/hud/AXEWorldMapOverlay.jsx',import.meta.url),'utf8');
  assert.match(source,/appendWolfveilCaveAccessFloor\(floorTris\)/);
  assert.match(source,/world\.walkableSurfaces\.push\(floorMesh\)/);
  assert.match(source,/appendWolfveilCaveAccessProps/);
  assert.match(scene,/const enableCaves=Boolean\(options\.originAtMarket\)/);
  assert.match(world,/caveAwareGroundY\(fromX,fromZ,model\.position\.y\)/);
  assert.match(world,/Math\.abs\(caveY-referenceY\)<=1\.1/);
  assert.match(map,/Four cave approach trails and walk-in entrances/);
});
