import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CREATOR_INTAKE_SCHEMA_832,
  parseCreatorIntakeBody832,
  createGame3DCreatorPrivateIntake832,
} from '../creatorCatalogPrivateIntake832.mjs';

const previousStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
before(()=>{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'});
after(()=>{
  if(previousStage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=previousStage;
});
const ID='10000000-0000-4000-8000-000000000001';
const context=Object.freeze({privateSession:'not-a-browser-property'});
const proposal={schema:'axe-game3d-creator-proposal-829-v1',
  source:{boxId:'box1',slotIndex:3},
  blueprint:{id:'item1',name:'Draft Sword',kind:'equipment',
    rarity:'Epic',slot:'weapon',levelMin:1,levelMax:30,
    stats:{strength:25},dropChance:0}};
const body=(operation,overrides={})=>JSON.stringify({
  schema:CREATOR_INTAKE_SCHEMA_832,
  ...(operation==='submit'?{proposal}:operation==='status'
    ?{proposalId:ID}:{proposalId:ID,disposition:'reject',note:'Not balanced'}),
  ...overrides,
});
const safe={stagingOnly:true,catalogPublished:false,
  eligibleForIssuance:false,rewardsIssued:false};
function make(options={}){
 let time=100000;
 const state={submitted:0,statusRead:0,reviewed:0,audits:[],contexts:[]};
 const staging={
  version:'axe-game3d-creator-staging-830-v1',
  privateServerOnly:true,publicRouteInstalled:false,
  productionReady:false,catalogPublished:false,
  eligibleForIssuance:false,rewardsIssued:false,
  async submit(args){
    state.submitted++;state.contexts.push(args.serverContext);
    return {...safe,ok:true,status:'pending',proposalId:ID,created:true};
  },
  async status(args){
    state.statusRead++;state.contexts.push(args.serverContext);
    return {...safe,ok:true,status:'pending',proposalId:ID};
  },
  async review(args){
    state.reviewed++;state.contexts.push(args.serverContext);
    return {...safe,ok:true,status:'curation-only',proposalId:ID,
      reviewed:true,disposition:args.disposition};
  },
  ...options.staging,
 };
 const auditEvent=options.auditEvent??(async event=>{
   state.audits.push(event);return true;
 });
 const authenticateServerSession=options.authenticateServerSession??
   (async (serverContext,operation)=>({
     authorized:serverContext===context,
     identitySource:'trusted-server-session',
     capability:'creator-catalog:'+operation,
     principalId:'creator-test',expiresAtMs:time+60000,
   }));
 const settings={
  staging,auditEvent,authenticateServerSession,enabled:true,
  scope:'private-staging',now:()=>time,...options,
 };
 delete settings.auditEventOverride;
 if(options.staging)settings.staging=staging;
 const service=createGame3DCreatorPrivateIntake832(settings);
 return {service,staging,state,advance:n=>{time+=n},
   setTime:n=>{time=n}};
}
const run=(service,operation='submit',overrides={})=>
 service.execute({operation,rawBody:body(operation,overrides),serverContext:context});

test('83.2 strict request schema admits only exact operation fields',()=>{
 assert.equal(parseCreatorIntakeBody832('submit',body('submit')).ok,true);
 assert.equal(parseCreatorIntakeBody832('status',body('status')).ok,true);
 assert.equal(parseCreatorIntakeBody832('review',body('review')).ok,true);
 for(const [op,fields] of [
  ['submit',{role:'admin'}],['submit',{creatorId:'victim'}],
  ['submit',{eligibleForIssuance:true}],['status',{isDeveloper:true}],
  ['review',{reviewerId:'client'}],['review',{rewardsIssued:true}],
 ]){
   assert.equal(parseCreatorIntakeBody832(op,body(op,fields)).ok,false,op);
 }
});

test('83.2 refuses invalid JSON and Unicode bodies above byte cap',()=>{
 for(const raw of ['',null,{},'{','[]','"hello"',' '.repeat(16385),
   JSON.stringify({schema:CREATOR_INTAKE_SCHEMA_832,proposal:'😀'.repeat(5000)})]){
   assert.equal(parseCreatorIntakeBody832('submit',raw).ok,false);
 }
});

test('83.2 invalid proposal IDs, decisions and control notes never pass',()=>{
 for(const candidate of [
  body('status',{proposalId:'../../private'}),
  body('status',{proposalId:5}),
  body('review',{disposition:'publish'}),
  body('review',{disposition:'accept-for-curation',note:''}),
  body('review',{note:'\u0001invalid'}),
  body('review',{note:'x'.repeat(501)}),
 ]){
  assert.equal(parseCreatorIntakeBody832(candidate.includes('"disposition"')?'review':'status',
    candidate).ok,false);
 }
});

test('83.2 factory refuses production, public routes or missing trusted services',()=>{
 const {staging}=make();
 for(const overrides of [
  {enabled:false},{scope:'public'},
  {staging:{...staging,publicRouteInstalled:true}},
  {staging:{...staging,catalogPublished:true}},
  {staging:{...staging,eligibleForIssuance:true}},
  {authenticateServerSession:null},{auditEvent:null},
  {principalLimit:0},{globalLimit:0},{windowMs:1},
 ]){
   assert.throws(()=>make(overrides),/private staging, trusted auth/);
 }
});

test('83.2 in-process creator submit is authenticated, audited and remains draft-only',async()=>{
 const {service,state}=make();
 const result=await run(service);
 assert.equal(result.ok,true);
 assert.equal(result.created,true);
 assert.equal(result.status,'pending');
 assert.equal(result.proposalId,ID);
 assert.equal(result.catalogPublished,false);
 assert.equal(result.rewardsIssued,false);
 assert.equal(result.eligibleForIssuance,false);
 assert.equal(result.auditRecorded,true);
 assert.equal(result.requiresAuditReconciliation,false);
 assert.equal(state.submitted,1);
 assert.equal(state.audits.length,2);
 assert.equal(state.audits[0].event,'intake-attempt');
 assert.equal(state.audits[1].event,'intake-result-ok');
 assert.equal(Object.isFrozen(state.audits[0]),true);
 assert.equal(Object.hasOwn(state.audits[0],'rawBody'),false);
 assert.equal(Object.hasOwn(state.audits[0],'proposal'),false);
});

test('83.2 status and review are independently capability-scoped',async()=>{
 const {service,state}=make();
 const status=await run(service,'status');
 const review=await run(service,'review');
 assert.equal(status.ok,true);
 assert.equal(status.status,'pending');
 assert.equal(review.ok,true);
 assert.equal(review.status,'curation-only');
 assert.equal(review.reviewed,true);
 assert.equal(review.disposition,'reject');
 assert.equal(state.statusRead,1);
 assert.equal(state.reviewed,1);
 assert.deepEqual(state.contexts,[context,context]);
});

test('83.2 role flags and a substituted session cannot authorize intake',async()=>{
 const {service,state}=make();
 const bad=await service.execute({
  operation:'submit',rawBody:body('submit'),
  serverContext:{role:'admin',isDeveloperVersion:true},
 });
 assert.equal(bad.ok,false);
 assert.equal(bad.code,'session-not-authorized');
 assert.equal(state.submitted,0);
 const missing=await service.execute({operation:'submit',rawBody:body('submit')});
 assert.equal(missing.code,'trusted-context-required');
});

test('83.2 rejects missing capability, wrong identity source and expired auth',async()=>{
 for(const attestation of [
  {authorized:true,identitySource:'browser',capability:'creator-catalog:submit',
    principalId:'creatorA',expiresAtMs:101000},
  {authorized:true,identitySource:'trusted-server-session',
    capability:'creator-catalog:review',principalId:'creatorA',expiresAtMs:101000},
  {authorized:true,identitySource:'trusted-server-session',
    capability:'creator-catalog:submit',principalId:'creatorA',expiresAtMs:100000},
  {authorized:true,identitySource:'trusted-server-session',
    capability:'creator-catalog:submit',principalId:'__anon__',expiresAtMs:101000},
 ]){
  const {service,state}=make({
    authenticateServerSession:async()=>attestation,
  });
  const result=await run(service);
  assert.equal(result.ok,false);
  assert.equal(state.submitted,0);
 }
});

test('83.2 session expiring during audit cannot reach database staging',async()=>{
 let advanceTime;
 const {service,state,advance}=make({
   auditEvent:async()=>{advanceTime(120000);return true},
 });
 advanceTime=advance;
 const result=await run(service);
 assert.equal(result.ok,false);
 assert.equal(result.code,'session-expired-before-stage');
 assert.equal(state.submitted,0);
});

test('83.2 audit failure before mutation blocks all stage writes',async()=>{
 const {service,state}=make({auditEvent:async()=>false});
 const result=await run(service);
 assert.equal(result.ok,false);
 assert.equal(result.code,'audit-unavailable');
 assert.equal(state.submitted,0);
});

test('83.2 post-commit audit outage clearly signals reconciliation required',async()=>{
 let attempts=0;
 const {service,state}=make({auditEvent:async()=>{
   attempts++;return attempts===1;
 }});
 const result=await run(service);
 assert.equal(result.ok,true);
 assert.equal(result.auditRecorded,false);
 assert.equal(result.requiresAuditReconciliation,true);
 assert.equal(state.submitted,1);
});

test('83.2 stage failure is sanitized and audited without revealing secrets',async()=>{
 const {service,state}=make({staging:{
   async submit(){throw Error('private database secret here')},
 }});
 const result=await run(service);
 assert.equal(result.ok,false);
 assert.equal(result.code,'staging-operation-failed');
 assert.equal(result.outcomeUnknown,true);
 assert.equal(result.requiresAuditReconciliation,true);
 assert.doesNotMatch(JSON.stringify(result),/private database secret/);
 assert.equal(state.audits.at(-1).event,'intake-exception');
});

test('83.2 stage may not forge publication or issuance on success',async()=>{
 for(const forbidden of ['catalogPublished','eligibleForIssuance','rewardsIssued']){
  const {service}=make({staging:{
    async submit(){return {...safe,ok:true,[forbidden]:true,proposalId:ID}},
  }});
  const result=await run(service);
  assert.equal(result.ok,false);
  assert.equal(result.code,'staging-contract-violation');
 }
});

test('83.2 per-principal per-operation limiter is bounded and resets',async()=>{
 const {service,advance,state}=make({principalLimit:2,globalLimit:12,windowMs:1000});
 assert.equal((await run(service)).ok,true);
 assert.equal((await run(service)).ok,true);
 assert.equal((await run(service)).code,'principal-rate-limited');
 assert.equal((await run(service,'status')).ok,true);
 advance(1000);
 assert.equal((await run(service)).ok,true);
 assert.equal(state.submitted,3);
});

test('83.2 global quota denies requests before session attestation',async()=>{
 const {service,advance,state}=make({principalLimit:2,globalLimit:2,windowMs:1000});
 assert.equal((await run(service)).ok,true);
 assert.equal((await run(service,'status')).ok,true);
 assert.equal((await run(service,'review')).code,'global-rate-limited');
 assert.equal(state.reviewed,0);
 advance(1000);
 assert.equal((await run(service,'review')).ok,true);
});

test('83.2 stage-denied reason uses a constrained code and is audited',async()=>{
 const {service,state}=make({staging:{
   async submit(){return {...safe,ok:false,
     reason:'invalid-creator-proposal'}},
 }});
 const result=await run(service);
 assert.equal(result.ok,false);
 assert.equal(result.code,'invalid-creator-proposal');
 assert.equal(state.audits.length,2);
 assert.equal(state.audits[1].event,'intake-result-denied');
});

test('83.2 tracked principal-operation bucket cap fails closed',async()=>{
 const {service,state}=make({
   maxPrincipals:1,globalLimit:6,principalLimit:2,
   authenticateServerSession:async (serverContext,operation)=>({
     authorized:true,identitySource:'trusted-server-session',
     capability:'creator-catalog:'+operation,
     principalId:serverContext.subject,expiresAtMs:101000,
   }),
 });
 const first=await service.execute({
   operation:'submit',rawBody:body('submit'),
   serverContext:{subject:'creator-one'},
 });
 assert.equal(first.ok,true);
 const second=await service.execute({
   operation:'submit',rawBody:body('submit'),
   serverContext:{subject:'creator-two'},
 });
 assert.equal(second.code,'principal-rate-limited');
 assert.equal(state.submitted,1);
});

test('83.2 clock rollback fails closed without altering staging state',async()=>{
 const {service,setTime,state}=make();
 assert.equal((await run(service)).ok,true);
 setTime(99999);
 const after=await run(service);
 assert.equal(after.code,'clock-invalid');
 assert.equal(state.submitted,1);
});

test('83.2 missing or unsupported operation cannot access staging',async()=>{
 const {service,state}=make();
 for(const operation of ['publish','mint','grant-item',null]){
   const result=await service.execute({operation,rawBody:'{}',
     serverContext:context});
   assert.equal(result.ok,false);
   assert.equal(result.code,'unsupported-operation');
 }
 assert.equal(state.submitted,0);
 assert.equal(state.reviewed,0);
});

test('83.2 audit metadata excludes creator blueprint content and reviewer notes',async()=>{
 const {service,state}=make();
 await run(service,'review',{note:'SECRET REVIEW CONTENT'});
 const audit=JSON.stringify(state.audits);
 assert.doesNotMatch(audit,/SECRET REVIEW CONTENT|Draft Sword|strength/);
 assert.match(audit,/principalId/);
});

test('83.2 source never exposes public route, player inventory, payment or DDL',()=>{
 const src=readFileSync('server/game3d/creatorCatalogPrivateIntake832.mjs','utf8');
 assert.doesNotMatch(src,/\bapp\.post\(|\bexpress\(|\bnew WebSocket\(|\bfetch\(/);
 assert.doesNotMatch(src,/\bCREATE TABLE\b|\bALTER TABLE\b/);
 assert.doesNotMatch(src,/game3d_item_issuance|game3d_wallet|awardIndex/);
 assert.match(src,/publicRouteInstalled:false/);
 assert.match(src,/eligibleForIssuance:false/);
 assert.match(src,/requiresAuditReconciliation/);
});
