import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSource} from '../src/components/duelist/client/localSource.mjs';
import {getModeArenaLayout,arenaFloorContains,arenaBodyBlockers,moveArenaBody} from '../src/components/duelist/sim/modeArenaLayout.mjs';
test('all seven test modes start solo and can start with normal bot seats',()=>{
  for(const mode of ['duel','ffa','tdm','ctf','escort','football','control']){
    const solo=createLocalSource({mode,testMode:true});
    assert.equal(solo.seats().length,1,mode);
    assert.equal(solo.seats()[0].kind,'player');
    const filled=createLocalSource({mode,testMode:true,testBots:true});
    assert.ok(filled.seats().some(s=>s.kind==='bot'),mode);
  }
});
test('A foundation is shared by public and private Control Point and has four center entrances',()=>{
  const map=getModeArenaLayout('control',true);
  assert.equal(map,getModeArenaLayout('control'));
  assert.equal(createLocalSource({mode:'control',testMode:true}).world.arenaLayout,map);
  assert.equal(createLocalSource({mode:'control'}).world.arenaLayout,map);
  assert.equal(map.parts.filter(p=>p.kind==='deck').length,3);
  assert.ok(map.parts.length<65);
  assert.equal(arenaFloorContains(map,0,15,.4),false);
  for(const [x,z] of [[0,-20],[0,-5],[-13.5,15],[13.5,15],[0,6]]){
    assert.ok(arenaFloorContains(map,x,z,.4));
    assert.equal(arenaBodyBlockers(map,{x,z,y:0,radius:.4,height:1.8}).length,0);
  }
  for(const [x,z] of [[-4,-5],[4,-5],[0,-9],[0,-1]]){
    const body={x,z,y:0};
    moveArenaBody(map,body,-x,-5-z,0);
    assert.ok(Math.hypot(body.x,body.z+5)<.2,JSON.stringify(body));
  }
  const body={x:0,z:6,y:0};
  moveArenaBody(map,body,0,12,0);
  assert.ok(body.z<8);
});

test('decorative trim follows the A outer and inner edges and clips to the foundation',async()=>{
  const THREE=await import('three');
  const {controlFloorPatterns,clippedPatternGeometry}=await import('../src/components/duelist/client/controlFloorTrim.mjs');
  const map=getModeArenaLayout('control',true);
  const trace=(shape,ring)=>{ring.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();};
  const outline=new THREE.Shape();trace(outline,map.footprint.outer);
  for(const ring of map.footprint.holes){const hole=new THREE.Path();trace(hole,ring);outline.holes.push(hole);}
  const floor=new THREE.ShapeGeometry(outline);
  const patterns=controlFloorPatterns(map.footprint);
  for(const polygons of Object.values(patterns)){
    const geometry=clippedPatternGeometry(floor,polygons);
    const p=geometry.attributes.position;
    assert.ok(p.count>0 && p.count<20000);
    for(let i=0;i<p.count;i+=3){
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3;
      const z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      assert.ok(arenaFloorContains(map,x,z),`trim escaped foundation: ${x},${z}`);
    }
    geometry.dispose();
  }
  floor.dispose();
});
