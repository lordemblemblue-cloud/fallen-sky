import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGame2ArenaServer } from '../arena.mjs';
import { RailwayGameSession } from '../../../src/components/game2/net/railway.js';
import { validateServerSettings, botSidesFor, serversFromStatus } from '../serverRules.mjs';

test('deployed map/mode status remains joinable before the new relay rolls out', () => {
  const rows=serversFromStatus({rooms:true,supports_modes:true,max_players:100,arenas:{training:{players:2}},team_arenas:{training:{players:3}}},{});
  assert.equal(rows.length,10);
  assert.equal(rows.find(r=>r.id==='training').players,2);
  assert.equal(rows.find(r=>r.id==='training:teams').players,3);
  assert.equal(rows.find(r=>r.id==='training:teams').matchMode,'teams');
});

const settings = extra => ({name:'Temple duels',mapId:'training',matchMode:'ffa',maxPlayers:100,botFill:8,...extra});
async function fixture(t, options={}) {
  const arena=createGame2ArenaServer({host:'127.0.0.1',authenticate:async token=>({id:token}),...options});
  const {port}=await arena.listen();t.after(()=>arena.close());
  const player=(id,extra={})=>new RailwayGameSession({selfId:id+'~abc123',name:id,token:id,side:'light',url:`ws://127.0.0.1:${port}/ws/game2`,WebSocketImpl:WebSocket,mapId:'training',...extra});
  return {arena,player};
}
async function until(fn) { for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'state did not converge'); }

test('server settings reject unsupported rules and bot counts; team fill balances both sides',()=>{
  for(const extra of [{mapId:'unknown'},{matchMode:'ctf'},{maxPlayers:200},{botFill:101},{botFill:-1},{name:' '}])assert.throws(()=>validateServerSettings(settings(extra)));
  const sides=botSidesFor(settings({matchMode:'teams'}),[{side:'light'},{side:'light'}]);
  assert.equal(sides.filter(s=>s==='light').length,2);assert.equal(sides.filter(s=>s==='dark').length,4);
});

test('named servers are real isolated rooms; humans replace bots, host migrates, last departure closes the room',async t=>{
  const {arena,player}=await fixture(t);
  const a=player('owner',{createServer:settings()}),b=player('visitor'),other=player('outsider');
  await a.start();const row=arena.report().servers.find(s=>s.custom);
  assert.equal(row.name,'Temple duels');assert.equal(row.players,1);assert.equal(row.ai,7);
  b.o.serverId=row.id;await b.start();await other.start();
  await until(()=>a.roster.size===2&&a.ai===6);assert.equal(arena.report().servers.find(s=>s.id===row.id).ai,6);
  const messages=[];b.onMessage=(from,body)=>messages.push(body);other.onMessage=()=>assert.fail('cross-room packet');
  a.broadcast({k:'s',t:1,f:[[a.self+':p',0]]},false);await until(()=>messages.length===1);
  a.leave();await until(()=>b.isHost&&b.ai===7);assert.equal(b.serverName,'Temple duels');
  b.leave();await until(()=>!arena.report().servers.some(s=>s.id===row.id));
  const stale=player('stale',{serverId:row.id});await stale.start();assert.equal(stale.state,'ended');assert.match(stale.statusText,/closed/);
  other.leave();
});

test('100-player team server admits 50 per side, refuses the 51st, and blocks friendly damage at the relay',async t=>{
  const {arena,player}=await fixture(t);
  const a=player('host',{createServer:settings({matchMode:'teams',botFill:100})});await a.start();
  const room=arena.report().servers.find(s=>s.custom).id,clients=[a];
  for(let i=1;i<50;i++){const p=player('light'+i,{serverId:room});await p.start();assert.equal(p.state,'live');clients.push(p);}
  const overflow=player('overflow',{serverId:room});await overflow.start();assert.equal(overflow.state,'ended');assert.match(overflow.statusText,/team is full/i);
  for(let i=0;i<50;i++){const p=player('dark'+i,{side:'dark',serverId:room});await p.start();assert.equal(p.state,'live');clients.push(p);}
  await until(()=>a.roster.size===100&&a.ai===0);
  assert.equal(arena.report().servers.find(s=>s.id===room).maxPlayers,100);
  const full=player('full',{side:'dark',serverId:room});await full.start();assert.match(full.statusText,/server is full/i);
  const allied=[],enemy=[];clients[1].onMessage=(from,body)=>allied.push(body);clients[50].onMessage=(from,body)=>enemy.push(body);
  a.send(clients[1].self,{k:'rpc',actor:a.self+':p',fid:clients[1].self+':p',m:'hurt',a:[10]});
  a.send(clients[50].self,{k:'rpc',actor:a.self+':p',fid:clients[50].self+':p',m:'hurt',a:[10]});
  await until(()=>enemy.length===1);assert.equal(allied.length,0);
  clients[50].broadcast({k:'fx',e:'died',fid:clients[50].self+':p',by:a.self+':p'});
  await until(()=>a.teamScore?.light===1);
  clients[50].broadcast({k:'fx',e:'died',fid:clients[50].self+':p',by:a.self+':p'});
  clients[50].leave();await until(()=>a.roster.size===99);
  const late=player('late',{side:'dark',serverId:room});await late.start();assert.equal(late.teamScore.light,1,'late joiners receive the shared score');late.leave();
  for(const p of clients)p.leave();
});

test('free-for-all capacity is exactly 100 humans and bots never consume human admission slots',async t=>{
  const {arena,player}=await fixture(t),host=player('host',{createServer:settings({botFill:100})});
  await host.start();const id=arena.report().servers.find(s=>s.custom).id,players=[host];
  assert.equal(host.ai,99);
  for(let i=1;i<100;i++){const p=player('ffa'+i,{serverId:id});await p.start();assert.equal(p.state,'live');players.push(p);}
  await until(()=>host.roster.size===100&&host.ai===0);
  const overflow=player('extra',{serverId:id});await overflow.start();assert.match(overflow.statusText,/full/i);
  for(const p of players)p.leave();
});

test('invalid creation, duplicate ownership, wrong maps and forged bot snapshots cannot join or leak rooms',async t=>{
  const {arena,player}=await fixture(t);
  const bad=player('bad',{createServer:settings({maxPlayers:200})});await bad.start();assert.equal(bad.state,'ended');assert.equal(arena.report().servers.filter(s=>s.custom).length,0);
  const host=player('owner',{createServer:settings({botFill:8})});await host.start();const room=arena.report().servers.find(s=>s.custom).id;
  const duplicate=player('owner',{selfId:'owner~def456',createServer:settings()});await duplicate.start();assert.match(duplicate.statusText,/already have/);
  const wrong=player('wrong',{serverId:room,mapId:'hangar'});await wrong.start();assert.match(wrong.statusText,/different map/);
  const visitor=player('visitor',{serverId:room});await visitor.start();const received=[];host.onMessage=(from,body)=>received.push(body);
  visitor.broadcast({k:'s',t:1,f:[[visitor.self+':a0',1]]},false);
  visitor.broadcast({k:'s',t:2,f:[[visitor.self+':p',1]]},false);
  await until(()=>received.length===1);assert.equal(received[0].t,2);assert.equal(received[0].f[0][1],0,'side comes from admission, not claimed snapshot');
  host.leave();visitor.leave();
});
