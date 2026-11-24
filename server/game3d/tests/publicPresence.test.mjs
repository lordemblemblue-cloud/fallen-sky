import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPublicWorldPresence,parseWorldPose } from '../publicPresence.mjs';
import { createPublicPresenceServer } from '../publicPresenceServer.mjs';
import { guestWorldScene,guestWorldPresenceUrl,connectGuestWorldPresence } from '../../../src/components/game3d/network/guestWorldPresence.mjs';
const pose=(scene='wolfveil:town',x=1)=>({t:'pose',scene,x,y:2,z:3,yaw:0,anim:'run'});
test('one shared world admits immediately, caps seats, excludes self and frees seats',()=>{
  const state=createPublicWorldPresence({capacity:2,clock:()=>123});
  const a=state.admit(),b=state.admit();
  assert.notEqual(a,b);assert.equal(state.admit(),null);
  assert.ok(state.update(a,pose()));assert.ok(state.update(b,pose('wolfveil:town',5)));
  const snap=state.snapshot(a);assert.equal(snap.count,2);assert.equal(snap.players.length,1);
  assert.equal(snap.players[0].player_id,b);assert.equal(snap.players[0].x,5);
  assert.equal(snap.players[0].last_update,123);
  state.leave(b);assert.equal(state.snapshot(a).players.length,0);assert.ok(state.admit());
});
test('scene isolation and strict cosmetic-only packets reject spoofing or privileged commands',()=>{
  const state=createPublicWorldPresence(),a=state.admit(),b=state.admit();
  assert.ok(state.update(a,pose()));assert.ok(state.update(b,pose('astral-dungeon')));
  assert.deepEqual(state.snapshot(a).players,[]);
  for(const invalid of [{...pose(),player_id:b},{...pose(),damage:100},{...pose(),x:Infinity},{...pose(),x:'1'},
    {...pose(),scene:'dashboard_admin'},{...pose(),anim:'<script>'},{...pose(),x:10001},{t:'reward'}]) {
    assert.equal(parseWorldPose(invalid),null);assert.equal(state.update(a,invalid),false);
  }
  assert.equal(state.update('unadmitted',pose()),false);
  assert.ok(state.update(b,pose()));assert.equal(state.snapshot(a).players[0].player_id,b);
});
test('secure URL and scene contracts',()=>{
  assert.equal(guestWorldScene('wolfveil',null),'wolfveil:all');
  assert.equal(guestWorldScene('wolfveil','east'),'wolfveil:east');
  assert.equal(guestWorldScene('invalid','town'),null);
  assert.equal(guestWorldPresenceUrl('wss://example.com/ws/world-presence','example.com'),'wss://example.com/ws/world-presence');
  assert.equal(guestWorldPresenceUrl('ws://example.com/ws/world-presence','example.com'),null);
  assert.equal(guestWorldPresenceUrl('wss://user:pw@example.com/ws/world-presence','example.com'),null);
  assert.equal(guestWorldPresenceUrl('ws://localhost:5322/ws/world-presence','localhost'),'ws://localhost:5322/ws/world-presence');
  assert.throws(()=>createPublicPresenceServer({allowedOrigins:['*']}));
});
test('browser adapter waits for server welcome, limits updates and ignores old-scene snapshots',()=>{
  const statuses=[],lists=[],sent=[];let now=100;
  const ws={readyState:1,bufferedAmount:0,send:s=>sent.push(JSON.parse(s)),close(){}};
  const client=connectGuestWorldPresence({url:'wss://example.com/ws/world-presence',initialScene:'wolfveil:town',socketFactory:()=>ws,
    onStatus:s=>statuses.push(s.status),onPlayers:p=>lists.push(p),clock:()=>now});
  client.update(pose());assert.equal(sent.length,0);
  const receive=m=>ws.onmessage({data:JSON.stringify(m)});
  receive({t:'welcome',count:1,max:20});
  client.update(pose());client.update(pose());assert.equal(sent.length,1);
  now+=100;client.update(pose());assert.equal(sent.length,2);
  client.setScene('wolfveil:east');
  receive({t:'presence',scene:'wolfveil:town',count:1,max:20,players:[]});
  assert.equal(lists.length,1);
  receive({t:'presence',scene:'wolfveil:east',count:1,max:20,players:[]});
  assert.equal(lists.length,2);assert.equal(statuses.at(-1),'connected');client.close();
});
test('real sockets join without queue and snapshots isolate scenes',{timeout:5000},async()=>{
  const origin='https://example.com';
  const service=createPublicPresenceServer({allowedOrigins:[origin]});
  const {port}=await service.listen();
  const url='ws://127.0.0.1:'+port+'/ws/world-presence';
  const sockets=[];
  const connect=async()=>{
    const ws=new WebSocket(url,{origin});sockets.push(ws);
    const [raw]=await once(ws,'message');assert.equal(JSON.parse(String(raw)).t,'welcome');return ws;
  };
  const next=(ws,predicate)=>new Promise((resolve,reject)=>{
    const timer=globalThis.setTimeout(()=>{ws.off('message',listener);reject(Error('snapshot timeout'));},1500);
    const listener=data=>{const m=JSON.parse(String(data));if(predicate(m)){globalThis.clearTimeout(timer);ws.off('message',listener);resolve(m);}};
    ws.on('message',listener);
  });
  try{
    const bad=new WebSocket(url,{origin:'https://other.example'});sockets.push(bad);
    await assert.rejects(once(bad,'open'));
    const a=await connect(),b=await connect();
    a.send(JSON.stringify(pose()));b.send(JSON.stringify(pose('wolfveil:town',9)));
    const both=await next(a,m=>m.t==='presence'&&m.players?.length===1);
    assert.equal(both.players[0].x,9);assert.equal(both.count,2);
    b.send(JSON.stringify(pose('astral-dungeon')));
    await next(a,m=>m.t==='presence'&&m.players?.length===0&&m.scene==='wolfveil:town');
  }finally{for(const ws of sockets)ws.terminate();await service.close();}
});
