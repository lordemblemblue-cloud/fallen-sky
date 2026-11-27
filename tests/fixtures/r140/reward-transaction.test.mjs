// R140 synthetic reference only: no production imports, network or storage.
import test from 'node:test';
import assert from 'node:assert/strict';
const copy = structuredClone;
const catalog = Object.freeze({ relic: Object.freeze({ scope: 'lifetime', item: 'fixture-blade', quantity: 1 }), repeat: Object.freeze({ scope: 'cycle', item: 'fixture-token', quantity: 2 }) });
const identity = { owner: 'fixture-owner', character: 'fixture-hero', generation: 1 };
const same = (a,b) => Boolean(a && b && typeof a.owner === 'string' && typeof a.character === 'string' && a.owner === b.owner && a.character === b.character);
const current = (a,b) => same(a,b) && a.generation === b.generation;
const initial = () => ({ owner: identity.owner, character: identity.character, revision: 0, cycle: 0, bag: [], vault: [], bagCap: 2, vaultCap: 2, receipts: [], evidence: [{ reward: 'relic', occurrence: 'paired', cycle: 0 }, { reward: 'repeat', occurrence: 'trial', cycle: 0 }] });
const request = (patch = {}) => ({ reward: 'relic', occurrence: 'paired', expectedRevision: 0, ...patch });
// Trusted fixture context and evidence are injected by the harness, never supplied by the request.
function reduce(state, principal, req) {
  const refuse = status => ({ state, status });
  if (!same(state, principal) || principal?.authority !== 'fixture-verified') return refuse('unauthorized');
  if (!req || Object.keys(req).some(k => !['reward','occurrence','expectedRevision'].includes(k))) return refuse('invalid');
  if (typeof req.reward !== 'string' || !Object.hasOwn(catalog, req.reward) || typeof req.occurrence !== 'string' || !req.occurrence.length || req.occurrence.length > 128 || !Number.isSafeInteger(req.expectedRevision) || req.expectedRevision < 0) return refuse('invalid');
  const def = catalog[req.reward];
  const key = JSON.stringify([state.owner,state.character,req.reward,req.occurrence,def.scope,def.scope === 'cycle' ? state.cycle : null]);
  const prior = state.receipts.find(r => r.key === key);
  if (prior?.status === 'committed') return { state, status: 'already_claimed', receipt: copy(prior) };
  if (req.expectedRevision !== state.revision) return refuse('conflict');
  if (!prior && !state.evidence.some(e => e.reward === req.reward && e.occurrence === req.occurrence && e.cycle === state.cycle)) return refuse('ineligible');
  const next = copy(state);
  const receipt = prior ? next.receipts.find(r => r.key === key) : { key, status: 'pending', items: Array.from({length:def.quantity}, (_,i) => ({ id: JSON.stringify([key,i]), definition: def.item })), delivery: [] };
  if (!prior) next.receipts.push(receipt);
  // All-or-nothing delivery for this fixture; capacities are synthetic, not live gear policy.
  if (next.bagCap-next.bag.length + next.vaultCap-next.vault.length >= receipt.items.length) {
    for (const item of receipt.items) {
      const location = next.bag.length < next.bagCap ? 'bag' : 'vault';
      next[location].push(copy(item));
      receipt.delivery.push({ id:item.id, location });
    }
    receipt.status = 'committed';
  } else if (prior) return { state, status:'pending', receipt:copy(prior) };
  next.revision++;
  return { state: next, status:receipt.status, receipt:copy(receipt) };
}
const trusted = { ...identity, authority: 'fixture-verified' };
// In-memory atomic simulation only; not evidence of database CAS or durability.
function harness(start=initial()) {
  let state=copy(start);
  return { snapshot:()=>copy(state), claim(req, principal=trusted, fault='') {
    const result=reduce(state,principal,req);
    if (result.state !== state) {
      if (fault==='write') return {status:'write_failed'};
      state=result.state;
      if (fault==='reply') return {status:'reply_lost'};
    }
    return {status:result.status, receipt:result.receipt};
  }};
}
function project(captured, active, result, checkedWrite, notify, seen = new Set()) {
  if (!current(captured,active)) return 'stale_session';
  if (!['committed','already_claimed'].includes(result.status) || !result.receipt) return 'not_confirmed';
  // Adapter must reconcile the full current authoritative snapshot, not append historical receipt items.
  if (!checkedWrite(result.receipt)) return 'write_failed';
  if (result.status === 'committed' && !seen.has(result.receipt.key)) { seen.add(result.receipt.key); notify(result.receipt); }
  return 'projected';
}
test('same claim: one item and identical receipt',()=>{const h=harness();const a=h.claim(request());const b=h.claim(request());assert.equal(b.status,'already_claimed');assert.deepEqual(a.receipt,b.receipt);assert.equal(h.snapshot().bag.length,1)});
test('lost response: retry finds committed receipt',()=>{const h=harness();assert.equal(h.claim(request(),trusted,'reply').status,'reply_lost');assert.equal(h.claim(request()).status,'already_claimed');assert.equal(h.snapshot().bag.length,1)});
test('failed write: no receipt or item; retry works',()=>{const h=harness();assert.equal(h.claim(request(),trusted,'write').status,'write_failed');assert.deepEqual(h.snapshot(),initial());assert.equal(h.claim(request()).status,'committed')});
test('bag full: use vault',()=>{const s=initial();s.bagCap=0;const h=harness(s);assert.equal(h.claim(request()).receipt.delivery[0].location,'vault');assert.equal(h.snapshot().vault.length,1)});
test('full containers: pending identity persists; retry after space',()=>{const s=initial();s.bagCap=s.vaultCap=0;const h=harness(s);const a=h.claim(request());assert.equal(a.status,'pending');assert.equal(h.claim(request({expectedRevision:1})).status,'pending');assert.equal(h.snapshot().revision,1);const restored=h.snapshot();restored.bagCap=1;restored.revision++;const h2=harness(restored);const b=h2.claim(request({expectedRevision:2}));assert.equal(b.status,'committed');assert.deepEqual(a.receipt.items,b.receipt.items)});
test('wrong owner, character or authority rejected',()=>{const h=harness();for(const p of [{...trusted,owner:'other'},{...trusted,character:'other'},{...trusted,authority:'local'}]) assert.equal(h.claim(request(),p).status,'unauthorized');assert.deepEqual(h.snapshot(),initial())});
test('unknown definitions, injected quantity, forged evidence and invalid revision rejected',()=>{const h=harness();for(const p of [{reward:'__proto__'},{reward:'unknown'},{quantity:99},{owner:'other'},{expectedRevision:null}]) assert.equal(h.claim(request(p)).status,'invalid');assert.equal(h.claim(request({occurrence:'not-earned'})).status,'ineligible');assert.deepEqual(h.snapshot(),initial())});
test('stale revision for new entitlement rejected',()=>{const h=harness();h.claim(request());assert.equal(h.claim(request({reward:'repeat',occurrence:'trial'})).status,'conflict');assert.equal(h.snapshot().receipts.length,1)});
test('removed lifetime item not recreated in next cycle',()=>{const h=harness();const a=h.claim(request());const s=h.snapshot();s.bag=[];s.cycle=1;s.revision++;const h2=harness(s);assert.deepEqual(h2.claim(request({expectedRevision:s.revision})).receipt,a.receipt);assert.equal(h2.snapshot().bag.length,0)});
test('repeat needs actual new cycle evidence and yields distinct items',()=>{const h=harness();const a=h.claim(request({reward:'repeat',occurrence:'trial'}));const s=h.snapshot();s.cycle=1;s.revision++;const h2=harness(s);const req=request({reward:'repeat',occurrence:'trial',expectedRevision:s.revision});assert.equal(h2.claim(req).status,'ineligible');s.evidence.push({reward:'repeat',occurrence:'trial',cycle:1});const b=harness(s).claim(req);assert.equal(b.status,'committed');assert.notDeepEqual(a.receipt.items,b.receipt.items)});
test('multi-unit delivery cannot partially grant',()=>{const s=initial();s.bagCap=1;s.vaultCap=0;const h=harness(s);assert.equal(h.claim(request({reward:'repeat',occurrence:'trial'})).status,'pending');assert.equal(h.snapshot().bag.length,0)});
test('reducer leaves input and returned receipt isolated',()=>{const s=initial();const r=reduce(s,trusted,request());assert.deepEqual(s,initial());r.receipt.items[0].definition='tampered';assert.equal(r.state.bag[0].definition,'fixture-blade');assert.equal(r.state.receipts[0].items[0].definition,'fixture-blade')});
test('stale identity or generation: no write or notification',()=>{const result=harness().claim(request());const fail=()=>assert.fail('unexpected side effect');for(const active of [{...identity,character:'other'},{...identity,generation:2}]) assert.equal(project(identity,active,result,fail,fail),'stale_session')});
test('projection failure or pending: no success notification',()=>{const result=harness().claim(request());const fail=()=>assert.fail('unexpected notification');assert.equal(project(identity,identity,result,()=>false,fail),'write_failed');assert.equal(project(identity,identity,{status:'pending'},fail,fail),'not_confirmed')});
test('confirmed projection emits once; replay reconciles without toast',()=>{const h=harness();let writes=0,events=0;const write=()=>{writes++;return true};const notify=()=>events++;assert.equal(project(identity,identity,h.claim(request()),write,notify),'projected');assert.equal(project(identity,identity,h.claim(request()),write,notify),'projected');assert.equal(writes,2);assert.equal(events,1)});
test('duplicate committed callback with shared session guard emits once',()=>{const result=harness().claim(request());const seen=new Set();let events=0;for(let i=0;i<2;i++) assert.equal(project(identity,identity,result,()=>true,()=>events++,seen),'projected');assert.equal(events,1)});
