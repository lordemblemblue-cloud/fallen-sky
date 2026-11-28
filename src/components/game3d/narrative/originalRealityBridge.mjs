// Phase 50 isolated narrative fixture; no live migration or storage.
export function createOriginalRealityBridge(adapter,m03){
  // Isolated fixture. Host assertions do not constitute authentication, combat evidence or actual migration.
  const copy=x=>JSON.parse(JSON.stringify(x)),fail=reason=>({ok:false,reason});
  const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const token=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(x);
  const roles=["DAMAGE","RANGE","DEFENSE"];
  const rules={
    AWAKEN:{stage:"M03_COMPLETE",anchors:["M04_AWAKEN"],modes:["safe_loaded"],next:"M04_TRAINING",quest:"M04",objective:"awaken_safe"},
    PRACTICE:{stage:"M04_TRAINING",anchors:["M04_YARD"],modes:roles},
    SKIP:{stage:"M04_TRAINING",anchors:["M04_YARD"],modes:["voluntary"]},
    SELECT:{stage:"M04_TRAINING",anchors:["M04_YARD"],modes:roles,next:"M04_COURT",quest:"M04",objective:"role_selected"},
    COURT:{stage:"M04_COURT",anchors:["M04_REFUGE"],modes:["main_wagon","side_lane","overlook"],next:"M04_HOLD_A",quest:"M04",objective:"court_group_safe"},
    HOLD_A:{stage:"M04_HOLD_A",anchors:["M04_HOLD_A"],modes:["safe_and_resolved"],next:"M04_HOLD_B",quest:"M04",objective:"retreat_group_a_safe"},
    HOLD_B:{stage:"M04_HOLD_B",anchors:["M04_HOLD_B"],modes:["safe_and_resolved"],next:"M04_EXIT",quest:"M04",objective:"retreat_group_b_safe"},
    EXIT:{stage:"M04_EXIT",anchors:["M04_RIVER_EXIT"],modes:["captain_withdrawal"],next:"M04_COMPLETE",quest:"M04",objective:"road_exit_confirmed"},
    ROAD:{stage:"M04_COMPLETE",anchors:["M05_ROAD"],modes:["safe_loaded"],next:"M05_RIVER",quest:"M05",objective:"evacuation_road"},
    ASSIST:{stage:"M05_RIVER",anchors:["M05_FAMILY_HOLD"],modes:["accompany","delegate","direct"]},
    RIVER:{stage:"M05_RIVER",anchors:["M05_RIVER_SAFE"],modes:["bank_short","upper_bypass"],next:"M05_VIEW",quest:"M05",objective:"river_safe"},
    VIEW:{stage:"M05_VIEW",anchors:["M05_BARRIER_VIEW"],modes:["witness"],next:"M05_THRESHOLD",quest:"M05",objective:"barrier_view"},
    READY:{stage:"M05_THRESHOLD",anchors:["M05_THRESHOLD_READY"],modes:["voluntary"],next:"M05_AUTHORED_READY",quest:"M05",objective:"threshold_ready"},
    COMMIT:{stage:"M05_AUTHORED_READY",anchors:["M05_HAND"],modes:["cinematic_complete","skip_with_journal"],next:"M05_COMPLETE",quest:"M05",objective:"authored_transition"}
  };
  const keys=["eventId","epoch","kind","mode","anchor","reality","verifiedSafe","destinationReady"];
  const valid=e=>exact(e,keys)&&token(e.eventId)&&Number.isSafeInteger(e.epoch)&&e.epoch>=0&&e.reality==="ORIGINAL"&&typeof e.verifiedSafe==="boolean"&&typeof e.destinationReady==="boolean"&&(e.kind==="RECOVER"?e.mode==="ordinary_failure"&&token(e.anchor):Object.hasOwn(rules,e.kind)&&rules[e.kind].anchors.includes(e.anchor)&&rules[e.kind].modes.includes(e.mode));
  const same=(a,b)=>keys.every(k=>a[k]===b[k]);
  const canonical=(questId,kind,objectiveId=null)=>({eventId:questId.toLowerCase()+"_bridge_"+(objectiveId||kind.toLowerCase()),questId,kind,reality:"ORIGINAL",objectiveId});
  const checkpoints={M04_TRAINING:"M04_YARD",M04_COURT:"M04_YARD",M04_HOLD_A:"M04_REFUGE",M04_HOLD_B:"M04_REST",M04_EXIT:"M04_REST",M05_RIVER:"M05_ROAD",M05_VIEW:"M05_RIVER_SAFE",M05_THRESHOLD:"M05_RIVER_SAFE",M05_AUTHORED_READY:"M05_THRESHOLD_READY"};
  const replay=events=>{
    if(!Array.isArray(events)||events.length>128)return fail("INVALID_JOURNAL");
    const state={stage:"M03_COMPLETE",epoch:0,practice:[],skipped:false,role:null,courtRoute:null,courtSafe:false,holdA:false,holdB:false,assistance:null,riverRoute:null,authoredDeath:false,lifeForcePreserved:false,silverMarkPending:false,olderLocalChronology:"UNRESOLVED",activeReality:"PRESERVED",m06Eligible:false};
    const questEvents=[],seen=new Map();
    for(const e of events){
      if(!valid(e)||seen.has(e.eventId))return fail("INVALID_HISTORY");
      if(e.epoch!==state.epoch)return fail("STALE_EPOCH");
      seen.set(e.eventId,e);
      if(e.kind==="RECOVER"){
        if(checkpoints[state.stage]!==e.anchor||!e.verifiedSafe||e.destinationReady)return fail("INVALID_RECOVERY");
        state.epoch++;continue;
      }
      const r=rules[e.kind];
      if(state.stage!==r.stage)return fail("WRONG_STAGE");
      // These are host assertions, not proof of safe collision, actual group arrivals or a completed scene.
      if(!e.verifiedSafe)return fail("UNVERIFIED_OBSERVATION");
      if(["AWAKEN","ROAD","COMMIT"].includes(e.kind)?!e.destinationReady:e.destinationReady)return fail("DESTINATION_NOT_READY_OR_UNEXPECTED");
      if(e.kind==="AWAKEN"){state.activeReality="ORIGINAL";questEvents.push(canonical("M04","ACCEPT"));}
      if(e.kind==="PRACTICE"||e.kind==="SKIP"){
        if(e.kind==="PRACTICE"){if(state.practice.includes(e.mode))return fail("PRACTICE_ALREADY_RECORDED");state.practice.push(e.mode);}
        else {if(state.skipped)return fail("SKIP_ALREADY_RECORDED");state.skipped=true;}
        if(state.practice.length+(state.skipped?1:0)===1)questEvents.push(canonical("M04","OBJECTIVE","practice_or_skip"));
      }
      if(e.kind==="SELECT"){if(!state.skipped&&!state.practice.length)return fail("PRACTICE_OR_SKIP_REQUIRED");state.role=e.mode;}
      if(e.kind==="COURT"){state.courtSafe=true;state.courtRoute=e.mode;}
      if(e.kind==="HOLD_A")state.holdA=true;
      if(e.kind==="HOLD_B")state.holdB=true;
      if(e.kind==="ROAD")questEvents.push(canonical("M05","ACCEPT"));
      if(e.kind==="ASSIST"){if(state.assistance)return fail("ASSIST_ALREADY_RECORDED");state.assistance=e.mode;}
      if(e.kind==="RIVER")state.riverRoute=e.mode;
      if(e.kind==="COMMIT"){
        state.authoredDeath=true;state.lifeForcePreserved=true;state.silverMarkPending=true;state.m06Eligible=true;
        // Presentation handoff only: actual M06 wake/control remains a distinct host transition.
        state.activeReality="TRANSITION_PENDING";
      }
      if(r.objective)questEvents.push(canonical(r.quest,"OBJECTIVE",r.objective));
      if(e.kind==="EXIT")questEvents.push(canonical("M04","COMPLETE"));
      if(e.kind==="COMMIT")questEvents.push(canonical("M05","COMPLETE"));
      if(r.next)state.stage=r.next;
    }
    return {ok:true,state,questEvents,seen};
  };
  const snap=b=>b.beast.clearing.opening.snapshot;
  const read=(b,scope)=>{
    if(!exact(b,["schemaVersion","beast","originalEvents"])||b.schemaVersion!==1)return fail("INVALID_BUNDLE");
    const prior=m03.read(b.beast,scope);if(!prior.ok)return prior;
    if(!prior.state.m04Available)return fail("M03_REQUIRED");
    const r=replay(b.originalEvents);if(!r.ok)return r;
    const actual=snap(b).events.filter(e=>["M04","M05"].includes(e.questId));
    if(actual.length!==r.questEvents.length||actual.some((e,i)=>Object.keys(r.questEvents[i]).some(k=>e[k]!==r.questEvents[i][k])))return fail("QUEST_JOURNAL_MISMATCH");
    return {ok:true,state:copy(r.state),revision:prior.revision,originalRevision:b.originalEvents.length};
  };
  const create=(beast,scope)=>{
    const b={schemaVersion:1,beast:copy(beast),originalEvents:[]};
    const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
  };
  const apply=(b,scope,expectedRevision,expectedOriginalRevision,e)=>{
    const before=read(b,scope);if(!before.ok)return before;
    if(!valid(e))return fail("INVALID_EVENT");
    const prior=b.originalEvents.find(x=>x.eventId===e.eventId);
    if(prior)return same(prior,e)?{ok:true,duplicate:true,bundle:copy(b),state:before.state}:fail("EVENT_ID_CONFLICT");
    if(expectedRevision!==before.revision||expectedOriginalRevision!==before.originalRevision)return fail("STALE_BUNDLE");
    const events=[...b.originalEvents,copy(e)],r=replay(events);if(!r.ok)return r;
    const old=replay(b.originalEvents);
    let snapshot=snap(b);
    for(const event of r.questEvents.slice(old.questEvents.length)){
      const next=adapter.append(snapshot,{scope,expectedRevision:snapshot.revision,event});if(!next.ok)return next;
      snapshot=next.snapshot;
    }
    const next=copy(b);next.originalEvents=events;next.beast.clearing.opening.snapshot=copy(snapshot);
    const checked=read(next,scope);return checked.ok?{ok:true,duplicate:false,bundle:next,state:checked.state}:checked;
  };
  const encode=(b,scope)=>{
    const r=read(b,scope);if(!r.ok)return r;
    const prior=m03.encode(b.beast,scope);if(!prior.ok)return prior;
    const data=JSON.stringify(b);return data.length<=600000?{ok:true,data}:fail("BUNDLE_TOO_LARGE");
  };
  const decode=(data,scope)=>{
    if(typeof data!=="string"||data.length>600000)return fail("INVALID_SERIALIZED_BUNDLE");
    let b;try{b=JSON.parse(data);}catch{return fail("INVALID_SERIALIZED_BUNDLE");}
    const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
  };
  return Object.freeze({create,read,apply,encode,decode});
}
