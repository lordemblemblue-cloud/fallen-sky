// Far proxy: tall scenery baked into one coarse outline. No Three.js needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeFarProxy} from '../src/components/game3d/performance/Game3DFarProxy.mjs';

const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const at=(x,y,z,scale=1)=>[scale,0,0,0,0,scale,0,0,0,0,scale,0,x,y,z,1];
// A box from (0,0,0) to (w,h,d), subdivided so it has plenty of small triangles.
function box(w,h,d,steps=4){
  const positions=[],index=[];
  const face=(origin,u,v)=>{
    const base=positions.length/3;
    for(let i=0;i<=steps;i++)for(let j=0;j<=steps;j++)
      positions.push(...[0,1,2].map(a=>origin[a]+u[a]*i/steps+v[a]*j/steps));
    for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){
      const p=base+i*(steps+1)+j,q=p+steps+1;
      index.push(p,q,p+1, p+1,q,q+1);
    }
  };
  face([0,0,0],[w,0,0],[0,h,0]);face([0,0,d],[w,0,0],[0,h,0]);
  face([0,0,0],[0,0,d],[0,h,0]);face([w,0,0],[0,0,d],[0,h,0]);
  face([0,h,0],[w,0,0],[0,0,d]);face([0,0,0],[w,0,0],[0,0,d]);
  return {positions:new Float32Array(positions),index:new Uint16Array(index)};
}
function bounds(positions){
  const out=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3)for(let a=0;a<3;a++){
    out[a]=Math.min(out[a],positions[i+a]);out[a+3]=Math.max(out[a+3],positions[i+a]);
  }
  return out;
}

test('a building keeps its outline with far fewer triangles',()=>{
  const hall={...box(12,8,10,8),matrices:[at(100,20,-50)],color:[.6,.4,.2]};
  const baked=bakeFarProxy([hall],{cellMeters:3});
  assert.equal(baked.sourceTriangles,768);
  assert.ok(baked.triangles>20&&baked.triangles<300,'coarser, not gone: '+baked.triangles);
  const [x0,y0,z0,x1,y1,z1]=bounds(baked.positions);
  // The outline stays within one grid cell of the real building.
  for(const [got,want] of [[x0,100],[x1,112],[y0,20],[y1,28],[z0,-50],[z1,-40]])
    assert.ok(Math.abs(got-want)<=3,got+' vs '+want);
  assert.equal(baked.colors.length,baked.positions.length);
  assert.ok(Math.abs(baked.colors[0]-.6)<1e-6&&Math.abs(baked.colors[2]-.2)<1e-6);
  for(const corner of baked.index)assert.ok(corner<baked.vertices);
  assert.equal(baked.cellMeters,3);
});

test('detail smaller than the grid disappears; doubled faces count once',()=>{
  const lantern={...box(.3,.4,.3,2),matrices:[at(5,1,5),at(9,1,5)],color:[1,1,0]};
  assert.equal(bakeFarProxy([lantern],{cellMeters:2}).triangles,0);
  const wall={...box(8,6,.2,1),matrices:[IDENTITY,IDENTITY],color:[.5,.5,.5]};
  const once=bakeFarProxy([{...wall,matrices:[IDENTITY]}],{cellMeters:2});
  assert.equal(bakeFarProxy([wall],{cellMeters:2}).triangles,once.triangles,
    'the same wall placed twice in one spot is still one wall');
  // Both faces of the thin wall land in the same cells: a single sheet remains.
  assert.equal(once.triangles,2);
});

test('the grid coarsens until the outline fits the triangle allowance',()=>{
  const trees=[];
  for(let i=0;i<40;i++)trees.push(at(i*9,0,(i%5)*11,1+i%3*.2));
  const forest={...box(4,10,4,6),matrices:trees,color:[.1,.4,.1]};
  const fine=bakeFarProxy([forest],{cellMeters:.5,maxTriangles:1e9});
  const capped=bakeFarProxy([forest],{cellMeters:.5,maxTriangles:900});
  assert.ok(fine.triangles>3000);
  assert.ok(capped.triangles<=900,'held to the allowance: '+capped.triangles);
  assert.ok(capped.cellMeters>.5);
  assert.ok(capped.triangles>100,'the forest is still there');
  const stuck=bakeFarProxy([forest],{cellMeters:.5,maxTriangles:1,maxCellMeters:2});
  assert.equal(stuck.cellMeters,2,'never coarser than the limit');
});

test('cells stay distinct at the far corners of the map',()=>{
  // Two small boxes one cell apart in z, 550 m out: with an inexact cell key
  // they would fall into the same cells and collapse into each other.
  const post={...box(1.2,1.2,1.2,1),color:[1,1,1]};
  const near=bakeFarProxy([{...post,matrices:[at(0,0,0)]}],{cellMeters:.5});
  const far=bakeFarProxy([{...post,matrices:[at(550,40,620)]}],{cellMeters:.5});
  const pair=bakeFarProxy([{...post,matrices:[at(550,40,620),at(550,40,623)]}],{cellMeters:.5});
  assert.equal(far.triangles,near.triangles);
  assert.equal(pair.triangles,near.triangles*2);
  // Bad placements (a number where a matrix belongs) add nothing.
  assert.equal(bakeFarProxy([{...post,matrices:[7]}],{cellMeters:.5}).triangles,0);
});

test('colours blend where different objects meet; bad input is skipped, not fatal',()=>{
  const red={...box(4,4,4,1),matrices:[at(0,0,0)],color:[1,0,0]};
  const blue={...box(4,4,4,1),matrices:[at(4,0,0)],color:[0,0,1]};
  const baked=bakeFarProxy([red,blue],{cellMeters:4});
  let mixed=0;
  for(let i=0;i<baked.colors.length;i+=3)if(baked.colors[i]>.01&&baked.colors[i+2]>.01)mixed++;
  assert.ok(mixed>0,'the shared wall carries both colours');
  const broken={positions:new Float32Array([0,0,0, NaN,1,0, 1,0,0, 0,0,0, 9,0,0, 0,9,0]),
    matrices:[IDENTITY],color:[1,1,1]};
  assert.equal(bakeFarProxy([broken],{cellMeters:1}).triangles,1);
  const none=bakeFarProxy([],{});
  assert.equal(none.triangles,0);assert.equal(none.positions.length,0);
  assert.equal(bakeFarProxy(null).sourceTriangles,0);
});

test('the game hands the outline builder to the area loader, and the menu can switch it off',async()=>{
  const fs=await import('node:fs');
  const read=path=>fs.readFileSync(new globalThis.URL('../'+path,import.meta.url),'utf8');
  const world=read('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/farOutline=wolfveilVillage\?createWolfveilFarOutline\(\{scene\}\):null;/);
  assert.match(world,/farProxy:farOutline,/);
  assert.match(world,/farScenery:profile\.farScenery\}\);/);
  assert.match(world,/farOutline\?\.disposeAll\(\);/);
  const outline=read('src/components/game3d/wolfveil/WolfveilFarOutline.js');
  assert.match(outline,/wolfveilAreaShared:true/,'the loader must never try to manage its own outline');
  assert.match(outline,/otsCameraIgnore:true/);
  assert.match(outline,/object\.raycast=noRaycast;/);
  const panel=read('src/components/game3d/performance/Game3DPlatformGraphicsPanel.jsx');
  assert.match(panel,/remember\(\{farScenery:!profile\.farScenery\}\)/);
  assert.doesNotMatch(read('src/components/game3d/performance/Game3DFarProxy.mjs'),/from ['"]three['"]/);
});
