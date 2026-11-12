import test from 'node:test';
import assert from 'node:assert/strict';
import {createAXEVerifiedQuestbookSession172,verifiedQuestTrackerEntries172}
  from '../../../src/components/game3d/axe/quests/AXEVerifiedQuestbookSession172.js';

const realView = () => ({
  readOnly:true,rewardsIssued:false,
  entries:[{id:'axe_q_first_patrol',title:'Beyond the Capital Gate',
    status:'accepted',statusLabel:'In Progress',readOnly:true,serverVerified:true,
    progressPercent:33,objectives:[{id:'patrol_kills',type:'kill',count:3,current:1,done:false}]},
    {id:'echo_ch_14_first_echo',title:'First Echo',status:'completed',
     statusLabel:'Completed',readOnly:true,serverVerified:true,progressPercent:100,
     objectives:[{id:'echo',type:'kill',count:1,current:1,done:true}]}],
  questState:{acceptedIds:['axe_q_first_patrol'],completedIds:['echo_ch_14_first_echo'],
    lastAcceptedId:'axe_q_first_patrol'},
});
const makeHarness = (overrides={}) => {
  let identity='account-A|character-A';
  let onIdentity=null,interval=null,stopInterval=null,fetches=0,resetCount=0;
  let replies=[];
  const view=realView();
  const model={
    getQuery:()=>({action:'read',knownRevision:null,knownViewId:null}),
    apply:(env)=>env?.ok ? {ok:true,view:env.view} : {ok:false,reason:'unauthorized'},
    reset:()=>{resetCount++},
  };
  const create = options => createAXEVerifiedQuestbookSession172({
    reader:()=>{fetches++;return replies.length?replies.shift():{ok:true,view}},
    createModel:()=>model,getIdentity:()=>identity,
    subscribeIdentityChange:fn=>{onIdentity=fn;return()=>{onIdentity=null}},
    schedule:(fn,ms)=>{interval=fn;return ms},
    unschedule:id=>{stopInterval=id},pollMs:20000,...overrides,...options,
  });
  return {create,view,setIdentity:x=>{identity=x;onIdentity?.()},
    queue:x=>replies.push(x),runTimer:()=>interval?.(),
    get fetches(){return fetches},get resetCount(){return resetCount},
    get stopped(){return stopInterval},get subscribed(){return !!onIdentity}};
};

const flush=()=>new Promise(r=>setImmediate(r));

test('17.2 disabled-by-default bridge cannot fetch/publish or schedule',async()=>{
  const session=createAXEVerifiedQuestbookSession172();
  assert.equal(session.enabled,false);
  assert.equal(session.getSnapshot().status,'disabled');
  await session.refresh();
  session.start()();
  assert.equal(session.getSnapshot().view,null);
  assert.equal(session.rewardsIssued,false);
});
test('17.2 invalid polling and missing model must fail closed',()=>{
  assert.throws(()=>createAXEVerifiedQuestbookSession172({reader:()=>{}}),/requires/);
  assert.throws(()=>createAXEVerifiedQuestbookSession172({pollMs:0}),/polling/);
  const h=makeHarness();
  assert.throws(()=>h.create({createModel:()=>({})}),/reconciler/);
});
test('17.2 actual mount triggers read-only canonical HUD view; never takes local progress',async()=>{
  const h=makeHarness(),session=h.create(),states=[];
  const off=session.subscribe(s=>states.push(s.status));
  const end=session.start();
  await flush();
  assert.equal(session.getSnapshot().status,'verified');
  assert.equal(session.getSnapshot().view.entries[0].objectives[0].current,1);
  assert.equal(h.fetches,1);
  assert.equal(session.getSnapshot().rewardsIssued,false);
  assert.deepEqual(states,['loading','loading','verified']);
  off();end();
  assert.equal(session.getSnapshot().view,null);
  assert.equal(session.getSnapshot().status,'loading');
});
test('17.2 HUD shows actual server quest objective and ignores completed quests',()=>{
  const view=realView(),entries=verifiedQuestTrackerEntries172(view);
  assert.equal(entries.length,1);
  assert.deepEqual(Object.keys(entries[0]).sort(),[
    'current','id','objective','percent','readOnly','readyToTurnIn',
    'title','total','tracked','verified'
  ].sort());
  assert.equal(entries[0].title,'Beyond the Capital Gate');
  assert.equal(entries[0].current,1);
  assert.equal(entries[0].total,3);
  assert.equal(entries[0].percent,33);
  assert.equal(entries[0].tracked,true);
  assert.equal(entries[0].verified,true);
  assert.equal(entries[0].readOnly,true);
  assert.equal(entries[0].objective,'Defeat 3 enemies');
});
test('17.2 hostile snapshots cannot populate verified HUD',()=>{
  assert.deepEqual(verifiedQuestTrackerEntries172(null),[]);
  assert.deepEqual(verifiedQuestTrackerEntries172({...realView(),readOnly:false}),[]);
  assert.deepEqual(verifiedQuestTrackerEntries172({...realView(),rewardsIssued:true}),[]);
  const corrupt=realView();corrupt.entries[0].objectives[0].current=400;
  assert.deepEqual(verifiedQuestTrackerEntries172(corrupt),[]);
  assert.deepEqual(verifiedQuestTrackerEntries172(realView(),0),[]);
});
test('17.2 server says ready to turn in only after objective quota met',()=>{
  const view=realView();
  view.entries[0].objectives[0].current=3;
  view.entries[0].progressPercent=100;
  view.entries[0].statusLabel='Ready to turn in';
  const item=verifiedQuestTrackerEntries172(view)[0];
  assert.equal(item.readyToTurnIn,true);
  assert.equal(item.current,3);
});
test('17.2 account/character change immediately erases the previous private view',async()=>{
  const h=makeHarness(),session=h.create(),end=session.start();
  await flush();
  assert.equal(session.getSnapshot().status,'verified');
  h.setIdentity('account-B|character-B');
  assert.equal(session.getSnapshot().view,null);
  assert.equal(session.getSnapshot().status,'loading');
  await flush();
  assert.equal(session.getSnapshot().status,'verified');
  assert(h.resetCount>=2);
  end();
});
test('17.2 stale first-account response cannot overwrite second-account state',async()=>{
  const h=makeHarness();
  let resolveOld;
  h.queue(new Promise(r=>resolveOld=r));
  const session=h.create(),end=session.start();
  await flush();
  h.setIdentity('account-B|character-B');
  await flush();
  assert.equal(session.getSnapshot().status,'verified');
  resolveOld({ok:true,view:{...realView(),entries:[{id:'forged'}]}});
  await flush();
  assert.equal(session.getSnapshot().view.entries[0].id,'axe_q_first_patrol');
  end();
});
test('17.2 repeated refresh while pending makes only one backend request',async()=>{
  const h=makeHarness();let resolveRead;
  h.queue(new Promise(r=>resolveRead=r));
  const session=h.create(),end=session.start();
  await flush();
  const p1=session.refresh(),p2=session.refresh();
  assert.equal(p1,p2);
  assert.equal(h.fetches,1);
  resolveRead({ok:true,view:h.view});
  await p1;
  assert.equal(session.getSnapshot().status,'verified');
  await h.runTimer();
  assert.equal(h.fetches,2);
  end();
});
test('17.2 rejected and malformed backend responses hide local quest data',async()=>{
  const h=makeHarness(),session=h.create(),end=session.start();
  await flush();
  h.queue({ok:false});
  await session.refresh();
  assert.equal(session.getSnapshot().status,'unavailable');
  assert.equal(session.getSnapshot().view,null);
  h.queue(Promise.reject(Error('offline')));
  await session.refresh();
  assert.equal(session.getSnapshot().status,'unavailable');
  assert.equal(session.getSnapshot().rewardsIssued,false);
  end();
});
test('17.2 stopping unmount discards pending replies and removes subscriptions/timers',async()=>{
  const h=makeHarness();let release;
  h.queue(new Promise(r=>release=r));
  const session=h.create(),end=session.start();
  await flush();
  assert(h.subscribed);
  end();
  assert(!h.subscribed);
  assert.equal(h.stopped,20000);
  release({ok:true,view:h.view});
  await flush();
  assert.equal(session.getSnapshot().status,'loading');
  assert.equal(session.getSnapshot().view,null);
});
test('17.2 multiple mount subscribers do not double-read or prematurely stop',async()=>{
  const h=makeHarness(),session=h.create();
  const one=session.start(),two=session.start();
  await flush();
  assert.equal(h.fetches,1);
  one();assert(h.subscribed);
  two();assert.equal(h.subscribed,false);
});
