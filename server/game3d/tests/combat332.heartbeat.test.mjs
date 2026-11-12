import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAccountHeartbeat330} from '../privateAccountHeartbeat330.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const wait=async(check,timeoutMs=800)=>{
 const start=Date.now();
 while(Date.now()-start<timeoutMs){
  if(check())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('heartbeat did not reach expected state');
};
test('32.9 heartbeat is opt-in and requires interval much shorter than TTL',()=>{
 assert.throws(()=>createPrivateAccountHeartbeat330(),/32.9/);
 assert.throws(()=>createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:600,ttlMs:1000,renew:async()=>true,onFailure:()=>{}}),/32.9/);
 const heartbeat=createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:100,ttlMs:1000,renew:async()=>true,onFailure:()=>{}});
 assert.equal(heartbeat.snapshot().active,false);
 assert.equal(heartbeat.stop(),true);
 assert.equal(heartbeat.start(),false);
});
test('32.9 timer renews exactly once at a time and can stop cleanly',async()=>{
 let calls=0,stopped=false;
 const heartbeat=createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:100,ttlMs:1000,
  renew:async()=>{calls++;return true},onFailure:()=>{stopped=true}});
 assert.equal(heartbeat.start(),true);
 assert.equal(heartbeat.start(),false);
 await wait(()=>calls>=2);
 assert.equal(heartbeat.snapshot().active,true);
 assert.equal(heartbeat.stop(),true);
 assert.equal(heartbeat.stop(),false);
 const old=calls;
 await new Promise(resolve=>setTimeout(resolve,130));
 assert.equal(calls,old);
 assert.equal(stopped,false);
});
test('33.0 a denied renewal invokes shutdown exactly once and never repeats',async()=>{
 let attempts=0,failed=0;
 const heartbeat=createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:100,ttlMs:1000,
  renew:async()=>{attempts++;return false},onFailure:()=>{failed++}});
 assert.equal(heartbeat.start(),true);
 await wait(()=>failed===1);
 assert.equal(heartbeat.snapshot().active,false);
 await new Promise(resolve=>setTimeout(resolve,130));
 assert.equal(attempts,1);
 assert.equal(failed,1);
});
test('33.0 staging authorization disappears before timer starts',()=>{
 let shutdowns=0;
 const heartbeat=createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:100,ttlMs:1000,
  renew:async()=>true,onFailure:()=>{shutdowns++}});
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(heartbeat.start(),false)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(heartbeat.snapshot().active,false);
 assert.equal(shutdowns,1);
});
