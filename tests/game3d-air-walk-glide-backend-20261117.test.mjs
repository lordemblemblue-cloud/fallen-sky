import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  AIR_WALK_RULES,createAirWalkState,deployAirWalkGlide,beginAirWalkBoost,
  advanceAirWalk,releaseAirWalkGlide,isAirWalkInFlight,
} from '../src/components/game3d/player/AirWalkTraversal.mjs';
import {
  createCombatResourceLedger,combatActionCost,trySpendCombatResource,
  advanceCombatResourceLedger,
} from '../src/components/game3d/combat/CombatResourceLedger.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const world=source('src/components/game3d/GameWorld3D.jsx');
const avatar=source('src/components/game3d/player/LunaDashboardPlayerController.jsx');
const inputView=source('src/pages/GameView.jsx');

function startAt(y=12,floorY=10,stamina=100){
  const deployed=deployAirWalkGlide(createAirWalkState(),{worldY:y,floorY,stamina});
  assert.equal(deployed.ok,true);
  return deployed.state;
}
const step=(s,seconds,opts={})=>advanceAirWalk(s,seconds,{floorY:10,...opts});

test('glider requires a true airborne height gap and nonzero stamina',()=>{
  const initial=createAirWalkState();
  for(const height of [10,10.1,10.219]){
    const result=deployAirWalkGlide(initial,{worldY:height,floorY:10,stamina:100});
    assert.equal(result.ok,false);
    assert.deepEqual(result.state,initial);
  }
  assert.equal(deployAirWalkGlide(initial,{worldY:11,floorY:10,stamina:0}).reason,
    'not_enough_stamina');
  assert.equal(startAt().mode,'glide');
});

test('glide uses a controlled terminal descent rather than terrain-following glue',()=>{
  let s=startAt(14,10);
  let paid=0;
  for(let i=0;i<45;i++){
    const r=step(s,1/60,{floorY:3});
    paid+=r.drainStamina;
    s=r.state;
    assert.equal(r.landed,false);
  }
  assert.equal(s.mode,'glide');
  assert.ok(s.y<14 && s.y>11,'moves down in absolute world coordinates');
  assert.ok(s.velocityY>=-AIR_WALK_RULES.glideFallSpeed-1e-9);
  assert.ok(Math.abs(paid-.75*AIR_WALK_RULES.glideStaminaPerSecond)<1e-6);
});

test('Air Walk spends an atomic 24-stamina boost, climbs and then resumes gliding',()=>{
  const start=startAt(15,10);
  let ledger=createCombatResourceLedger({});
  const cost=combatActionCost('air_walk');
  assert.equal(cost.stamina,AIR_WALK_RULES.boostStaminaCost);
  ledger=trySpendCombatResource(ledger,'air_walk').state;
  assert.equal(ledger.stamina,100-cost.stamina);
  const boosted=beginAirWalkBoost(start,{stamina:100});
  assert.equal(boosted.ok,true);
  assert.equal(boosted.state.mode,'boost');
  assert.equal(boosted.state.boosts,1);
  let peak=boosted.state.y,s=boosted.state;
  for(let i=0;i<80;i++){
    const next=step(s,1/60,{floorY:10});
    s=next.state;
    peak=Math.max(peak,s.y);
    if(s.mode==='glide')break;
  }
  assert.ok(peak>start.y+.5,'boost rises measurably');
  assert.equal(s.mode,'glide','returns automatically to glide at apex');
  assert.ok(s.boostCooldown>0);
  assert.equal(beginAirWalkBoost(s,{stamina:100}).reason,'cooldown');
  for(let i=0;i<30;i++)s=step(s,1/60,{floorY:10}).state;
  const second=beginAirWalkBoost(s,{stamina:100});
  assert.equal(second.ok,true);
  assert.equal(second.state.boosts,2);
});

test('exhaustion drains toward a safe natural fall, cannot grant infinite hover',()=>{
  let s=startAt(12,10);
  const failed=step(s,.08,{canGlide:false});
  assert.equal(failed.state.mode,'fall');
  assert.equal(failed.exhausted,true);
  assert.equal(failed.drainStamina,0);
  s=failed.state;
  let landed=false;
  for(let i=0;i<200;i++){
    const r=step(s,.08,{canGlide:false});
    s=r.state;
    if(r.landed){landed=true;break;}
  }
  assert.equal(landed,true);
  assert.deepEqual(s,createAirWalkState());
  assert.equal(isAirWalkInFlight(s),false);
});

test('clicking off the glide drops with gravity; ledges do not snap to the lower terrain',()=>{
  const state=releaseAirWalkGlide(startAt(28,10));
  assert.equal(state.mode,'fall');
  const result=advanceAirWalk(state,.08,{floorY:-10});
  assert.equal(result.landed,false);
  assert.ok(result.state.y>27,'uses absolute world height rather than subtracting the hill height');
  assert.ok(result.state.velocityY<0);
});

test('ceiling collision stops upward Air Walk before passing through upper floors',()=>{
  const start=startAt(11,10);
  const activated=beginAirWalkBoost(start,{stamina:80}).state;
  const next=advanceAirWalk(activated,.08,{floorY:10,ceilingY:13});
  assert.equal(next.landed,false);
  assert.ok(next.state.y+AIR_WALK_RULES.riderHeight<=13+1e-6);
  assert.equal(next.state.mode,'glide');
});

test('combat ledger prevents underpayment, negative or oversized drain, and defers regen',()=>{
  assert.equal(combatActionCost('glide',{seconds:1}).stamina,.08*6.5);
  assert.equal(combatActionCost('glide',{seconds:-10}).stamina,0);
  assert.equal(combatActionCost('glide',{seconds:NaN}).stamina,0);
  let ledger=createCombatResourceLedger({});
  for(let i=0;i<15;i++){
    const paid=trySpendCombatResource(ledger,'glide',{seconds:.08});
    assert.equal(paid.ok,true);
    ledger=paid.state;
  }
  const remaining=ledger.stamina;
  ledger=advanceCombatResourceLedger(ledger,.08,{alive:true});
  assert.equal(ledger.stamina,remaining,'gliding prevents instant frame-to-frame regeneration');
  for(let i=0;i<4;i++)ledger=trySpendCombatResource(ledger,'air_walk').state;
  assert.ok(ledger.stamina>=0);
  const last=trySpendCombatResource(ledger,'air_walk');
  assert.equal(last.ok,false);
});

test('Space cycles jump→glide→Air Walk; G and Q remain Clan/Crouch',()=>{
  assert.match(world,/if\(k===' '\)\{/);
  assert.match(world,/requestAirWalkAction\?\.\(\)/);
  assert.match(avatar,/if\(airWalk.mode==='glide'\)\{/);
  assert.match(avatar,/beginAirWalkBoost\(airWalk/);
  assert.match(avatar,/deployAirWalkGlide\(airWalk/);
  assert.match(avatar,/const jumped=requestJump\(\)/);
  assert.match(world,/if \(k === 'q' && !crouchTogglePressed.current\)/);
  assert.match(inputView,/e\.key\.toLowerCase\(\) === 'g'/);
  assert.doesNotMatch(world,/if \(k === 'g'\).*AirWalk/);
});

test('existing player, mount, duel, menu, respawn, world-floor and cave-ceiling code is respected',()=>{
  assert.match(world,/!dedicatedMode && !window\.__activeDuel/);
  assert.match(world,/spendAirWalkBoost:\(\)=>spendCombatResource\('air_walk'\)/);
  assert.match(world,/spendAirWalkGlide:seconds=>spendCombatResource\('glide',\{seconds\}\)/);
  assert.match(world,/playerAnim\?\.cancelAirWalk\?\.\(\)/);
  assert.match(world,/playerAnim\?\.resetAirWalkMotion\?\.\(\)/);
  assert.match(world,/sampleAirWalkCeilingY/);
  assert.match(world,/airWalkCeilingRay\.intersectObjects\(groundMeshes,true\)/);
  assert.match(world,/moveWorldActor\(model,move\.x\*speed\*delta,move\.z\*speed\*delta,mounted\)/);
  assert.match(world,/shouldRejectCaveGroundStep/);
  assert.match(avatar,/getAirWalkState:\(\)=>\(\{\.\.\.airWalk\}\)/);
  assert.match(avatar,/resetAirWalk\(\)/);
  assert.match(world,/playerStateMachine\.setAirborneState/);
  assert.match(world,/!airTravel &&/); // no free Sprint mastery during flight
});

test('Air Walk has no glider mesh, new graphics, UI popup or skillbook override',()=>{
  assert.doesNotMatch(world,/new GlideGeometry|loadAirWalkGlider|gliderModelUrl/);
  assert.doesNotMatch(avatar,/new THREE\.Mesh|gliderAssetUrl/);
  assert.match(avatar,/requestAirWalkAction/);
  assert.match(world,/spendCombatResource\('air_walk'\)/);
});
