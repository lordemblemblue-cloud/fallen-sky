import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateWorldGateway140}
 from '../privateWorldGateway140.mjs';

const scope={
 instanceId:'private-140-instance',instanceEpoch:'epoch-140-one',
 holderId:'worker-140-one',ownerId:'account140',
 characterId:'hero140',mapFingerprint:'a'.repeat(64)
};
const token='session-valid-140';
const validSession={
 authenticated:true,identitySource:'trusted-server-session',
 accountId:scope.ownerId,characterId:scope.characterId
};
function fixture({badOwner=false,delayMs=0}={}){
 const actions=[],requests=[];
 let resolver=null,closed=false;
 const createOwner=async cfg=>{
  resolver=cfg.resolveAuthenticatedSubject;
  return {
   version:'13.9',privateServerOnly:true,productionReady:false,
   publicTransportInstalled:badOwner?true:false,rewardWriterEnabled:false,
   async connect(args){
    const subject=await resolver(args.serverRequestContext);
    requests.push({method:'connect',subject,args});
    return {ok:!!subject,connectionId:'12345678-1234-1234-1234-123456789012',
     snapshot:{eventSeq:0},cursor:0,
     nextIntentSeq:1,rewardsIssued:false};
   },
   async poll(args){
    const subject=await resolver(args.serverRequestContext);
    requests.push({method:'poll',subject,args});
    return {ok:!!subject,events:[],nextSeq:args.afterSeq,
     rewardsIssued:false};
   },
   async setInput(args){
    const subject=await resolver(args.serverRequestContext);
    requests.push({method:'setInput',subject,args});
    return {ok:!!subject,inputSeq:args.input.seq,rewardsIssued:false};
   },
   async submit(args){
    const subject=await resolver(args.serverRequestContext);
    requests.push({method:'submit',subject,args});
    return {ok:!!subject,queued:true,rewardsIssued:false};
   },
   async disconnect(args){
    const subject=await resolver(args.serverRequestContext);
    requests.push({method:'disconnect',subject,args});
    return {ok:!!subject,disconnected:true,rewardsIssued:false};
   },
   async advance(){
    actions.push('advance');
    return {ok:true,rewardsIssued:false,productionReady:false};
   },
   async release(){
    closed=true;actions.push('release');return true;
   },
  };
 };
 const config={
  pool:{connect:async()=>{}},scope,
  createEncounter:async()=>({}),
  authorizeServerOperation:async()=>true,
  allowedOrigins:['http://127.0.0.1:5173'],
  createOwner,
  authenticateRequest:async req=>{
   if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
   return req.headers.authorization==='Bearer '+token?
    validSession:null;
  }
 };
 return {config,actions,requests,resolve:()=>resolver,
  closed:()=>closed};
}
const validId='12345678-1234-1234-1234-123456789012';
async function post(port,action,payload={},headers={},options={}){
 const res=await fetch('http://127.0.0.1:'+port+
  '/private-game3d/140/'+action,{
  method:'POST',
  headers:{'content-type':'application/json',
   origin:'http://127.0.0.1:5173',...headers},
  body:options.raw??JSON.stringify(payload)
 });
 return {status:res.status,headers:res.headers,
  body:await res.json()};
}
test('14.0 requires private owner, explicit allowlist and auth callback',async()=>{
 const f=fixture();
 await assert.rejects(createGame3DPrivateWorldGateway140({
  ...f.config,authenticateRequest:null}),/trusted worker/);
 await assert.rejects(createGame3DPrivateWorldGateway140({
  ...f.config,allowedOrigins:[]}),/trusted worker/);
 await assert.rejects(createGame3DPrivateWorldGateway140({
  ...fixture({badOwner:true}).config}),/private 13.9 owner contract/);
});
test('14.0 private gateway handles authenticated connect, replay and input only',async()=>{
 const f=fixture();
 const gw=await createGame3DPrivateWorldGateway140(f.config);
 const a=await gw.listen({port:0});
 assert.equal(a.host,'127.0.0.1');
 assert.equal(a.loopbackOnly,true);
 try{
  const headers={authorization:'Bearer '+token};
  const conn=await post(a.port,'connect',{},headers);
  assert.equal(conn.status,200);
  assert.equal(conn.body.ok,true);
  assert.equal(conn.body.connectionId,validId);
  assert.equal(conn.body.productionReady,false);
  const input=await post(a.port,'input',{
   connectionId:validId,input:{seq:1,x:0,z:1,facing:0}
  },headers);
  assert.equal(input.body.ok,true);
  const move=await post(a.port,'intent',{
   connectionId:validId,
   intent:{action:'basic',intentId:'strike-000001',
    intentSeq:1,targetId:'enemy1',weaponPath:'damage'}
  },headers);
  assert.equal(move.body.ok,true);
  const reply=await post(a.port,'poll',{
   connectionId:validId,afterSeq:0
  },headers);
  assert.equal(reply.status,200);
  assert.equal(reply.body.nextSeq,0);
  assert.equal((await gw.scheduleTick()).ok,true);
  assert.equal(f.actions.includes('advance'),true);
  const disconnect=await post(a.port,'disconnect',{
   connectionId:validId
  },headers);
  assert.equal(disconnect.body.disconnected,true);
  assert.deepEqual(f.requests.map(x=>x.method),[
   'connect','setInput','submit','poll','disconnect']);
  assert.ok(f.requests.every(x=>x.subject.accountId===scope.ownerId));
  assert.ok(f.requests.every(x=>x.args.serverRequestContext));
  assert.equal(gw.multiplayerReplicationEnabled,false);
  assert.equal(gw.rewardWriterEnabled,false);
  assert.equal(gw.publicTransportInstalled,false);
 }finally{
  assert.equal(await gw.close(),true);
  assert.equal(f.closed(),true);
 }
});
test('14.0 denies impersonation, unauthenticated requests and wrong origins',async()=>{
 const f=fixture();
 const gw=await createGame3DPrivateWorldGateway140(f.config);
 const a=await gw.listen();
 try{
  const absent=await post(a.port,'connect');
  assert.equal(absent.status,401);
  const impersonate=await post(a.port,'connect',{},
   {authorization:'Bearer wrong-token'});
  assert.equal(impersonate.body.reason,'unauthenticated_world_gateway');
  const crossSite=await post(a.port,'connect',{},
   {authorization:'Bearer '+token,origin:'https://evil.example'});
  assert.equal(crossSite.status,403);
  assert.equal(crossSite.body.reason,'origin_denied');
  assert.equal(f.requests.length,0);
  assert.equal(f.actions.length,0);
 }finally{await gw.close()}
});
test('14.0 rejects unauthorized commands and forged fields without invoking owner',async()=>{
 const f=fixture();
 const gw=await createGame3DPrivateWorldGateway140(f.config);
 const a=await gw.listen();
 const headers={authorization:'Bearer '+token};
 try{
  for(const action of ['advance','release','admin','grantXP',
    'create','../release','connect?method=advance']){
   const res=await post(a.port,action,{},headers);
   assert.equal(res.status,404,action);
  }
  for(const [action,payload] of [
   ['connect',{ownerId:scope.ownerId}],
   ['poll',{connectionId:validId,afterSeq:-1}],
   ['poll',{connectionId:'fake',afterSeq:1}],
   ['input',{connectionId:validId,input:{seq:1,x:500,z:0,facing:0}}],
   ['input',{connectionId:validId,input:{seq:1,x:0,z:0,facing:0,damage:999}}],
   ['intent',{connectionId:validId,intent:{
    action:'basic',intentId:'strike-000001',
    intentSeq:1,targetId:'enemy1',weaponPath:'damage',xp:500
   }}],
  ]){
   const reply=await post(a.port,action,payload,headers);
   assert.equal(reply.status,400,JSON.stringify({action,payload}));
  }
  const large=await post(a.port,'connect',{},headers,{
   raw:JSON.stringify({junk:'x'.repeat(5000)})
  });
  assert.equal(large.status,413);
  assert.equal(f.requests.length,0);
  assert.equal(f.actions.length,0);
 }finally{await gw.close()}
});
test('14.0 refuses re-listen and never provides a public bind parameter',async()=>{
 const f=fixture();
 const gw=await createGame3DPrivateWorldGateway140(f.config);
 assert.equal(gw.publicWorldConnected,false);
 assert.equal(gw.productionReady,false);
 const a=await gw.listen({port:0});
 try{
  await assert.rejects(gw.listen({port:3333}),/already started/);
  assert.equal(a.host,'127.0.0.1');
 }finally{await gw.close()}
 assert.equal((await gw.scheduleTick()).ok,false);
 assert.equal(await gw.close(),false);
});
