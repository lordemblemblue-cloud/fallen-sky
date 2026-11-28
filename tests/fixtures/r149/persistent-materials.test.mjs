// R149: disposable SQLite reference, never a live game authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const scope='fixture/hero', alt='fixture/alt';
const encode=JSON.stringify, decode=JSON.parse;
const open=path=>{const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=3000; PRAGMA synchronous=FULL');return db;};
const read=(db,s=scope)=>decode(db.prepare('SELECT body FROM state WHERE scope=?').get(s).body);
const write=(db,s,v)=>db.prepare('UPDATE state SET body=? WHERE scope=?').run(encode(v),s);
function tx(db,s,actor,fn,fault=''){
  if(actor!==s)return {status:'unauthorized'};
  try{db.exec('BEGIN IMMEDIATE');const v=read(db,s),result=fn(v);
    if(!result.changed){db.exec('ROLLBACK');return result;}
    write(db,s,v);if(fault==='before')throw Error('injected');db.exec('COMMIT');
    return fault==='after'?{status:'reply_lost'}:result;
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');if(e.message==='injected')return {status:'write_failed'};if([5,6].includes(e.errcode&255))return {status:'busy'};throw e;}
}
function migrate(db,s,actor,fault='') {return tx(db,s,actor,v=>{
  if(v.migrated)return {status:'ready'};
  if(v.units.some(u=>v.historical.includes(u.dropId)))return {status:'review_required'};
  v.units=v.units.map((u,i)=>({...u,unitId:encode([s,'legacy',i])}));v.migrated=true;v.revision++;
  return {status:'ready',changed:true};
},fault);}
// Trusted evidence/receipt supplied by harness, not browser-selected material grants.
function mutate(db,s,actor,q,fault='') {return tx(db,s,actor,v=>{
  if(!v.migrated)return {status:'migration_required'};
  if(q.epoch!==v.epoch)return {status:'wrong_epoch'};
  if(!['acquire','debit'].includes(q.kind)||typeof q.id!=='string'||!q.id||!Array.isArray(q.ids)||!q.ids.length||q.ids.some(x=>typeof x!=='string'||!x)||new Set(q.ids).size!==q.ids.length)return {status:'invalid'};
  const signature=encode([q.kind,[...q.ids].sort()]);const prior=v.receipts.find(r=>r.epoch===q.epoch&&r.id===q.id);
  if(prior)return prior.signature===signature?{status:'replayed',receipt:prior}:{status:'receipt_conflict'};
  if(q.revision!==v.revision)return {status:'conflict'};
  if(q.kind==='acquire'){
    // Only the synthetic trusted source may name occurrences; retained acquisition history survives restore.
    if(q.ids.some(id=>v.acquired.includes(id)))return {status:'already_acquired'};
    for(const id of q.ids){v.acquired.push(id);v.units.push({dropId:id,unitId:encode([s,'acquired',id])});}
  }else{const owned=new Set(v.units.map(u=>u.unitId));if(q.ids.some(id=>!owned.has(id)))return {status:'missing_unit'};v.units=v.units.filter(u=>!q.ids.includes(u.unitId));}
  v.revision++;const receipt={id:q.id,epoch:q.epoch,signature};v.receipts.push(receipt);return {status:'committed',receipt,changed:true};
},fault);}
function backup(db,s,actor,id){return tx(db,s,actor,v=>{
  if(!v.migrated)return {status:'migration_required'};if(v.backups.some(b=>b.id===id))return {status:'exists'};
  v.backups.push({id,units:structuredClone(v.units),epoch:v.epoch});v.revision++;return {status:'saved',changed:true};
});}
// Candidate policy only: explicit restore of trusted snapshot, new epoch, old receipts kept.
// Post-backup acquisitions are not silently restored; production discovery redelivery is separate.
function restore(db,s,actor,id,epoch,revision,fault=''){return tx(db,s,actor,v=>{
  if(v.epoch!==epoch||v.revision!==revision)return {status:'conflict'};
  const b=v.backups.find(x=>x.id===id);if(!b)return {status:'missing_backup'};
  v.units=structuredClone(b.units);v.epoch++;v.revision++;return {status:'restored',changed:true};
},fault);}
function project(current,next){if(!next||current.scope!==next.scope||current.epoch!==next.epoch||next.revision<current.revision)return 'stale';if(next.revision===current.revision)return encode(current)===encode(next)?'unchanged':'divergent';return 'applied';}
function setup(t,historical=[]){const dir=mkdtempSync(join(tmpdir(),'r149-')),path=join(dir,'fixture.sqlite'),db=open(path);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(scope TEXT PRIMARY KEY, body TEXT NOT NULL)');for(const s of [scope,alt])db.prepare('INSERT INTO state VALUES(?,?)').run(s,encode({scope:s,epoch:1,revision:0,migrated:false,units:[{dropId:'dup'},{dropId:'dup'}],historical,receipts:[],acquired:[],backups:[]}));t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return {db,path};}
const q=(v,patch={})=>({epoch:v.epoch,revision:v.revision,id:'r1',kind:'debit',ids:[v.units[0].unitId],...patch});
function worker(path,request){return new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:{path,request}});let value;w.on('message',m=>{value=m;});w.on('error',reject);w.on('exit',n=>n===0&&value?resolve(value):reject(Error('worker exit '+n)));});}
if(!isMainThread){const db=open(workerData.path);try{parentPort.postMessage(mutate(db,scope,scope,workerData.request));}finally{db.close();}}
else {
 test('migration persists distinct IDs and retry does not regenerate them',t=>{const {db,path}=setup(t);assert.equal(migrate(db,scope,scope).status,'ready');const s=read(db),other=open(path);try{assert.equal(migrate(other,scope,scope).status,'ready');assert.deepEqual(read(other),s);assert.equal(new Set(s.units.map(u=>u.unitId)).size,2);}finally{other.close();}});
 test('interrupted migration rolls back; lost reply retries same IDs',t=>{const {db}=setup(t),s=read(db);assert.equal(migrate(db,scope,scope,'before').status,'write_failed');assert.deepEqual(read(db),s);assert.equal(migrate(db,scope,scope,'after').status,'reply_lost');const kept=read(db);migrate(db,scope,scope);assert.deepEqual(read(db),kept);});
 test('ambiguous historical overlap never deletes or relabels units',t=>{const {db}=setup(t,['dup']),s=read(db);assert.equal(migrate(db,scope,scope).status,'review_required');assert.deepEqual(read(db),s);});
 test('two connections replay same debit without second charge',async t=>{const {db,path}=setup(t);migrate(db,scope,scope);const r=q(read(db)),results=await Promise.all([worker(path,r),worker(path,r)]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','replayed']);assert.equal(read(db).units.length,1);assert.deepEqual(results[0].receipt,results[1].receipt);});
 test('competing debits cannot consume same occurrence twice',async t=>{const {db,path}=setup(t);migrate(db,scope,scope);const r=q(read(db)),other={...r,id:'r2'},results=await Promise.all([worker(path,r),worker(path,other)]);assert.deepEqual(results.map(x=>x.status).sort(),['committed','conflict']);const loser=results[0].status==='conflict'?r:other;assert.equal(mutate(db,scope,scope,{...loser,revision:read(db).revision}).status,'missing_unit');assert.equal(read(db).units.length,1);});
 test('lost debit reply recovers receipt after reopen',t=>{const {db,path}=setup(t);migrate(db,scope,scope);const r=q(read(db));assert.equal(mutate(db,scope,scope,r,'after').status,'reply_lost');const other=open(path);try{assert.equal(mutate(other,scope,scope,r).status,'replayed');assert.equal(read(other).units.length,1);}finally{other.close();}});
 test('trusted acquisition is unique even after consumption',t=>{const {db}=setup(t);migrate(db,scope,scope);const a=q(read(db),{kind:'acquire',ids:['event-1']});assert.equal(mutate(db,scope,scope,a).status,'committed');const s=read(db);assert.equal(mutate(db,scope,scope,q(s,{id:'r2',ids:[s.units.at(-1).unitId]})).status,'committed');assert.equal(mutate(db,scope,scope,q(read(db),{id:'r3',kind:'acquire',ids:['event-1']})).status,'already_acquired');assert.equal(read(db).units.length,2);});
 test('other character cannot migrate, acquire, debit or restore this scope',t=>{const {db}=setup(t);migrate(db,scope,scope);const s=read(db);assert.equal(migrate(db,scope,alt).status,'unauthorized');assert.equal(mutate(db,scope,alt,q(s)).status,'unauthorized');assert.equal(mutate(db,scope,alt,q(s,{kind:'acquire',ids:['event']})).status,'unauthorized');assert.equal(restore(db,scope,alt,'b',1,s.revision).status,'unauthorized');assert.deepEqual(read(db),s);});
 test('restore rolls back on failure and fences old debit receipts',t=>{const {db}=setup(t);migrate(db,scope,scope);backup(db,scope,scope,'b');const r=q(read(db));mutate(db,scope,scope,r);const s=read(db);assert.equal(restore(db,scope,scope,'b',s.epoch,s.revision,'before').status,'write_failed');assert.deepEqual(read(db),s);assert.equal(restore(db,scope,scope,'b',s.epoch,s.revision).status,'restored');const kept=read(db);assert.equal(kept.units.length,2);assert.equal(kept.epoch,2);assert.equal(mutate(db,scope,scope,r).status,'wrong_epoch');assert.equal(restore(db,scope,scope,'b',s.epoch,s.revision).status,'conflict');assert.deepEqual(read(db),kept);});
 test('explicit restore keeps acquisition history and old receipts',t=>{const {db}=setup(t);migrate(db,scope,scope);backup(db,scope,scope,'b');mutate(db,scope,scope,q(read(db),{kind:'acquire',ids:['later']}));const s=read(db);restore(db,scope,scope,'b',s.epoch,s.revision);const restored=read(db);assert.equal(restored.receipts.length,1);assert.deepEqual(restored.acquired,['later']);assert.equal(mutate(db,scope,scope,q(restored,{kind:'acquire',ids:['later']})).status,'already_acquired');});
 test('same revision divergent snapshots and stale epochs rejected',t=>{const {db}=setup(t);migrate(db,scope,scope);const s=read(db);assert.equal(project(s,structuredClone(s)),'unchanged');assert.equal(project(s,{...s,units:[]}),'divergent');assert.equal(project(s,{...s,epoch:0}),'stale');assert.equal(project(s,{...s,revision:0}),'stale');assert.equal(project(s,{...s,revision:2}),'applied');});
}
