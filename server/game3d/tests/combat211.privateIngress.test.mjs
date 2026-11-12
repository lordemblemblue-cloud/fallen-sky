import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestIngress211} from '../privateQuestIngress211.mjs';

const origin=1793720000000;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
function fixture({failAttach=false,badRead=false,slowRead=false}={}) {
 let time=origin, live=true, auth=true, changed=false, closed=0, reads=0;
 let releaseRead=()=>{};
 const gate=()=>new Promise(done=>{releaseRead=done});
 const transport={id:'backend-owned-transport'};
 const readContext={kind:'backend-signed-read'};
 const reconnect={kind:'backend-original-one-use-claim'};
 const invalidTransport={id:'not-registered'};
 const scope={ownerId:'user211',characterId:'hero211'};
 const resolver=async({serverTransportContext})=>{
  if(!auth||serverTransportContext!==transport)return null;
  return {authenticated:true,identitySource:'trusted-private-transport-211',
   transportId:'tx-'+(changed?'2':'1').repeat(32),
   ownerId:scope.ownerId,characterId:scope.characterId,
   expiresAtMs:origin+15000,serverReadContext:readContext};
 };
 const handle={get active(){return live},async read({serverReadContext,frame}){
  reads++;
  assert.equal(serverReadContext,readContext);
  assert.equal(frame.op,'questbook.read');
  if(slowRead)await gate();
  if(badRead)return {ok:false};
  return {ok:true,operation:'questbook.snapshot',seq:frame.seq,
   staticReconnectSnapshot:true,transportBindingCreated:false,
   worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
   objectives:[{questId:'axe_patrol',objectiveId:'wolf_kills',type:'kill',
    status:'accepted',current:2,required:3,secret:'never leak me'}]};
 },close(){live=false;closed++;return true}};
 const transport199={version:'19.9',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,
  resumeCombatAuthorized:false,
  async attach({serverReconnectContext}){
   assert.equal(serverReconnectContext,reconnect);
   return failAttach ? {ok:false} : {ok:true,version:'19.9',
    transportBindingCreated:false,resumeCombatAuthorized:false,
    privateHandle:handle};
  }};
 const create=()=>createGame3DPrivateQuestIngress211({enabled:true,
  questTransport199:transport199,scope,resolveAuthenticatedTransport211:resolver,
  now:()=>time});
 const bind=g=>g.bind({serverTransportContext:transport,serverReconnectContext:reconnect});
 const rawFrame=n=>JSON.stringify({v:1,seq:n,op:'questbook.read'});
 const receive=(g,n)=>g.receive({serverTransportContext:transport,rawFrame:rawFrame(n)});
 return {create,bind,receive,rawFrame,transport,reconnect,invalidTransport,
  expire(){time=origin+15001},revoke(){auth=false},rotate(){changed=true},
  releaseRead(){releaseRead()},get closed(){return closed},get reads(){return reads}};
}

test('21.1 disabled by default and no public listener',()=>{
 assert.throws(()=>createGame3DPrivateQuestIngress211(),/requires private/);
 const h=fixture(),g=h.create();
 assert.equal(g.publicRouteInstalled,false);
 assert.equal(g.transportBindingCreated,false);
 assert.equal(g.resumeCombatAuthorized,false);
 g.shutdown();
});
test('21.1 binds original private handoff without exporting handle or identity',async()=>{
 const h=fixture(),g=h.create();
 const bound=await h.bind(g);
 assert.equal(bound.ok,true);
 assert.equal(bound.transportBindingCreated,false);
 assert.equal(Object.hasOwn(bound,'privateHandle'),false);
 assert.equal(JSON.stringify(bound).includes('user211'),false);
 g.shutdown();
});
test('21.1 ingests only trusted read-only frames and whitelisted questbook data',async()=>{
 const h=fixture(),g=h.create();await h.bind(g);
 const result=await h.receive(g,1);
 assert.equal(result.ok,true);
 assert.equal(result.rewardsIssued,false);
 const payload=JSON.parse(result.payload);
 assert.deepEqual(payload,{v:1,type:'questbook.snapshot',seq:1,
  objectives:[{questId:'axe_patrol',objectiveId:'wolf_kills',type:'kill',
   status:'accepted',current:2,required:3}]});
 assert.equal(JSON.stringify(result).includes('secret'),false);
 g.shutdown();
});
test('21.1 bad client command closes private attachment',async()=>{
 const h=fixture(),g=h.create();await h.bind(g);
 const denial=await g.receive({serverTransportContext:h.transport,
  rawFrame:JSON.stringify({v:1,seq:1,op:'combat.attack'})});
 assert.equal(denial.ok,false);
 assert.equal(denial.reason,'malformed_or_unauthorized_frame');
 assert.equal((await h.receive(g,1)).ok,false);
 assert.equal(h.closed,1);
});
test('21.1 forged transport cannot bind or read',async()=>{
 const h=fixture(),g=h.create();
 const denial=await g.bind({serverTransportContext:h.invalidTransport,
  serverReconnectContext:h.reconnect});
 assert.equal(denial.ok,false);
 assert.equal((await h.bind(g)).ok,false);
 assert.equal(h.reads,0);
});
test('21.1 malformed or oversized JSON is refused',async()=>{
 for(const raw of ['{', ' '.repeat(193),JSON.stringify({v:1,seq:1,op:'questbook.read',ownerId:'evil'})]){
  const h=fixture(),g=h.create();await h.bind(g);
  assert.equal((await g.receive({serverTransportContext:h.transport,rawFrame:raw})).ok,false);
  assert.equal(h.closed,1);
 }
});
test('21.1 independent logout and ID rotation deny reads',async()=>{
 for(const method of ['revoke','rotate','expire']){
  const h=fixture(),g=h.create();await h.bind(g);h[method]();
  assert.equal((await h.receive(g,1)).ok,false);
  assert.equal(h.closed,1);
 }
});
test('21.1 revoked during in-flight read fails closed without payload',async()=>{
 const h=fixture({slowRead:true}),g=h.create();await h.bind(g);
 const pending=h.receive(g,1);
 // Give the serial queue time to enter the read callback.
 for(let i=0;i<50&&h.reads===0;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.reads,1);
 h.revoke();h.releaseRead();
 const result=await pending;
 assert.equal(result.ok,false);
 assert.equal(Object.hasOwn(result,'payload'),false);
 assert.equal(h.closed,1);
});
test('21.1 original 19.9 refusal cannot be bypassed',async()=>{
 const h=fixture({failAttach:true}),g=h.create();
 assert.equal((await h.bind(g)).ok,false);
 assert.equal((await h.receive(g,1)).ok,false);
});
test('21.1 original 19.9 read failure closes ingress',async()=>{
 const h=fixture({badRead:true}),g=h.create();await h.bind(g);
 assert.equal((await h.receive(g,1)).ok,false);
 assert.equal(h.closed,1);
});
test('21.1 one-use binding and idempotent shutdown',async()=>{
 const h=fixture(),g=h.create();
 assert.equal((await h.bind(g)).ok,true);
 assert.equal((await h.bind(g)).ok,false);
 assert.equal(g.shutdown(),true);
 assert.equal(g.close(),false);
 assert.equal((await h.receive(g,1)).ok,false);
 assert.equal(h.closed,1);
 const counters=g.metrics();
 assert.equal(Object.keys(counters).sort().join(','),'accepted,closed,denied');
 assert.equal(JSON.stringify(counters).includes('user211'),false);
});
test('21.1 rejects concurrent over-capacity messages',async()=>{
 const h=fixture({slowRead:true}),g=h.create();await h.bind(g);
 const pending=Array.from({length:5},(_,i)=>h.receive(g,i+1));
 const rejected=await pending[4];
 assert.equal(rejected.ok,false);
 assert.equal(rejected.reason,'private_ingress_backpressure');
 // Release each sequential delayed read.
 for(let i=0;i<4;i++){
  for(let j=0;j<50&&h.reads<i+1;j++)await new Promise(resolve=>setImmediate(resolve));
  h.releaseRead();
 }
 const results=await Promise.all(pending.slice(0,4));
 assert.equal(results.every(r=>r.ok),true);
 g.shutdown();
});
