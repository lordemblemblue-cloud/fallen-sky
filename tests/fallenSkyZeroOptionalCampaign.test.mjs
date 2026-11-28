/* global URL */
// Data-level campaign regression, not executable game or reward/ending authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOpeningQuestAdapter} from '../src/components/game3d/narrative/openingQuestAdapter.mjs';
const json=name=>JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/'+name,import.meta.url),'utf8'));
const finale=JSON.parse(readFileSync(new URL('./fixtures/fallenSkyPhase75Finale.json',import.meta.url),'utf8'));
const names=["NPC_PHASE42_REGISTRY.json","NPC_PHASE46_OPENING_REGION.json","NPC_PHASE49_M03_DEFINITION.json","NPC_PHASE50_M04_M05_DEFINITIONS.json","NPC_PHASE51_M06_DEFINITION.json","NPC_PHASE54_M07_INTAKE.json","NPC_PHASE55_M08_INTAKE.json","NPC_PHASE56_M09_INTAKE.json","NPC_PHASE57_M10_INTAKE.json","NPC_PHASE58_M11_INTAKE.json","NPC_PHASE59_M12_INTAKE.json","NPC_PHASE60_M13_INTAKE.json","NPC_PHASE63_M14_INTAKE.json","NPC_PHASE64_M15_INTAKE.json","NPC_PHASE65_M16_INTAKE.json","NPC_PHASE66_M17_INTAKE.json","NPC_PHASE67_M18_INTAKE.json"];
const [registry,opening,m03,original,m06,...middleLate]=names.map(json);
const defs=[...opening.objectiveDefinitions,m03,...original,m06];
const [m19,m20]=finale.chapters;
const chapters=[...middleLate,m19];
const aliases={M07:'HISTORIAN_DEBRIEF',M08:'ROUTE_ACCEPTED'};
const branches=['SACRIFICE_RESTORATION','REFUSAL_FUSION'];

function runCases(check,eq){
 const main=registry.canonicalIds.main,optional=new Set([...registry.canonicalIds.side,...registry.canonicalIds.discoveries]);
 const key=(q,id)=>q+':'+id;
 const terminal=q=>aliases[q]??q+'_COMPLETE';
 const scope={ownerId:'__anon__',characterId:'phase75_fixture',campaignId:'fixture_cycle'};
 check('20 canonical chapters',()=>eq(main.join(),Array.from({length:20},(_,i)=>'M'+String(i+1).padStart(2,'0')).join()));
 check('105 distinct optional IDs',()=>eq(optional.size,105));
 check('opening six real source definitions only',()=>eq(defs.map(d=>d.id).join(),main.slice(0,6).join()));
 check('opening definitions disabled at source',()=>eq(defs.every(d=>d.enabled===false),true));
 check('opening prerequisites main only',()=>eq(defs.every((d,i)=>d.requires.join()===(i?main[i-1]:'')),true));
 check('M07 through M19 source sequence',()=>eq(chapters.map(c=>c.questId).join(),main.slice(6,19).join()));
 check('finale snapshot marked unmerged',()=>eq(finale.status,'PINNED_UNMERGED_FINALE_GRAPH_ONLY'));
 check('finale production confirmation disabled',()=>eq(m19.review.productionConfirmEnabled,false));
 check('M20 requires committed branch',()=>eq(m20.input.immutableBranch&&m20.completion.requiresActualCommittedBranch,true));
 const a=createOpeningQuestAdapter({definitions:defs.map(d=>({...d,enabled:true})),contentRevision:'phase75_fixture'});
 const openingEvents=defs.flatMap(d=>['ACCEPT',...d.objectives,'COMPLETE'].map((v,i)=>({eventId:d.id+'_'+i,questId:d.id,kind:v==='ACCEPT'||v==='COMPLETE'?v:'OBJECTIVE',reality:d.reality,objectiveId:v==='ACCEPT'||v==='COMPLETE'?null:v})));
 function open(events){
   let snapshot=a.newSnapshot(scope);
   for(const event of events){const r=a.append(snapshot,{scope,expectedRevision:snapshot.revision,event});if(!r.ok)return null;snapshot=r.snapshot;}
   const r=a.read(snapshot,scope);return r.ok?r.quests:null;
 }
 const actual=open(openingEvents);
 check('M01–M06 actual adapter completes with no optional IDs',()=>eq(Object.keys(actual??{}).join(),main.slice(0,6).join()));
 check('all opening chapters completed',()=>eq(Object.values(actual??{}).filter(q=>q.status==='COMPLETED').length,6));
 check('no opening optional records',()=>eq(Object.keys(actual??{}).some(id=>optional.has(id)),false));
 for(const ev of openingEvents)check('opening omission '+ev.eventId,()=>eq(open(openingEvents.filter(e=>e!==ev))?.M06?.status==='COMPLETED',false));
 const map=new Map();
 for(const [i,c] of chapters.entries()){
   const q=c.questId,prev=main[i+5],prevMarker=prev+'_COMPLETE';
   check(q+' disabled source only',()=>eq(c.enabled===false&&c.shippingBlocked===true,true));
   check(q+' unique milestones',()=>eq(new Set(c.stages.map(s=>s.id)).size,c.stages.length));
   check(q+' no optional prerequisites',()=>eq(c.stages.every(s=>s.requires.every(p=>!optional.has(p))),true));
   check(q+' predecessor',()=>eq(c.stages[0].requires.includes(prevMarker),true));
   check(q+' terminal',()=>eq(c.stages.at(-1).id,terminal(q)));
   for(const s of c.stages)map.set(key(q,s.id),s.requires.map(p=>p===prevMarker?key(prev,terminal(prev)):key(q,p)));
 }
 check('150 distinct M07–M19 milestones',()=>eq(map.size,150));
 check('M07–M19 resolved edges',()=>eq([...map.values()].flat().every(p=>p==='M06:M06_COMPLETE'||map.has(p)),true));
 const prefix=chapters.flatMap(c=>c.stages.map(s=>key(c.questId,s.id)));
 const orders={};
 for(const branch of branches){
   const graph=new Map(map);
   const stages=[...m20.commonStages,...m20.branchStages[branch],{id:m20.terminal.id,requires:m20.terminal.requiresByBranch[branch]}];
   for(const s of stages)graph.set(key('M20',s.id),s.requires.map(p=>p==='M19_COMPLETE'?key('M19',p):key('M20',p)));
   const seq=[...prefix,...stages.map(s=>key('M20',s.id))];orders[branch]=seq;
   function finish(sequence,openingState=actual){
     // Only actual completion of the isolated opening adapter supplies the seed.
     const done=new Set(openingState?.M06?.status==='COMPLETED'?['M06:M06_COMPLETE']:[]);
     for(const n of sequence){if(done.has(n)||!graph.has(n)||!graph.get(n).every(p=>done.has(p)))return false;done.add(n);}
     return [...graph.keys()].every(n=>done.has(n))&&done.has('M20:M20_COMPLETE');
   }
   check(branch+' no optional dependencies',()=>eq(stages.every(s=>s.requires.every(p=>!optional.has(p))),true));
   check(branch+' all edges resolve',()=>eq([...graph.values()].flat().every(p=>p==='M06:M06_COMPLETE'||graph.has(p)),true));
   check(branch+' full main-only path',()=>eq(finish(seq),true));
   check(branch+' no opening completion blocks',()=>eq(finish(seq,null),false));
   check(branch+' duplicate milestone rejected',()=>eq(finish([seq[0],...seq]),false));
   check(branch+' optional injected as milestone rejected',()=>eq(finish([...seq,'S01:COMPLETE']),false));
   for(const id of seq)check(branch+' omit '+id,()=>eq(finish(seq.filter(x=>x!==id)),false));
   const other=branches.find(b=>b!==branch);
   check(branch+' wrong ending rejected',()=>eq(finish([...prefix,...m20.commonStages.map(s=>key('M20',s.id)),...m20.branchStages[other].map(s=>key('M20',s.id)),'M20:M20_COMPLETE']),false));
 }
 check('no actual optional rewards or progress generated',()=>eq(Object.keys(actual??{}).every(id=>main.includes(id))&&Object.values(orders).every(seq=>seq.every(id=>main.includes(id.split(':')[0]))),true));
}

test('main-only progression through both draft ending graphs',()=>runCases((name,fn)=>{try{fn()}catch(error){throw new Error(name,{cause:error})}},assert.equal));
