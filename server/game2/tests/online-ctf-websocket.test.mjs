import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGame2ArenaServer } from '../arena.mjs';
import { RailwayGameSession } from '../../../src/components/game2/net/railway.js';
import { ONLINE_CTF_MAPS, ONLINE_CTF_HOMES } from '../ctfMatch.mjs';

const waitFor = async (predicate, message) => {
  for (let i=0;i<300;i++) {
    if (predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(message);
};
const makeSnap = (session, pos, alive=true) => {
  const fighter = Array(44).fill(0);
  fighter[0]=session.self+':p'; fighter[3]=pos[0];fighter[4]=pos[1];fighter[5]=pos[2];
  fighter[13]=alive?0:1;fighter[14]=alive?100:0;fighter[15]=100;
  return {k:'s',t:Date.now()/1000,f:[fighter]};
};
async function queue(url, name, modes) {
  const socket = new WebSocket(url), received = [];
  socket.on('message',raw=>{try{received.push(JSON.parse(String(raw)));}catch{}});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.send(JSON.stringify({t:'queue',version:2,token:name,peer:name+'~abc123',name,modes}));
  return {socket,match:()=>received.find(m=>m.t==='match_found')};
}
test('online CTF queue waits for 4 humans, picks an authored map, relays flags and scores',async t=>{
  const arena=createGame2ArenaServer({host:'127.0.0.1',rng:()=>.99,authenticate:async token=>({id:token})});
  const address=await arena.listen();t.after(()=>arena.close());
  const url='ws://127.0.0.1:'+address.port+'/ws/game2';
  const names=['alice','bob','charlie','delta'],queues=[];
  for(const name of names.slice(0,3))queues.push(await queue(url,name,['ctf']));
  await waitFor(()=>arena.report().matchmaking.waiting===3,'three CTF players not waiting');
  assert.ok(queues.every(q=>!q.match()),'three players cannot launch four-player CTF');
  queues.push(await queue(url,names[3],['ctf']));
  await waitFor(()=>queues.every(q=>q.match()),'fourth human did not launch CTF');
  const ticket=queues[0].match();
  assert.ok(ONLINE_CTF_MAPS.includes(ticket.mapId));
  assert.equal(ticket.mapId,'sumi_stronghold','injected random value should select authored stronghold');
  assert.equal(ticket.matchMode,'ctf');
  assert.equal(new Set(queues.map(q=>q.match().serverId)).size,1);
  const sessions=queues.map((q,i)=>{
    const match=q.match();
    return new RailwayGameSession({
      selfId:names[i]+'~abc123',token:names[i],name:names[i],
      url,WebSocketImpl:WebSocket,side:match.side,
      matchMode:'ctf',serverId:match.serverId,matchTicket:match.matchTicket,mapId:match.mapId,
    });
  });
  for(const session of sessions) await session.start();
  await waitFor(()=>sessions.every(s=>s.roster.size===4),'CTF roster not formed');
  assert.deepEqual(sessions[0].ctf.score,{light:0,dark:0});
  const enemyHome=ONLINE_CTF_HOMES[ticket.mapId].dark;
  const ownHome=ONLINE_CTF_HOMES[ticket.mapId].light;
  sessions[0].broadcast(makeSnap(sessions[0],enemyHome),false);
  await waitFor(()=>sessions.every(s=>s.ctf.flags.dark.carrier===sessions[0].self),'stolen flag not synchronized');
  sessions[0].broadcast(makeSnap(sessions[0],ownHome),false);
  await waitFor(()=>sessions.every(s=>s.ctf.score.light===1),'valid flag capture not scored for all players');
  assert.equal(sessions[0].ctf.flags.dark.state,'base');
  assert.equal(sessions[2].ctf.score.dark,0);
  for(const session of sessions)session.leave();
});
test('duel and team duel never roll into random map pools',async t=>{
  const arena=createGame2ArenaServer({host:'127.0.0.1',rng:()=>.99,authenticate:async token=>({id:token})});
  const address=await arena.listen();t.after(()=>arena.close());
  const url='ws://127.0.0.1:'+address.port+'/ws/game2';
  const duel=[await queue(url,'one',['duel']),await queue(url,'two',['duel'])];
  await waitFor(()=>duel.every(q=>q.match()),'duel not matched');
  assert.ok(duel.every(q=>['training','skybridge'].includes(q.match().mapId)));
  const team=[];
  for(const name of ['three','four','five','six'])team.push(await queue(url,name,['team_duel']));
  await waitFor(()=>team.every(q=>q.match()),'team duel not matched');
  assert.ok(team.every(q=>['training','skybridge'].includes(q.match().mapId)));
});
