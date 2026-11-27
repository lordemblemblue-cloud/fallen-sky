// Phase 48 development-only; no game mount or live state.
export function createM02Bridge(adapter,m01) {
  // Offline proposal, not a trusted host, live save writer or combat trigger.
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fail=reason=>({ok:false,reason});
  const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const routes={
    BEGIN:{approach:["M02_APPROACH"]},
    WARNING:{spoken:["M02_APPROACH","M02_PERIMETER_N","M02_PERIMETER_S"],contextual:["M02_APPROACH","M02_PERIMETER_N","M02_PERIMETER_S"]},
    BARRIER:{soil:["M02_FRAGMENT_VIEW","M02_PERIMETER_N","M02_PERIMETER_S"],shard:["M02_FRAGMENT_VIEW"],twig:["M02_FRAGMENT_VIEW","M02_PERIMETER_N","M02_PERIMETER_S"]},
    WOLF:{observe_at_distance_and_warn:["M02_WOLF_VIEW"],crouch_and_warn:["M02_WOLF_VIEW"],call_woman:["M02_WOLF_VIEW","M02_PERIMETER_S"]},
    SHADOW:{visual:["M02_WOLF_VIEW","M02_PERIMETER_S"],accessible_cue:["M02_WOLF_VIEW","M02_PERIMETER_S"]},
    RETREAT:{walk:["M02_RETREAT"]},
    RETURN:{walk:["M02_APPROACH","M02_RETREAT"]},
    READINESS:{protect_safe:["M02_PROTECT_SAFE"],outer_lookout:["M02_OUTER_LOOKOUT"]}
  };
  const keys=["eventId","kind","mode","anchor","reality","arenaLoaded","controlAvailable"];
  const valid=e=>exact(e,keys)&&typeof e.eventId==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(e.eventId)&&Object.hasOwn(routes,e.kind)&&Object.hasOwn(routes[e.kind],e.mode)&&routes[e.kind][e.mode].includes(e.anchor)&&e.reality==="PRESERVED"&&typeof e.arenaLoaded==="boolean"&&typeof e.controlAvailable==="boolean"&&(e.kind==="READINESS"?e.arenaLoaded&&e.controlAvailable:!e.arenaLoaded&&!e.controlAvailable);
  const same=(a,b)=>keys.every(k=>a[k]===b[k]);
  const canonical=(kind,objectiveId=null)=>({eventId:"m02_bridge_"+(objectiveId||kind.toLowerCase()),questId:"M02",kind,reality:"PRESERVED",objectiveId});
  const replay=events=>{
    if(!Array.isArray(events)||events.length>64)return fail("INVALID_JOURNAL");
    const state={started:false,warning:null,barrierClues:[],wolf:null,shadow:null,retreated:false,readiness:null,completed:false};
    const questEvents=[],seen=new Map();
    for(const e of events){
      if(!valid(e)||seen.has(e.eventId))return fail("INVALID_OBSERVATION_HISTORY");
      seen.set(e.eventId,e);
      if(e.kind==="BEGIN"){
        if(state.started)return fail("ALREADY_STARTED");
        state.started=true;questEvents.push(canonical("ACCEPT"),canonical("OBJECTIVE","clearing_approach"));continue;
      }
      if(!state.started||state.completed)return fail("M02_NOT_ACTIVE");
      if(e.kind==="RETURN"){
        if(!state.retreated)return fail("NOT_RETREATED");
        state.retreated=false;continue;
      }
      if(state.retreated)return fail("RETURN_REQUIRED");
      if(e.kind==="RETREAT"){state.retreated=true;continue;}
      if(e.kind==="WARNING"){
        if(state.warning)return fail("WARNING_ALREADY_RECORDED");
        state.warning=e.mode;questEvents.push(canonical("OBJECTIVE","protective_warning"));continue;
      }
      if(!state.warning)return fail("PROTECTIVE_WARNING_REQUIRED");
      switch(e.kind){
      case "BARRIER":
        if(state.barrierClues.includes(e.mode))return fail("CLUE_ALREADY_RECORDED");
        if(!state.barrierClues.length)questEvents.push(canonical("OBJECTIVE","barrier_observation"));
        state.barrierClues.push(e.mode);break;
      case "WOLF":
        if(state.wolf)return fail("WOLF_ALREADY_RECORDED");
        state.wolf=e.mode;questEvents.push(canonical("OBJECTIVE","wolf_observation_and_warning"));break;
      case "SHADOW":
        if(!state.wolf||state.shadow)return fail("SHADOW_NOT_AVAILABLE");
        state.shadow=e.mode;break;
      case "READINESS":
        // Independent shadow is part of the authored encounter presentation;
        // accessible cue counts equally. No additional canonical objective ID.
        if(!state.barrierClues.length||!state.wolf||!state.shadow)return fail("REQUIRED_OBSERVATIONS_MISSING");
        state.readiness=e.mode;state.completed=true;
        questEvents.push(canonical("OBJECTIVE","voluntary_readiness"),canonical("COMPLETE"));break;
      }
    }
    return {ok:true,state,questEvents};
  };
  const read=(bundle,scope)=>{
    if(!exact(bundle,["schemaVersion","opening","clearingObservations"])||bundle.schemaVersion!==1)return fail("INVALID_BUNDLE");
    const first=m01.read(bundle.opening,scope);if(!first.ok)return first;
    if(!first.m02Available)return fail("M01_REQUIRED");
    const r=replay(bundle.clearingObservations);if(!r.ok)return r;
    const actual=bundle.opening.snapshot.events.filter(e=>e.questId==="M02");
    if(actual.length!==r.questEvents.length||actual.some((e,i)=>Object.keys(r.questEvents[i]).some(k=>e[k]!==r.questEvents[i][k])))return fail("JOURNAL_QUEST_MISMATCH");
    return {ok:true,state:copy(r.state),revision:first.revision,observedCount:bundle.clearingObservations.length,m03Available:r.state.completed,playerFacingName:"Woman in the Light"};
  };
  const create=(opening,scope)=>{
    const b={schemaVersion:1,opening:copy(opening),clearingObservations:[]};
    const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
  };
  const apply=(bundle,scope,expectedRevision,expectedObservedCount,event)=>{
    const current=read(bundle,scope);if(!current.ok)return current;
    if(!valid(event))return fail("INVALID_OBSERVATION");
    const prior=bundle.clearingObservations.find(e=>e.eventId===event.eventId);
    if(prior)return same(prior,event)?{ok:true,duplicate:true,bundle:copy(bundle),state:current.state}:fail("OBSERVATION_ID_CONFLICT");
    if(expectedRevision!==current.revision||expectedObservedCount!==current.observedCount)return fail("STALE_BUNDLE");
    const observations=[...bundle.clearingObservations,copy(event)];
    const r=replay(observations);if(!r.ok)return r;
    const old=replay(bundle.clearingObservations);
    let snapshot=bundle.opening.snapshot;
    for(const e of r.questEvents.slice(old.questEvents.length)){
      const result=adapter.append(snapshot,{scope,expectedRevision:snapshot.revision,event:e});
      if(!result.ok)return result;
      snapshot=result.snapshot;
    }
    const next={schemaVersion:1,opening:{...copy(bundle.opening),snapshot:copy(snapshot)},clearingObservations:observations};
    const verified=read(next,scope);if(!verified.ok)return verified;
    return {ok:true,duplicate:false,bundle:next,state:verified.state};
  };
  const encode=(bundle,scope)=>{
    const r=read(bundle,scope);if(!r.ok)return r;
    const first=m01.encode(bundle.opening,scope);if(!first.ok)return first;
    const data=JSON.stringify(bundle);return data.length<=280000?{ok:true,data}:fail("BUNDLE_TOO_LARGE");
  };
  const decode=(data,scope)=>{
    if(typeof data!=="string"||data.length>280000)return fail("INVALID_SERIALIZED_BUNDLE");
    let b;try{b=JSON.parse(data);}catch{return fail("INVALID_SERIALIZED_BUNDLE");}
    const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
  };
  return Object.freeze({create,read,apply,encode,decode});
}
