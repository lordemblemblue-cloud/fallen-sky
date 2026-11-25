import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildConduitMinimap,selectConduitTier,conduitMinimapMarkers,conduitPickupStatus} from '../src/components/duelist/client/maps/conduitMinimap.mjs';
const p=(y,x=0,z=0)=>({x,y,z});
test('automatic level follows grounded support and holds during airborne transitions',()=>{
  assert.equal(selectConduitTier(p(-5)),'T0');
  assert.equal(selectConduitTier(p(0)),'T1');
  assert.equal(selectConduitTier(p(5)),'T2');
  assert.equal(selectConduitTier({...p(6),grounded:false},'T1'),'T1');
  assert.equal(selectConduitTier({...p(2.9),grounded:true,supportTier:'T2'},'T1'),'T2');
  assert.equal(selectConduitTier(null,'T0'),'T0');
});
test('marker permissions exclude hidden enemies, unauthorized allies, dead and other-floor enemies',()=>{
  const actor=(id,team,y,extra={})=>({id,team,...p(y),alive:true,mapVisible:true,...extra});
  const actors=[actor('ally','blue',-5),actor('hidden','red',0,{enemyReveal:false}),actor('revealed','red',0,{enemyReveal:true}),
    actor('up','red',5,{enemyReveal:true}),actor('no-map','blue',0,{mapVisible:false}),actor('dead','blue',0,{alive:false}),
    actor('stealth','red',0,{mapVisible:false,enemyReveal:true}),actor('me','blue',0)];
  const result=conduitMinimapMarkers({self:{id:'me',...p(0)},actors,tier:'T1',localTeam:'blue'});
  assert.deepEqual(result.map(m=>m.id),['self','ally','revealed']);
  assert.equal(result[1].relative,-1);
  assert.equal(result[2].kind,'enemy');
  assert.equal(conduitMinimapMarkers({actors:[actor('unknown','blue',0)],tier:'T1'}).length,0);
});
test('pickup timers only display supplied match state and never invent readiness',()=>{
  assert.deepEqual(conduitPickupStatus('p',{}),{available:null,seconds:null});
  assert.deepEqual(conduitPickupStatus('p',{p:{available:false,remaining:9.2}}),{available:false,seconds:10});
  assert.deepEqual(conduitPickupStatus('p',{p:{available:true,remaining:9}}),{available:true,seconds:null});
});
test('static model uses actual floor shapes, cutouts, flight markers and only certified mounted vents',()=>{
  const arena={config:{foundationR:44.8,yT2:5,buildings:[{id:'armory',name:'ARMORY',angle:-Math.PI*.75}]},
    world:{obbs:[{label:'Bsmt Floor',walkable:true,cx:1,cy:-5.25,cz:0,hx:2,hy:.25,hz:1,cos:1,sin:0},
      {label:'Roof',walkable:true,cx:1,cy:9,cz:0,hx:2,hy:.25,hz:1,cos:1,sin:0}],
      discs:[{label:'Courtyard',walkable:true,cx:0,cz:0,radius:24,yMax:0,cutouts:[{cx:3,cz:3,hx:1,hz:2,cos:1,sin:0}]}],
      annuli:[{label:'Ring Walk',walkable:true,rMin:27.2,rMax:32.2,yMax:5}],
      ramps:[{label:'Armory Int Stair F1',cx:1,cz:2,rotY:0,yStart:.65,yEnd:2.825}],jumpPads:[{id:'pad',...p(5,20,20)}]},
    pickups:[{id:'core',label:'Core',position:[0,-5,0]}]};
  const routes=[{id:'draft',mounted:false,certified:true,waypoints:[p(5),p(5,3)]},{id:'ready',mounted:true,certified:true,waypoints:[p(5),p(5,3)]}];
  const model=buildConduitMinimap(arena,{certifiedVentRoutes:routes});
  assert.equal(model.levels.T0.floors.length,1);assert.equal(model.levels.T1.floors.length,1);assert.equal(model.levels.T2.floors.length,1);
  assert.equal(model.levels.T1.floors[0].path.split('M ').length,3);
  assert.equal(model.levels.T1.stairs.length,1);assert.equal(model.levels.T2.stairs.length,1);
  assert.equal(model.levels.T2.pads.length,1);assert.equal(model.levels.T0.pickups.length,1);
  assert.deepEqual(model.levels.T2.vents.map(v=>v.id),['ready']);
});
