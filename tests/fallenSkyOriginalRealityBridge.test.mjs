import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOriginalRealityBridge} from '../src/components/game3d/narrative/originalRealityBridge.mjs';
import {createOpeningQuestAdapter} from '../src/components/game3d/narrative/openingQuestAdapter.mjs';
import {createM01Bridge} from '../src/components/game3d/narrative/m01MerchantBridge.mjs';
import {createM02Bridge} from '../src/components/game3d/narrative/m02ClearingBridge.mjs';
import {createM03EncounterModel} from '../src/components/game3d/narrative/m03EncounterModel.mjs';
import {createM03QuestBridge} from '../src/components/game3d/narrative/m03QuestBridge.mjs';
const json=p=>JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/'+p,import.meta.url),'utf8'));
const draft=json('NPC_PHASE46_OPENING_REGION.json'),m03Def=json('NPC_PHASE49_M03_DEFINITION.json'),definitions=json('NPC_PHASE50_M04_M05_DEFINITIONS.json');
function runChecks(makeBridge,factories,draft,m03Def,definitions,assert){
 const [makeAdapter,makeM01,makeM02,makeModel,makeM03]=factories;
 const scope={ownerId:"__anon__",characterId:"char_fixture",campaignId:"campaign_fixture"};
 const defs=[...draft.objectiveDefinitions,m03Def,...definitions].map(d=>({...d,enabled:true}));
 const a=makeAdapter({definitions:defs,contentRevision:"phase50_fixture"}),first=makeM01(a),second=makeM02(a,first),third=makeM03(a,second,makeModel()),bridge=makeBridge(a,third);
 const checks=[];const check=(n,f)=>{f();checks.push(n);};
 let opening=first.create(scope);
 for(const [eventId,kind,mode,anchor,safeDestinationReady] of [["1","BEGIN","spawn","M01_SPAWN",false],["2","WARNING","proximity","M01_MERCHANT",false],["3","FRAGMENT","visual","M01_SKY_WINDOW",false],["4","ARRIVAL","threshold","M01_CLEARING_EDGE",true]]){
  const r=first.apply(opening,scope,opening.snapshot.revision,opening.observations.length,{eventId,kind,mode,anchor,reality:"PRESERVED",safeDestinationReady});assert(r.ok,r.reason);opening=r.bundle;
 }
 let clearing=second.create(opening,scope).bundle;
 for(const [eventId,kind,mode,anchor,arenaLoaded,controlAvailable] of [["1","BEGIN","approach","M02_APPROACH",false,false],["2","WARNING","contextual","M02_APPROACH",false,false],["3","WOLF","call_woman","M02_WOLF_VIEW",false,false],["4","SHADOW","accessible_cue","M02_WOLF_VIEW",false,false],["5","BARRIER","soil","M02_FRAGMENT_VIEW",false,false],["6","READINESS","outer_lookout","M02_OUTER_LOOKOUT",true,true]]){
  const r=second.apply(clearing,scope,clearing.opening.snapshot.revision,clearing.clearingObservations.length,{eventId,kind,mode,anchor,reality:"PRESERVED",arenaLoaded,controlAvailable});assert(r.ok,r.reason);clearing=r.bundle;
 }
 let beast=third.create(clearing,scope).bundle;
 check("requires completed M03",()=>assert(bridge.create(beast,scope).reason==="M03_REQUIRED"));
 for(const [eventId,epoch,kind,data] of [["start",0,"START",{role:"DAMAGE",assist:false,arenaLoaded:true,controlAvailable:true,validWeapon:true,loanerRequired:false}],["transform",1,"TRANSFORM_COMPLETE",{controlAvailable:true}],["victory",1,"BOSS_DAMAGE",{hpAfter:0}],["after",1,"AFTERMATH",{mode:"skip_with_journal"}]]){
  const r=third.apply(beast,scope,beast.clearing.opening.snapshot.revision,beast.encounterEvents.length,{eventId,epoch,kind,data});assert(r.ok,r.reason);beast=r.bundle;
 }
 let b=bridge.create(beast,scope).bundle;
 const state=()=>bridge.read(b,scope).state;
 const ev=(eventId,kind,mode,anchor,destinationReady=false,epoch=state().epoch)=>({eventId,epoch,kind,mode,anchor,reality:"ORIGINAL",verifiedSafe:true,destinationReady});
 const send=(e,rev=b.beast.clearing.opening.snapshot.revision,count=b.originalEvents.length,s=scope)=>bridge.apply(b,s,rev,count,e);
 const add=e=>{const r=send(e);assert(r.ok,r.reason);b=r.bundle;return r;};
 const wake=ev("wake","AWAKEN","safe_loaded","M04_AWAKEN",true);
 check("no unsafe awakening",()=>assert(send({...wake,destinationReady:false}).reason==="DESTINATION_NOT_READY_OR_UNEXPECTED"));
 check("wrong reality blocked",()=>assert(send({...wake,reality:"PRESERVED"}).reason==="INVALID_EVENT"));
 check("no early death commit",()=>assert(send(ev("bad","COMMIT","cinematic_complete","M05_HAND",true)).reason==="WRONG_STAGE"));
 check("awakening records original reality",()=>{const prior=b;add(wake);assert(state().activeReality==="ORIGINAL"&&prior.originalEvents.length===0);});
 check("exact wake retry",()=>assert(send(wake,0,0).duplicate));
 check("conflicting event ID",()=>assert(send({...wake,anchor:"M04_AWAKEN",verifiedSafe:false}).reason==="EVENT_ID_CONFLICT"));
 check("practice or skip required",()=>assert(send(ev("sel","SELECT","RANGE","M04_YARD")).reason==="PRACTICE_OR_SKIP_REQUIRED"));
 check("skip permits role selection",()=>{add(ev("skip","SKIP","voluntary","M04_YARD"));add(ev("select","SELECT","RANGE","M04_YARD"));assert(state().role==="RANGE");});
 check("hold cannot precede refuge",()=>assert(send(ev("earlyhold","HOLD_A","safe_and_resolved","M04_HOLD_A")).reason==="WRONG_STAGE"));
 check("unverified civilian arrival rejected",()=>assert(send({...ev("court","COURT","side_lane","M04_REFUGE"),verifiedSafe:false}).reason==="UNVERIFIED_OBSERVATION"));
 check("civilian side lane",()=>{add(ev("court","COURT","side_lane","M04_REFUGE"));assert(state().courtSafe&&state().courtRoute==="side_lane");});
 check("ordinary defeat preserves group and changes epoch",()=>{add(ev("fall","RECOVER","ordinary_failure","M04_REFUGE"));assert(state().courtSafe&&state().epoch===1&&!state().authoredDeath);});
 check("late combat event rejected",()=>assert(send(ev("late","HOLD_A","safe_and_resolved","M04_HOLD_A",false,0)).reason==="STALE_EPOCH"));
 check("safe checkpoint serialize",()=>{const x=bridge.encode(b,scope),y=bridge.decode(x.data,scope);assert(x.ok&&y.ok);b=y.bundle;assert(state().courtSafe);});
 check("hold A then B",()=>{add(ev("a","HOLD_A","safe_and_resolved","M04_HOLD_A"));add(ev("b","HOLD_B","safe_and_resolved","M04_HOLD_B"));assert(state().holdA&&state().holdB);});
 check("captain withdrawal completes M04",()=>{add(ev("exit","EXIT","captain_withdrawal","M04_RIVER_EXIT"));assert(a.read(b.beast.clearing.opening.snapshot,scope).quests.M04.status==="COMPLETED"&&!state().authoredDeath);});
 check("M05 road load required",()=>assert(send(ev("roadbad","ROAD","safe_loaded","M05_ROAD")).reason==="DESTINATION_NOT_READY_OR_UNEXPECTED"));
 check("road begins",()=>{add(ev("road","ROAD","safe_loaded","M05_ROAD",true));assert(state().stage==="M05_RIVER");});
 check("optional assistance recorded",()=>{add(ev("assist","ASSIST","delegate","M05_FAMILY_HOLD"));assert(state().assistance==="delegate");});
 check("upper bypass valid",()=>{add(ev("river","RIVER","upper_bypass","M05_RIVER_SAFE"));assert(state().riverRoute==="upper_bypass");});
 check("barrier view before threshold",()=>assert(send(ev("premature","READY","voluntary","M05_THRESHOLD_READY")).reason==="WRONG_STAGE"));
 check("barrier view and readiness",()=>{add(ev("view","VIEW","witness","M05_BARRIER_VIEW"));add(ev("ready","READY","voluntary","M05_THRESHOLD_READY"));assert(!state().authoredDeath);});
 check("ordinary threshold failure not death commit",()=>{add(ev("retry","RECOVER","ordinary_failure","M05_THRESHOLD_READY"));assert(!state().authoredDeath&&state().stage==="M05_AUTHORED_READY");});
 check("wrong recovery anchor blocked",()=>assert(send(ev("badrec","RECOVER","ordinary_failure","M04_REFUGE")).reason==="INVALID_RECOVERY"));
 check("destination failure leaves ready",()=>assert(send(ev("load","COMMIT","cinematic_complete","M05_HAND")).reason==="DESTINATION_NOT_READY_OR_UNEXPECTED"&&!state().authoredDeath));
 check("foreign scope rejected",()=>assert(!send(ev("commit","COMMIT","skip_with_journal","M05_HAND",true),b.beast.clearing.opening.snapshot.revision,b.originalEvents.length,{...scope,characterId:"other"}).ok));
 check("extra reward field rejected",()=>assert(send({...ev("commit","COMMIT","skip_with_journal","M05_HAND",true),gold:99}).reason==="INVALID_EVENT"));
 const commit=ev("commit","COMMIT","skip_with_journal","M05_HAND",true);
 check("authored death and strand commit together",()=>{add(commit);const s=state();assert(s.authoredDeath&&s.lifeForcePreserved&&s.silverMarkPending&&s.m06Eligible&&s.activeReality==="TRANSITION_PENDING"&&s.olderLocalChronology==="UNRESOLVED");});
 check("no automatic M06 acceptance",()=>assert(!a.read(b.beast.clearing.opening.snapshot,scope).quests.M06));
 check("no second catastrophe",()=>assert(send({...commit,eventId:"commit2"}).reason==="WRONG_STAGE"));
 check("exact commit retry",()=>assert(send(commit).duplicate));
 check("completed checkpoint reload",()=>{const x=bridge.encode(b,scope),y=bridge.decode(x.data,scope);assert(x.ok&&y.ok&&bridge.read(y.bundle,scope).state.authoredDeath);});
 check("tampered history rejected",()=>{const x=JSON.parse(JSON.stringify(b));x.originalEvents=x.originalEvents.filter(e=>e.kind!=="COMMIT");assert(!bridge.read(x,scope).ok);});
 check("previous chapters retained",()=>assert(third.read(b.beast,scope).state.m04Available&&a.read(b.beast.clearing.opening.snapshot,scope).quests.M05.status==="COMPLETED"));
 check("alternate practice roles and bank path no optional help",()=>{for(const role of ["DAMAGE","DEFENSE"]){b=bridge.create(beast,scope).bundle;add(wake);add(ev("p","PRACTICE",role,"M04_YARD"));add(ev("s","SELECT",role,"M04_YARD"));add(ev("c","COURT","main_wagon","M04_REFUGE"));add(ev("a","HOLD_A","safe_and_resolved","M04_HOLD_A"));add(ev("b","HOLD_B","safe_and_resolved","M04_HOLD_B"));add(ev("x","EXIT","captain_withdrawal","M04_RIVER_EXIT"));add(ev("r","ROAD","safe_loaded","M05_ROAD",true));add(ev("river","RIVER","bank_short","M05_RIVER_SAFE"));add(ev("v","VIEW","witness","M05_BARRIER_VIEW"));add(ev("t","READY","voluntary","M05_THRESHOLD_READY"));add(ev("d","COMMIT","cinematic_complete","M05_HAND",true));assert(state().m06Eligible&&state().assistance===null);}});
 check("disabled M04 blocked",()=>{const aa=makeAdapter({definitions:defs.map(d=>({...d,enabled:!["M04","M05"].includes(d.id)})),contentRevision:"phase50_fixture"}),f=makeM01(aa),s=makeM02(aa,f),t=makeM03(aa,s,makeModel()),bb=makeBridge(aa,t),initial=bb.create(beast,scope);assert(initial.ok&&bb.apply(initial.bundle,scope,initial.bundle.beast.clearing.opening.snapshot.revision,0,wake).reason==="UNKNOWN_OR_DISABLED_QUEST");});
 return checks;
}
test('M04/M05 fixture: 37 scenarios',()=>assert.equal(runChecks(createOriginalRealityBridge,[createOpeningQuestAdapter,createM01Bridge,createM02Bridge,createM03EncounterModel,createM03QuestBridge],draft,m03Def,definitions,(v,m)=>assert.ok(v,m)).length,37));
