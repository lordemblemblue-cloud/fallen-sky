import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CREATOR_PROPOSAL_SCHEMA_829, CREATOR_CANDIDATE_SCHEMA_829,
  CREATOR_REVIEW_SCHEMA_829, prepareCreatorCatalogCandidate829,
  verifyCreatorCatalogCandidate829,createCreatorCatalogReviewService829,
} from '../creatorCatalogReview829.mjs';

const blueprint=()=>({
  id:'bp-test-1',kind:'equipment',name:'Forest Fang',description:'Forest sword',
  icon:'⚔️',rarity:'Epic',slot:'weapon',
  levelMin:1,levelMax:50,stats:{strength:25,hp:100},
  setId:'forest',skillId:'',materialType:'',tags:'forest,starter',
  dropSource:'forest_elite',dropChance:2.5,notes:'creator draft',
});
const request=(b=blueprint())=>({
  schema:CREATOR_PROPOSAL_SCHEMA_829,
  source:{boxId:'collection-1',slotIndex:499},
  blueprint:b,
});
const prepare=(p=request(),creator='creatorA')=>
  prepareCreatorCatalogCandidate829({
    proposal:p,authenticatedCreatorId:creator,
  });
const service=()=>createCreatorCatalogReviewService829({
  authorizeReviewer:async context=>context?.serverSessionToken==='verified'
    ?{authorized:true,reviewerId:'reviewerB'}
    :{authorized:false},
});
const accept=(candidate,context={serverSessionToken:'verified'},
  disposition='accept-for-curation',note='Reviewed for later manual catalog curation')=>
  service().review({candidate,serverContext:context,disposition,note});

test('82.9 equipment draft creates frozen inert catalog candidate',()=>{
  const result=prepare();
  assert.equal(result.ok,true);
  assert.equal(result.candidate.schema,CREATOR_CANDIDATE_SCHEMA_829);
  assert.equal(result.candidate.creatorId,'creatorA');
  assert.equal(result.candidate.payload.source.slotIndex,499);
  assert.equal(result.candidate.payload.blueprint.rarity,'Epic');
  assert.equal(result.candidate.payload.blueprint.stats.strength,25);
  assert.match(result.candidate.proposalDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.candidate.draftOnly,true);
  assert.equal(result.candidate.serverPublished,false);
  assert.equal(result.candidate.eligibleForIssuance,false);
  assert.equal(Object.isFrozen(result.candidate),true);
  assert.equal(Object.isFrozen(result.candidate.payload.blueprint.stats),true);
  assert.equal(verifyCreatorCatalogCandidate829(result.candidate).ok,true);
});

test('82.9 material and skill candidate schemas retain draft-only refs',()=>{
  const material=prepare(request({...blueprint(),kind:'material',slot:'',
    materialType:'ore'}));
  const skill=prepare(request({...blueprint(),kind:'skill',slot:'',
    skillId:'aoe-cyclone'}));
  assert.equal(material.ok,true);
  assert.equal(material.candidate.payload.blueprint.materialType,'ore');
  assert.equal(material.candidate.payload.blueprint.slot,'');
  assert.equal(skill.ok,true);
  assert.equal(skill.candidate.payload.blueprint.skillId,'aoe-cyclone');
  assert.equal(skill.candidate.eligibleForIssuance,false);
});

test('82.9 candidate digest is stable across stat key ordering',()=>{
  const a=prepare();
  const b=prepare(request({...blueprint(),stats:{hp:100,strength:25}}));
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.equal(a.candidate.proposalDigest,b.candidate.proposalDigest);
});

test('82.9 creator identity must come from trusted server, not proposal body',()=>{
  for(const identity of [null,'','__anon__','bad/id','a'.repeat(129)]){
    const result=prepare(request(),identity);
    assert.equal(result.ok,false,String(identity));
  }
  const injected={...request(),creatorId:'malicious'};
  assert.equal(prepare(injected).ok,false);
  assert.equal(prepare({...request(),ownerId:'victim'}).ok,false);
});

test('82.9 malformed source or unknown fields are rejected',()=>{
  for(const p of [
    {...request(),schema:'unknown'},
    {...request(),source:{boxId:'collection-1',slotIndex:500}},
    {...request(),source:{boxId:'collection-1',slotIndex:-1}},
    {...request(),source:{boxId:'collection-1',slotIndex:1.2}},
    {...request(),source:{boxId:'../steal',slotIndex:4}},
    {...request(),source:{boxId:'collection-1',slotIndex:4,issuedItemId:'grant'}},
    {...request(),schema:CREATOR_PROPOSAL_SCHEMA_829,extra:'publish-now'},
  ])assert.equal(prepare(p).ok,false,JSON.stringify(p));
});

test('82.9 arbitrary approval, issuance, or character fields cannot enter draft',()=>{
  for(const extra of ['approved','eligibleForIssuance','issuedItemId',
    'ownerId','characterId','rewardAmount','isAdmin','serverPublished']){
    assert.equal(prepare(request({...blueprint(),[extra]:true})).ok,false,extra);
  }
});

test('82.9 unsupported rarity, equipment slot and kind fail closed',()=>{
  for(const b of [
    {...blueprint(),kind:'currency'},
    {...blueprint(),rarity:'Administrator'},
    {...blueprint(),slot:'inventory'},
    {...blueprint(),kind:'material',slot:'weapon',materialType:'ore'},
    {...blueprint(),kind:'skill',slot:'',skillId:''},
    {...blueprint(),kind:'material',slot:'',materialType:''},
  ])assert.equal(prepare(request(b)).ok,false,JSON.stringify(b));
});

test('82.9 levels and drop chance cannot be coerced or silently clamped',()=>{
  for(const patch of [
    {levelMin:'1'}, {levelMax:10000}, {levelMin:12,levelMax:11},
    {dropChance:'2.5'}, {dropChance:101}, {dropChance:-1},
    {dropChance:Infinity},{dropChance:NaN},
    {dropChance:4,dropSource:''},
  ])assert.equal(prepare(request({...blueprint(),...patch})).ok,false,
    JSON.stringify(patch));
});

test('82.9 stat values must be finite whitelisted bounded numbers',()=>{
  for(const stats of [
    {'__proto__':1,unknown:2},{strength:'25'},{hp:Infinity},
    {hp:1_000_001},{dodge:NaN},{strength:null},
  ])assert.equal(prepare(request({...blueprint(),stats})).ok,false,
    JSON.stringify(stats));
  assert.equal(prepare(request({...blueprint(),stats:{defense:-3}})).ok,true);
});

test('82.9 malformed non-plain input cannot trigger review or grant',()=>{
  for(const b of [null,[],Object.create(null)]){
    if(b===Object.create(null))continue;
    const result=prepare(request(b));
    assert.equal(result.ok,false);
  }
  const malicious=JSON.parse('{"kind":"equipment","name":"S","rarity":"Epic","slot":"weapon","levelMin":1,"levelMax":2,"dropChance":0,"stats":{},"__proto__":{"admin":true}}');
  assert.equal(prepare(request(malicious)).ok,false);
});

test('82.9 forged candidate digest or changed payload cannot pass consistency check',()=>{
  const input=prepare().candidate;
  assert.equal(verifyCreatorCatalogCandidate829({
    ...input,proposalDigest:'a'.repeat(64),
  }).ok,false);
  assert.equal(verifyCreatorCatalogCandidate829({
    ...input,payload:{...input.payload,
      blueprint:{...input.payload.blueprint,stats:{strength:999}}},
  }).ok,false);
});

test('82.9 forged publishing flags and injected payload fields cannot be reviewed',()=>{
  const input=prepare().candidate;
  for(const forged of [
    {...input,serverPublished:true},
    {...input,eligibleForIssuance:true},
    {...input,draftOnly:false},
    {...input,grantInventory:true},
    {...input,payload:{...input.payload,itemInstanceId:'forged'}},
  ])assert.equal(verifyCreatorCatalogCandidate829(forged).ok,false);
});

test('82.9 review service needs injected trusted reviewer verifier',()=>{
  assert.throws(()=>createCreatorCatalogReviewService829(),/authorization/);
  assert.throws(()=>createCreatorCatalogReviewService829({
    authorizeReviewer:'admin',
  }),/authorization/);
});

test('82.9 unauthorized or self review is rejected even with valid draft',async()=>{
  const candidate=prepare().candidate;
  assert.equal((await accept(candidate,{serverSessionToken:'fake'})).ok,false);
  const self=createCreatorCatalogReviewService829({
    authorizeReviewer:async()=>({authorized:true,reviewerId:'creatorA'}),
  });
  const result=await self.review({candidate,serverContext:{},
    disposition:'accept-for-curation',note:'Review later'});
  assert.equal(result.ok,false);
  assert.equal(result.code,'self-review-not-allowed');
});

test('82.9 accepted curation review still cannot publish or award',async()=>{
  const candidate=prepare().candidate;
  const decision=await accept(candidate);
  assert.equal(decision.ok,true);
  assert.equal(decision.record.schema,CREATOR_REVIEW_SCHEMA_829);
  assert.equal(decision.record.disposition,'accept-for-curation');
  assert.equal(decision.record.status,'review-record-only');
  assert.equal(decision.record.creatorId,'creatorA');
  assert.equal(decision.record.reviewerId,'reviewerB');
  assert.equal(decision.record.catalogPublished,false);
  assert.equal(decision.record.eligibleForIssuance,false);
  assert.equal(decision.record.statsApplied,false);
  assert.equal(decision.record.skillUnlocked,false);
  assert.equal(decision.record.rewardsIssued,false);
  assert.equal(decision.record.proposalDigest,candidate.proposalDigest);
  assert.equal(Object.isFrozen(decision.record),true);
});

test('82.9 request-changes and reject are review records, never grants',async()=>{
  const candidate=prepare().candidate;
  for(const disposition of ['request-changes','reject']){
    const reviewed=await accept(candidate,undefined,disposition,
      'Needs a design or balance revision');
    assert.equal(reviewed.ok,true);
    assert.equal(reviewed.record.disposition,disposition);
    assert.equal(reviewed.record.catalogPublished,false);
  }
});

test('82.9 unknown decisions, missing notes and invalid notes fail closed',async()=>{
  const candidate=prepare().candidate;
  for(const disposition of ['approve','publish','issue-item','',null]){
    assert.equal((await accept(candidate,undefined,disposition)).ok,false);
  }
  for(const note of ['',null,'x'.repeat(501),'\u0001bad']){
    const reviewed=await accept(candidate,undefined,'reject',note);
    assert.equal(reviewed.ok,false);
    assert.equal(reviewed.record,undefined);
  }
});

test('82.9 trusted reviewer callback failures do not bypass authorization',async()=>{
  const candidate=prepare().candidate;
  const bad=createCreatorCatalogReviewService829({
    authorizeReviewer:async()=>{throw Error('session revoked');},
  });
  const result=await bad.review({
    candidate,serverContext:{},disposition:'reject',note:'Source unverified',
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,'reviewer-not-authorized');
});

test('82.9 reviewer role claimed in browser payload has no authorization effect',async()=>{
  const candidate=prepare().candidate;
  const result=await accept(candidate,
    {role:'admin',isDeveloper:true,serverSessionToken:'fake'});
  assert.equal(result.ok,false);
});

test('82.9 review model never touches payment, inventory or award write paths',()=>{
  const source=readFileSync('server/game3d/creatorCatalogReview829.mjs','utf8');
  assert.doesNotMatch(source,/fetch\(|localStorage|pool\.query\(|\.connect\(|issueCommittedAward\(|game3d_item_issuance/);
  assert.match(source,/eligibleForIssuance:false/);
  assert.match(source,/serverPublished:false/);
  assert.match(source,/catalogPublished:false/);
});
