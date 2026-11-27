// R141 disposable SQLite reference. Not a production adapter or authorization service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
const principal = { owner: 'fixture-owner', character: 'fixture-hero', authority: 'fixture' };
const scope = JSON.stringify([principal.owner, principal.character]);
const clone = structuredClone;
const initial = () => ({ cycle: 0, cap: 2, items: [], receipts: [], earned: [0] });
function open(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000');
  return db;
}
function read(db) {
  const row = db.prepare('SELECT revision, body FROM saves WHERE scope=?').get(scope);
  return { revision: row.revision, body: JSON.parse(row.body) };
}
function mutate(db, actor, expected, change, fault = '') {
  if (!actor || actor.owner !== principal.owner || actor.character !== principal.character || actor.authority !== 'fixture') return { status: 'unauthorized' };
  db.exec('BEGIN IMMEDIATE');
  try {
    const { revision, body } = read(db);
    const result = change(body);
    if (!result.changed) { db.exec('ROLLBACK'); return result; }
    if (expected !== revision) { db.exec('ROLLBACK'); return { status: 'conflict' }; }
    const write = db.prepare('UPDATE saves SET revision=revision+1, body=? WHERE scope=? AND revision=?').run(JSON.stringify(body), scope, revision);
    if (write.changes !== 1) throw Error('CAS failed');
    if (fault === 'beforeCommit') throw Error('injected failure');
    db.exec('COMMIT');
    return fault === 'lostReply' ? { status: 'reply_lost' } : result;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); return { status: 'write_failed', reason: error.message }; }
}
function claim(db, actor, expected, { resume = null, fault = '' } = {}) {
  return mutate(db, actor, expected, body => {
    // The fixture has one catalog-defined cycle reward. Resume only a recorded receipt.
    const key = resume ?? JSON.stringify([scope, 'fixture-trial', body.cycle]);
    let receipt = body.receipts.find(r => r.key === key);
    if (receipt?.status === 'committed') return { status: 'already_claimed', receipt: clone(receipt) };
    if (!receipt && (resume !== null || !body.earned.includes(body.cycle))) return { status: 'ineligible' };
    const fresh = !receipt;
    if (fresh) { receipt = { key, cycle: body.cycle, status: 'pending', id: JSON.stringify([key, 0]) }; body.receipts.push(receipt); }
    if (body.items.length >= body.cap) return { status: 'pending', receipt: clone(receipt), changed: fresh };
    body.items.push(receipt.id); receipt.status = 'committed';
    return { status: 'committed', receipt: clone(receipt), changed: true };
  }, fault);
}
function setup(t, body = initial()) {
  const dir = mkdtempSync(join(tmpdir(), 'r141-'));
  const path = join(dir, 'fixture.sqlite'); const db = open(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE saves(scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)');
  db.prepare('INSERT INTO saves VALUES(?,?,?)').run(scope, 0, JSON.stringify(body));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, path };
}
function edit(db, fn) { return mutate(db, principal, read(db).revision, body => { fn(body); return { status: 'edited', changed: true }; }); }
function runWorker(path) { return new Promise((resolve, reject) => {
  const w = new Worker(new URL(import.meta.url), { workerData: path });
  let result; w.on('message', value => { result = value; }); w.on('error', reject);
  w.on('exit', code => code === 0 ? resolve(result) : reject(Error('worker failed')));
}); }
async function project(captured, getActive, load, commitScoped, notify, seen) {
  const snapshot = await load();
  const active = getActive();
  if (!active || active.scope !== captured.scope || active.generation !== captured.generation) return 'stale';
  if (!snapshot || snapshot.scope !== captured.scope) return 'invalid';
  // Synchronous scoped commit contract: reject older revisions and recheck identity at write.
  if (!commitScoped(captured, snapshot)) return 'not_applied';
  if (snapshot.event && !seen.has(snapshot.event)) { seen.add(snapshot.event); notify(snapshot.event); }
  return 'applied';
}
if (!isMainThread) {
  const db = open(workerData); try { parentPort.postMessage(claim(db, principal, 0)); } finally { db.close(); }
} else {
  test('two worker connections converge on one committed receipt', async t => { const {db,path}=setup(t); const results=await Promise.all([runWorker(path),runWorker(path)]); assert.deepEqual(results.map(r=>r.status).sort(),['already_claimed','committed']); assert.deepEqual(results[0].receipt,results[1].receipt); assert.equal(read(db).body.items.length,1); assert.equal(read(db).revision,1); });
  test('stale revision cannot create a new pending receipt', t => { const {db}=setup(t); edit(db,b=>{b.cap=0}); assert.equal(claim(db,principal,0).status,'conflict'); assert.equal(read(db).body.receipts.length,0); });
  test('failure before commit rolls back both item and receipt', t => { const {db}=setup(t); assert.equal(claim(db,principal,0,{fault:'beforeCommit'}).status,'write_failed'); assert.deepEqual(read(db),{revision:0,body:initial()}); });
  test('lost reply reconciles from reopened database', t => { const {db,path}=setup(t); assert.equal(claim(db,principal,0,{fault:'lostReply'}).status,'reply_lost'); const other=open(path); try { assert.equal(claim(other,principal,0).status,'already_claimed'); assert.equal(read(other).body.items.length,1); } finally {other.close();} });
  test('pending receipt survives new cycle and resumes exact prior item', t => { const s=initial();s.cap=0;const {db}=setup(t,s);const a=claim(db,principal,0);assert.equal(a.status,'pending');edit(db,b=>{b.cycle=1;b.cap=2});assert.equal(claim(db,principal,2).status,'ineligible');const b=claim(db,principal,2,{resume:a.receipt.key});assert.equal(b.status,'committed');assert.equal(b.receipt.id,a.receipt.id);assert.equal(b.receipt.cycle,0); });
  test('unknown resume and wrong owner cannot mint or read receipt', t => { const {db}=setup(t);const a=claim(db,principal,0);assert.equal(claim(db,{...principal,owner:'other'},1,{resume:a.receipt.key}).status,'unauthorized');assert.equal(claim(db,principal,1,{resume:'fake'}).status,'ineligible');assert.equal(read(db).body.items.length,1); });
  test('consumed item is not restored by receipt replay', t => { const {db}=setup(t);const a=claim(db,principal,0);edit(db,b=>{b.items=[]});assert.equal(claim(db,principal,2,{resume:a.receipt.key}).status,'already_claimed');assert.equal(read(db).body.items.length,0); });
  test('new cycle requires new trusted evidence', t => { const {db}=setup(t);const a=claim(db,principal,0);edit(db,b=>{b.cycle=1;b.earned.push(1)});const b=claim(db,principal,2);assert.equal(b.status,'committed');assert.notEqual(a.receipt.id,b.receipt.id); });
  test('identity changes during asynchronous load suppress write and toast', async () => { const captured={scope,generation:1};let active=captured;const result=await project(captured,()=>active,async()=>{active={scope,generation:2};return {scope,revision:1,event:'e'}},()=>assert.fail('write'),()=>assert.fail('toast'),new Set());assert.equal(result,'stale'); });
  test('wrong snapshot scope is rejected', async () => { const c={scope,generation:1};assert.equal(await project(c,()=>c,async()=>({scope:'other',revision:1}),()=>assert.fail('write'),()=>assert.fail('toast'),new Set()),'invalid'); });
  test('out of order snapshots and repeated notifications', async () => { const c={scope,generation:1};let revision=-1,events=0;const seen=new Set();const write=(id,s)=>{if(id!==c||s.revision<revision)return false;revision=s.revision;return true};const apply=r=>project(c,()=>c,async()=>({scope,revision:r,event:'e'}),write,()=>events++,seen);assert.equal(await apply(2),'applied');assert.equal(await apply(1),'not_applied');assert.equal(await apply(2),'applied');assert.equal(events,1); });
}
