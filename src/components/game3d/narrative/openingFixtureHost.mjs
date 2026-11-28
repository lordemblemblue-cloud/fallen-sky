// Phase 53 isolated host fixture; no live mount or storage.
export function createOpeningFixtureHost({scope,bridges,verifyObservation,commitGuard=()=>true}){
  // Host-only test harness. Closure separation is not a server security boundary.
  const copy=x=>JSON.parse(JSON.stringify(x)),fail=reason=>({ok:false,reason});
  const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const token=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
  if(!exact(scope,["ownerId","characterId","campaignId"])||!Object.values(scope).every(token)||typeof verifyObservation!=="function"||typeof commitGuard!=="function")throw Error("INVALID_HOST_CONFIG");
  const owned=copy(scope);
  const chapters=["M01","M02","M03","M04_M05","M06"];
  for(const id of chapters)if(!bridges[id]||!["create","read","apply","encode"].every(k=>typeof bridges[id][k]==="function"))throw Error("INVALID_BRIDGE");
  const route=Object.fromEntries(chapters.map(id=>[id,bridges[id]]));
  const initial=route.M01.create(owned);
  let record={revision:0,chapter:"M01",bundle:initial,receipts:[]},busy=false;
  const sameScope=s=>exact(s,["ownerId","characterId","campaignId"])&&Object.keys(owned).every(k=>s[k]===owned[k]);
  const count=(id,r)=>id==="M01"||id==="M02"?r.observedCount:id==="M03"?r.encounterRevision:id==="M04_M05"?r.originalRevision:r.wolfveilRevision;
  const ready=(id,r)=>id==="M01"?r.m02Available:id==="M02"?r.m03Available:id==="M03"?r.state.m04Available:id==="M04_M05"?r.state.m06Eligible:false;
  const current=()=>route[record.chapter].read(record.bundle,owned);
  const view=()=>{
    const r=current();
    return r.ok?{ok:true,revision:record.revision,chapter:record.chapter,state:copy(r.state),nextChapter:ready(record.chapter,r)?chapters[chapters.indexOf(record.chapter)+1]:null,fixtureOnly:true}:fail("INVALID_HOST_STATE");
  };
  const fingerprint=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const submit=request=>{
    if(busy)return fail("HOST_BUSY");
    if(!exact(request,["scope","expectedRevision","receiptId","chapter","event"])||!sameScope(request.scope)||!token(request.receiptId)||!chapters.includes(request.chapter)||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0||!request.event||typeof request.event!=="object"||Array.isArray(request.event))return fail("INVALID_REQUEST");
    busy=true;
    try{
      const evt=copy(request.event),key=fingerprint({chapter:request.chapter,event:evt});
      if(key.length>16000)return fail("EVENT_TOO_LARGE");
      const old=record.receipts.find(x=>x.id===request.receiptId);
      if(old)return old.key===key?{...view(),duplicate:true}:fail("RECEIPT_CONFLICT");
      if(request.expectedRevision!==record.revision)return fail("STALE_HOST_REVISION");
      if(record.receipts.length>=2048)return fail("FIXTURE_LIMIT");
      let chapter=record.chapter,bundle=record.bundle,read=current();
      if(!read.ok)return fail("INVALID_HOST_STATE");
      if(request.chapter!==chapter){
        if(!ready(chapter,read)||chapters[chapters.indexOf(chapter)+1]!==request.chapter)return fail("CHAPTER_NOT_AVAILABLE");
        chapter=request.chapter;
        const created=route[chapter].create(bundle,owned);
        if(!created.ok)return fail(created.reason);
        bundle=created.bundle;read=route[chapter].read(bundle,owned);
        if(!read.ok)return fail(read.reason);
      }
      // The injected verifier must independently derive evidence from the future
      // engine; fixture tests use a synthetic allowlist. No UI-provided truth flags suffice.
      if(verifyObservation({scope:copy(owned),chapter,event:copy(evt),state:copy(read.state),hostRevision:record.revision})!==true)return fail("EVIDENCE_REJECTED");
      const result=route[chapter].apply(bundle,owned,read.revision,count(chapter,read),evt);
      if(!result.ok)return fail(result.reason);
      // A scene event cannot be reused under a new host receipt.
      if(result.duplicate)return fail("SCENE_EVENT_ALREADY_USED");
      const next={revision:record.revision+1,chapter,bundle:result.bundle,receipts:[...record.receipts,{id:request.receiptId,key}]};
      if(commitGuard({previousRevision:record.revision,nextRevision:next.revision,chapter})!==true)return fail("COMMIT_REJECTED");
      // Single synchronous owner; no durable CAS or disk transaction.
      record=next;
      return {...view(),duplicate:false};
    }catch{return fail("HOST_OPERATION_FAILED");}finally{busy=false;}
  };
  const checkpoint=()=>{
    if(busy)return fail("HOST_BUSY");
    const encoded=route[record.chapter].encode(record.bundle,owned);
    if(!encoded.ok)return fail(encoded.reason);
    // Diagnostic export only; no import/resume or durable receipt persistence yet.
    return {ok:true,chapter:record.chapter,revision:record.revision,data:encoded.data,restorable:false};
  };
  return Object.freeze({ui:Object.freeze({view}),host:Object.freeze({submit,checkpoint})});
}
