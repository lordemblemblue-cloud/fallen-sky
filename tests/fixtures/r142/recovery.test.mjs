// Isolated synthetic SQLite recovery reference; no production imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scope = 'synthetic-character';
function open(path) { const db = new DatabaseSync(path); db.exec('PRAGMA busy_timeout=50; PRAGMA synchronous=FULL'); return db; }
function read(db) { return db.prepare('SELECT * FROM saves WHERE owner=?').get(scope); }
function claim(db, key='trial', crash='') {
  let began = false;
  try {
    db.exec('BEGIN IMMEDIATE'); began = true;
    const prior = db.prepare('SELECT item FROM receipts WHERE owner=? AND reward=?').get(scope,key);
    if (prior) { db.exec('ROLLBACK'); return 'already_claimed'; }
    const item = JSON.stringify([scope,key]);
    db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(scope,key,item);
    db.prepare('INSERT INTO inventory VALUES(?,?)').run(scope,item);
    db.prepare('UPDATE saves SET revision=revision+1 WHERE owner=?').run(scope);
    if (crash==='before') process.kill(process.pid,'SIGKILL');
    db.exec('COMMIT'); began = false;
    if (crash==='after') process.kill(process.pid,'SIGKILL');
    return 'committed';
  } catch (e) {
    if (began && db.isTransaction) db.exec('ROLLBACK');
    if (e.errcode===5 || e.errcode===6) return 'busy';
    throw e;
  }
}
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'r142-')); const path=join(dir,'test.sqlite'); const db=open(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE saves(owner TEXT PRIMARY KEY, revision INTEGER, label TEXT); CREATE TABLE receipts(owner TEXT,reward TEXT,item TEXT,PRIMARY KEY(owner,reward)); CREATE TABLE inventory(owner TEXT,item TEXT,PRIMARY KEY(owner,item));');
  db.prepare('INSERT INTO saves VALUES(?,?,?)').run(scope,0,'original');
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});}); return {db,path};
}
function count(db,table) { return db.prepare('SELECT count(*) AS n FROM '+table+' WHERE owner=?').get(scope).n; }
function crashChild(path,when) { const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',path,when],{timeout:5000}); assert.equal(result.signal,'SIGKILL',String(result.stderr)); }
// Conservative backup policy for fixture only: metadata restore never rewinds inventory/ledger.
function restoreLabel(db,backup,expected) {
  if (!backup || backup.owner!==scope || typeof backup.label!=='string' || backup.label.length>100) return 'invalid';
  const updated=db.prepare('UPDATE saves SET label=?,revision=revision+1 WHERE owner=? AND revision=?').run(backup.label,scope,expected);
  return updated.changes===1?'restored_metadata':'conflict';
}
if(process.argv[2]==='--child') { const db=open(process.argv[3]);claim(db,'trial',process.argv[4]);db.close();process.exit(2); }
else {
  test('bounded lock contention returns busy, then retry succeeds',t=>{const {db,path}=setup(t);const other=open(path);try{db.exec('BEGIN IMMEDIATE');assert.equal(claim(other),'busy');assert.equal(count(other,'receipts'),0);db.exec('ROLLBACK');assert.equal(claim(other),'committed');assert.equal(count(db,'inventory'),1);}finally{if(db.isTransaction)db.exec('ROLLBACK');other.close();}});
  test('SIGKILL before commit leaves no item, receipt or revision',t=>{const {db,path}=setup(t);crashChild(path,'before');const other=open(path);try{assert.equal(count(other,'inventory'),0);assert.equal(count(other,'receipts'),0);assert.equal(read(other).revision,0);assert.equal(claim(other),'committed');}finally{other.close();}});
  test('SIGKILL after commit preserves exact grant across reopen',t=>{const {db,path}=setup(t);crashChild(path,'after');const other=open(path);try{assert.equal(count(other,'inventory'),1);assert.equal(count(other,'receipts'),1);assert.equal(read(other).revision,1);assert.equal(claim(other),'already_claimed');assert.equal(count(other,'inventory'),1);}finally{other.close();}});
  test('old metadata backup does not resurrect spent reward',t=>{const {db}=setup(t);const backup=read(db);assert.equal(claim(db),'committed');db.prepare('DELETE FROM inventory WHERE owner=?').run(scope);assert.equal(restoreLabel(db,backup,1),'restored_metadata');assert.equal(count(db,'inventory'),0);assert.equal(count(db,'receipts'),1);assert.equal(claim(db),'already_claimed');});
  test('stale restore revision and mismatched owner are refused',t=>{const {db}=setup(t);const backup=read(db);claim(db);assert.equal(restoreLabel(db,backup,0),'conflict');assert.equal(restoreLabel(db,{...backup,owner:'other'},1),'invalid');assert.equal(read(db).revision,1);assert.equal(count(db,'inventory'),1);});
  test('metadata restore cannot apply backup inventory or ledger fields',t=>{const {db}=setup(t);const backup={...read(db),items:['fake'],receipts:[]};claim(db);assert.equal(restoreLabel(db,backup,1),'restored_metadata');assert.equal(count(db,'inventory'),1);assert.equal(count(db,'receipts'),1);assert.equal(read(db).revision,2);});
}
