import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {
  HALO_FLIGHT_RULES,getHaloFlightProfile,paidGlideSeconds,
} from '../src/components/game3d/player/haloWingFlightRules.mjs';
import {
  AIR_WALK_RULES,createAirWalkState,deployAirWalkGlide,beginAirWalkBoost,
  beginAirWalkFinisher,setAirWalkKickHeld,beginAirWalkRun,
  advanceAirWalk,releaseAirWalkGlide,isAirWalkInFlight,
} from '../src/components/game3d/player/AirWalkTraversal.mjs';
import {
  combatActionCost,createCombatResourceLedger,trySpendCombatResource,
} from '../src/components/game3d/combat/CombatResourceLedger.mjs';
import {createHaloFlightClips} from '../src/components/game3d/player/playerHaloFlightClips.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const world=source('src/components/game3d/GameWorld3D.jsx');
const controller=source('src/components/game3d/player/LunaDashboardPlayerController.jsx');
const wings=source('src/components/game3d/PlayerAngelWings.jsx');
const haloUI=source('src/components/game3d/progression/hub/HaloSubTab.jsx');
const close=(a,b,eps=1e-5)=>Math.abs(a-b)<eps;
const deploy=(percent=10)=>deployAirWalkGlide(createAirWalkState(),{
  worldY:100,floorY:0,stamina:0,haloPercent:percent,
}).state;
const tick=(state,dt,extras={})=>advanceAirWalk(state,dt,{floorY:0,...extras});

test('Halo 10% awakens real wings and gives five free glide seconds; max grants fifty',()=>{
  assert.equal(getHaloFlightProfile({level:0}).haloPercent,0);
  assert.equal(getHaloFlightProfile({level:19}).unlocked,false);
  assert.equal(getHaloFlightProfile({level:20}).haloPercent,10);
  assert.equal(getHaloFlightProfile({level:20}).freeGlideSeconds,5);
  assert.equal(getHaloFlightProfile({level:50}).freeGlideSeconds,12.5);
  assert.equal(getHaloFlightProfile({level:100}).freeGlideSeconds,25);
  assert.equal(getHaloFlightProfile({level:200}).freeGlideSeconds,50);
  assert.equal(getHaloFlightProfile({level:400}).freeGlideSeconds,50);
  assert.equal(HALO_FLIGHT_RULES.wingUnlockPercent,10);
  assert.equal(HALO_FLIGHT_RULES.doubleTapMilliseconds,300);
  assert.equal(deployAirWalkGlide(createAirWalkState(),{
    worldY:10,floorY:0,stamina:100,haloPercent:9.99,
  }).reason,'wings_not_awakened');
  assert.equal(deployAirWalkGlide(createAirWalkState(),{
    worldY:10,floorY:0,stamina:0,haloPercent:10,
  }).ok,true,'five-second glide needs no initial stamina');
  assert.equal(deploy(10).freeGlideTotal,5);
});

test('glide is free until threshold and bills only the crossing-frame remainder',()=>{
  let state=deploy(10),drained=0;
  for(let i=0;i<62;i++){
    const frame=tick(state,.08);
    state=frame.state;drained+=frame.drainStamina;
    assert.equal(frame.drainStamina,0);
    assert.equal(state.mode,'glide');
  }
  assert.ok(close(state.freeGlideRemaining,.04));
  const boundary=tick(state,.08);
  assert.ok(close(boundary.drainStamina,.04*AIR_WALK_RULES.glideStaminaPerSecond));
  assert.equal(boundary.state.freeGlideRemaining,0);
  assert.ok(close(paidGlideSeconds(boundary.state,.08),.08));
  assert.ok(close(tick(boundary.state,.08).drainStamina,.08*6.5));
  assert.equal(tick(boundary.state,.08,{canGlide:false}).state.mode,'fall');
});

test('existing combat stamina ledger remains sole payer for Air Walk and finisher',()=>{
  assert.equal(combatActionCost('air_walk').stamina,24);
  assert.equal(combatActionCost('air_walk_run',{seconds:.08}).stamina,.08*12);
  assert.equal(combatActionCost('air_walk_run',{seconds:100}).stamina,.08*12);
  assert.equal(combatActionCost('air_walk_run',{seconds:-50}).stamina,0);
  assert.equal(combatActionCost('air_walk_finisher').stamina,28);
  assert.equal(combatActionCost('glide',{seconds:.08}).stamina,.08*6.5);
  let ledger=createCombatResourceLedger({});
  ledger=trySpendCombatResource(ledger,'air_walk').state;
  ledger=trySpendCombatResource(ledger,'air_walk_run',{seconds:.08}).state;
  ledger=trySpendCombatResource(ledger,'air_walk_finisher').state;
  assert.ok(close(ledger.stamina,47.04));
  assert.equal(trySpendCombatResource(ledger,'air_walk_finisher').ok,true);
  assert.equal(trySpendCombatResource({...ledger,stamina:0},'air_walk_run',{seconds:.08}).ok,false);
});

test('hold aerial kick enters stamina-draining upward Skywalk and release resumes glide',()=>{
  const initial=deploy(25);
  const boosted=beginAirWalkBoost(initial,{stamina:100});
  assert.equal(boosted.ok,true);
  assert.equal(boosted.state.mode,'boost');
  let s=setAirWalkKickHeld(boosted.state,true);
  assert.equal(beginAirWalkRun(s).ok,false,'hold threshold must elapse first');
  for(let i=0;i<4;i++)s=tick(s,.08).state;
  assert.equal(s.mode,'walk');
  assert.ok(s.y>initial.y,'upward kicks increase altitude');
  assert.equal(s.freeGlideRemaining,12.5,'running cannot consume or reset free gliding time');
  const continuous=tick(s,.08);
  assert.ok(close(continuous.drainAirWalk,.96));
  assert.equal(continuous.drainStamina,0);
  assert.equal(setAirWalkKickHeld(continuous.state,false).mode,'glide');
  assert.equal(tick(continuous.state,.08,{canAirWalk:false}).state.mode,'glide',
    'out-of-stamina air-running drops safely back to glide');
});

test('double-tap finisher charges once, surges forward and automatically reopens glide',()=>{
  const boosted=beginAirWalkBoost(deploy(10),{stamina:100}).state;
  const dash=beginAirWalkFinisher(boosted,{stamina:100});
  assert.equal(dash.ok,true);
  assert.equal(dash.state.mode,'dash');
  assert.equal(beginAirWalkFinisher(boosted,{stamina:27}).reason,'not_enough_stamina');
  let s=dash.state;
  for(let i=0;i<8 && s.mode==='dash';i++)s=tick(s,.08).state;
  assert.equal(s.mode,'glide');
  assert.equal(s.freeGlideRemaining,5,'final kick cannot reset or spend free time');
  assert.equal(s.dashRemaining,0);
  assert.equal(beginAirWalkFinisher(s,{stamina:100}).ok,false,'one finisher per kick sequence');
  assert.ok(isAirWalkInFlight(s));
  assert.equal(releaseAirWalkGlide(s).mode,'fall');
});

test('roof collision, landing and reset work for sky-run and dash',()=>{
  let s=beginAirWalkFinisher(beginAirWalkBoost(deploy(10),{stamina:100}).state,
    {stamina:100}).state;
  const roof=tick(s,.08,{ceilingY:s.y+1.8});
  assert.equal(roof.state.mode,'dash');
  assert.ok(roof.state.y<=s.y+1e-6,'dash does not phase through low ceilings');
  s={...roof.state,y:.04,velocityY:-2,dashRemaining:0,mode:'glide'};
  const landed=tick(s,.08,{floorY:0});
  assert.equal(landed.landed,true);
  assert.deepEqual(landed.state,createAirWalkState());
});

test('Air Jump, kicks, Skywalk loop, finishing launch and wing glide animate real rig bones',()=>{
  for(const style of ['mixamorig','pelvis']){
    const model=new THREE.Group();
    const names=style==='mixamorig'
      ?['mixamorigHips','mixamorigSpine','mixamorigSpine2',
        'mixamorigLeftUpLeg','mixamorigRightUpLeg','mixamorigLeftArm','mixamorigRightArm']
      :['pelvis','spine_01','spine_02','thigh_l','thigh_r','upperarm_l','upperarm_r'];
    for(const name of names){const b=new THREE.Bone();b.name=name;model.add(b);}
    const clips=createHaloFlightClips(model);
    assert.deepEqual(Object.keys(clips),['airJump','airWalkKick','airWalkLoop','airWalkFinisher','wingGlide']);
    for(const [key,clip] of Object.entries(clips)){
      assert.ok(clip.tracks.length>=6);
      assert.ok(clip.tracks.every(t=>t.name.endsWith('.quaternion')),
        key+' must not animate root/world position');
      assert.equal(clip.userData.worldRootTranslation,false);
      assert.ok(clip.duration>=.2&&clip.duration<=1);
    }
  }
});

test('world hooks use Halo progression, real stamina, safe collision and original wings',()=>{
  assert.match(world,/getHaloFlightProfile\(\{level:getHaloState\(\)\.level\}\)/);
  assert.match(world,/spendAirWalkRun:seconds=>spendCombatResource\('air_walk_run',\{seconds\}\)/);
  assert.match(world,/spendAirWalkFinisher:\(\)=>spendCombatResource\('air_walk_finisher'\)/);
  assert.match(world,/requestAirWalkAction\?\.\(\{/);
  assert.match(world,/lastAirKickTapMs<=HALO_FLIGHT_RULES\.doubleTapMilliseconds/);
  assert.match(world,/if\(k===' '\)playerAnim\?\.setAirWalkHeld\?\.\(false\)/);
  assert.match(world,/airMode!=='dash'/);
  assert.match(controller,/paidGlideSeconds\(airWalk,dt\)/);
  assert.match(controller,/moveWithCollision\(dir.x\*HALO_FLIGHT_RULES\.finisherForwardSpeed\*step/);
  assert.match(controller,/moveWithCollision\(x,z\)/);
  assert.match(controller,/getAirWalkStamina\(\)/);
  assert.match(controller,/hasAction\('airWalkLoop'\)\?'airWalkLoop'/);
  assert.match(controller,/hasAction\('wingGlide'\)/);
  assert.match(controller,/specialMoveTimer=HALO_FLIGHT_RULES\.initialAirJumpSeconds/);
  assert.match(wings,/subscribeHalo\(s=>\{haloSnapshot=s;updateWingVisual\(\);\}\)/);
  assert.match(wings,/halo_flight/);
  assert.match(wings,/flightMode==='glide'/);
  assert.match(wings,/wingAlpha=airborneWing\?Math.max\(\.87,alpha\):alpha/);
  assert.match(world,/window\.__gw3dAirFlightMode=traversalAfterMotion\?\.mode\|\|'idle'/);
  assert.match(haloUI,/Halo Wing Flight/);
  assert.match(haloUI,/flight\.freeGlideSeconds\.toFixed\(1\)/);
});
