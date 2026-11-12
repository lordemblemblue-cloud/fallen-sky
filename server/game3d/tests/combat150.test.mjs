import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createGame3DServerHeldWorldBridge150}
 from '../privateWorldSessionBridge150.mjs';

const scope={instanceId:'private-world-150',ownerId:'owner150',
 characterId:'hero150'};
const now=Date.now();
const identity={authenticated:true,identitySource:'trusted-server-session',
 accountId:scope.ownerId,characterId:scope.characterId,
 serverSessionId:'server-session-150',expiresAtMs:now+600000};
const issueToken=i=>String.fromCharCode(64+i).repeat(43);
function privateAuthority(){
 let issues=0;const revocations=[];
 return {version:'14.9',privateServerOnly:true,revocations,
  async issue(request){
   issues++;
   assert.deepEqual(request,{...scope,ttlSeconds:120});
   const token=issueToken(issues);
   return {ok:true,...scope,token,
    tokenSha256:createHash('sha256').update(token).digest('hex')};
  },
  async revoke(request){revocations.push(request);return {ok:true}},
  get issues(){return issues},
 };
}
async function gateway(){
 const requests=[];
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  requests.push({host:req.headers.host,authorization:req.headers.authorization,
   origin:req.headers.origin,method:req.method,url:req.url,
   payload:JSON.parse(Buffer.concat(chunks).toString('utf8'))});
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({ok:true,connectionId:'123e4567-e89b-12d3-a456-426614174000',
   rewardsIssued:false,productionReady:false}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:server.address().port,requests,
  close:()=>new Promise(resolve=>server.close(resolve))};
}
const setup=(port,authority,clock=()=>now)=>
 createGame3DServerHeldWorldBridge150({scope,authority149:authority,
  resolveTrustedPlayerSession:async ctx=>ctx,loopbackPort:port,
  origin:'https://private-client.example',ttlSeconds:120,now:clock});

test('15.0 validates fixed localhost wiring and a real privileged 14.9 issuer',()=>{
 assert.throws(()=>createGame3DServerHeldWorldBridge150(),/requires pinned/);
 assert.throws(()=>createGame3DServerHeldWorldBridge150({
  scope,authority149:privateAuthority(),
  resolveTrustedPlayerSession:async ctx=>ctx,loopbackPort:0,
  origin:'https://private-client.example'}),/requires pinned/);
 assert.throws(()=>createGame3DServerHeldWorldBridge150({
  scope,authority149:privateAuthority(),
  resolveTrustedPlayerSession:async ctx=>ctx,loopbackPort:5678,
  origin:'https://private-client.example/path'}),/requires pinned/);
});
test('15.0 sends only to fixed loopback, holds bearer server-side and reauthenticates every call',async()=>{
 const gw=await gateway(),a=privateAuthority(),bridge=setup(gw.port,a);
 try{
  const missing=await bridge.open({serverRequestContext:null});
  assert.equal(missing.ok,false);
  assert.equal(a.issues,0);
  const opened=await bridge.open({serverRequestContext:identity});
  assert.equal(opened.ok,true);
  assert.equal(opened.credentialDeliveredToBrowser,false);
  assert.equal(JSON.stringify(opened).includes(issueToken(1)),false);
  assert.equal(JSON.stringify(opened).includes('tokenSha256'),false);
  const invalid=await bridge.send({handle:opened.handle,
   action:'intent',payload:{action:'basic'},serverRequestContext:identity});
  assert.equal(invalid.reason,'invalid_private_action');
  assert.equal(gw.requests.length,0);
  const wrong=await bridge.send({handle:opened.handle,action:'connect',
   payload:{},serverRequestContext:{...identity,serverSessionId:'other-session-150'}});
  assert.equal(wrong.reason,'private_session_expired_or_denied');
  assert.equal(gw.requests.length,0);
  const valid=await bridge.send({handle:opened.handle,action:'connect',
   payload:{},serverRequestContext:identity});
  assert.equal(valid.ok,true);
  assert.equal(valid.rewardsIssued,false);
  assert.equal(valid.publicPlayerRouteInstalled,false);
  assert.equal(gw.requests.length,1);
  assert.equal(gw.requests[0].authorization,'Bearer '+issueToken(1));
  assert.equal(gw.requests[0].host,'127.0.0.1:'+gw.port);
  assert.equal(gw.requests[0].origin,'https://private-client.example');
  assert.equal(gw.requests[0].url,'/private-game3d/140/connect');
  assert.equal(gw.requests[0].method,'POST');
  assert.deepEqual(gw.requests[0].payload,{});
  const closed=await bridge.close({handle:opened.handle,
   serverRequestContext:identity});
  assert.equal(closed.serverRevocationConfirmed,true);
  assert.equal(a.revocations.length,1);
  const again=await bridge.send({handle:opened.handle,action:'connect',
   payload:{},serverRequestContext:identity});
  assert.equal(again.ok,false);
 }finally{await bridge.shutdown();await gw.close()}
});
test('15.0 rotates handles without exposing bearer and fences old sessions',async()=>{
 const gw=await gateway(),a=privateAuthority(),bridge=setup(gw.port,a);
 try{
  const first=await bridge.open({serverRequestContext:identity});
  const second=await bridge.open({serverRequestContext:identity});
  assert.equal(a.issues,2);
  assert.notEqual(first.handle,second.handle);
  const old=await bridge.send({handle:first.handle,action:'connect',
   payload:{},serverRequestContext:identity});
  assert.equal(old.ok,false);
  const ok=await bridge.send({handle:second.handle,action:'input',
   payload:{connectionId:'123e4567-e89b-12d3-a456-426614174000',
    input:{seq:1,x:0,z:1,facing:0}},serverRequestContext:identity});
  assert.equal(ok.ok,true);
  assert.equal(gw.requests[0].authorization,'Bearer '+issueToken(2));
  await bridge.shutdown();
  assert.equal(a.revocations.length,1);
  assert.equal((await bridge.open({serverRequestContext:identity})).ok,false);
 }finally{await gw.close()}
});
test('15.0 fails closed when trusted login expires before a private action',async()=>{
 const gw=await gateway(),a=privateAuthority();
 let clock=now;const bridge=setup(gw.port,a,()=>clock);
 try{
  const opened=await bridge.open({serverRequestContext:identity});
  clock=now+121000;
  const r=await bridge.send({handle:opened.handle,action:'connect',
   payload:{},serverRequestContext:identity});
  assert.equal(r.ok,false);
  assert.equal(gw.requests.length,0);
  const failed=await bridge.close({handle:opened.handle,
   serverRequestContext:{...identity,expiresAtMs:now-1}});
  assert.equal(failed.ok,false);
  await bridge.shutdown();
 }finally{await gw.close()}
});
