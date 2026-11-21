// Going through a torii gate, on foot or riding, travels to the area beyond it
// (owner, 2026-11-21: "you can't go through the portals"). In portal-scene play
// only the current area's ground exists, so the area loader's switch 12 m past
// a border was out of reach and no gate ever travelled.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {WOLFVEIL_GATE_TRAVEL,wolfveilGateTravel,wolfveilGatePush,wolfveilGateLanding}
  from '../src/components/game3d/wolfveil/streaming/WolfveilGateTravel.mjs';
import {wolfveilAreaGates} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {wolfveilAreaAtWorld} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {resolveWorldPvpZone,resolveWorldPvpSceneZone}
  from '../src/components/game3d/pvp/WorldPvpRules.mjs';

const gates=wolfveilAreaGates();
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
// A WORLD point on `gate`'s axis: `depth` metres along its facing, `lateral` across.
const onGate=(gate,depth,lateral=0)=>({
  x:gate.x+gate.facing[0]*depth+gate.facing[1]*lateral,
  z:gate.z+gate.facing[1]*depth-gate.facing[0]*lateral+70,
});
const depthPast=(gate,point,sign)=>sign*((point.x-gate.x)*gate.facing[0]+(point.z-70-gate.z)*gate.facing[1]);
const ways=gate=>[{from:gate.behind,to:gate.ahead,sign:1},{from:gate.ahead,to:gate.behind,sign:-1}];

test('every gate, both ways: stepping through the opening travels to the far side',()=>{
  assert.equal(gates.length,11);
  for(const gate of gates)for(const {from,to,sign} of ways(gate)){
    const label=`${gate.id} ${from}->${to}`;
    for(const lateral of [0,gate.halfWidth*.8,-gate.halfWidth*.8]){
      const pass=wolfveilGateTravel(onGate(gate,-.4*sign,lateral),onGate(gate,.4*sign,lateral),
        {area:from,gates});
      assert.ok(pass,label+' lateral '+lateral);
      assert.equal(pass.gate.id,gate.id,label);
      assert.equal(pass.from,from,label);
      assert.equal(pass.to,to,label);
      // The destination scene accepts the landing (GameView checks the same).
      assert.equal(wolfveilAreaAtWorld(pass.landing),to,label);
      const past=depthPast(gate,pass.landing,sign);
      assert.ok(past>=WOLFVEIL_GATE_TRAVEL.landingMeters-1e-9&&past<=WOLFVEIL_GATE_TRAVEL.landingMeters+8,label+' '+past);
      // Arrives facing on, away from the gate.
      assert.ok(Math.abs(Math.sin(pass.heading)-gate.facing[0]*sign)<1e-9,label);
      assert.ok(Math.abs(Math.cos(pass.heading)-gate.facing[1]*sign)<1e-9,label);
    }
  }
});

test('walking, riding and slow steps all count; landing on the plane counts on the next step',()=>{
  const gate=gates.find(g=>g.id==='town_east_market_bridge');
  for(const step of [.04,.3,1.4,3.5]){
    const pass=wolfveilGateTravel(onGate(gate,-step/2),onGate(gate,step/2),{area:'town',gates});
    assert.equal(pass?.to,'east','step '+step);
  }
  assert.equal(wolfveilGateTravel(onGate(gate,-.5),onGate(gate,0),{area:'town',gates}),null);
  assert.equal(wolfveilGateTravel(onGate(gate,0),onGate(gate,.5),{area:'town',gates})?.to,'east');
  // Without an area filter the far side still decides.
  assert.equal(wolfveilGateTravel(onGate(gate,.5),onGate(gate,-.5),{gates})?.to,'town');
});

test('a long frame through a gate still travels, and nobody is left standing past a gate',()=>{
  // A hitch or a galloping mount can carry the player 10 m in one frame (seen
  // in play: 6.4 m before the Ridge Path gate to 3.5 m past it).
  for(const gate of gates)for(const {from,to,sign} of ways(gate)){
    const label=`${gate.id} ${from}->${to}`;
    assert.equal(wolfveilGateTravel(onGate(gate,-6.4*sign),onGate(gate,3.5*sign),{area:from,gates})?.to,to,label+' long frame');
    assert.equal(wolfveilGateTravel(onGate(gate,-12*sign),onGate(gate,12*sign),{area:from,gates})?.to,to,label+' 24 m frame');
    // Already past the plane inside the opening (first frame, or after a snap).
    for(const past of [.2,2,WOLFVEIL_GATE_TRAVEL.pushReachMeters])
      for(const lateral of [0,gate.halfWidth*.8,-gate.halfWidth*.8])
        assert.equal(wolfveilGateTravel(null,onGate(gate,past*sign,lateral),{area:from,gates})?.to,to,`${label} standing ${past} past`);
    assert.equal(wolfveilGateTravel(null,onGate(gate,(WOLFVEIL_GATE_TRAVEL.pushReachMeters+.5)*sign),{area:from,gates}),null,label+' far past');
    assert.equal(wolfveilGateTravel(null,onGate(gate,2*sign,gate.halfWidth+WOLFVEIL_GATE_TRAVEL.openingSlack+.3),{area:from,gates}),null,label+' past but beside');
    assert.equal(wolfveilGateTravel(null,onGate(gate,-2*sign),{area:from,gates}),null,label+' on the loaded side');
    assert.equal(wolfveilGateTravel(null,onGate(gate,2*sign),{gates}),null,label+' no scene, no side');
  }
});

test('no travel beside a gate, along it, back into the loaded area, on a teleport or for another area',()=>{
  for(const gate of gates)for(const {from,sign} of ways(gate)){
    const label=`${gate.id} from ${from}`;
    const outside=gate.halfWidth+WOLFVEIL_GATE_TRAVEL.openingSlack+.3;
    for(const lateral of [outside,-outside])
      assert.equal(wolfveilGateTravel(onGate(gate,-.4*sign,lateral),onGate(gate,.4*sign,lateral),
        {area:from,gates}),null,label+' beside');
    assert.equal(wolfveilGateTravel(onGate(gate,-1*sign,-1),onGate(gate,-1*sign,1),{area:from,gates}),null,label+' along');
    assert.equal(wolfveilGateTravel(onGate(gate,-2*sign),onGate(gate,-2*sign),{area:from,gates}),null,label+' standing');
    // Stepping back towards the area already loaded is not a journey.
    const to=sign>0?gate.ahead:gate.behind;
    assert.equal(wolfveilGateTravel(onGate(gate,.4*sign),onGate(gate,-.4*sign),{area:from,gates}),null,label+' back');
    assert.equal(wolfveilGateTravel(onGate(gate,-.4*sign),onGate(gate,.4*sign),{area:to,gates}),null,label+' into loaded');
    const jump=WOLFVEIL_GATE_TRAVEL.maxStepMeters/2+.5;
    assert.equal(wolfveilGateTravel(onGate(gate,-jump*sign),onGate(gate,jump*sign),{area:from,gates}),null,label+' teleport');
  }
  const bridge=gates.find(g=>g.id==='town_east_market_bridge');
  assert.equal(wolfveilGateTravel(onGate(bridge,-.4),onGate(bridge,.4),{area:'west',gates}),null,'not a west gate');
  for(const bad of [null,{},{x:NaN,z:0},{x:0,z:Infinity}]){
    // No usable previous position: only standing past the plane counts.
    assert.equal(wolfveilGateTravel(bad,onGate(bridge,-.4),{area:'town',gates}),null);
    assert.equal(wolfveilGateTravel(bad,onGate(bridge,.4),{area:'town',gates})?.to,'east');
    assert.equal(wolfveilGateTravel(onGate(bridge,-.4),bad,{area:'town',gates}),null);
  }
  assert.equal(wolfveilGateLanding(bridge,'north'),null,'north is not a side of this gate');
});

test('every gate, both ways: walking or riding into the opening and being held up short of it travels',()=>{
  // In a portal scene a trail's ground ends at the border, so a walker can be
  // stopped before the plane of a gate turned along its path.
  for(const gate of gates)for(const {from,to,sign} of ways(gate)){
    const label=`${gate.id} ${from}->${to}`;
    for(const [depth,lateral] of [[-.2,0],[-3,0],[-1.5,gate.halfWidth*.7],[-1.5,-gate.halfWidth*.7],[.3,0]]){
      const here=onGate(gate,depth*sign,lateral);
      for(const length of [.08,.6]){ // a walking frame and a fast mounted frame
        const step={x:gate.facing[0]*sign*length,z:gate.facing[1]*sign*length};
        const pass=wolfveilGatePush(here,here,step,{area:from,gates});
        assert.equal(pass?.to,to,`${label} at ${depth},${lateral}`);
        assert.equal(wolfveilAreaAtWorld(pass.landing),to,label);
        assert.ok(depthPast(gate,pass.landing,sign)>=WOLFVEIL_GATE_TRAVEL.landingMeters-1e-9,label);
        // Partly held up (sliding along a post) still counts; a free step does not.
        const slid=onGate(gate,(depth+length*.2)*sign,lateral);
        assert.equal(wolfveilGatePush(here,slid,step,{area:from,gates})?.to,to,label+' slid');
        const free=onGate(gate,(depth+length)*sign,lateral);
        assert.equal(wolfveilGatePush(here,free,step,{area:from,gates}),null,label+' walking freely');
      }
    }
  }
});

test('a push never travels away from the gate, beside it, too far in front or from the far side',()=>{
  for(const gate of gates)for(const {from,to,sign} of ways(gate)){
    const label=`${gate.id} from ${from}`;
    const into={x:gate.facing[0]*sign*.1,z:gate.facing[1]*sign*.1};
    const held=(depth,lateral=0,step=into,area=from)=>{
      const here=onGate(gate,depth*sign,lateral);
      return wolfveilGatePush(here,here,step,{area,gates});
    };
    assert.equal(held(-WOLFVEIL_GATE_TRAVEL.pushReachMeters-.5),null,label+' too far');
    assert.equal(held(1.2),null,label+' already past the plane');
    assert.equal(held(-1,gate.halfWidth+WOLFVEIL_GATE_TRAVEL.openingSlack+.3),null,label+' beside the opening');
    assert.equal(held(-1,0,{x:gate.facing[1]*.1,z:-gate.facing[0]*.1}),null,label+' asking sideways');
    assert.equal(held(-1,0,{x:-into.x,z:-into.z}),null,label+' asking back');
    // 70 degrees off the gate's axis is not heading into it.
    const c=Math.cos(70*Math.PI/180),s=Math.sin(70*Math.PI/180);
    assert.equal(held(-1,0,{x:(gate.facing[0]*sign*c+gate.facing[1]*s)*.1,z:(gate.facing[1]*sign*c-gate.facing[0]*s)*.1}),null,label+' 70 degrees off');
    assert.equal(held(-1,0,{x:0,z:0}),null,label+' no step');
    // In the far side's own scene, pushing the same way is pushing into its own ground.
    assert.equal(held(-1,0,into,to),null,label+' loaded already');
  }
  const bridge=gates.find(g=>g.id==='town_east_market_bridge');
  const here=onGate(bridge,-1);
  assert.equal(wolfveilGatePush(here,here,{x:.1,z:0},{area:'west',gates}),null,'not a west gate');
  assert.equal(wolfveilGatePush(here,{x:here.x+40,z:here.z},{x:.1,z:0},{area:'town',gates}),null,'teleport');
  for(const bad of [null,{x:NaN,z:0}])assert.equal(wolfveilGatePush(bad,here,{x:.1,z:0},{area:'town',gates}),null);
});

test('the world status follows the loaded area scene, so a gate cannot flip it every step',()=>{
  // Standing on the east half of the market bridge deck, still in the town scene.
  const deck={x:126,z:-28};
  assert.equal(resolveWorldPvpZone({region:'wolfveil',position:deck}).id,'wolfveil-east');
  assert.equal(resolveWorldPvpSceneZone({region:'wolfveil',area:'town',position:deck}).id,'wolfveil-town');
  assert.equal(resolveWorldPvpSceneZone({region:'wolfveil',area:'east',position:{x:118,z:-28}}).label,
    'East Wilds · Optional PvP');
  // No scene (or an unknown one) keeps the position rule; private homes stay safe.
  assert.equal(resolveWorldPvpSceneZone({region:'wolfveil',area:null,position:deck}).id,'wolfveil-east');
  assert.equal(resolveWorldPvpSceneZone({region:'wolfveil',area:'nowhere',position:deck}).id,'wolfveil-east');
  assert.equal(resolveWorldPvpSceneZone({region:'wolfveil',area:'east',position:deck,privateArea:true}).id,'private-home');
  assert.equal(resolveWorldPvpSceneZone({region:'lunar-cave',area:'east',position:deck}).kind,'safe');
  // The server's trusted-position rule ignores any area a client might send.
  assert.equal(resolveWorldPvpZone({region:'wolfveil',position:deck,area:'town',loadedArea:'town'}).id,'wolfveil-east');
  const control=source('src/components/game3d/pvp/WorldPvpControl.jsx');
  assert.equal(control.match(/resolveWorldPvpSceneZone\(\{\s*region,area,/g).length,3);
  assert.doesNotMatch(control,/resolveWorldPvpZone\(/);
  assert.match(source('src/pages/GameView.jsx'),/<WorldPvpControl region=\{worldRegion\} area=\{worldRegion==='wolfveil'&&wolfveilAreaScenesEnabled\(\)\?worldArea:null\}/);
});

test('the live world travels through a gate, rides on after a ridden crossing and keeps its arrival area while loading',()=>{
  const world=source('src/components/game3d/GameWorld3D.jsx');
  assert.match(world,/import \{wolfveilGateTravel,wolfveilGatePush\} from '\.\/wolfveil\/streaming\/WolfveilGateTravel\.mjs'/);
  assert.match(world,/wolfveilGateTravel\(lastGatePosition,here,\{area:worldArea,gates:areaPortals\.gates\}\)/);
  // Once per frame in live play, right after the gates update (not on the title screen).
  assert.equal(world.match(/passAreaGate\(\);/g).length,1);
  assert.match(world,/areaPortals\?\.update\(delta,modelRef\.current\?\.position\|\|initialAreaPosition,regionStream\?\.getArea\(\)\);\s*passAreaGate\(\);/);
  // The push is judged on the player's own WASD / click-to-move step, mounted or not.
  assert.equal(world.match(/pushAreaGate\(model,/g).length,1);
  assert.match(world,/moveWorldActor\(model,move\.x\*speed\*delta,move\.z\*speed\*delta,mounted\);\s*pushAreaGate\(model,fromX,fromZ,move\.x\*speed\*delta,move\.z\*speed\*delta\);/);
  assert.match(world,/wolfveilGatePush\(\{x:fromX,z:fromZ\},actor\.position,\{x:dx,z:dz\},\s*\{area:worldArea,gates:areaPortals\.gates\}\)/);
  assert.match(world,/target:'wolfveil-area',area:pass\.to,gateway:pass\.gate\.id,landing/);
  assert.match(world,/mounted:isMountedRef\.current===true/);
  // Duels, caves and natural zones never travel; one journey per scene.
  assert.match(world,/areaTravelStarted\|\|dedicatedMode\|\|region!=='wolfveil'\|\|\s*entryModeRef\.current\|\|wolfveilVillage\?\.caveSystem\?\.isActive\?\.\(\)\|\|naturalZones\?\.isInside\(\)/);
  // While the arriving player loads, the loader and gates use the arrival, not the town centre.
  assert.doesNotMatch(world,/modelRef\.current\?\.position\|\|\{x:0,z:70\}/);
  // A ridden crossing mounts again through the ordinary F path.
  assert.match(world,/if\(areaArrival\?\.mounted===true\)arrivalMount=\{heading:areaArrival\.heading,seconds:20\}/);
  assert.match(world,/mount\.position\.copy\(model\.position\);[\s\S]{0,140}mountToggleRef\.current = true;/);
  assert.ok(world.indexOf('if (arrivalMount && model)')<world.indexOf('if (mountToggleRef.current && model)'));
  const view=source('src/pages/GameView.jsx');
  assert.match(view,/heading:Number\.isFinite\(landing\.heading\)\?landing\.heading:null,\s*mounted:landing\.mounted===true\}\)/);
});

test('gate travel stays free of Three.js so it can be tested anywhere',()=>{
  assert.doesNotMatch(source('src/components/game3d/wolfveil/streaming/WolfveilGateTravel.mjs'),/from 'three/);
});
