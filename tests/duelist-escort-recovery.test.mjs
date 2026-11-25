import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,matchView,queueMatchClass,matchCountdownSeconds} from '../src/components/duelist/sim/match.mjs';
import {IMPORTED_ESCORT,escortMove,escortEmbedded,escortBlockers,escortRecoverySpot,escortSupport} from '../src/components/duelist/sim/importedEscortLayout.mjs';
import {bodyOf} from '../src/components/duelist/sim/world.mjs';
const DT=1/60;
const make=()=>createMatch({mode:'escort',seats:2,players:[{id:'red',team:'red'},{id:'blue',team:'blue'}]});
test('30 seconds of preparation followed by five seconds, no combat or timer advance before live',()=>{
 const m=make(),initial=matchView(m,'red');assert.equal(initial.preparation,30);assert.equal(initial.countdown,35);assert.equal(initial.clockLeft,300);
 assert.equal(queueMatchClass(m,'red','healer').accepted,true);
 for(let i=0;i<35*60;i++){
  stepMatch(m,DT,{red:{move:{x:1,z:0},presses:['light','roll']}});
  const v=matchView(m,'red');assert.equal(m.clock,0);assert.equal(m.escort.distance,0);
  if(i<1799)assert.ok(v.preparation>0);
  if(i>=1800&&i<2099){assert.equal(v.preparation,0);assert.ok(v.countdown<=5);}
 }
 if(m.phase!=='live')stepMatch(m,DT);
 assert.equal(m.phase,'live');assert.equal(m.seats.get('red').classId,'healer');
 assert.equal(matchCountdownSeconds('control'),3);
});
test('descending capsule lands on structural pillar tops instead of entering them',()=>{
 const pillars=IMPORTED_ESCORT.solids.filter(p=>/Pillar/.test(p.id));assert.ok(pillars.length>=4);
 for(const p of pillars){
  const b={x:(p.x0+p.x1)/2,z:(p.z0+p.z1)/2,y:p.y1+1.1};
  escortMove(b,0,0,-2.4,.4,false);
  assert.ok(b.y>=p.y1-.01,p.id+' landed at '+b.y+' vs '+p.y1);
  assert.equal(escortEmbedded(b),false,p.id);
 }
});
test('wall and foundation recovery chooses ground outside the relevant building',()=>{
 for(const a of IMPORTED_ESCORT.buildings){
  const b={x:a.minX+.4,z:a.minZ+.4,y:a.baseY+.2,yaw:0};
  assert.ok(escortEmbedded(b),a.label+' wall test');
  const p=escortRecoverySpot(b,'red',0,new Map(),'red',null);
  assert.equal(escortBlockers({...p,radius:.48}).length,0,a.label);
  assert.ok(p.x<a.minX-.5||p.x>a.maxX+.5||p.z<a.minZ-.5||p.z>a.maxZ+.5,a.label+' must recover outside');
  assert.ok(Math.abs(escortSupport(p.x,p.z,p.y+.06,.03)-p.y)<.08);
 }
});
test('automatic server recovery preserves health, stamina and defender death delay',()=>{
 const m=make();m.phase='live';
 const b=bodyOf(m.world,'blue'),f=m.world.fighters.get('blue'),a=IMPORTED_ESCORT.buildings.find(p=>p.label==='PointB_DefenderWest');
 Object.assign(b,{x:a.minX+.4,z:a.minZ+.4,y:a.baseY+.2});
 f.vitals.hp=47;f.vitals.stamina=20;
 let recovered=false;
 for(let i=0;i<30;i++){const result=stepMatch(m,DT);if(result.events.some(e=>e.type==='positionRecovered'&&e.id==='blue')){recovered=true;break;}}
 assert.ok(recovered);assert.equal(escortEmbedded(b),false);assert.equal(f.vitals.hp,47);
 assert.ok(f.vitals.stamina<40);assert.equal(m.seats.get('blue').respawnAt,null);assert.equal(matchView(m,'blue').me.recoveryCount,1);
 f.vitals.dead=true;f.vitals.hp=0;m.seats.get('blue').respawnAt=m.world.time+20;m.seats.get('blue').respawnStartedAt=m.world.time;
 Object.assign(b,{x:a.minX+.4,z:a.minZ+.4,y:a.baseY+.2});
 for(let i=0;i<30;i++)stepMatch(m,DT);
 assert.equal(f.vitals.dead,true);assert.equal(matchView(m,'blue').me.recoveryCount,1);assert.ok(matchView(m,'blue').me.respawnIn>19);
});
