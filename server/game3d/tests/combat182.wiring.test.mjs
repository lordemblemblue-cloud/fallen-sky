import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateSignedQuestWorldStaging182}
 from '../privateSignedQuestWorldStaging182.mjs';
import {createGame3DQuestActionRoute174}
 from '../privateQuestActionRoute174.mjs';

const host={
 consumeServerNpcInteraction:async()=>null,
 readServerWorldSnapshot:async()=>null,
 verifyServerLineOfSight:async()=>null,
};
const stage={
 version:'18.0',privateServerOnly:true,
 publicPlayerRouteInstalled:false,publicQuestActionWriterInstalled:false,
 questActionWorldHost177:host,verifyWorldActionSession:async()=>false,
};
const options={
 worldStage180:stage,writerPool:{connect:async()=>{
  throw Error('No dedicated PG writer on this test machine');
 }},writerSchema:'private_quest_staging',
 secret:'test-only-182-'+ 's'.repeat(48),
 appOrigin:'https://staging.example',enabled:true,
};
async function withStagingFlags(fn){
 const names=['GAME3D_PRIVATE_STAGING_ENV',
  'GAME3D_QUEST_ACTION_174_SINGLE_REPLICA_STAGING_ACK'];
 const prior=names.map(x=>process.env[x]);
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  process.env.GAME3D_QUEST_ACTION_174_SINGLE_REPLICA_STAGING_ACK='true';
  await fn();
 }finally{
  names.forEach((key,i)=>{
   if(prior[i]===undefined)delete process.env[key];
   else process.env[key]=prior[i];
  });
 }
}
test('18.2 refuses to create an action route without isolated staging opt-in',async()=>{
 await assert.rejects(createGame3DPrivateSignedQuestWorldStaging182(),/18\.2 requires/);
 await withStagingFlags(async()=>{
  await assert.rejects(createGame3DPrivateSignedQuestWorldStaging182({
   ...options,enabled:false}),/18\.2 requires/);
 });
});
test('18.2 refuses a missing or forged world action-session verifier',async()=>{
 await withStagingFlags(async()=>{
  await assert.rejects(createGame3DPrivateSignedQuestWorldStaging182({
   ...options,worldStage180:{...stage,verifyWorldActionSession:null}
  }),/18\.2 requires/);
  await assert.rejects(createGame3DPrivateSignedQuestWorldStaging182({
   ...options,worldStage180:{...stage,publicPlayerRouteInstalled:true}
  }),/18\.2 requires/);
 });
});
test('18.2 checks restricted PG readiness BEFORE exposing signed Questbook route',async()=>{
 await withStagingFlags(async()=>{
  await assert.rejects(createGame3DPrivateSignedQuestWorldStaging182(options),
   /Quest action 17\.4 database readiness denied: database_unavailable/);
 });
});
test('17.4 refuses malformed optional world-session verification configuration',()=>{
 assert.throws(()=>createGame3DQuestActionRoute174({
  pool:{connect:async()=>({release(){}})},
  secret:options.secret,appOrigin:options.appOrigin,
  verifyWorldActionSession:true,
 }),/17\.4 requires/);
});
test('18.2 is not installed by the live Game 3D worker',()=>{
 const source=readFileSync(new URL('../index.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/privateSignedQuestWorldStaging182|GAME3D_PRIVATE_STAGING_ENV/);
});
