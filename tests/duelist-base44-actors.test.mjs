import test from 'node:test';
import assert from 'node:assert/strict';
import {DuelistRoomEngine} from '../src/components/duelist/net/actorRoomEngine.mjs';
import {getModeArenaLayout,arenaFloorContains,arenaBodyBlockers} from '../src/components/duelist/sim/modeArenaLayout.mjs';
import {DEFAULT_PUBLIC_ROOMS,PROTOCOL} from '../src/components/duelist/net/protocol.mjs';
const fixture=(mode='control')=>{
  let now=0,n=0;
  const room=new DuelistRoomEngine(DEFAULT_PUBLIC_ROOMS.find(r=>r.mode===mode).id,{clock:()=>now,idFactory:()=>String(++n).padStart(32,'0')});
  const client=id=>({id,identity:{type:'anonymous',anonymousId:id},messages:[],send(m){this.messages.push(m);},reject(code){this.rejected=code;}});
  const join=c=>{room.connect(c);room.message(c,{t:'hello',v:PROTOCOL});room.message(c,{t:'join',mode,matchId:room.roomId,cls:'duelist'});};
  const tick=(seconds=1)=>{for(let i=0;i<seconds*60;i++){now+=1/60;room.tick();}};
  return {room,client,join,tick};
};
test('all seven fixed public actor rooms report real empty occupancy',()=>{
  for(const def of DEFAULT_PUBLIC_ROOMS){const room=new DuelistRoomEngine(def.id);assert.equal(room.status().mode,def.mode);assert.equal(room.status().players,0);}
  assert.equal(new DuelistRoomEngine('invalid').status(),null);
});
test('two human clients join one authoritative Control Point match, receive individual snapshots and release seats',()=>{
  const {room,client,join,tick}=fixture();
  const a=client('tab-a'),b=client('tab-b');join(a);join(b);
  assert.equal(room.status().players,2);
  assert.equal(room.status().bots,6);
  const layout=getModeArenaLayout('control');
  assert.equal(room.match.world.arenaLayout,layout);
  assert.equal(layout.id,'control-a-v1');
  for(const body of room.match.world.bodies.values()){
    assert.ok(arenaFloorContains(layout,body.x,body.z,.4));
    assert.equal(arenaBodyBlockers(layout,{...body,radius:.4,height:1.8}).length,0);
  }
  assert.ok(a.messages.find(m=>m.t==='joined').replaced);
  assert.ok(b.messages.find(m=>m.t==='joined').replaced);
  const aid=a.messages.find(m=>m.t==='welcome').id,bid=b.messages.find(m=>m.t==='welcome').id;
  assert.notEqual(aid,bid);
  tick(6);
  const snap=a.messages.filter(m=>m.t==='snap').at(-1);
  assert.ok(snap.fighters.some(f=>f.id===bid));
  const view=b.messages.find(m=>m.t==='snap'&&m.view?.controlPoints?.length===3).view;
  assert.deepEqual(view.controlPoints.map(({x,z})=>({x,z})),layout.controlPoints);
  room.message(a,{t:'input',s:1,m:[1,0],p:[]});tick();
  assert.ok(a.messages.some(m=>m.t==='snap'&&m.ack===1));
  room.remove(a.id);assert.equal(room.status().players,1);assert.equal(room.status().bots,7);
  room.remove(b.id);assert.equal(room.status().players,0);assert.equal(room.match,null);
});
test('duel enforces two human seats; mode mismatch cannot create a match',()=>{
  const {room,client,join}=fixture('duel');
  const a=client('a'),b=client('b'),c=client('c');join(a);join(b);join(c);
  assert.equal(room.status().players,2);assert.ok(c.messages.some(m=>m.code==='full'));
  const other=client('d');room.connect(other);room.message(other,{t:'hello',v:PROTOCOL});room.message(other,{t:'join',mode:'control'});
  assert.ok(other.messages.some(m=>m.code==='room'));
});

