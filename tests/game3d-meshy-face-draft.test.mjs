import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  faceDraftEnabled,validateFaceDraftImages,
  issueFaceDraftTicket,verifyFaceDraftTicket,
  createFaceDraft,getFaceDraft,publicFaceDraftStatus,resetFaceDraftRateLimitForTests,
} from '../server/game3d/meshyFaceDraftService.mjs';

const user={id:'creator-123'},otherUser={id:'creator-456'};
const secret='0123456789aabcdefghijklmnopqrstu_12345';
const env={
  GAME3D_MESHY_FACE_ENABLED:'true',GAME3D_MESHY_FACE_SERVER_ENV:'test',
  GAME3D_MESHY_FACE_ALLOWED_USERS:user.id,
  GAME3D_MESHY_FACE_SIGNING_SECRET:secret,
  MESHY_API_KEY:'test-meshy-token-123456789',
};
const image='data:image/jpeg;base64,'+'A'.repeat(512);
const taskId='018a210d-8ba4-705c-b111-1f1776f7f578';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Cloud generation is disabled by default, in production, or for a different player',()=>{
  assert.equal(faceDraftEnabled({},user),false);
  assert.equal(faceDraftEnabled({...env,GAME3D_MESHY_FACE_SERVER_ENV:'production'},user),false);
  assert.equal(faceDraftEnabled({...env,GAME3D_MESHY_FACE_ENABLED:'false'},user),false);
  assert.equal(faceDraftEnabled(env,otherUser),false);
  assert.equal(faceDraftEnabled(env,user),true);
});

test('Photos require separate informed consent, 1-4 data URI images and size limits',()=>{
  assert.equal(validateFaceDraftImages({images:[image]})?.code,'photo-consent-required');
  assert.equal(validateFaceDraftImages({images:[],consent:true})?.code,'provide-one-to-four-images');
  assert.equal(validateFaceDraftImages({images:Array(5).fill(image),consent:true})?.code,
    'provide-one-to-four-images');
  assert.equal(validateFaceDraftImages({images:['https://example.com/faces'],consent:true})?.ok,false);
  assert.equal(validateFaceDraftImages({images:[image],consent:true})?.ok,true);
});

test('Tickets are authenticated to owner/task and cannot be used after expiry',async()=>{
  const ticket=await issueFaceDraftTicket({taskId,mode:'image-to-3d',user,secret,now:1000});
  assert.equal((await verifyFaceDraftTicket(ticket,{user,secret,now:1300}))?.taskId,taskId);
  assert.equal(await verifyFaceDraftTicket(ticket,{user:otherUser,secret,now:1300}),null);
  assert.equal(await verifyFaceDraftTicket(ticket.slice(0,-1)+'0',{user,secret,now:1300}),null);
  assert.equal(await verifyFaceDraftTicket(ticket,{user,secret,now:1000+60*60*1000}),null);
});

test('Single portrait sends exactly Image-to-3D request, never browser credentials',async()=>{
  resetFaceDraftRateLimitForTests();
  const requests=[];
  const fetcher=async(url,opt)=>{
    requests.push({url,opt});
    return Response.json({result:taskId});
  };
  const result=await createFaceDraft({env,user,input:{images:[image],consent:true},fetcher});
  assert.equal(result.ok,true);
  assert.equal(result.mode,'image-to-3d');
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/^https:\/\/api\.meshy\.ai\/openapi\/v1\/image-to-3d$/);
  assert.equal(requests[0].opt.headers.Authorization,'Bearer '+env.MESHY_API_KEY);
  assert.equal(JSON.parse(requests[0].opt.body).image_url,image);
  assert.equal(JSON.parse(requests[0].opt.body).texture_model,'meshy-n1');
  assert.equal(JSON.parse(requests[0].opt.body).should_texture,true);
  assert(!('env' in result));
  assert(!('image_url' in result));
});

test('Multiple photos call documented Multi-Image endpoint in the supplied order',async()=>{
  resetFaceDraftRateLimitForTests();
  let sent;
  const fetcher=async(url,opt)=>{
    sent={url,body:JSON.parse(opt.body)};
    return Response.json({result:taskId});
  };
  const result=await createFaceDraft({
    env,user,input:{consent:true,images:[image,image,image]},fetcher,
  });
  assert.equal(result.ok,true);
  assert.equal(result.mode,'multi-image-to-3d');
  assert.match(sent.url,/multi-image-to-3d$/);
  assert.deepEqual(sent.body.image_urls,[image,image,image]);
  assert.equal(sent.body.ai_model,'meshy-7.1');
  assert.deepEqual(sent.body.target_formats,['glb']);
});

test('Allowlist and consent failures spend no generation credits; max 2 in one test process',async()=>{
  resetFaceDraftRateLimitForTests();
  let requests=0;
  const fetcher=async()=>{requests++;return Response.json({result:taskId})};
  assert.equal((await createFaceDraft({env,user:otherUser,input:{images:[image],consent:true},fetcher})).ok,false);
  assert.equal((await createFaceDraft({env,user,input:{images:[image]},fetcher})).ok,false);
  assert.equal(requests,0);
  for(let i=0;i<2;i++)assert.equal(
    (await createFaceDraft({env,user,input:{consent:true,images:[image]},fetcher})).ok,true);
  assert.equal((await createFaceDraft({env,user,input:{consent:true,images:[image]},fetcher})).status,429);
  assert.equal(requests,2);
});

test('Status retrieval requires owned signed ticket and returns allowlisted Meshy URLs',async()=>{
  resetFaceDraftRateLimitForTests();
  const ticket=await issueFaceDraftTicket({taskId,mode:'multi-image-to-3d',user,secret});
  const paths=[];
  const fetcher=async(url,opt)=>{
    paths.push([url,opt.method]);
    return Response.json({
      status:'SUCCEEDED',progress:100,
      model_urls:{glb:'https://assets.meshy.ai/demo/head.glb?Expires=test'},
      thumbnail_url:'https://assets.meshy.ai/demo/head.png',
    });
  };
  const status=await getFaceDraft({env,user,ticket,fetcher});
  assert.equal(status.ok,true);
  assert.equal(status.status,'SUCCEEDED');
  assert.equal(status.glb,'https://assets.meshy.ai/demo/head.glb?Expires=test');
  assert.deepEqual(paths,[[`https://api.meshy.ai/openapi/v1/multi-image-to-3d/${taskId}`,'GET']]);
  assert.equal((await getFaceDraft({env,user:otherUser,ticket,fetcher})).ok,false);
  assert.equal(paths.length,1);
  assert.equal(publicFaceDraftStatus({status:'SUCCEEDED',
    model_urls:{glb:'https://attacker.example/file.glb'}}).glb,null);
});

test('Draft deletion does not alter the player and only addresses original task',async()=>{
  const ticket=await issueFaceDraftTicket({taskId,mode:'image-to-3d',user,secret});
  let captured;
  const fetcher=async(url,opt)=>{captured={url,method:opt.method};return Response.json({})};
  const res=await getFaceDraft({env,user,ticket,fetcher,remove:true});
  assert.equal(res.deleted,true);
  assert.equal(captured.method,'DELETE');
  assert.match(captured.url,/\/image-to-3d\//);
});

test('Character creation keeps local scanner, remote draft is a separate opted-in preview',()=>{
  const editor=read('src/components/onboarding/CharacterAppearanceEditor.jsx');
  const local=read('src/components/onboarding/GenesisFaceScan.jsx');
  const cloud=read('src/components/onboarding/MeshyFaceDraftCreator.jsx');
  const route=read('src/routes/api/game3d-face.js');
  assert.match(editor,/<GenesisFaceScan config=\{config\}/);
  assert.match(editor,/<MeshyFaceDraftCreator\/>/);
  assert.match(local,/The photo stays on this device/);
  assert.match(cloud,/VITE_GAME3D_MESHY_FACE_PREVIEW/);
  assert.match(cloud,/consent/);
  assert.match(cloud,/getAccessToken/);
  assert.doesNotMatch(cloud,/setConfig\(|model_url\s*:/);
  assert.match(route,/middleware:\[requireUserRoute\]/);
  assert.match(route,/faceDraftEnabled\(process.env,context.user\)/);
  assert.match(route,/requireSameOrigin\(request\)/);
});
