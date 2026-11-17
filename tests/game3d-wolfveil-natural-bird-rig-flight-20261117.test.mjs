import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  BIRD_WING_STROKE_KEYS,sampleBirdWingStroke,
  classifyWolfveilBirdBone,sampleWolfveilBirdPose,
} from '../src/components/game3d/wolfveil/ambient/WolfveilBirdRigAnimation.mjs';
import {
  birdRandom,makeBird,advanceBird,birdBudget,
} from '../src/components/game3d/wolfveil/ambient/WolfveilBirdFlightPlan.mjs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const renderer=file('src/components/game3d/wolfveil/ambient/WolfveilAmbientBirds.mjs');
const world=file('src/components/game3d/GameWorld3D.jsx');

test('text-authored wing keyframes form one seamless downstroke/recovery cycle',()=>{
  assert.ok(BIRD_WING_STROKE_KEYS.length>=6);
  assert.equal(BIRD_WING_STROKE_KEYS[0][0],0);
  assert.equal(BIRD_WING_STROKE_KEYS.at(-1)[0],1);
  assert.equal(sampleBirdWingStroke(0),sampleBirdWingStroke(1));
  assert.equal(sampleBirdWingStroke(.15),sampleBirdWingStroke(1.15));
  assert.ok(sampleBirdWingStroke(.29)>sampleBirdWingStroke(.61));
  for(let i=0;i<=200;i++){
    const v=sampleBirdWingStroke(i/200);
    assert.ok(Number.isFinite(v));
    assert.ok(v>=-.6&&v<=1.01);
  }
});

test('maps original Tripo wing roots and optional feather/head/tail bones by name, not by guesswork',()=>{
  assert.deepEqual(classifyWolfveilBirdBone('0_Left_Limb_0'),{kind:'wing',sign:1,segment:0});
  assert.deepEqual(classifyWolfveilBirdBone('0_Right_Limb_0'),{kind:'wing',sign:-1,segment:0});
  assert.deepEqual(classifyWolfveilBirdBone('Armature::0_Left_Limb_1'),{kind:'wing',sign:1,segment:1});
  assert.deepEqual(classifyWolfveilBirdBone('Wing_R_2'),{kind:'wing',sign:-1,segment:2});
  assert.deepEqual(classifyWolfveilBirdBone('0_Tail_0'),{kind:'tail'});
  assert.deepEqual(classifyWolfveilBirdBone('Head'),{kind:'head'});
  assert.deepEqual(classifyWolfveilBirdBone('Neck_0'),{kind:'neck'});
  assert.equal(classifyWolfveilBirdBone('0_Left_Leg_0'),null);
  assert.equal(classifyWolfveilBirdBone('Hips'),null);
  assert.equal(classifyWolfveilBirdBone(''),null);
});

test('bird poses flap rapidly, glide with open wings, brake/land and take off naturally',()=>{
  const b={mode:'flight',flightStage:'flap',motionClock:.1,beatHz:3.1,
    phase:0,flapEnergy:.8,bank:.12,pitch:-.08};
  const powered=sampleWolfveilBirdPose(b);
  assert.equal(powered.flightStage,'flap');
  assert.ok(Math.abs(powered.wingAngle)<1.1);
  assert.ok(powered.tail!==0&&powered.head!==0);
  const coast=sampleWolfveilBirdPose({...b,flightStage:'glide'});
  assert.equal(coast.flightStage,'glide');
  assert.ok(Math.abs(coast.wingAngle)<.4);
  assert.ok(Math.abs(coast.wingTipAngle)<.2);
  const rest=sampleWolfveilBirdPose({...b,mode:'landed'});
  assert.equal(rest.flightStage,'perch');
  assert.equal(rest.head,0);assert.equal(rest.tail,0);assert.equal(rest.bob,0);
  const takeoff=sampleWolfveilBirdPose({...b,mode:'takeoff'});
  assert.equal(takeoff.flightStage,'takeoff');
  const braking=sampleWolfveilBirdPose({...b,mode:'descending'});
  assert.equal(braking.flightStage,'brake');
  for(const pose of [powered,coast,rest,takeoff,braking])
    for(const value of Object.values(pose))
      if(typeof value==='number')assert.ok(Number.isFinite(value));
});

test('near birds use independent real-time cycles rather than one globally synchronized flap',()=>{
  const r=birdRandom(723),center={x:0,y:6,z:70},terrain=()=>4;
  const birds=Array.from({length:8},(_,i)=>makeBird(i,center,terrain,r));
  assert.equal(new Set(birds.map(b=>b.beatHz)).size,8);
  assert.equal(new Set(birds.map(b=>b.phase)).size,8);
  let glideSeen=false,flapSeen=false;
  for(let i=0;i<120;i++){
    for(const b of birds){
      // Continuous independent animation clocks; disable physical landing.
      b.flightFor=1e10;
      advanceBird(b,.08,{center,terrainY:terrain,chooseLanding:()=>null});
      assert.ok(Number.isFinite(b.bank)&&Math.abs(b.bank)<=.28);
      assert.ok(Number.isFinite(b.pitch)&&Math.abs(b.pitch)<=.2);
      assert.ok(b.flapEnergy>=0&&b.flapEnergy<=1);
      if(b.flightStage==='glide')glideSeen=true;
      if(b.flightStage==='flap')flapSeen=true;
    }
  }
  assert.equal(glideSeen,true);assert.equal(flapSeen,true);
});

test('existing landing safety, no-collider and far instancing contracts stay connected',()=>{
  assert.match(renderer,/WOLFVEIL_OWNER_BIRD_ASSET/);
  assert.match(renderer,/cloneSkinned\(model\)/);
  assert.match(renderer,/classifyWolfveilBirdBone\(o\.name\)/);
  assert.match(renderer,/sampleWolfveilBirdPose\(bird\)/);
  assert.match(renderer,/w\.bone\.quaternion\.copy\(w\.base\)/);
  assert.match(renderer,/actor\.root\.position\.y=actor\.rootY\+pose\.bob/);
  assert.match(renderer,/item\.actor\.rotation\.x=pose\.bank/);
  assert.match(renderer,/item\.actor\.rotation\.z=pose\.pitch/);
  assert.match(renderer,/farMesh=new THREE\.InstancedMesh\(farGeometry,farMaterial,MAX_FAR\)/);
  assert.match(renderer,/farMaterial\.onBeforeCompile=shader=>/);
  assert.match(renderer,/farWingClock\.value=elapsed/);
  assert.match(renderer,/wolfveilIsProtectedSWTile/);
  assert.match(renderer,/insideWolfveilImportedTown/);
  assert.match(renderer,/raycast=noop/);
  assert.match(renderer,/status\(\)\{return \{loaded/);
  assert.match(renderer,/animation:'text_keyframed_bone_flight'/);
  assert.match(world,/ambientBirds\?\.update\(delta,modelRef\.current\?\.position,envSystem\.getState\(\)\)/);
  assert.match(world,/ambientBirds\?\.dispose\(\)/);
  assert.ok(birdBudget('low',16.7,true).near<birdBudget('ultra',16.7,false).near);
  assert.doesNotMatch(renderer,/awardXP\(|createRigidBody\(|addCollider\(|server\.spawn|skinWeight\.set/);
});
