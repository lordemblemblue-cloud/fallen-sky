import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch,matchView,joinMatch,leaveMatch,queueMatchClass} from '../src/components/duelist/sim/match.mjs';
import {IMPORTED_CTF,ctfSafe,ctfZone,ctfMove,ctfRestricted,ctfSupport,ctfRay} from '../src/components/duelist/sim/importedCtfLayout.mjs';
import {ctfBotPath} from '../src/components/duelist/sim/ctfBotNav.mjs';
import {targetsInReach} from '../src/components/duelist/sim/world.mjs';
const DT=1/60;
const make=()=>createMatch({mode:'ctf',players:[{id:'r',team:'red',classId:'warrior'},{id:'b',team:'blue',classId:'healer'}],seats:2});
const tick=m=>stepMatch(m,DT);
const body=(m,id)=>m.world.bodies.get(id);
const put=(m,id,x,y,z)=>Object.assign(body(m,id),{x,y,z,vy:0,kx:0,kz:0});
const live=()=>{const m=make();m.world.time=34.99;stepMatch(m,.02);return m;};
test('CTF preparation and countdown preserve exact duration across irregular steps',()=>{
 const m=make();assert.equal(matchView(m).preparation,30);
 for(let i=0;i<120;i++)stepMatch(m,.25);
 assert.equal(m.phase,'countdown');assert.equal(matchView(m).preparation,0);assert.equal(matchView(m).countdown,5);assert.equal(m.clock,0);
 for(let i=0;i<19;i++)stepMatch(m,.25);
 assert.equal(m.phase,'countdown');stepMatch(m,.375);
 assert.equal(m.phase,'live');assert.ok(Math.abs(m.clock-.125)<1e-8);
});
test('all 24 spawns supported, correctly oriented and navigable to the enemy flag',()=>{
 assert.equal(IMPORTED_CTF.spawns.length,24);
 for(const s of IMPORTED_CTF.spawns){assert.ok(ctfSafe(s,s.team));assert.ok(ctfZone(s.team,s));const goal=IMPORTED_CTF.flags[s.team==='red'?'blue':'red'];assert.ok(ctfBotPath(s,goal,s.team).length,s.id);}
 const m=make();assert.ok(Math.sin(body(m,'r').yaw)>.99);assert.ok(Math.sin(body(m,'b').yaw)<-.99);
});
test('elevated objectives cannot be picked up or captured from the ground below',()=>{
 const m=live();put(m,'r',31,0,0);tick(m);assert.equal(m.flags.blue.state,'home');
 put(m,'r',31,4.8,0);tick(m);assert.equal(m.flags.blue.carrier,'r');assert.equal(m.flags.blue.y,4.8);
 put(m,'r',-31,0,0);tick(m);assert.equal(m.teamScores.red,0);assert.equal(m.flags.blue.carrier,'r');
 put(m,'r',-31,4.8,0);tick(m);assert.equal(m.teamScores.red,1);
});
test('own flag away blocks captures and sends immediate feedback; returning it allows capture',()=>{
 const m=live();put(m,'r',31,4.8,0);tick(m);put(m,'b',-31,4.8,0);tick(m);put(m,'r',-31,4.8,1);put(m,'b',20,4.8,0);
 const out=tick(m);assert.equal(m.teamScores.red,0);assert.ok(out.events.some(e=>e.type==='captureBlocked'&&e.id==='r'));
 leaveMatch(m,'b');assert.equal(m.flags.red.state,'home');tick(m);assert.equal(m.teamScores.red,1);
});
test('spawn rooms reject opponents and carriers; block combat without changing fighter stats',()=>{
 const m=live();const p=body(m,'r');const f=m.world.fighters.get('r');
 assert.ok(ctfZone('red',p));const hp=f.vitals.hp;stepMatch(m,DT,{r:{presses:['light','special']}});assert.equal(f.vitals.hp,hp);assert.equal(f.action,null);
 const spawn=IMPORTED_CTF.spawns.find(s=>s.team==='red');assert.ok(ctfRestricted('blue',spawn));assert.ok(ctfRestricted('red',spawn,true));
 put(m,'r',31,4.8,0);tick(m);put(m,'r',-38.5,4.8,0);tick(m);assert.ok(!ctfRestricted('red',body(m,'r'),m.flags.blue.carrier==='r'));assert.equal(f.vitals.hp,hp);
 put(m,'r',-37,4.8,0);put(m,'b',-38.5,4.8,0);assert.equal(targetsInReach(m.world,m.world.fighters.get('b'),body(m,'b'),{range:5,arc:360},false).length,0);
});
test('carriers outside the playable floor fall and cannot bypass normal respawn',()=>{
 const m=live();put(m,'r',31,4.8,0);tick(m);put(m,'r',55,-3,0);tick(m);
 assert.equal(m.flags.blue.state,'home');assert.ok(m.world.fighters.get('r').vitals.dead);assert.ok(m.seats.get('r').respawnAt>m.world.time+4.9);assert.equal(m.scores.r.falls,1);
});
test('tied regulation goes to sudden death and the first valid capture wins once',()=>{
 const m=live();m.clock=599.99;tick(m);assert.ok(matchView(m).overtime);assert.equal(m.phase,'live');
 put(m,'r',31,4.8,0);tick(m);put(m,'r',-31,4.8,0);const e=tick(m).events;assert.equal(m.winner,'red');assert.equal(m.phase,'over');assert.equal(e.filter(x=>x.type==='over').length,1);
});
test('opaque decks physically block rays and upward movement while lower passage remains walkable',()=>{
 const b={x:0,y:0,z:0};const r=ctfMove(b,0,0,12);assert.ok(r.ceiling);assert.ok(b.y<=3.01);
 assert.ok(ctfRay({x:0,y:1,z:0},{x:0,y:5.8,z:0})<1);
 assert.equal(ctfSupport(0,0,.1),0);assert.equal(ctfSupport(0,0,4.81),4.8);
});
