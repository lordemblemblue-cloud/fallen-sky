/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM03EncounterModel} from '../src/components/game3d/narrative/m03EncounterModel.mjs';
import {createM03QuestBridge} from '../src/components/game3d/narrative/m03QuestBridge.mjs';
import {createOpeningQuestAdapter} from '../src/components/game3d/narrative/openingQuestAdapter.mjs';
import {createM01Bridge} from '../src/components/game3d/narrative/m01MerchantBridge.mjs';
import {createM02Bridge} from '../src/components/game3d/narrative/m02ClearingBridge.mjs';
const draft=JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/NPC_PHASE46_OPENING_REGION.json',import.meta.url),'utf8'));
const definition=JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/NPC_PHASE49_M03_DEFINITION.json',import.meta.url),'utf8'));
function runChecks(makeModel,makeBridge,makeAdapter,makeM01,makeM02,draft,definition,assert){
 const checks=[];const check=(n,f)=>{f();checks.push(n);};
 const scope={ownerId:"__anon__",characterId:"char_fixture",campaignId:"campaign_fixture"};
 const defs=[...draft.objectiveDefinitions,definition].map(d=>({...d,enabled:true}));
 const a=makeAdapter({definitions:defs,contentRevision:"phase49_fixture"}),first=makeM01(a),second=makeM02(a,first),model=makeModel(),bridge=makeBridge(a,second,model);
 let opening=first.create(scope);
 for(const [eventId,kind,mode,anchor,safeDestinationReady] of [["1","BEGIN","spawn","M01_SPAWN",false],["2","WARNING","proximity","M01_MERCHANT",false],["3","FRAGMENT","visual","M01_SKY_WINDOW",false],["4","ARRIVAL","threshold","M01_CLEARING_EDGE",true]]){
  const r=first.apply(opening,scope,opening.snapshot.revision,opening.observations.length,{eventId,kind,mode,anchor,reality:"PRESERVED",safeDestinationReady});assert(r.ok,r.reason);opening=r.bundle;
 }
 let clearing=second.create(opening,scope).bundle;
 check("M02 required",()=>assert(bridge.create(clearing,scope).reason==="M02_REQUIRED"));
 for(const [eventId,kind,mode,anchor,arenaLoaded,controlAvailable] of [["1","BEGIN","approach","M02_APPROACH",false,false],["2","WARNING","contextual","M02_APPROACH",false,false],["3","WOLF","call_woman","M02_WOLF_VIEW",false,false],["4","SHADOW","accessible_cue","M02_WOLF_VIEW",false,false],["5","BARRIER","soil","M02_FRAGMENT_VIEW",false,false],["6","READINESS","outer_lookout","M02_OUTER_LOOKOUT",true,true]]){
  const r=second.apply(clearing,scope,clearing.opening.snapshot.revision,clearing.clearingObservations.length,{eventId,kind,mode,anchor,reality:"PRESERVED",arenaLoaded,controlAvailable});assert(r.ok,r.reason);clearing=r.bundle;
 }
 let b=bridge.create(clearing,scope).bundle;
 const state=()=>bridge.read(b,scope).state;
 const e=(eventId,kind,data={},epoch=state().epoch)=>({eventId,kind,data,epoch});
 const send=(event,rev=b.clearing.opening.snapshot.revision,count=b.encounterEvents.length,s=scope)=>bridge.apply(b,s,rev,count,event);
 const add=event=>{const r=send(event);assert(r.ok,r.reason);b=r.bundle;return r;};
 const startData={role:"DAMAGE",assist:false,arenaLoaded:true,controlAvailable:true,validWeapon:true,loanerRequired:false};
 check("no attack before start",()=>assert(send(e("early","TELEGRAPH",{attackId:"a",attack:"CLAW"})).reason==="ENCOUNTER_NOT_ACTIVE"));
 check("arena ready required",()=>assert(send(e("bad","START",{...startData,arenaLoaded:false})).reason==="UNSAFE_START"));
 check("no loaner over valid weapon",()=>assert(send(e("loan","START",{...startData,role:"TRAINING_LOANER",loanerRequired:true})).reason==="INVALID_WEAPON_SELECTION"));
 const start=e("start","START",startData);
 check("start transforms",()=>{add(start);assert(state().status==="TRANSFORMING"&&state().epoch===1);});
 check("exact start retry",()=>assert(send(start,0,0).duplicate));
 check("no hit during transformation",()=>assert(send(e("hit","BOSS_DAMAGE",{hpAfter:0})).reason==="ENCOUNTER_NOT_ACTIVE"));
 check("controls required after transformation",()=>assert(send(e("transformbad","TRANSFORM_COMPLETE",{controlAvailable:false})).reason==="TRANSFORMATION_NOT_READY"));
 check("phase A",()=>{add(e("transform","TRANSFORM_COMPLETE",{controlAvailable:true}));assert(state().phase==="A");});
 check("wrong phase attack",()=>assert(send(e("pulse0","TELEGRAPH",{attackId:"p",attack:"BARRIER_PULSE"})).reason==="INVALID_TELEGRAPH"));
 check("telegraph before hit",()=>{add(e("claw","TELEGRAPH",{attackId:"claw1",attack:"CLAW"}));assert(send(e("resolve0","RESOLVE",{attackId:"claw1",outcome:"miss"})).reason==="INVALID_RESOLUTION");});
 check("hit window and resolve",()=>{add(e("clawhit","HIT_WINDOW",{attackId:"claw1"}));add(e("clawend","RESOLVE",{attackId:"claw1",outcome:"miss"}));assert(!state().pending);});
 check("attack ID cannot repeat",()=>assert(send(e("clawagain","TELEGRAPH",{attackId:"claw1",attack:"CLAW"})).reason==="ATTACK_ID_REUSED"));
 check("phase B threshold",()=>{add(e("damage1","BOSS_DAMAGE",{hpAfter:7000}));assert(state().phase==="B");});
 check("interrupt prevents barrier hit",()=>{add(e("pulse1","TELEGRAPH",{attackId:"p1",attack:"BARRIER_PULSE"}));add(e("interrupt","PROTECT",{attackId:"p1",method:"interrupt"}));assert(state().barrier===3&&state().protectionAcknowledged&&!state().pending);});
 check("lure alternative",()=>{add(e("pulse2","TELEGRAPH",{attackId:"p2",attack:"BARRIER_PULSE"}));add(e("lure","PROTECT",{attackId:"p2",method:"lure"}));assert(state().barrier===3);});
 check("failed interrupt costs one segment",()=>{add(e("pulse3","TELEGRAPH",{attackId:"p3",attack:"BARRIER_PULSE"}));add(e("pulse3hit","HIT_WINDOW",{attackId:"p3"}));assert(send(e("late","PROTECT",{attackId:"p3",method:"interrupt"})).reason==="PROTECTION_NOT_AVAILABLE");add(e("pulse3end","RESOLVE",{attackId:"p3",outcome:"barrier_hit"}));assert(state().barrier===2&&state().status==="ACTIVE");});
 check("no unsafe combat save",()=>assert(bridge.encode(b,scope).reason==="UNSAFE_CHECKPOINT"));
 check("ordinary defeat not migration",()=>{add(e("death","PLAYER_DEFEAT"));assert(state().status==="FAILED"&&!state().m04Available&&!state().pending);});
 check("stale encounter event rejected",()=>assert(send(e("old","BOSS_DAMAGE",{hpAfter:0},1)).reason==="STALE_EPOCH"));
 check("retry with range and assist",()=>{add(e("retry","START",{...startData,role:"RANGE",assist:true}));add(e("trans2","TRANSFORM_COMPLETE",{controlAvailable:true}));assert(state().role==="RANGE"&&state().assist&&state().hp===10000&&state().barrier===3);});
 check("retreat resets attempt",()=>{add(e("retreat","RETREAT"));assert(state().status==="RETREATED"&&!state().m04Available);});
 check("retreat checkpoint reload",()=>{const enc=bridge.encode(b,scope),dec=bridge.decode(enc.data,scope);assert(enc.ok&&dec.ok);b=dec.bundle;});
 check("defense role",()=>{add(e("retry2","START",{...startData,role:"DEFENSE"}));add(e("trans3","TRANSFORM_COMPLETE",{controlAvailable:true}));assert(state().role==="DEFENSE");});
 check("checkpoint reset while active",()=>{add(e("reload","RELOAD_CHECKPOINT"));assert(state().status==="READY"&&!state().m04Available);});
 check("loaner only when no valid weapon",()=>{add(e("retry3","START",{...startData,role:"TRAINING_LOANER",validWeapon:false,loanerRequired:true}));add(e("trans4","TRANSFORM_COMPLETE",{controlAvailable:true}));assert(state().role==="TRAINING_LOANER");});
 check("phase C threshold",()=>{add(e("damage2","BOSS_DAMAGE",{hpAfter:7000}));add(e("damage3","BOSS_DAMAGE",{hpAfter:3500}));assert(state().phase==="C");});
 check("victory cancels pending attack",()=>{add(e("tail","TELEGRAPH",{attackId:"tail1",attack:"TAIL_ARC"}));add(e("victory","BOSS_DAMAGE",{hpAfter:0}));assert(state().status==="DEFEATED"&&!state().pending&&!state().m04Available&&!state().sealRepaired);});
 check("late damage blocked",()=>assert(send(e("latehit","HIT_WINDOW",{attackId:"tail1"})).reason==="ENCOUNTER_NOT_ACTIVE"));
 check("victory checkpoint reload",()=>{const enc=bridge.encode(b,scope),dec=bridge.decode(enc.data,scope);assert(enc.ok&&dec.ok);b=dec.bundle;assert(state().status==="DEFEATED");});
 const finish=e("after","AFTERMATH",{mode:"skip_with_journal"});
 check("aftermath completes M03",()=>{add(finish);assert(state().m04Available&&a.read(b.clearing.opening.snapshot,scope).quests.M03.status==="COMPLETED");});
 check("no automatic M04 acceptance",()=>assert(!a.read(b.clearing.opening.snapshot,scope).quests.M04));
 check("no repeated completion",()=>assert(send(e("after2","AFTERMATH",{mode:"acknowledge"})).reason==="AFTERMATH_NOT_AVAILABLE"));
 check("exact finish retry",()=>assert(send(finish).duplicate));
 check("foreign character rejected",()=>assert(!send(finish,0,0,{...scope,characterId:"other"}).ok));
 check("prior M01 M02 retained",()=>assert(second.read(b.clearing,scope).m03Available));
 check("tampered journal rejected",()=>{const x=JSON.parse(JSON.stringify(b));x.encounterEvents=x.encounterEvents.filter(v=>v.kind!=="AFTERMATH");assert(!bridge.read(x,scope).ok);});
 check("barrier failure distinct from victory",()=>{let j=[];const m=makeModel({barrierSegments:1});const go=(id,kind,data={})=>{const s=m.read(j).state,r=m.append(j,j.length,{eventId:id,kind,data,epoch:s.epoch});assert(r.ok,r.reason);j=r.events;};go("s","START",startData);go("t","TRANSFORM_COMPLETE",{controlAvailable:true});go("d","BOSS_DAMAGE",{hpAfter:7000});go("p","TELEGRAPH",{attackId:"p",attack:"BARRIER_PULSE"});go("h","HIT_WINDOW",{attackId:"p"});go("r","RESOLVE",{attackId:"p",outcome:"barrier_hit"});assert(m.read(j).state.status==="FAILED"&&!m.read(j).state.m04Available);});
 check("disabled M03 remains disabled",()=>{const aa=makeAdapter({definitions:defs.map(d=>({...d,enabled:d.id!=="M03"})),contentRevision:"phase49_fixture"}),f=makeM01(aa),s=makeM02(aa,f),bb=makeBridge(aa,s,model),initial=bb.create(clearing,scope);assert(initial.ok&&bb.apply(initial.bundle,scope,initial.bundle.clearing.opening.snapshot.revision,0,start).reason==="UNKNOWN_OR_DISABLED_QUEST");});
 return checks;
}
test('M03 fixture: 39 scenarios',()=>assert.equal(runChecks(createM03EncounterModel,createM03QuestBridge,createOpeningQuestAdapter,createM01Bridge,createM02Bridge,draft,definition,(v,m)=>assert.ok(v,m)).length,39));
