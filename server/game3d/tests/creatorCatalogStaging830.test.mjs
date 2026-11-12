import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createGame3DCreatorCatalogStaging830,
  CREATOR_STAGING_SCHEMA_830,
} from '../creatorCatalogStaging830.mjs';
import {CREATOR_PROPOSAL_SCHEMA_829} from '../creatorCatalogReview829.mjs';

const oldStage=process.env.GAME3D_PRIVATE_STAGING_ENV;
before(()=>{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'});
after(()=>{
  if(oldStage===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=oldStage;
});
const proposal=()=>({
  schema:CREATOR_PROPOSAL_SCHEMA_829,
  source:{boxId:'equipment-box',slotIndex:10},
  blueprint:{
    id:'bp-forest-1',kind:'equipment',name:'Forest Fang',
    description:'Test equipment',icon:'⚔️',rarity:'Epic',
    slot:'weapon',levelMin:1,levelMax:50,
    stats:{hp:100,strength:25},dropChance:2.5,
    dropSource:'forest_boss',notes:'creator draft',
  },
});
function fakePool(){
  const database={proposals:new Map(),reviews:new Map(),queries:[],
    releases:0,rollbacks:0,failReviewInsert:false};
  const result=rows=>({rowCount:rows.length,rows});
  return {
    database,
    async connect(){
      let state={proposals:new Map(database.proposals),
        reviews:new Map(database.reviews)};
      return {
        async query(sql,params=[]){
          database.queries.push({sql,params});
          if(sql.startsWith('BEGIN'))return result([]);
          if(sql==='COMMIT'){
            database.proposals=state.proposals;
            database.reviews=state.reviews;
            return result([]);
          }
          if(sql==='ROLLBACK'){database.rollbacks++;return result([])}
          if(sql.startsWith("SELECT set_config('search_path'"))return result([])
          if(sql.includes(' LIMIT 0'))return result([]);
          if(sql.startsWith('INSERT INTO game3d_creator_catalog_proposal_830')){
            const [id,creatorId,digest,payload]=params;
            const existing=[...state.proposals.values()].find(row=>
              row.creator_id===creatorId&&row.proposal_digest===digest);
            if(existing)return result([]);
            const row={proposal_id:id,creator_id:creatorId,
              proposal_digest:digest,payload:JSON.parse(payload),
              status:'pending',revision:0};
            state.proposals.set(id,row);
            return result([row]);
          }
          if(sql.startsWith('SELECT proposal_id,creator_id,proposal_digest,payload,status ')){
            let row;
            if(sql.includes('WHERE creator_id=$1 AND proposal_digest=$2')){
              row=[...state.proposals.values()].find(item=>
                item.creator_id===params[0]&&item.proposal_digest===params[1]);
            }else if(sql.includes('WHERE proposal_id=$1 AND creator_id=$2')){
              row=state.proposals.get(params[0]);
              if(row?.creator_id!==params[1])row=undefined;
            }else if(sql.includes('WHERE proposal_id=$1 FOR UPDATE')){
              row=state.proposals.get(params[0]);
            }
            return result(row?[{...row}]:[]);
          }
          if(sql.startsWith('UPDATE game3d_creator_catalog_proposal_830')){
            const [id,status]=params;
            const prev=state.proposals.get(id);
            if(!prev||prev.status!=='pending'||prev.revision!==0)
              return result([]);
            const updated={...prev,status,revision:1};
            state.proposals.set(id,updated);
            return result([updated]);
          }
          if(sql.startsWith('INSERT INTO game3d_creator_catalog_review_830')){
            if(database.failReviewInsert)throw Error('Simulated review insert failure');
            const [reviewId,id,digest,reviewer,disposition,note]=params;
            if(state.reviews.has(id))throw Error('Review is already committed');
            state.reviews.set(id,{reviewId,proposalId:id,digest,reviewer,
              disposition,note,catalogPublished:false,rewardsIssued:false});
            return result([]);
          }
          throw Error('Unexpected SQL in test fake: '+sql);
        },
        release(){database.releases++},
      };
    },
  };
}
function service(pool=fakePool(),creatorId='creatorA',reviewerId='reviewerB'){
  const operations=createGame3DCreatorCatalogStaging830({
    pool,enabled:true,scope:'private-staging',schema:'game3d_private_test',
    authorizeCreator:async context=>
      context?.session==='creator'?{authorized:true,creatorId}:{authorized:false},
    authorizeReviewer:async context=>
      context?.session==='reviewer'?{authorized:true,reviewerId}:{authorized:false},
  });
  return {operations,pool};
}
const asCreator={session:'creator'};
const asReviewer={session:'reviewer'};
const submit=(operations,p=proposal(),serverContext=asCreator)=>
  operations.submit({proposal:p,serverContext});
const accept=(operations,id,overrides={})=>operations.review({
  proposalId:id,serverContext:asReviewer,disposition:'accept-for-curation',
  note:'Manual balance review required before any publication',
  ...overrides,
});

test('83.0 disabled factory cannot be created for public or live runtime',()=>{
  const pool=fakePool();
  const authorized=async()=>({authorized:true,creatorId:'creatorA'});
  const reviewer=async()=>({authorized:true,reviewerId:'reviewerB'});
  for(const options of [
    {enabled:false,scope:'private-staging'},
    {enabled:true,scope:'public'},
    {enabled:true,scope:'private-staging',schema:'public'},
    {enabled:true,scope:'private-staging',schema:'bad; DROP TABLE x;'},
    {enabled:true,scope:'private-staging',schema:null},
    {enabled:true,scope:'private-staging',authorizeCreator:undefined},
    {enabled:true,scope:'private-staging',authorizeReviewer:undefined},
  ])assert.throws(()=>createGame3DCreatorCatalogStaging830({
    pool,authorizeCreator:authorized,authorizeReviewer:reviewer,
    schema:'game3d_private_test',...options,
  }),/private staging and trusted identities/);
});

test('83.0 stage starts with explicit schema check and no DDL execution',async()=>{
  const {operations,pool}=service();
  const ready=await operations.assertSchema();
  assert.equal(ready.ok,true);
  assert.equal(operations.version,CREATOR_STAGING_SCHEMA_830);
  assert.equal(operations.privateServerOnly,true);
  assert.equal(operations.publicRouteInstalled,false);
  assert.equal(operations.autoMigration,false);
  assert.equal(operations.rewardsIssued,false);
  assert.equal(pool.database.queries.some(q=>/CREATE TABLE|GRANT /i.test(q.sql)),false);
  assert.ok(pool.database.queries.some(q=>
    q.sql.includes("set_config('search_path', $1, true)")&&
    q.params[0]==='game3d_private_test'));
});

test('83.0 authenticated creator stores one inert, durable-shaped proposal row',async()=>{
  const {operations,pool}=service();
  const result=await submit(operations);
  assert.equal(result.ok,true);
  assert.equal(result.created,true);
  assert.equal(result.status,'pending');
  assert.match(result.proposalId,/^[0-9a-f-]{36}$/i);
  assert.match(result.proposalDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.eligibleForIssuance,false);
  assert.equal(result.catalogPublished,false);
  assert.equal(pool.database.proposals.size,1);
  assert.equal(pool.database.reviews.size,0);
  assert.equal([...pool.database.proposals.values()][0].creator_id,'creatorA');
});

test('83.0 exact resubmission is idempotent and returns same proposal ID',async()=>{
  const {operations,pool}=service();
  const first=await submit(operations);
  const second=await submit(operations);
  assert.equal(second.ok,true);
  assert.equal(second.created,false);
  assert.equal(second.proposalId,first.proposalId);
  assert.equal(second.proposalDigest,first.proposalDigest);
  assert.equal(pool.database.proposals.size,1);
});

test('83.0 changed content creates separate proposal; no overwrite of previous',async()=>{
  const {operations,pool}=service();
  const first=await submit(operations);
  const changed=proposal();
  changed.blueprint.stats.hp=200;
  const second=await submit(operations,changed);
  assert.equal(first.ok,true);
  assert.equal(second.ok,true);
  assert.notEqual(second.proposalId,first.proposalId);
  assert.equal(pool.database.proposals.size,2);
});

test('83.0 unverified creator and spoofed browser role cannot store proposals',async()=>{
  const {operations,pool}=service();
  const wrong=await submit(operations,proposal(),{role:'admin',isDeveloper:true});
  assert.equal(wrong.ok,false);
  assert.equal(wrong.reason,'creator-unauthorized');
  assert.equal(pool.database.proposals.size,0);
  const extra={...proposal(),creatorId:'attacker'};
  assert.equal((await submit(operations,extra)).ok,false);
  assert.equal(pool.database.proposals.size,0);
});

test('83.0 unknown grant and owner fields are rejected before database work',async()=>{
  const {operations,pool}=service();
  for(const field of ['ownerId','eligibleForIssuance','serverPublished',
    'itemInstanceId','rewardsIssued']){
    assert.equal((await submit(operations,{
      ...proposal(),blueprint:{...proposal().blueprint,[field]:true},
    })).ok,false);
  }
  assert.equal(pool.database.proposals.size,0);
  assert.equal(pool.database.queries.length,0);
});

test('83.0 creator status read refuses cross-account identity and invalid ID',async()=>{
  const pool=fakePool();
  const {operations}=service(pool);
  const item=await submit(operations);
  assert.equal((await operations.status({
    proposalId:item.proposalId,serverContext:asCreator,
  })).status,'pending');
  assert.equal((await operations.status({
    proposalId:'not-a-uuid',serverContext:asCreator,
  })).ok,false);
  assert.equal((await operations.status({
    proposalId:item.proposalId,serverContext:{role:'admin'},
  })).ok,false);
  const foreign=service(pool,'differentCreator').operations;
  assert.equal((await foreign.status({
    proposalId:item.proposalId,serverContext:asCreator,
  })).ok,false);
});

test('83.0 unauthorized review cannot change proposal or issue rewards',async()=>{
  const {operations,pool}=service();
  const created=await submit(operations);
  const denied=await accept(operations,created.proposalId,{
    serverContext:{role:'admin',isDeveloper:true},
  });
  assert.equal(denied.ok,false);
  assert.equal(pool.database.proposals.get(created.proposalId).status,'pending');
  assert.equal(pool.database.reviews.size,0);
});

test('83.0 creator self-review is rejected even with authenticated reviewer',async()=>{
  const pool=fakePool();
  const {operations}=service(pool,'creatorA','creatorA');
  const created=await submit(operations);
  const declined=await accept(operations,created.proposalId);
  assert.equal(declined.ok,false);
  assert.equal(pool.database.reviews.size,0);
  assert.equal(pool.database.proposals.get(created.proposalId).status,'pending');
});

test('83.0 curation acceptance records one inert review but never publishes',async()=>{
  const {operations,pool}=service();
  const created=await submit(operations);
  const reviewed=await accept(operations,created.proposalId);
  assert.equal(reviewed.ok,true);
  assert.equal(reviewed.reviewed,true);
  assert.equal(reviewed.status,'curation-only');
  assert.equal(reviewed.disposition,'accept-for-curation');
  assert.equal(reviewed.reviewerId,'reviewerB');
  assert.equal(reviewed.catalogPublished,false);
  assert.equal(reviewed.eligibleForIssuance,false);
  assert.equal(reviewed.rewardsIssued,false);
  assert.equal(pool.database.proposals.get(created.proposalId).revision,1);
  assert.equal(pool.database.reviews.size,1);
});

test('83.0 reviewed proposals cannot be reviewed twice or replay rewards',async()=>{
  const {operations,pool}=service();
  const created=await submit(operations);
  assert.equal((await accept(operations,created.proposalId)).ok,true);
  assert.equal((await accept(operations,created.proposalId)).ok,false);
  assert.equal(pool.database.reviews.size,1);
  const replay=await submit(operations);
  assert.equal(replay.created,false);
  assert.equal(replay.status,'curation-only');
  assert.equal(pool.database.reviews.size,1);
});

test('83.0 reject and request-changes never publish a live catalog item',async()=>{
  for(const [disposition,status] of [
    ['reject','rejected'],['request-changes','request-changes'],
  ]){
    const {operations,pool}=service();
    const item=await submit(operations);
    const reviewed=await accept(operations,item.proposalId,{disposition});
    assert.equal(reviewed.ok,true);
    assert.equal(reviewed.status,status);
    assert.equal(reviewed.rewardsIssued,false);
    assert.equal(pool.database.reviews.size,1);
  }
});

test('83.0 failed review insert rolls back status transition atomically',async()=>{
  const {operations,pool}=service();
  const created=await submit(operations);
  pool.database.failReviewInsert=true;
  await assert.rejects(accept(operations,created.proposalId),
    /Simulated review insert failure/);
  assert.equal(pool.database.proposals.get(created.proposalId).status,'pending');
  assert.equal(pool.database.reviews.size,0);
  assert.ok(pool.database.rollbacks>0);
});

test('83.0 stored candidate tampering blocks replay or review',async()=>{
  const {operations,pool}=service();
  const created=await submit(operations);
  const row=pool.database.proposals.get(created.proposalId);
  pool.database.proposals.set(created.proposalId,{
    ...row,payload:{...row.payload,blueprint:{
      ...row.payload.blueprint,name:'Tampered',
    }},
  });
  const result=await accept(operations,created.proposalId);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'stored-proposal-integrity-failed');
  assert.equal(pool.database.reviews.size,0);
});

test('83.0 staging gate is rechecked at execution time',async()=>{
  const {operations}=service();
  const stage=process.env.GAME3D_PRIVATE_STAGING_ENV;
  try{
    process.env.GAME3D_PRIVATE_STAGING_ENV='production';
    const result=await submit(operations);
    assert.equal(result.ok,false);
    assert.equal(result.reason,'staging-disabled');
  }finally{
    process.env.GAME3D_PRIVATE_STAGING_ENV=stage;
  }
});

test('83.0 migration is explicit non-public PG16 and guards no issuance',()=>{
  const sql=readFileSync(
    'server/game3d/sql/053_creator_catalog_private_staging_830.sql','utf8');
  assert.match(sql,/server_version_num/);
  assert.match(sql,/current_schema\(\)='public'/);
  assert.match(sql,/UNIQUE \(creator_id,proposal_digest\)/);
  assert.match(sql,/proposal_id uuid NOT NULL UNIQUE/);
  assert.match(sql,/CHECK\s*\(catalog_published=false\)/);
  assert.match(sql,/CHECK\s*\(eligible_for_issuance=false\)/);
  assert.match(sql,/REVOKE ALL ON game3d_creator_catalog_review_830 FROM PUBLIC/);
  assert.match(sql,/game3d_creator_catalog_proposal_830_immutable/);
  assert.match(sql,/game3d_creator_catalog_review_830_immutable/);
  assert.match(sql,/REVOKE ALL ON FUNCTION game3d_creator_catalog_proposal_830_guard\(\) FROM PUBLIC/);
  assert.match(sql,/REVOKE ALL ON FUNCTION game3d_creator_catalog_review_830_guard\(\) FROM PUBLIC/);
  const withoutComments=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(withoutComments,/\bGRANT\s+[^;\n]+\bTO\b\s+(?:PUBLIC|authenticated)/i);
  assert.doesNotMatch(sql,/game3d_item_issuance|game3d_wallet|game3d_inventory_slot/);
});

test('83.0 staging source contains no public endpoint, gameplay award or auto migration',()=>{
  const js=readFileSync('server/game3d/creatorCatalogStaging830.mjs','utf8');
  assert.doesNotMatch(js,/express\(|app\.post\(|server\.on\(|fetch\(|WebSocket/);
  assert.doesNotMatch(js,/game3d_item_issuance|game3d_wallet|awardIndex/);
  assert.doesNotMatch(js,/CREATE TABLE|ALTER TABLE/);
  assert.match(js,/enabled!==true/);
  assert.match(js,/scope!=='private-staging'/);
  assert.match(js,/GAME3D_PRIVATE_STAGING_ENV==='staging'/);
});
