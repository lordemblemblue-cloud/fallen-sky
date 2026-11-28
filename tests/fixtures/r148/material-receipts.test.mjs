// R148 isolated reference; inputs are trusted server fixture data, not client grants.
import test from 'node:test';
import assert from 'node:assert/strict';
const copy = structuredClone;
const scope = 'fixture-owner/hero';
const unit = (dropId, id='stone') => ({dropId,id});
function migrate(units, historicalSpent, namespace) {
  const historical = new Set(historicalSpent);
  if (units.some(u => historical.has(u.dropId))) return {status:'review_required',units:copy(units)};
  // Assign once on a verified server snapshot, persist atomically, never regenerate on upload.
  return {status:'ready',units:units.map((u,i)=>({...u,unitId:JSON.stringify([namespace,i])}))};
}
const initial = () => ({scope,epoch:1,revision:0,units:migrate([unit('dup'),unit('dup'),unit('other')],[],'fixture-v1').units,receipts:[]});
const request = (s, patch={}) => ({scope:s.scope,epoch:s.epoch,revision:s.revision,receiptId:'r1',unitIds:[s.units[0].unitId],...patch});
function debit(state, trustedReceipt) {
  const r=trustedReceipt, refuse=status=>({status,state});
  if (!r || r.scope!==state.scope || r.epoch!==state.epoch) return refuse('wrong_scope');
  if (typeof r.receiptId!=='string'||!r.receiptId||!Array.isArray(r.unitIds)||!r.unitIds.length||r.unitIds.some(id=>typeof id!=='string')||new Set(r.unitIds).size!==r.unitIds.length) return refuse('invalid');
  const signature=JSON.stringify([...r.unitIds].sort());
  const previous=state.receipts.find(x=>x.id===r.receiptId);
  if(previous) return previous.signature===signature?{status:'replayed',state,receipt:copy(previous)}:refuse('receipt_conflict');
  if(r.revision!==state.revision) return refuse('revision_conflict');
  const available=new Set(state.units.map(u=>u.unitId));
  if(available.size!==state.units.length||r.unitIds.some(id=>!available.has(id))) return refuse('missing_unit');
  const next=copy(state), wanted=new Set(r.unitIds);
  next.units=next.units.filter(u=>!wanted.has(u.unitId));
  const receipt={id:r.receiptId,signature,unitIds:[...r.unitIds]};
  next.receipts.push(receipt);next.revision++;
  return {status:'committed',state:next,receipt:copy(receipt)};
}
// A save projection consumes the current scoped server snapshot, never reapplies debit receipts.
function project(current, snapshot) {
  if(!snapshot||current.scope!==snapshot.scope||current.epoch!==snapshot.epoch||snapshot.revision<current.revision) return {status:'stale',state:current};
  return {status:'applied',state:copy(snapshot)};
}
test('legacy duplicate units retain count and distinct canonical IDs',()=>{const s=initial();assert.equal(s.units.length,3);assert.equal(new Set(s.units.map(x=>x.unitId)).size,3);assert.equal(s.units.filter(x=>x.dropId==='dup').length,2);});
test('historically spent overlapping legacy IDs require review, no loss',()=>{const units=[unit('dup'),unit('dup')];assert.deepEqual(migrate(units,['dup'],'v'),{status:'review_required',units});});
test('even one overlapping historical ID is ambiguous',()=>{assert.equal(migrate([unit('dup')],['dup'],'v').status,'review_required');});
test('nonoverlapping historical IDs do not prevent preserving inventory',()=>{const units=[unit('dup'),unit('dup')];assert.equal(migrate(units,['gone'],'v').units.length,2);});
test('one exact debit and repeated receipt preserve the other legacy duplicate',()=>{const s=initial(),r=request(s),a=debit(s,r),b=debit(a.state,r);assert.equal(a.status,'committed');assert.equal(b.status,'replayed');assert.equal(b.state.units.filter(x=>x.dropId==='dup').length,1);assert.equal(b.state.revision,1);assert.deepEqual(b.receipt,a.receipt);assert.equal(s.units.length,3);});
test('same receipt with different unit is refused',()=>{const s=initial(),r=request(s),a=debit(s,r);assert.equal(debit(a.state,{...r,unitIds:[s.units[1].unitId]}).status,'receipt_conflict');});
test('missing exact unit never substitutes another same-material unit',()=>{const s=initial(),a=debit(s,request(s));const b=debit(a.state,request(a.state,{receiptId:'r2',unitIds:[s.units[0].unitId]}));assert.equal(b.status,'missing_unit');assert.deepEqual(b.state,a.state);});
test('multi-unit debit is all or nothing',()=>{const s=initial(),r=request(s,{unitIds:[s.units[0].unitId,'missing']});assert.equal(debit(s,r).status,'missing_unit');assert.equal(s.units.length,3);assert.equal(debit(s,request(s,{unitIds:[s.units[0].unitId,s.units[1].unitId]})).state.units.length,1);});
test('duplicate target IDs and stale revision are refused',()=>{const s=initial(),id=s.units[0].unitId;assert.equal(debit(s,request(s,{unitIds:[id,id]})).status,'invalid');assert.equal(debit(s,request(s,{revision:1})).status,'revision_conflict');});
test('different character and old restore epoch cannot apply receipts',()=>{const s=initial(),r=request(s);assert.equal(debit(s,{...r,scope:'other'}).status,'wrong_scope');assert.equal(debit({...s,epoch:2},r).status,'wrong_scope');});
test('repeated authoritative snapshot does not reapply material debit',()=>{const s=initial(),a=debit(s,request(s)).state,b=project(s,a);assert.deepEqual(project(b.state,a).state,a);assert.equal(project(a,s).status,'stale');assert.equal(project(a,{...a,scope:'other'}).status,'stale');});
test('receipt and snapshot copies cannot mutate trusted state',()=>{const s=initial(),a=debit(s,request(s));a.receipt.unitIds.push('fake');assert.equal(a.state.receipts[0].unitIds.length,1);const p=project(s,a.state);p.state.units.length=0;assert.equal(a.state.units.length,2);});
