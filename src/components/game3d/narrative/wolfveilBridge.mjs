// Phase 51 isolated narrative fixture; no service mount or live writes.
export function createWolfveilBridge(adapter,original){
 const copy=x=>JSON.parse(JSON.stringify(x)),fail=reason=>({ok:false,reason});
 const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
 const services=["Blacksmith","Appearance","Companion","Spirituality","Character","Questbook","Map","Store"];
 const rules={
 WAKE:{stages:["PENDING"],anchors:["M06_WAKE"],modes:["safe_loaded"],next:"MARK",objective:"wake_safe"},
 MARK:{stages:["MARK"],anchors:["PALM_INSPECT"],modes:["visual","accessible","skip_with_observation"],next:"PATH",objective:"mark_inspected"},
 GODDESS_TOPIC:{stages:["PATH"],anchors:["GODDESS_STAND"],modes:["insist","survivors","go_home"]},
 PATH:{stages:["PATH"],anchors:["M06_PATH_START"],modes:["walk"],next:"RETURN",objective:"path_open"},
 RIVER_NOTE:{stages:["RETURN"],anchors:["M05_MATCH_BEND"],modes:["inspect"]},
 MERCHANT_HELP:{stages:["RETURN"],anchors:["MERCHANT_CART"],modes:["completed"]},
 GATE:{stages:["RETURN"],anchors:["GATE"],modes:["arrive"],next:"LYRA"},
 LYRA:{stages:["LYRA"],anchors:["LYRA_FOUNTAIN"],modes:["city","dream","mark_with_consent","skip_with_directions","ordinary"],next:"OPEN",objective:"lyra_met"},
 OATH:{stages:["OPEN","COMPLETE"],anchors:["TREE_RIBBON"],modes:["accept","decline"]},
 OPEN:{stages:["OPEN"],anchors:["LYRA_FOUNTAIN","M07_SIGN"],modes:["directions_delivered"],next:"COMPLETE",objective:"open_world"}
 };
 const keys=["eventId","kind","mode","anchor","reality","verified","destinationReady"];
 const valid=e=>exact(e,keys)&&typeof e.eventId==="string"&&/^[A-Za-z0-9_-]{1,96}$/.test(e.eventId)&&e.reality==="PRESERVED"&&Object.hasOwn(rules,e.kind)&&rules[e.kind].anchors.includes(e.anchor)&&rules[e.kind].modes.includes(e.mode)&&typeof e.verified==="boolean"&&typeof e.destinationReady==="boolean";
 const canonical=(kind,objectiveId=null)=>({eventId:"m06_bridge_"+(objectiveId||kind.toLowerCase()),questId:"M06",kind,reality:"PRESERVED",objectiveId});
 const replay=events=>{
  if(!Array.isArray(events)||events.length>24)return fail("INVALID_JOURNAL");
  const state={stage:"PENDING",activeReality:"TRANSITION_PENDING",markInspected:false,goddessTopic:null,riverNote:false,merchantHelp:false,lyraTopic:null,oath:null,openWorld:false,m07Eligible:false};
  const questEvents=[],seen=new Map();
  for(const e of events){
   if(!valid(e)||seen.has(e.eventId))return fail("INVALID_HISTORY");
   seen.set(e.eventId,e);const r=rules[e.kind];
   if(!r.stages.includes(state.stage))return fail("WRONG_STAGE");
   if(!e.verified||(e.kind==="WAKE"?!e.destinationReady:e.destinationReady))return fail("UNVERIFIED_OR_UNSAFE");
   if(e.kind==="WAKE"){state.activeReality="PRESERVED";questEvents.push(canonical("ACCEPT"));}
   if(e.kind==="MARK")state.markInspected=true;
   if(e.kind==="GODDESS_TOPIC"){if(state.goddessTopic)return fail("ALREADY_RECORDED");state.goddessTopic=e.mode;}
   if(e.kind==="RIVER_NOTE"){if(state.riverNote)return fail("ALREADY_RECORDED");state.riverNote=true;}
   if(e.kind==="MERCHANT_HELP"){if(state.merchantHelp)return fail("ALREADY_RECORDED");state.merchantHelp=true;}
   if(e.kind==="LYRA")state.lyraTopic=e.mode;
   if(e.kind==="OATH"){if(state.oath)return fail("ALREADY_RECORDED");state.oath=e.mode;}
   if(e.kind==="OPEN"){state.openWorld=true;state.m07Eligible=true;}
   if(r.objective)questEvents.push(canonical("OBJECTIVE",r.objective));
   if(e.kind==="OPEN")questEvents.push(canonical("COMPLETE"));
   if(r.next)state.stage=r.next;
  }
  return {ok:true,state,questEvents};
 };
 const snapshot=b=>b.original.beast.clearing.opening.snapshot;
 const read=(b,scope)=>{
  if(!exact(b,["schemaVersion","original","wolfveilEvents"])||b.schemaVersion!==1)return fail("INVALID_BUNDLE");
  const prior=original.read(b.original,scope);if(!prior.ok)return prior;
  if(!prior.state.m06Eligible||!prior.state.authoredDeath||!prior.state.lifeForcePreserved||!prior.state.silverMarkPending)return fail("M05_REQUIRED");
  const r=replay(b.wolfveilEvents);if(!r.ok)return r;
  const actual=snapshot(b).events.filter(e=>e.questId==="M06");
  if(actual.length!==r.questEvents.length||actual.some((e,i)=>Object.keys(r.questEvents[i]).some(k=>e[k]!==r.questEvents[i][k])))return fail("QUEST_JOURNAL_MISMATCH");
  return {ok:true,state:copy(r.state),revision:prior.revision,wolfveilRevision:b.wolfveilEvents.length};
 };
 const create=(prior,scope)=>{
  if(!prior||typeof prior!=="object")return fail("INVALID_BUNDLE");
  const b={schemaVersion:1,original:copy(prior),wolfveilEvents:[]};const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
 };
 const apply=(b,scope,expectedRevision,expectedWolfveilRevision,e)=>{
  const before=read(b,scope);if(!before.ok)return before;
  if(!valid(e))return fail("INVALID_EVENT");
  const prior=b.wolfveilEvents.find(x=>x.eventId===e.eventId);
  if(prior)return keys.every(k=>prior[k]===e[k])?{ok:true,duplicate:true,bundle:copy(b),state:before.state}:fail("EVENT_ID_CONFLICT");
  if(expectedRevision!==before.revision||expectedWolfveilRevision!==before.wolfveilRevision)return fail("STALE_BUNDLE");
  const events=[...b.wolfveilEvents,copy(e)],r=replay(events);if(!r.ok)return r;
  const old=replay(b.wolfveilEvents);let snap=snapshot(b);
  for(const event of r.questEvents.slice(old.questEvents.length)){
   const next=adapter.append(snap,{scope,expectedRevision:snap.revision,event});if(!next.ok)return next;snap=next.snapshot;
  }
  const next=copy(b);next.wolfveilEvents=events;next.original.beast.clearing.opening.snapshot=copy(snap);
  const checked=read(next,scope);return checked.ok?{ok:true,duplicate:false,bundle:next,state:checked.state}:checked;
 };
 // Presentation availability only. Host must independently authorize actual service use.
 const serviceMenu=(b,scope,hostAvailable)=>{
  const r=read(b,scope);if(!r.ok)return r;
  if(!Array.isArray(hostAvailable)||hostAvailable.some(x=>!services.includes(x)))return fail("INVALID_SERVICE_LIST");
  return {ok:true,entries:r.state.openWorld?services.filter(x=>hostAvailable.includes(x)):[],mountAllowed:false};
 };
 const encode=(b,scope)=>{
  const r=read(b,scope);if(!r.ok)return r;const p=original.encode(b.original,scope);if(!p.ok)return p;
  const data=JSON.stringify(b);return data.length<=620000?{ok:true,data}:fail("BUNDLE_TOO_LARGE");
 };
 const decode=(data,scope)=>{
  if(typeof data!=="string"||data.length>620000)return fail("INVALID_SERIALIZED_BUNDLE");
  let b;try{b=JSON.parse(data);}catch{return fail("INVALID_SERIALIZED_BUNDLE");}
  const r=read(b,scope);return r.ok?{ok:true,bundle:b}:r;
 };
 return Object.freeze({create,read,apply,serviceMenu,encode,decode});
}
