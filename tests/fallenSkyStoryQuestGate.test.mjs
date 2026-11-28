import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryQuestGate,classifyStoryQuestId} from '../src/components/game3d/narrative/storyQuestGate.mjs';

function runCases(check,eq,throws){
  const scope={ownerId:'__anon__',characterId:'character_a',campaignId:'cycle_1'};
  const bScope={...scope,characterId:'character_b'};
  const defs=[{id:'M01',reality:'PRESERVED',requires:[],objectives:['fixture_a'],enabled:true},
    {id:'M02',reality:'PRESERVED',requires:['M01'],objectives:['fixture_b'],enabled:true},
    {id:'S01',reality:'PRESERVED',requires:[],objectives:['fixture_s'],enabled:false}];
  const gate=createStoryQuestGate({definitions:defs,contentRevision:'fixture_v1'});
  const empty=createStoryQuestGate();
  let a=gate.newSnapshot(scope),b=gate.newSnapshot(bScope);
  const ev=(eventId,kind='ACCEPT',questId='M01',objectiveId=null,reality='PRESERVED')=>({eventId,kind,questId,objectiveId,reality});
  const req=(s,event,sc=scope)=>({scope:sc,expectedRevision:s.revision,event});
  const send=(s,event,sc=scope)=>gate.submit(s,req(s,event,sc));
  check('canonical opening classifier',()=>eq(classifyStoryQuestId('M06'),'OPENING_SUPPORTED'));
  check('canonical future chapters not supported',()=>eq(classifyStoryQuestId('M20'),'NOT_YET_SUPPORTED'));
  check('canonical discovery not supported',()=>eq(classifyStoryQuestId('D01'),'NOT_YET_SUPPORTED'));
  for(const id of ['M99','M1','m01',' M01','M01 ','S56','D00','tr_m01','axe_quest','__proto__',null,{}])
    check('reject unknown or legacy '+JSON.stringify(id),()=>eq(send(a,ev('bad','ACCEPT',id)).reason,'UNKNOWN_OR_DISABLED_QUEST'));
  check('disabled canonical side quest',()=>eq(send(a,ev('s','ACCEPT','S01')).reason,'UNKNOWN_OR_DISABLED_QUEST'));
  check('future canonical chapter',()=>eq(send(a,ev('later','ACCEPT','M07')).reason,'UNKNOWN_OR_DISABLED_QUEST'));
  check('discovery distinct lane',()=>eq(send(a,ev('d','ACCEPT','D01')).reason,'UNKNOWN_OR_DISABLED_QUEST'));
  check('empty default catalog fails closed',()=>eq(empty.submit(empty.newSnapshot(scope),req(a,ev('default'))).reason,'UNKNOWN_OR_DISABLED_QUEST'));
  check('caller definition refused at request',()=>eq(gate.submit(a,{...req(a,ev('fake')),definition:defs[0]}).reason,'INVALID_STORY_REQUEST'));
  check('caller definition refused at event',()=>eq(send(a,{...ev('fake'),definition:defs[0]}).reason,'INVALID_STORY_EVENT'));
  check('reward field refused',()=>eq(send(a,{...ev('fake'),xp:999}).reason,'INVALID_STORY_EVENT'));
  check('symbol key refused',()=>eq(gate.submit(a,{...req(a,ev('fake')),[Symbol('extra')]:1}).reason,'INVALID_STORY_REQUEST'));
  check('inherited request refused',()=>eq(gate.submit(a,Object.create(req(a,ev('fake')))).reason,'INVALID_STORY_REQUEST'));
  check('accessor request refused',()=>eq(gate.submit(a,{...req(a,ev('fake')),get event(){throw Error('getter should not run')}}).reason,'INVALID_STORY_REQUEST'));
  check('null request refused',()=>eq(gate.submit(a,null).reason,'INVALID_STORY_REQUEST'));
  check('invalid revision refused',()=>eq(gate.submit(a,{...req(a,ev('fake')),expectedRevision:NaN}).reason,'INVALID_STORY_REQUEST'));
  check('bad scope rejected',()=>throws(()=>gate.newSnapshot({...scope,characterId:'__anon__'})));
  check('prior chapter required',()=>eq(send(a,ev('next','ACCEPT','M02')).reason,'PREREQUISITE_REQUIRED'));
  check('wrong reality',()=>eq(send(a,ev('wrong','ACCEPT','M01',null,'ORIGINAL')).reason,'WRONG_REALITY'));
  check('accept once and original unchanged',()=>{const r=send(a,ev('accept'));eq(r.ok,true);eq(a.revision,0);a=r.snapshot;});
  check('separate character empty',()=>eq(Object.keys(gate.read(b,bScope).quests).length,0));
  check('foreign read refused',()=>eq(gate.read(a,bScope).ok,false));
  check('foreign write refused',()=>eq(send(a,ev('foreign'),bScope).ok,false));
  check('foreign campaign refused',()=>eq(gate.read(a,{...scope,campaignId:'cycle_2'}).ok,false));
  check('foreign owner refused',()=>eq(gate.read(a,{...scope,ownerId:'other'}).ok,false));
  check('stale revision refused',()=>eq(gate.submit(a,{...req(a,ev('stale','OBJECTIVE','M01','fixture_a')),expectedRevision:0}).reason,'STALE_REVISION'));
  check('exact duplicate safe',()=>{const r=gate.submit(a,{...req(a,ev('accept')),expectedRevision:0});eq(r.duplicate,true);eq(r.snapshot.revision,1);});
  check('conflicting event id refused',()=>eq(send(a,ev('accept','COMPLETE')).reason,'EVENT_ID_CONFLICT'));
  check('early completion refused',()=>eq(send(a,ev('complete','COMPLETE')).reason,'OBJECTIVES_INCOMPLETE'));
  check('unknown objective refused',()=>eq(send(a,ev('badobj','OBJECTIVE','M01','fake')).reason,'UNKNOWN_OBJECTIVE'));
  check('valid objective',()=>{const r=send(a,ev('obj','OBJECTIVE','M01','fixture_a'));eq(r.ok,true);a=r.snapshot;});
  check('duplicate objective refused',()=>eq(send(a,ev('obj2','OBJECTIVE','M01','fixture_a')).reason,'OBJECTIVE_ALREADY_RECORDED'));
  check('valid completion',()=>{const r=send(a,ev('done','COMPLETE'));eq(r.ok,true);a=r.snapshot;eq(gate.read(a,scope).quests.M01.status,'COMPLETED');});
  check('M02 eligible only after completion',()=>eq(send(a,ev('next','ACCEPT','M02')).ok,true));
  check('second character starts independently',()=>{const r=send(b,ev('accept'),bScope);eq(r.ok,true);b=r.snapshot;eq(gate.read(b,bScope).quests.M01.status,'ACTIVE');eq(gate.read(a,scope).quests.M01.status,'COMPLETED');});
  check('scoped encoding roundtrip',()=>{const enc=gate.encode(a,scope);eq(enc.ok,true);eq(JSON.stringify(gate.decode(enc.data,scope).snapshot),JSON.stringify(a));});
  check('foreign decoded save refused',()=>eq(gate.decode(gate.encode(a,scope).data,bScope).ok,false));
  check('mutation after construction cannot enable disabled ID',()=>{defs[2].enabled=true;eq(send(a,ev('s2','ACCEPT','S01')).reason,'UNKNOWN_OR_DISABLED_QUEST');});
  check('mutation after construction cannot replace objective',()=>{defs[0].objectives[0]='forged';eq(send(b,ev('fake','OBJECTIVE','M01','forged'),bScope).reason,'UNKNOWN_OBJECTIVE');});
  check('invalid config key rejected',()=>throws(()=>createStoryQuestGate({definitions:[],live:true})));
}
test('isolated story gate scenarios',()=>{runCases((name,fn)=>{try{fn()}catch(error){throw new Error(name,{cause:error})}},assert.equal,assert.throws);});
