import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, stepMatch } from '../src/components/duelist/sim/match.mjs';
import { ESCORT_LENGTH, ESCORT_ROUTE, ESCORT_SPEED, ESCORT_RADIUS, payloadPose } from '../src/components/duelist/sim/escort.mjs';
import { bodyOf } from '../src/components/duelist/sim/world.mjs';
import { ONLINE_MODES } from '../src/components/duelist/net/protocol.mjs';
import { templateLaunch } from '../src/components/duelist/menu/templateCatalog.mjs';
import { resultsScoreText } from '../src/components/duelist/client/resultPresentation.mjs';

const dt = 1/60;
function start() {
  const m = createMatch({mode:'escort',seats:2,players:[{id:'a',team:'red'},{id:'b',team:'blue'}]});
  while(m.phase==='countdown') stepMatch(m,dt);
  return m;
}
function stand(m,id,inside) {
  const p=m.escort.pointACaptured?m.escort:{x:0,y:0,z:-148};Object.assign(bodyOf(m.world,id),{x:p.x+(inside ? (id==='a' ? -1:1):ESCORT_RADIUS+3),z:p.z,y:p.y});
}

test('both menu and authoritative online queue accept Escort',()=>{
  assert.equal(templateLaunch('normal','transport',true,true), null, 'Transport online entry must use server selection');
  assert.ok(ONLINE_MODES.includes('escort'));
  const m=start();
  assert.equal(m.escort.distance,0);
  assert.equal(matchView(m,'a').me.team,'red');
});
test('red pushes, blue contests, defenders alone hold earned progress',()=>{
  const m=start();m.escort.pointACaptured=true; stand(m,'a',true); stand(m,'b',false); stepMatch(m,dt);
  assert.equal(m.escort.distance,dt*ESCORT_SPEED); const advanced=m.escort.distance;
  stand(m,'b',true);stepMatch(m,dt);
  assert.equal(m.escort.distance,advanced);assert.equal(m.escort.contested,true);
  stand(m,'a',false);stepMatch(m,dt);
  assert.equal(m.escort.distance,advanced);assert.equal(m.escort.moving,false);
  stand(m,'a',true);m.world.fighters.get('a').vitals.dead=true;stepMatch(m,dt);
  assert.equal(m.escort.attackers,0);
});
test('overtime lasts through a contest and defenders win when the attackers leave',()=>{
  const m=start();m.clock=m.def.clock-dt/2;stand(m,'a',true);stand(m,'b',true);
  stepMatch(m,dt);assert.equal(m.phase,'live');assert.equal(m.escort.overtime,true);
  stand(m,'a',false);stepMatch(m,dt);
  assert.equal(m.winner,'blue');assert.equal(m.phase,'over');
  assert.match(resultsScoreText(matchView(m,'b')), /Defense held/);
});
test('delivery on the last tick wins and the payload stops at the gate',()=>{
  const m=start();m.clock=m.def.clock-dt/2;
  m.escort.pointACaptured=true;m.escort.stage=2;m.escort.distance=ESCORT_LENGTH-0.001;Object.assign(m.escort,payloadPose(m.escort.distance));
  stand(m,'a',true);stand(m,'b',false);stepMatch(m,dt);
  assert.equal(m.winner,'red');assert.equal(m.escort.progress,100);
  const {x,z}=m.escort;assert.ok(Math.hypot(x-ESCORT_ROUTE.at(-1).x,z-ESCORT_ROUTE.at(-1).z)<1e-8);
  const view=matchView(m,'a');view.escort.progress=0;stepMatch(m,dt);
  assert.equal(m.escort.progress,100);assert.equal(m.escort.moving,false);
});
test('empty cart at the time limit is a defending victory',()=>{
  const m=start();m.clock=m.def.clock;stand(m,'a',false);stand(m,'b',false);stepMatch(m,dt);
  assert.equal(m.winner,'blue');
});
