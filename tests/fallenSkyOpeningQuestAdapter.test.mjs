import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpeningQuestAdapter } from '../src/components/game3d/narrative/openingQuestAdapter.mjs';

function runCases(factory,assert){
  const scope={ownerId:"__anon__",characterId:"char_test",campaignId:"campaign_test"};
  // Synthetic test objectives: not authored story tasks or activation approval.
  const defs=Array.from({length:6},(_,i)=>({id:"M0"+(i+1),reality:i===3||i===4?"ORIGINAL":"PRESERVED",requires:i?["M0"+i]:[],objectives:["fixture_a","fixture_b"],enabled:true}));
  defs.push({id:"S01",reality:"PRESERVED",requires:[],objectives:["fixture_optional"],enabled:false});
  const a=factory({definitions:defs,contentRevision:"fixture_v1"});
  const event=(id,kind,questId="M01",reality="PRESERVED",objectiveId=null)=>({eventId:id,questId,kind,reality,objectiveId});
  const add=(snapshot,e,expectedRevision=snapshot.revision,owner=scope)=>a.append(snapshot,{scope:owner,expectedRevision,event:e});
  const checks=[];
  const check=(name,fn)=>{fn();checks.push(name);};
  let s=a.newSnapshot(scope);
  check("fresh save empty",()=>assert(a.read(s,scope).ok&&Object.keys(a.read(s,scope).quests).length===0));
  check("unknown quest rejected",()=>assert(add(s,event("u","ACCEPT","M99")).reason==="UNKNOWN_OR_DISABLED_QUEST"));
  check("disabled optional rejected",()=>assert(add(s,event("d","ACCEPT","S01")).reason==="UNKNOWN_OR_DISABLED_QUEST"));
  check("out of order rejected",()=>assert(add(s,event("o","ACCEPT","M02")).reason==="PREREQUISITE_REQUIRED"));
  check("wrong reality rejected",()=>assert(add(s,event("w","ACCEPT","M01","ORIGINAL")).reason==="WRONG_REALITY"));
  check("not active rejected",()=>assert(add(s,event("n","COMPLETE")).reason==="NOT_ACTIVE"));
  check("stale revision rejected",()=>assert(add(s,event("r","ACCEPT"),1).reason==="STALE_REVISION"));
  check("foreign owner rejected",()=>assert(add(s,event("f","ACCEPT"),0,{...scope,ownerId:"other"}).reason==="INVALID_SNAPSHOT_OR_SCOPE"));
  check("foreign character rejected",()=>assert(!a.read(s,{...scope,characterId:"char_other"}).ok));
  check("foreign campaign rejected",()=>assert(!a.read(s,{...scope,campaignId:"other"}).ok));
  check("reject extra reward field",()=>assert(add(s,{...event("x","ACCEPT"),gold:999}).reason==="INVALID_EVENT"));
  check("null event rejected",()=>assert(add(s,null).reason==="INVALID_EVENT"));
  const start=event("accept1","ACCEPT");
  check("accept preserves original snapshot",()=>{const r=add(s,start);assert(r.ok&&s.revision===0);s=r.snapshot;});
  check("exact retry idempotent",()=>{const r=add(s,start,0);assert(r.ok&&r.duplicate&&r.snapshot.revision===1);});
  check("event ID reuse conflict",()=>assert(add(s,event("accept1","COMPLETE")).reason==="EVENT_ID_CONFLICT"));
  check("early completion rejected",()=>assert(add(s,event("early","COMPLETE")).reason==="OBJECTIVES_INCOMPLETE"));
  check("unknown objective rejected",()=>assert(add(s,event("q","OBJECTIVE","M01","PRESERVED","bogus")).reason==="UNKNOWN_OBJECTIVE"));
  check("valid objective recorded",()=>{const r=add(s,event("a","OBJECTIVE","M01","PRESERVED","fixture_a"));assert(r.ok);s=r.snapshot;});
  check("duplicate objective rejected",()=>assert(add(s,event("a2","OBJECTIVE","M01","PRESERVED","fixture_a")).reason==="OBJECTIVE_ALREADY_RECORDED"));
  check("partial progress reload",()=>{const e=a.encode(s,scope),d=a.decode(e.data,scope);assert(e.ok&&d.ok&&a.read(d.snapshot,scope).quests.M01.objectives.length===1);s=d.snapshot;});
  check("malformed save rejected",()=>assert(!a.decode("{broken",scope).ok));
  check("tampered history rejected",()=>{const t=JSON.parse(JSON.stringify(s));t.events[0].questId="M02";assert(!a.read(t,scope).ok);});
  check("wrong content revision rejected",()=>assert(!a.read({...s,contentRevision:"other"},scope).ok));
  check("second objective and completion",()=>{s=add(s,event("b","OBJECTIVE","M01","PRESERVED","fixture_b")).snapshot;s=add(s,event("done1","COMPLETE")).snapshot;assert(a.read(s,scope).quests.M01.status==="COMPLETED");});
  check("completed quest cannot repeat",()=>assert(add(s,event("repeat","ACCEPT")).reason==="ALREADY_ACCEPTED_OR_COMPLETED"));
  check("M02-M06 without side quest",()=>{for(let i=1;i<6;i++){const d=defs[i];for(const e of [event("accept"+(i+1),"ACCEPT",d.id,d.reality),...d.objectives.map((o,j)=>event("obj"+i+"_"+j,"OBJECTIVE",d.id,d.reality,o)),event("done"+(i+1),"COMPLETE",d.id,d.reality)]){const r=add(s,e);assert(r.ok);s=r.snapshot;}}assert(a.read(s,scope).quests.M06.status==="COMPLETED"&&!a.read(s,scope).quests.S01);});
  check("reality histories retained",()=>{const q=a.read(s,scope).quests;assert(q.M04.reality==="ORIGINAL"&&q.M06.reality==="PRESERVED"&&q.M01.status==="COMPLETED");});
  check("no ending or discovery activation",()=>assert(add(s,event("end","ACCEPT","M19")).reason==="UNKNOWN_OR_DISABLED_QUEST"&&add(s,event("disc","ACCEPT","D01")).reason==="UNKNOWN_OR_DISABLED_QUEST"));
  check("full snapshot roundtrip",()=>{const e=a.encode(s,scope);assert(e.ok&&JSON.stringify(a.decode(e.data,scope).snapshot)===JSON.stringify(s));});
  check("invalid main dependencies rejected",()=>{let threw=false;try{factory({definitions:[{...defs[1],requires:["S01"]}],contentRevision:"fixture_v1"});}catch{threw=true;}assert(threw);});
  check("invalid main reality rejected",()=>{let threw=false;try{factory({definitions:[{...defs[3],reality:"PRESERVED"}],contentRevision:"fixture_v1"});}catch{threw=true;}assert(threw);});
  check("empty real configuration fails closed",()=>{const empty=factory({definitions:[],contentRevision:"draft_v1"});const snap=empty.newSnapshot(scope);assert(empty.append(snap,{scope,expectedRevision:0,event:start}).reason==="UNKNOWN_OR_DISABLED_QUEST");});
  return checks;
}

test('opening quest adapter contract (32 isolated scenarios)',()=>{assert.equal(runCases(createOpeningQuestAdapter,value=>assert.ok(value)).length,32);});
