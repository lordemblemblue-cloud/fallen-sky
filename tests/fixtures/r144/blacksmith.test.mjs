// Synthetic transaction fixture. No live game imports or policy changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const actor = 'fixture-hero';
const initial = () => ({revision:0, gold:10, materials:['m1','m2'], gear:{a:{level:0,locked:false}, b:{level:0,locked:false}, c:{level:0,locked:true}}, receipts:{}, restoring:false});
function setup(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE saves (scope TEXT PRIMARY KEY, body TEXT NOT NULL)');
  db.prepare('INSERT INTO saves VALUES (?,?)').run(actor,JSON.stringify(initial()));
  t.after(()=>db.close()); return db;
}
const read = db => JSON.parse(db.prepare('SELECT body FROM saves WHERE scope=?').get(actor).body);
const write = (db,s) => db.prepare('UPDATE saves SET body=? WHERE scope=?').run(JSON.stringify(s),actor);
const request = (patch={}) => ({id:'tx1', service:'combine', target:'a', donor:'b', revision:0,...patch});
// Outcome is injected by the trusted test harness, never the request. Costs are synthetic.
function attempt(db,who,req,outcome='success',fault=false) {
  if(who!==actor)return {status:'unauthorized'};
  if(!req || !['combine','stage','reinforcement'].includes(req.service) || typeof req.id!=='string' || !/^tx[0-9]+$/.test(req.id) || Object.keys(req).some(k=>!['id','service','target','donor','revision'].includes(k)))return {status:'invalid'};
  db.exec('BEGIN IMMEDIATE');
  try {
    const s=read(db);
    const refuse=status=>{db.exec('ROLLBACK');return {status};};
    if(s.restoring)return refuse('restoring');
    const signature=JSON.stringify([req.service,req.target,req.donor??null]);
    const prior=s.receipts[req.id];
    if(prior){if(prior.signature!==signature)return refuse('id_conflict');db.exec('ROLLBACK');return {status:'replayed',receipt:prior};}
    if(s.revision!==req.revision)return refuse('conflict');
    const donorService=req.service!=='reinforcement';
    const target=Object.hasOwn(s.gear,req.target)?s.gear[req.target]:null;
    const donor=Object.hasOwn(s.gear,req.donor)?s.gear[req.donor]:null;
    if(!target||target.locked|| (donorService&&(!donor||donor.locked||req.target===req.donor)) || (!donorService&&req.donor!=null))return refuse('invalid_item');
    if(!['success','failure'].includes(outcome))return refuse('invalid_outcome');
    if(s.gold<2||s.materials.length<1)return refuse('insufficient');
    s.gold-=2;
    const spent=s.materials.shift();
    if(outcome==='success'){target.level++;if(donorService)delete s.gear[req.donor];}
    s.revision++;
    const receipt={signature,outcome,spent,consumed:outcome==='success'&&donorService?req.donor:null,revision:s.revision};
    s.receipts[req.id]=receipt;write(db,s);
    if(fault)throw Error('injected');
    db.exec('COMMIT');return {status:'committed',receipt};
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');if(e.message==='injected')return {status:'write_failed'};throw e;}
}
test('successful combine commits cost, upgrade and donor together',t=>{const db=setup(t);const r=attempt(db,actor,request());assert.equal(r.status,'committed');const s=read(db);assert.equal(s.gold,8);assert.deepEqual(s.materials,['m2']);assert.equal(s.gear.a.level,1);assert.equal(s.gear.b,undefined);assert.equal(r.receipt.consumed,'b');});
test('failed combine retains donor and target; records synthetic cost',t=>{const db=setup(t);assert.equal(attempt(db,actor,request(),'failure').receipt.outcome,'failure');assert.equal(read(db).gear.a.level,0);assert.ok(read(db).gear.b);assert.equal(read(db).gold,8);});
test('ascension success uses donor once',t=>{const db=setup(t);const q=request({service:'stage'});assert.equal(attempt(db,actor,q).status,'committed');assert.equal(attempt(db,actor,request({id:'tx2',service:'stage',revision:1})).status,'invalid_item');});
test('reinforcement uses no donor',t=>{const db=setup(t);assert.equal(attempt(db,actor,request({service:'reinforcement',donor:null})).status,'committed');assert.ok(read(db).gear.b);});
test('protected donor, protected target and self-donor refused',t=>{const db=setup(t);for(const patch of [{donor:'c'},{target:'c'},{donor:'a'}])assert.equal(attempt(db,actor,request(patch)).status,'invalid_item');assert.deepEqual(read(db),initial());});
test('unknown target, unknown donor and wrong service refused',t=>{const db=setup(t);assert.equal(attempt(db,actor,request({target:'missing'})).status,'invalid_item');assert.equal(attempt(db,actor,request({donor:'missing'})).status,'invalid_item');assert.equal(attempt(db,actor,request({service:'unknown'})).status,'invalid');assert.deepEqual(read(db),initial());});
test('insufficient materials cannot partially charge gold',t=>{const db=setup(t);const s=read(db);s.materials=[];write(db,s);assert.equal(attempt(db,actor,request()).status,'insufficient');assert.deepEqual(read(db),s);});
test('injected write failure rolls back all costs, items and receipt',t=>{const db=setup(t);assert.equal(attempt(db,actor,request(),'success',true).status,'write_failed');assert.deepEqual(read(db),initial());assert.equal(attempt(db,actor,request()).status,'committed');});
test('replay after a later upgrade returns original receipt without debit',t=>{const db=setup(t);const q=request({service:'reinforcement',donor:null});const a=attempt(db,actor,q);assert.equal(attempt(db,actor,{...q,id:'tx2',revision:1}).status,'committed');const s=read(db);assert.deepEqual(attempt(db,actor,q),{status:'replayed',receipt:a.receipt});assert.deepEqual(read(db),s);});
test('transaction id cannot be reused for different intent',t=>{const db=setup(t);attempt(db,actor,request());const s=read(db);assert.equal(attempt(db,actor,request({service:'stage'})).status,'id_conflict');assert.deepEqual(read(db),s);});
test('stale revision, wrong character and client outcome override rejected',t=>{const db=setup(t);assert.equal(attempt(db,actor,request({revision:9})).status,'conflict');assert.equal(attempt(db,'other',request()).status,'unauthorized');assert.equal(attempt(db,actor,request({outcome:'success'})).status,'invalid');assert.deepEqual(read(db),initial());});
test('restore interlock blocks upgrades until reconciliation completes',t=>{const db=setup(t);const s=read(db);s.restoring=true;write(db,s);assert.equal(attempt(db,actor,request()).status,'restoring');assert.deepEqual(read(db),s);s.restoring=false;s.revision++;write(db,s);assert.equal(attempt(db,actor,request()).status,'conflict');assert.equal(attempt(db,actor,request({revision:1})).status,'committed');});
