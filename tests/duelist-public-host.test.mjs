import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import {createGuestArenaHost,publicArenaOrigins} from '../server/duelist/publicHost.mjs';
import {PROTOCOL,WS_PATH} from '../src/components/duelist/net/protocol.mjs';
test('public guest host requires exact HTTPS origins',()=>{
  for(const origin of ['', '*','https://example.com/path','http://example.com','https://u:p@example.com'])assert.throws(()=>publicArenaOrigins(origin));
  assert.deepEqual(publicArenaOrigins('https://example.com,https://example.com'),['https://example.com']);
});
test('real lobby and exact-room drop-in for guests; malformed resume cannot crash',{timeout:8000},async()=>{
  const origin='https://example.com';
  const host=createGuestArenaHost({origins:origin,maxConnections:2});
  const {port}=await host.listen(),url='ws://127.0.0.1:'+port+WS_PATH;
  const sockets=[];
  const next=(ws,t)=>new Promise((resolve,reject)=>{
    const timer=globalThis.setTimeout(()=>{ws.off('message',listener);reject(Error('timeout '+t));},2000);
    function listener(raw){const msg=JSON.parse(String(raw));if(msg.t===t){globalThis.clearTimeout(timer);ws.off('message',listener);resolve(msg);}}
    ws.on('message',listener);
  });
  async function connect(){
    const ws=new WebSocket(url,{origin});sockets.push(ws);await once(ws,'open');
    const pending=next(ws,'welcome');ws.send(JSON.stringify({t:'hello',v:PROTOCOL,id:'admin',token:'ignored'}));
    const welcome=await pending;assert.match(welcome.id,/^guest-/);return {ws,welcome};
  }
  try{
    const lobby=await (await globalThis.fetch('http://127.0.0.1:'+port+'/lobby')).json();
    const room=lobby.matches.find(r=>r.mode==='tdm');assert.equal(room.seats,20);assert.equal(room.players,0);
    const a=await connect(),b=await connect();assert.notEqual(a.welcome.id,b.welcome.id);
    for(const {ws} of [a,b]){
      const pending=next(ws,'joined');ws.send(JSON.stringify({t:'join',mode:'tdm',matchId:room.id}));
      assert.equal((await pending).match,room.id);
    }
    const full=new WebSocket(url,{origin});sockets.push(full);await assert.rejects(once(full,'open'));
    const pending=next(a.ws,'error');a.ws.send(JSON.stringify({t:'join',mode:'story',create:true}));assert.equal((await pending).code,'mode');
    const state=await (await globalThis.fetch('http://127.0.0.1:'+port+'/lobby')).json();
    assert.equal(state.matches.find(r=>r.id===room.id).players,2);
    a.ws.close();await once(a.ws,'close');
    const c=new WebSocket(url,{origin});sockets.push(c);await once(c,'open');
    const welcome=next(c,'welcome');c.send(JSON.stringify({t:'hello',v:PROTOCOL,resume:{match:room.id,key:'é'.repeat(24)}}));
    assert.equal((await welcome).resumed,false);
  }finally{for(const ws of sockets)ws.terminate();await host.close();}
});
