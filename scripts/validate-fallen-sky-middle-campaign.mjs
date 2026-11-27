// Static validation of disabled source-intake manifests; not gameplay code.
import {readFileSync} from 'node:fs';
const root=new URL('../docs/game3d/threads-of-our-pain/',import.meta.url);
const names=[
  "NPC_PHASE42_REGISTRY.json",
  "NPC_PHASE54_M07_INTAKE.json",
  "NPC_PHASE55_M08_INTAKE.json",
  "NPC_PHASE56_M09_INTAKE.json",
  "NPC_PHASE57_M10_INTAKE.json",
  "NPC_PHASE58_M11_INTAKE.json",
  "NPC_PHASE59_M12_INTAKE.json",
  "NPC_PHASE60_M13_INTAKE.json",
  "NPC_PHASE61_DISCOVERY_FRAMEWORK.json"
];
const aliases={
  "M07": "HISTORIAN_DEBRIEF",
  "M08": "ROUTE_ACCEPTED",
  "M09": "M09_COMPLETE",
  "M10": "M10_COMPLETE",
  "M11": "M11_COMPLETE",
  "M12": "M12_COMPLETE",
  "M13": "M13_COMPLETE"
};
function validate(registry,chapters,discovery,aliases){
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const ids=(prefix,n)=>Array.from({length:n},(_,i)=>prefix+String(i+1).padStart(2,"0"));
 const exact=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===b.length&&b.every(x=>a.includes(x));
 check("canonical main IDs",exact(registry.canonicalIds.main,ids("M",20)));
 check("canonical side IDs",exact(registry.canonicalIds.side,ids("S",55)));
 check("canonical discovery IDs",exact(registry.canonicalIds.discoveries,ids("D",50)));
 check("30 unique draft NPCs",exact(registry.actors.map(a=>a.proposedNpcId),ids("FS_NPC_",30).map(x=>x.replace(/(\d\d)$/,"0$1")))&&registry.actors.every(a=>a.enabled===false));
 check("55 unique side coordination assignments",exact(registry.actors.flatMap(a=>a.sideQuestCoordination),registry.canonicalIds.side));
 check("7 ordered chapter manifests",chapters.map(c=>c.questId).join()==="M07,M08,M09,M10,M11,M12,M13");
 const map=new Map(),localCounts={},canonical=new Set([...registry.canonicalIds.side,...registry.canonicalIds.discoveries]),npc=new Map(registry.actors.map(a=>[a.proposedNpcId,a]));
 const key=(q,s)=>q+":"+s;
 function parent(c,p){const prior=chapters[chapters.indexOf(c)-1];if(prior&&p===prior.questId+"_COMPLETE")return key(prior.questId,aliases[prior.questId]);if(c.questId==="M07"&&p==="M06_COMPLETE")return "M06:COMPLETE_EXTERNAL";return key(c.questId,p);}
 for(const [i,c] of chapters.entries()){
 const q=c.questId,stageIds=c.stages.map(s=>s.id),optional=c.optionalIndependent??c.optionalDependencies??[];
 check(q+" disabled source only",c.enabled===false&&c.shippingBlocked&&c.status==="SOURCE_INTAKE_ONLY");
 check(q+" local IDs unique",new Set(stageIds).size===stageIds.length);
 check(q+" predecessor declared",c.stages[0].requires.includes("M"+String(i+6).padStart(2,"0")+"_COMPLETE"));
 check(q+" terminal alias",stageIds.at(-1)===aliases[q]);
 check(q+" next eligibility", (c.completion??c.handoff).next.match(/^M\d\d/)[0]==="M"+String(i+8).padStart(2,"0")&&!(c.completion??c.handoff).autoAccept);
 check(q+" optional references canonical",optional.every(id=>canonical.has(id)));
 check(q+" no optional gate",c.stages.every(s=>s.requires.every(p=>!canonical.has(p))));
 check(q+" chronology pending",c.chronology.originalLocalOrderRelativeToM05==="UNRESOLVED");
 const actors=[...(c.actors??[]),...(c.families?.preserved??[]),...(c.families?.original??[]),...(c.otherActors??[])];
 check(q+" actor binding unresolved",actors.every(a=>a.runtimeId===null));
 check(q+" NPC candidates mapped",(c.coordinationCandidates??[]).every(a=>npc.get(a.id)?.name===a.name)&&actors.every(a=>!a.proposedNpcId||npc.has(a.proposedNpcId)));
 for(const s of c.stages){map.set(key(q,s.id),s.requires.map(p=>parent(c,p)));localCounts[s.id]=(localCounts[s.id]??0)+1;}
 }
 check("57 qualified nodes",map.size===57);
 check("RETURN15 collision isolated",localCounts.RETURN15===2&&map.has("M07:RETURN15")&&map.has("M08:RETURN15"));
 check("all edges resolve",[...map.values()].flat().every(p=>p==="M06:COMPLETE_EXTERNAL"||map.has(p)));
 const complete=(sequence,seed=["M06:COMPLETE_EXTERNAL"])=>{const done=new Set(seed);for(const id of sequence){if(done.has(id)||!map.has(id)||!map.get(id).every(p=>done.has(p)))return false;done.add(id);}return done.has("M13:M13_COMPLETE")&&[...map.keys()].every(k=>done.has(k));};
 const normal=chapters.flatMap(c=>c.stages.map(s=>key(c.questId,s.id)));
 const pairs=[["M11:VENT_RESTORED","M11:MEDICINE_DELIVERED"],["M12:EMBLEM15_OBSERVED","M12:REGISTER_COMPARED"],["M12:EMBLEM18_OBSERVED","M12:MELODY18_CONFIRMED"],["M13:M13_ESCORT_SAFE","M13:M13_ROOF_READY"]];
 for(let mask=0;mask<16;mask++){const seq=[...normal];for(const [i,[a,b]] of pairs.entries())if(mask&(1<<i)){const x=seq.indexOf(a),y=seq.indexOf(b);[seq[x],seq[y]]=[seq[y],seq[x]];}check("legal cross-chapter order "+mask,complete(seq));}
 for(const node of normal)check("missing "+node+" blocks completion",!complete(normal.filter(n=>n!==node)));
 check("M06 incomplete blocks entry",!complete(normal,[]));
 check("duplicate milestone rejected",!complete([normal[0],...normal]));
 check("unqualified return rejected",!complete(normal.map(n=>n==="M08:RETURN15"?"RETURN15":n)));
 check("wrong chapter return rejected",!complete(normal.map(n=>n==="M08:RETURN15"?"M07:RETURN15":n)));
 const [m7,m8,m9,m10,m11,m12,m13]=chapters;
 check("M07 mark separate from crest",m7.assetContract.sharedPersonalMark===m8.assetContract.separatePersonalMark&&m7.assetContract.adjacentDistinctCrest===m8.assetContract.sharedPublicCrest&&m8.assetContract.sharedPublicCrest!==m8.assetContract.separatePersonalMark);
 check("M08 public crest passes M09",m8.assetContract.sharedPublicCrest===m9.assets.publicCrest);
 check("M09 M10 pre-strike seam",m9.handoff.beat===m10.input.beat&&m9.handoff.next===m10.input.eligibility&&!m9.handoff.attackOccurred&&!m10.input.attackAlreadyOccurred&&JSON.stringify(m9.handoff.requiredState)===JSON.stringify(m10.input.requiredState));
 check("M10 no goddess defeat",!m10.encounter.goddessDefeated&&m10.encounter.objective==="PROTECT_AND_SURVIVE");
 check("M10 exit receipts before closure",m10.routes.requiredExitReceipts.every(id=>m10.stages.findIndex(s=>s.id===id)<m10.stages.findIndex(s=>s.id==="SEAM_CLOSED")));
 check("M11 M12 distinct family continuity",m11.actors.slice(0,3).map(a=>a.role).join()===m12.families.original.map(a=>a.name).join()&&m11.distinctM12Family.join()===m12.families.preserved.map(a=>a.name).join()&&!m12.families.sharedIdentityConfirmed);
 check("M11 M12 motif/emblem continuity",m11.family.melody.sharedMotif===m12.assets.motif&&m11.family.emblem.sharedDesign===m12.assets.emblem&&!m12.assets.physicalTransfer);
 check("M11 aid retained in M12",["VENT_RESTORED","MEDICINE_DELIVERED","CORRIDOR_SECURE"].every(x=>m12.revisit.retainM11.includes(x)));
 check("M13 no M14 spoiler",m13.completion.neutralSummons&&!m13.completion.spoiler);
 check("50 discoveries canonical disabled",exact(discovery.discoveries.map(d=>d.id),registry.canonicalIds.discoveries)&&discovery.discoveries.every(d=>d.enabled===false&&d.approvedRuntimeId===null&&d.approvedRewardDefinitionId===null));
 check("discovery claim and vista",discovery.common.completionRequires.includes("RELIC_CLAIM_RECEIPT")&&discovery.common.completionRequires.includes("ACTUAL_SECOND_VISTA"));
 check("discovery legacy history retained",discovery.common.legacyDonePreserved&&discovery.common.legacyMissingVistaAnnotation==="RECOLLECTION_OUTSTANDING");
 check("discovery exit independent",discovery.common.safeExitIndependent&&discovery.common.occupiedCollisionLease);
 check("discovery side quest independent",discovery.common.noSideQuestAutoComplete&&discovery.common.noManualMigration);
 check("lifetime entitlement retained",discovery.common.ngPlusResetsCycleObjectivesNotLifetimeEntitlement&&discovery.common.neverRecreateSoldConsumedOrDismantled);
 return {checks,nodes:map.size,edges:[...map.values()].reduce((a,p)=>a+p.length,0),localCollisions:Object.entries(localCounts).filter(([,n])=>n>1),optionalRefs:[...new Set(chapters.flatMap(c=>c.optionalIndependent??c.optionalDependencies??[]))].sort(),candidateIds:[...new Set(chapters.flatMap(c=>(c.coordinationCandidates??[]).map(x=>x.id)))].sort()};
}
const [registry,...chapters]=names.map(n=>JSON.parse(readFileSync(new URL(n,root),'utf8')));
const discovery=chapters.pop();
const result=validate(registry,chapters,discovery,aliases);
for(const check of result.checks)console.log((check.ok?'PASS ':'FAIL ')+check.name);
console.log(result.checks.filter(c=>c.ok).length+'/'+result.checks.length+' static checks passed');
if(result.checks.some(c=>!c.ok))process.exitCode=1;
