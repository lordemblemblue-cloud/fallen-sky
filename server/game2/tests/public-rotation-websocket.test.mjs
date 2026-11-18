import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {createGame2ArenaServer} from '../arena.mjs';
import {RailwayGameSession} from '../../../src/components/game2/net/railway.js';

const until=async (fn,why)=>{
  for(let i=0;i<250;i++){
    if(fn())return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail(why);
};
async function fixture(t){
  const arena=createGame2ArenaServer({host:'127.0.0.1',
    authenticate:async token=>token.startsWith('user-')?{id:token.slice(5)}:null});
  const addr=await arena.listen();
  t.after(async()=>arena.close());
  return {arena,url:'ws://127.0.0.1:'+addr.port+'/ws/game2'};
}
const session=(url,name,opts={})=>{
  const obj=new RailwayGameSession({selfId:name+'~abc123',name,
    token:'user-'+name,url,WebSocketImpl:WebSocket,mapId:'training',side:'light',...opts});
  obj.packets=[];obj.onMessage=(from,body)=>obj.packets.push({from,body});
  return obj;
};
async function queued(url,name,modes,mapId=null){
  const socket=new WebSocket(url),messages=[];
  socket.on('message',data=>{try{messages.push(JSON.parse(String(data)));}catch{}});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.send(JSON.stringify({t:'queue',version:2,token:'user-'+name,peer:name+'~abc123',
    name,modes,mapId}));
  return {socket,messages,match:()=>messages.find(m=>m.t==='match_found')};
}

test('relay exposes two isolated, directly joinable public rooms per game mode',async t=>{
  const {arena}=await fixture(t);
  const rows=arena.report().servers.filter(r=>r.publicMode);
  assert.equal(rows.length,10);
  for(const mode of ['ffa','teams','duel','team_duel','ctf']){
    const group=rows.filter(r=>r.matchMode===mode);
    assert.equal(group.length,2);
    assert.deepEqual(group.map(r=>r.id),['public-'+mode,'public-'+mode+'-2']);
    assert.ok(group.every(r=>r.players===0 && r.maxPlayers===100 && r.custom===false));
    assert.equal(group[0].mapId, ['ctf','teams'].includes(mode) ? 'sumi_stronghold' : 'training');
    assert.equal(group[1].mapId, ['ctf','teams'].includes(mode) ? 'sumi_stronghold' : 'skybridge');
  }
});

test('separate public map servers stay isolated and join without matchmaking',async t=>{
  const {arena,url}=await fixture(t);
  const training=session(url,'trainingPlayer',{serverId:'public-ffa',mapId:'training'});
  const sky=session(url,'skyPlayer',{serverId:'public-ffa-2',mapId:'skybridge'});
  await training.start();await sky.start();
  await until(()=>training.state==='live' && sky.state==='live','direct joins did not connect');
  assert.equal(arena.report().servers.find(r=>r.id==='public-ffa').players,1);
  assert.equal(arena.report().servers.find(r=>r.id==='public-ffa-2').players,1);
  assert.equal(training.roster.has(sky.self),false,'separate public rooms must not share player rosters');
  assert.equal(sky.roster.has(training.self),false,'separate public rooms must not share player rosters');
  training.leave();sky.leave();
});

test('direct joining public 1v1 ladder keeps winner and moves defeated player to spectator',async t=>{
  const {arena,url}=await fixture(t);
  const a=session(url,'alice',{serverId:'public-duel'});
  const b=session(url,'bob',{serverId:'public-duel',side:'dark'});
  const c=session(url,'charlie',{serverId:'public-duel',side:'dark'});
  await a.start(); await b.start(); await c.start();
  await until(()=>a.duelState?.active?.length===2&&a.duelState.waiting.length===1,
    'first two duelists and spectator did not appear');
  assert.deepEqual(a.duelState.active,[a.self,b.self]);
  assert.deepEqual(a.duelState.waiting,[c.self]);
  c.send(a.self,{k:'rpc',fid:a.self+':p',actor:c.self+':p',m:'hurt',a:[10]});
  await new Promise(r=>setTimeout(r,60));
  assert.equal(a.packets.filter(p=>p.body.k==='rpc').length,0,'spectator attacks were relayed');
  b.broadcast({k:'fx',e:'died',fid:b.self+':p',by:a.self+':p'});
  await until(()=>a.duelState?.round===2 && a.duelState?.active?.includes(c.self),
    'next challenger was not promoted');
  assert.ok(a.duelState.active.includes(a.self),'winner must remain duelist');
  assert.ok(a.duelState.spectators.includes(b.self),'loser must watch next duel');
  assert.equal(arena.report().servers.find(r=>r.id==='public-duel').players,3);
  a.leave();b.leave();c.leave();
  await until(()=>arena.report().servers.find(r=>r.id==='public-duel').players===0,
    'public ladder should remain listed when empty');
});

test('team duel keeps winning pair and advances next two after both opponents fall',async t=>{
  const {url}=await fixture(t);
  const names=['a','b','c','d','e','f'];
  const sessions=[];
  for(const name of names){
    const s=session(url,name,{serverId:'public-team_duel'});
    sessions.push(s);await s.start();
  }
  await until(()=>sessions[0].duelState?.active.length===4 &&
    sessions[0].duelState?.waiting.length===2,'2v2 ladder did not fill its four fighters');
  const before=sessions[0].duelState;
  assert.deepEqual(before.active.slice(0,2),[sessions[0].self,sessions[2].self]);
  const losers=before.activeBySide.dark;
  for(const loser of losers){
    sessions.find(s=>s.self===loser).broadcast({k:'fx',e:'died',
      fid:loser+':p',by:sessions[0].self+':p'});
  }
  await until(()=>sessions[0].duelState?.round===2,'winning team did not remain for round two');
  const after=sessions[0].duelState;
  assert.deepEqual(after.activeBySide.light,[sessions[0].self,sessions[2].self]);
  assert.ok(after.activeBySide.dark.includes(sessions[4].self));
  assert.ok(after.activeBySide.dark.includes(sessions[5].self));
  assert.ok(losers.every(id=>after.spectators.includes(id)));
  for(const s of sessions)s.leave();
});

test('queue refuses mixed specific map requests until a compatible human arrives',async t=>{
  const {url}=await fixture(t);
  const a=await queued(url,'one',['ffa'],'training');
  const b=await queued(url,'two',['ffa'],'skybridge');
  await until(()=>a.messages.some(m=>m.t==='queue_wait')&&b.messages.some(m=>m.t==='queue_wait'),
    'players did not enter distinct map queues');
  assert.equal(a.match(),undefined);
  assert.equal(b.match(),undefined);
  const c=await queued(url,'three',['ffa'],'training');
  await until(()=>a.match()&&c.match(),'same-map players were not paired');
  assert.equal(a.match().mapId,'training');
  assert.equal(c.match().serverId,a.match().serverId);
  assert.equal(b.match(),undefined);
  b.socket.close();a.socket.close();c.socket.close();
});
