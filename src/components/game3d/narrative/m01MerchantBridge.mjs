// Phase 47 development-only scene event bridge; no runtime mount.
export function createM01Bridge(adapter) {
  // Pure development adapter. Host observations are assertions, not authorization.
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fail=reason=>({ok:false,reason});
  const token=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
  const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const routes={
    BEGIN:{spawn:["M01_SPAWN"]},
    WARNING:{interaction:["M01_MERCHANT"],proximity:["M01_MERCHANT"]},
    STRAP_HELP:{completed:["M01_MERCHANT"]},
    FRAGMENT:{visual:["M01_SKY_WINDOW"],audio:["M01_SKY_WINDOW"],accessible_cue:["M01_SKY_WINDOW"],residual_glow_and_journal:["M01_FORK","M01_UPPER_VISTA","M01_STREAM_PATH","M01_CLEARING_EDGE"]},
    INTENT:{concern:["M01_FORK"],curiosity:["M01_FORK"],fear:["M01_FORK"]},
    DETOUR:{homeward:["M01_HOMEWARD_LOOP"],streamside:["M01_STREAMSIDE_LOOP"]},
    ARRIVAL:{threshold:["M01_CLEARING_EDGE"],overlook_confirmation:["M01_UPPER_VISTA","M01_CLEARING_EDGE"]}
  };
  const keys=["eventId","kind","mode","anchor","reality","safeDestinationReady"];
  const valid=e=>exact(e,keys)&&token(e.eventId)&&Object.hasOwn(routes,e.kind)&&Object.hasOwn(routes[e.kind],e.mode)&&routes[e.kind][e.mode].includes(e.anchor)&&e.reality==="PRESERVED"&&typeof e.safeDestinationReady==="boolean"&&(e.kind==="ARRIVAL"?e.safeDestinationReady:!e.safeDestinationReady);
  const same=(a,b)=>keys.every(k=>a[k]===b[k]);
  const canonical=(kind,objectiveId=null)=>({eventId:"m01_bridge_"+(objectiveId||kind.toLowerCase()),questId:"M01",kind,reality:"PRESERVED",objectiveId});
  const replay=events=>{
    if(!Array.isArray(events)||events.length>16)return fail("INVALID_JOURNAL");
    const state={started:false,warning:null,fragment:null,arrival:null,strapHelp:false,intent:null,detours:[],completed:false};
    const questEvents=[],seen=new Map();
    for(const e of events){
      if(!valid(e)||seen.has(e.eventId))return fail("INVALID_OBSERVATION_HISTORY");
      seen.set(e.eventId,e);
      if(e.kind==="BEGIN"){
        if(state.started)return fail("ALREADY_STARTED");
        state.started=true;questEvents.push(canonical("ACCEPT"));continue;
      }
      if(!state.started||state.completed)return fail("M01_NOT_ACTIVE");
      switch(e.kind){
      case "WARNING":
        if(state.warning)return fail("WARNING_ALREADY_RECORDED");
        state.warning=e.mode;questEvents.push(canonical("OBJECTIVE","merchant_warning"));break;
      case "STRAP_HELP":
        if(!state.warning||state.strapHelp)return fail("STRAP_NOT_AVAILABLE");
        state.strapHelp=true;break;
      case "FRAGMENT":
        if(!state.warning||state.fragment)return fail("FRAGMENT_NOT_AVAILABLE");
        state.fragment=e.mode;questEvents.push(canonical("OBJECTIVE","fragment_cue"));break;
      case "INTENT":
        if(!state.fragment||state.intent)return fail("INTENT_NOT_AVAILABLE");
        state.intent=e.mode;break;
      case "DETOUR":
        if(!state.warning||state.detours.includes(e.mode)||(e.mode==="homeward"&&!state.fragment))return fail("DETOUR_NOT_AVAILABLE");
        state.detours.push(e.mode);break;
      case "ARRIVAL":
        if(!state.warning||!state.fragment)return fail("REQUIRED_CUES_MISSING");
        state.arrival=e.mode;state.completed=true;
        questEvents.push(canonical("OBJECTIVE","voluntary_clearing_arrival"),canonical("COMPLETE"));break;
      }
    }
    return {ok:true,state,questEvents,seen};
  };
  const read=(bundle,scope)=>{
    if(!exact(bundle,["schemaVersion","snapshot","observations"])||bundle.schemaVersion!==1)return fail("INVALID_BUNDLE");
    const q=adapter.read(bundle.snapshot,scope);if(!q.ok)return q;
    const r=replay(bundle.observations);if(!r.ok)return r;
    const actual=bundle.snapshot.events.filter(e=>e.questId==="M01");
    if(actual.length!==r.questEvents.length||actual.some((e,i)=>Object.keys(r.questEvents[i]).some(k=>e[k]!==r.questEvents[i][k])))return fail("JOURNAL_QUEST_MISMATCH");
    return {ok:true,revision:q.revision,state:copy(r.state),m02Available:r.state.completed,observedCount:bundle.observations.length};
  };
  const create=scope=>({schemaVersion:1,snapshot:adapter.newSnapshot(scope),observations:[]});
  const apply=(bundle,scope,expectedRevision,expectedObservedCount,event)=>{
    const current=read(bundle,scope);if(!current.ok)return current;
    if(!valid(event))return fail("INVALID_OBSERVATION");
    const prior=bundle.observations.find(e=>e.eventId===event.eventId);
    if(prior)return same(prior,event)?{ok:true,duplicate:true,bundle:copy(bundle),state:current.state}:fail("OBSERVATION_ID_CONFLICT");
    if(expectedRevision!==current.revision||expectedObservedCount!==current.observedCount)return fail("STALE_BUNDLE");
    const observations=[...bundle.observations,copy(event)];
    const r=replay(observations);if(!r.ok)return r;
    const old=replay(bundle.observations);
    let snapshot=bundle.snapshot;
    for(const e of r.questEvents.slice(old.questEvents.length)){
      const result=adapter.append(snapshot,{scope,expectedRevision:snapshot.revision,event:e});
      if(!result.ok)return result;
      snapshot=result.snapshot;
    }
    const next={schemaVersion:1,snapshot:copy(snapshot),observations};
    const verified=read(next,scope);if(!verified.ok)return verified;
    return {ok:true,duplicate:false,bundle:next,state:verified.state};
  };
  const encode=(bundle,scope)=>{
    const r=read(bundle,scope);if(!r.ok)return r;
    const q=adapter.encode(bundle.snapshot,scope);if(!q.ok)return q;
    const data=JSON.stringify(bundle);return data.length<=260000?{ok:true,data}:fail("BUNDLE_TOO_LARGE");
  };
  const decode=(data,scope)=>{
    if(typeof data!=="string"||data.length>260000)return fail("INVALID_SERIALIZED_BUNDLE");
    let bundle;try{bundle=JSON.parse(data);}catch{return fail("INVALID_SERIALIZED_BUNDLE");}
    const r=read(bundle,scope);return r.ok?{ok:true,bundle}:r;
  };
  return Object.freeze({create,read,apply,encode,decode});
}
