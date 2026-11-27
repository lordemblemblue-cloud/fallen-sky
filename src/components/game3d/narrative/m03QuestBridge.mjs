// Phase 49 offline quest bridge; no live storage writes.
export function createM03QuestBridge(adapter,m02,model){
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fail=reason=>({ok:false,reason});
  const questEvents=state=>{
    const event=(kind,objectiveId=null)=>({eventId:"m03_bridge_"+(objectiveId||kind.toLowerCase()),questId:"M03",kind,reality:"PRESERVED",objectiveId});
    const out=[];
    if(state.epoch>0)out.push(event("ACCEPT"));
    if(["DEFEATED","COMPLETE"].includes(state.status))out.push(event("OBJECTIVE","boss_defeated"));
    if(state.status==="COMPLETE")out.push(event("OBJECTIVE","aftermath_acknowledged"),event("COMPLETE"));
    return out;
  };
  const read=(b,scope)=>{
    if(!b||Object.getPrototypeOf(b)!==Object.prototype||Object.keys(b).length!==3||!Object.hasOwn(b,"clearing")||!Object.hasOwn(b,"encounterEvents")||b.schemaVersion!==1)return fail("INVALID_BUNDLE");
    const prior=m02.read(b.clearing,scope);if(!prior.ok)return prior;
    if(!prior.m03Available)return fail("M02_REQUIRED");
    const r=model.read(b.encounterEvents);if(!r.ok)return r;
    const expected=questEvents(r.state), actual=b.clearing.opening.snapshot.events.filter(e=>e.questId==="M03");
    if(actual.length!==expected.length||actual.some((e,i)=>Object.keys(expected[i]).some(k=>expected[i][k]!==e[k])))return fail("QUEST_ENCOUNTER_MISMATCH");
    return {ok:true,state:r.state,revision:prior.revision,encounterRevision:r.revision};
  };
  const create=(clearing,scope)=>{
    const b={schemaVersion:1,clearing:copy(clearing),encounterEvents:[]};
    const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
  };
  const apply=(b,scope,expectedRevision,expectedEncounterRevision,e)=>{
    const before=read(b,scope);if(!before.ok)return before;
    const r=model.append(b.encounterEvents,expectedEncounterRevision,e);if(!r.ok)return r;
    if(r.duplicate)return {ok:true,duplicate:true,bundle:copy(b),state:before.state};
    if(expectedRevision!==before.revision)return fail("STALE_BUNDLE");
    let snapshot=b.clearing.opening.snapshot;
    for(const event of questEvents(r.state).slice(questEvents(before.state).length)){
      const next=adapter.append(snapshot,{scope,expectedRevision:snapshot.revision,event});
      if(!next.ok)return next;snapshot=next.snapshot;
    }
    const next={schemaVersion:1,clearing:{...copy(b.clearing),opening:{...copy(b.clearing.opening),snapshot:copy(snapshot)}},encounterEvents:r.events};
    const checked=read(next,scope);return checked.ok?{ok:true,duplicate:false,bundle:next,state:checked.state}:checked;
  };
  const encode=(b,scope)=>{
    const r=read(b,scope);if(!r.ok)return r;
    // No mid-attack saves; use a checkpoint reset before storing an active attempt.
    if(["ACTIVE","TRANSFORMING"].includes(r.state.status))return fail("UNSAFE_CHECKPOINT");
    const prior=m02.encode(b.clearing,scope);if(!prior.ok)return prior;
    const data=JSON.stringify(b);return data.length<=520000?{ok:true,data}:fail("BUNDLE_TOO_LARGE");
  };
  const decode=(data,scope)=>{
    if(typeof data!=="string"||data.length>520000)return fail("INVALID_SERIALIZED_BUNDLE");
    let b;try{b=JSON.parse(data);}catch{return fail("INVALID_SERIALIZED_BUNDLE");}
    const r=read(b,scope);if(!r.ok)return r;
    return ["ACTIVE","TRANSFORMING"].includes(r.state.status)?fail("UNSAFE_CHECKPOINT"):{ok:true,bundle:b};
  };
  return Object.freeze({create,read,apply,encode,decode});
}
