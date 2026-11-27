// R145 disposable SQLite fixture; no production imports or real player data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
const scope = JSON.stringify(['fixture-owner','hero']);
const alt = JSON.stringify(['fixture-owner','alt']);
const initial = () => ({revision:0, gold:10, materials:['m1','m2'], gear:{a:0,b:0,c:0}, receipts:{}});
function open(path) { const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=3000; PRAGMA synchronous=FULL');return db; }
function read(db,s=scope) { return JSON.parse(db.prepare('SELECT body FROM saves WHERE scope=?').get(s).body); }
function write(db,s,state) { db.prepare('UPDATE saves SET body=? WHERE scope=?').run(JSON.stringify(state),s); }
function setup(t,patch={}) {const dir=mkdtempSync(join(tmpdir(),'r145-')),path=join(dir,'fixture.sqlite'),db=open(path);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE saves(scope TEXT PRIMARY KEY,body TEXT NOT NULL)');for(const s of [scope,alt])db.prepare('INSERT INTO saves VALUES(?,?)').run(s,JSON.stringify({...initial(),...patch}));t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return {db,path};}
const req=(patch={})=>({id:'tx1',service:'combine',target:'a',donor:'b',revision:0,...patch});
// Synthetic costs and success outcomes; principal and scope are trusted harness inputs.
function attempt(db,principal,s,q,fault='') {
  if(principal!==s)return {status:'unauthorized'};
  if(!q||!/^tx[0-9]+$/.test(q.id)||!['combine','stage','reinforcement'].includes(q.service)||!Number.isSafeInteger(q.revision)||q.revision<0||Object.keys(q).some(k=>!['id','service','target','donor','revision'].includes(k)))return {status:'invalid'};
  try {
    db.exec('BEGIN IMMEDIATE');const state=read(db,s);
    const refuse=status=>{db.exec('ROLLBACK');return {status};};
    const signature=JSON.stringify([q.service,q.target,q.donor??null]);const prior=state.receipts[q.id];
    if(prior){if(prior.signature!==signature)return refuse('id_conflict');db.exec('ROLLBACK');return {status:'replayed',receipt:prior};}
    if(state.revision!==q.revision)return refuse('conflict');
    const needsDonor=q.service!=='reinforcement';
    if(!Object.hasOwn(state.gear,q.target)|| (needsDonor&&(!Object.hasOwn(state.gear,q.donor)||q.target===q.donor))||(!needsDonor&&q.donor!=null))return refuse('invalid_item');
    if(state.gold<2||!state.materials.length)return refuse('insufficient');
    state.gold-=2;const spent=state.materials.shift();state.gear[q.target]++;if(needsDonor)delete state.gear[q.donor];state.revision++;
    const receipt={signature,spent,consumed:needsDonor?q.donor:null,revision:state.revision};state.receipts[q.id]=receipt;write(db,s,state);
    if(fault==='before')throw Error('injected');db.exec('COMMIT');return fault==='after'?{status:'reply_lost'}:{status:'committed',receipt};
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');if((e.errcode&255)===5||(e.errcode&255)===6)return {status:'busy'};if(e.message==='injected')return {status:'write_failed'};throw e;}
}
async function race(path,requests){
  const gate=new SharedArrayBuffer(4),flag=new Int32Array(gate);let workers=[];
  try { const ready=await Promise.all(requests.map(({s=scope,q,fault=''})=>new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:{path,s,q,fault,gate}});workers.push(w);let result;const done=new Promise((ok,bad)=>{w.on('message',m=>{if(m.ready)resolve({done});else result=m;});w.on('error',e=>{reject(e);bad(e);});w.on('exit',code=>{if(code===0&&result)ok(result);else {const e=Error('worker exit '+code);reject(e);bad(e);}});});done.catch(()=>{});})));Atomics.store(flag,0,1);Atomics.notify(flag,0);return await Promise.all(ready.map(x=>x.done));}finally{await Promise.all(workers.map(w=>w.terminate()));}
}
if(!isMainThread){const {path,s,q,fault,gate}=workerData;const db=open(path);try{parentPort.postMessage({ready:true});if(Atomics.wait(new Int32Array(gate),0,0,5000)==='timed-out')throw Error('start timeout');parentPort.postMessage(attempt(db,s,s,q,fault));}finally{db.close();}}
else {
  test('identical simultaneous request has one debit and identical receipt',async t=>{const {db,path}=setup(t);const results=await race(path,[{q:req()},{q:req()}]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','replayed']);assert.deepEqual(results[0].receipt,results[1].receipt);assert.equal(read(db).gold,8);assert.equal(read(db).revision,1);});
  test('different targets compete for same donor across services',async t=>{const {db,path}=setup(t);const q=req({id:'tx2',service:'stage',target:'c'});const results=await race(path,[{q:req()},{q}]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','conflict']);const loser=results[0].status==='conflict'?req():q;assert.equal(attempt(db,scope,scope,{...loser,revision:1}).status,'invalid_item');assert.equal(read(db).gear.b,undefined);assert.equal(read(db).gold,8);});
  test('different items compete for final material, retry cannot overspend',async t=>{const {db,path}=setup(t,{materials:['m1']});const p=req({service:'reinforcement',donor:null}),q={...p,id:'tx2',target:'c'};const results=await race(path,[{q:p},{q}]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','conflict']);const loser=results[0].status==='conflict'?p:q;assert.equal(attempt(db,scope,scope,{...loser,revision:1}).status,'insufficient');assert.deepEqual(read(db).materials,[]);assert.equal(read(db).gold,8);});
  test('different scopes can reuse transaction and donor labels safely',async t=>{const {db,path}=setup(t);const results=await race(path,[{q:req()},{s:alt,q:req()}]);assert.ok(results.every(x=>x.status==='committed'));assert.equal(read(db,scope).revision,1);assert.equal(read(db,alt).revision,1);assert.equal(attempt(db,alt,scope,req()).status,'unauthorized');});
  test('same request ID with different intent cannot consume second donor',async t=>{const {db,path}=setup(t);const results=await race(path,[{q:req()},{q:req({target:'c',service:'stage'})}]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','id_conflict']);assert.equal(read(db).gold,8);assert.equal(Object.keys(read(db).receipts).length,1);});
  test('precommit failure leaves contender able to commit',async t=>{const {db,path}=setup(t);const results=await race(path,[{q:req(),fault:'before'},{q:req()}]);assert.ok(results.some(x=>x.status==='committed'));assert.ok(results.some(x=>['write_failed','replayed'].includes(x.status)));assert.equal(read(db).revision,1);assert.equal(read(db).gold,8);});
  test('lost reply recovered from separate connection after later upgrade',async t=>{const {db,path}=setup(t);const q=req({service:'reinforcement',donor:null});const [result]=await race(path,[{q,fault:'after'}]);assert.equal(result.status,'reply_lost');assert.equal(attempt(db,scope,scope,{...q,id:'tx2',revision:1}).status,'committed');const other=open(path);try{const s=read(other);assert.equal(attempt(other,scope,scope,q).status,'replayed');assert.deepEqual(read(other),s);assert.equal(s.gold,6);}finally{other.close();}});
  test('held writer lock returns busy without mutation; retry succeeds',t=>{const {db,path}=setup(t);const other=open(path);other.exec('PRAGMA busy_timeout=30');try{db.exec('BEGIN IMMEDIATE');assert.equal(attempt(other,scope,scope,req()).status,'busy');assert.deepEqual(read(other),initial());db.exec('ROLLBACK');assert.equal(attempt(other,scope,scope,req()).status,'committed');}finally{if(db.isTransaction)db.exec('ROLLBACK');other.close();}});
  test('noncompeting operations retry at new revision with distinct receipts',async t=>{const {db,path}=setup(t);const p=req({service:'reinforcement',donor:null}),q={...p,id:'tx2',target:'c'};const results=await race(path,[{q:p},{q}]);const loser=results[0].status==='conflict'?p:q;assert.equal(attempt(db,scope,scope,{...loser,revision:1}).status,'committed');const s=read(db);assert.equal(s.revision,2);assert.equal(s.gear.a,1);assert.equal(s.gear.c,1);assert.equal(new Set(Object.values(s.receipts).map(x=>x.spent)).size,2);});
}
