import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createDuelistServer} from '../server/duelist/server.mjs';
import {PROTOCOL,WS_PATH} from '../src/components/duelist/net/protocol.mjs';

test('real WebSocket host supports atomic explicit tiers and rejects duplicate or malformed purchases',{timeout:12000},async()=>{
 const server=createDuelistServer({host:'127.0.0.1',port:0,authenticate:async token=>token?{id:token,name:'Tester'}:null});
 const {port}=await server.listen();
 const ws=new WebSocket('ws://127.0.0.1:'+port+WS_PATH);
 const inbox=[];
 ws.on('message',raw=>inbox.push(JSON.parse(String(raw))));
 async function next(type){
  const until=Date.now()+3000;
  while(Date.now()<until){
   const i=inbox.findIndex(m=>m.t===type);
   if(i>=0)return inbox.splice(i,1)[0];
   await new Promise(resolve=>globalThis.setTimeout(resolve,10));
  }
  assert.fail('Timed out: '+type);
 }
 const send=m=>ws.send(JSON.stringify(m));
 try{
  await once(ws,'open');send({t:'hello',v:PROTOCOL,token:'shop-test',name:'Tester'});
  assert.equal((await next('welcome')).shopBuild,true);
  send({t:'join',mode:'duel',cls:'duelist'});await next('joined');
  send({t:'shopBuild',id:'ironfang',tier:3,combine:false});
  const bought=await next('shop');assert.equal(bought.ok,true);assert.equal(bought.tier,3);assert.equal(bought.cost,300);assert.equal(bought.gold,0);
  send({t:'shopBuild',id:'ironfang',tier:3,combine:false});
  assert.equal((await next('shop')).ok,false);
  send({t:'shopBuild',id:'heartseed',tier:2,combine:'false'});
  assert.equal((await next('shop')).reason,'invalid-tier');
  send({t:'shopBuild',id:'heartseed',tier:3,combine:false});
  assert.equal((await next('shop')).reason,'not-enough-gold');
 }finally{ws.terminate();await server.close();}
});
