import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalSource} from '../src/components/duelist/client/localSource.mjs';
import {createMatch,stepMatch,matchView} from '../src/components/duelist/sim/match.mjs';
import {DuelistRoomEngine} from '../src/components/duelist/net/actorRoomEngine.mjs';
import {PROTOCOL,DEFAULT_PUBLIC_ROOMS} from '../src/components/duelist/net/protocol.mjs';
import {arenaGrounded,arenaBodyBlockers} from '../src/components/duelist/sim/modeArenaLayout.mjs';
test('all regular modes create their match without private test flags',()=>{
 for(const mode of ['duel','tdm','ffa','ctf','control','escort','football']){
   const source=createLocalSource({mode,seed:4});
   assert.equal(source.mode,mode);assert.equal(source.match.testMode,false);
   assert.ok(source.seats().length>=2);
   if(['tdm','ffa'].includes(mode))assert.equal(source.world.arenaLayout.id,'the-conduit');
 }
 const source=readFileSync(new URL('../src/components/duelist/client/DuelistGame.jsx',import.meta.url),'utf8');
 assert.match(source,/world\.arenaLayout\?\.conduitImported/);
 assert.match(source,/createConduitArena\(scene/);
});
test('real native room engine joins two clients in each Conduit mode',()=>{
 for(const mode of ['tdm','ffa']){
   let now=0,n=0;
   const engine=new DuelistRoomEngine(DEFAULT_PUBLIC_ROOMS.find(r=>r.mode===mode).id,{clock:()=>now,idFactory:()=>String(++n).padStart(32,'0')});
   const connect=id=>{const c={id,identity:{type:'anonymous',anonymousId:id},messages:[],send(m){this.messages.push(m);},reject(code){throw Error('rejected '+code);}};
     engine.connect(c);engine.message(c,{t:'hello',v:PROTOCOL});engine.message(c,{t:'join',mode,matchId:engine.roomId,cls:'duelist'});return c;};
   const a=connect('a'),b=connect('b');assert.equal(engine.status().players,2);
   assert.equal(engine.match.world.arenaLayout.id,'the-conduit');
   const seats=[a,b].map(c=>c.messages.find(m=>m.t==='joined'));
   for(const s of seats){const p=engine.match.world.bodies.get(s.you);assert.ok(arenaGrounded(engine.match.world.arenaLayout,p));assert.deepEqual(arenaBodyBlockers(engine.match.world.arenaLayout,{...p,radius:.4,height:1.8}),[]);}
   if(mode==='tdm')assert.notEqual(seats[0].team,seats[1].team);else assert.ok(seats.every(s=>s.team===null));
   for(let i=0;i<12;i++){now+=1/60;engine.tick();}
   assert.ok(a.messages.some(m=>m.t==='snap'));engine.remove('a');engine.remove('b');
 }
});
test('ordinary match grants pickups and launches pads on the shared collision layout',()=>{
 const m=createMatch({mode:'ffa',players:[{id:'you'}],seats:1});
 m.phase='live';m.clock=1;
 const f=m.world.fighters.get('you'),b=m.world.bodies.get('you');
 Object.assign(b,{x:0,y:-5,z:2.6});f.vitals.will=1;f.vitals.shield=0;
 stepMatch(m,1/60,{you:{}});assert.equal(f.vitals.will,f.vitals.max.will);
 assert.equal(matchView(m,'you').conduitPickups.find(p=>p.id==='t0_core').available,false);
 const pad=m.world.arenaLayout.world.jumpPads[0];
 Object.assign(b,{x:pad.x,y:pad.y,z:pad.z,vy:0});
 for(let i=0;i<87;i++)stepMatch(m,1/60,{you:{}});
 assert.ok(Math.hypot(b.x-pad.targetX,b.z-pad.targetZ)<.35);
 assert.ok(Math.abs(b.y-pad.targetY)<.2);
 assert.ok(arenaGrounded(m.world.arenaLayout,b));
});
