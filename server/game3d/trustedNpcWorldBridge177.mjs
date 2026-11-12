// Combat / Quest 17.7 — interface to a genuinely server-authoritative world.
// This never reads browser positions, client NPC clicks, or local quest state.
// The three injected functions MUST be provided by a trusted server world host;
// injecting browser/event payloads is expressly not a valid deployment.
// Not installed in Game 3D worker until a real authoritative world host exists.
const WHO=/^[A-Za-z0-9_-]{1,128}$/;
const QUEST=/^[A-Za-z0-9_.:-]{1,160}$/;
const RECEIPT=/^[A-Za-z0-9_.:-]{8,160}$/;
const WORLD=/^[A-Za-z0-9_.:-]{8,128}$/;
const SESSION=/^qb174-[a-f0-9]{64}$/;
const validWho=x=>typeof x==='string'&&WHO.test(x)&&
 !['__anon__','__default__','__dev_test__'].includes(x);
const point=p=>p&&typeof p==='object'&&!Array.isArray(p)&&
 Object.keys(p).length===3&&['x','y','z'].every(k=>
  typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k])<=100000);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=()=>null;

export function createGame3DTrustedNpcWorldBridge177({
 consumeServerNpcInteraction,readServerWorldSnapshot,verifyServerLineOfSight,
 now=Date.now,maxAgeMs=5000,maxDistance=4.5,
}={}){
 if([consumeServerNpcInteraction,readServerWorldSnapshot,
   verifyServerLineOfSight,now].some(fn=>typeof fn!=='function')||
   !Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>5000||
   !Number.isFinite(maxDistance)||maxDistance<=0||maxDistance>4.5)
  throw Error('17.7 requires three independent trusted world-host operations');
 let stopped=false;
 const used=new Map();
 const shutdown=()=>{stopped=true;used.clear();};
 const resolveTrustedInteraction=async(request={})=>{
  if(stopped||!object(request)||
     !validWho(request.ownerId)||!validWho(request.characterId)||
     typeof request.questId!=='string'||!QUEST.test(request.questId)||
     typeof request.npcId!=='string'||!QUEST.test(request.npcId)||
     typeof request.sessionId!=='string'||!SESSION.test(request.sessionId)||
     Object.keys(request).some(k=>!['ownerId','characterId','questId','npcId','sessionId'].includes(k)))
   return fail();
  const {ownerId,characterId,questId,npcId,sessionId}=request;
  const query=Object.freeze({ownerId,characterId,questId,npcId,sessionId});
  // The trusted host must CONSUME a recorded, player-initiated world event,
  // not manufacture a receipt from these requested fields.
  let receipt;
  try{receipt=await consumeServerNpcInteraction(query);}catch{return fail();}
  const time=now();
  if(stopped||!object(receipt)||
     receipt.source!=='server-world-npc-event-177'||
     receipt.consumed!==true||
     receipt.actorAuthenticated!==true||
     receipt.intent!=='npc_interact'||
     receipt.ownerId!==ownerId||receipt.characterId!==characterId||
     receipt.questId!==questId||receipt.npcId!==npcId||
     receipt.actionSessionId!==sessionId||
     typeof receipt.receiptId!=='string'||!RECEIPT.test(receipt.receiptId)||
     typeof receipt.worldInstanceId!=='string'||!WORLD.test(receipt.worldInstanceId)||
     typeof receipt.worldEpoch!=='string'||!WORLD.test(receipt.worldEpoch)||
     !Number.isSafeInteger(receipt.worldTick)||receipt.worldTick<1||
     !Number.isSafeInteger(receipt.occurredAtMs)||receipt.occurredAtMs>time||
     time-receipt.occurredAtMs>maxAgeMs)return fail();
  // Never accept coordinates in the event or from the network request.
  if(Object.hasOwn(receipt,'player')||Object.hasOwn(receipt,'npc')||
     Object.hasOwn(receipt,'position')||Object.hasOwn(receipt,'lineOfSight'))return fail();
  const identity=Object.freeze({ownerId,characterId,questId,npcId,
   sessionId,receiptId:receipt.receiptId,worldInstanceId:receipt.worldInstanceId,
   worldEpoch:receipt.worldEpoch,worldTick:receipt.worldTick});
  let state;
  try{state=await readServerWorldSnapshot(identity);}catch{return fail();}
  if(stopped||!object(state)||state.source!=='server-world-snapshot-177'||
     state.serverAuthenticated!==true||state.characterId!==characterId||
     state.ownerId!==ownerId||state.actionSessionId!==sessionId||
     state.npcId!==npcId||state.npcSpawnVerified!==true||
     state.worldInstanceId!==receipt.worldInstanceId||
     state.worldEpoch!==receipt.worldEpoch||
     state.worldTick!==receipt.worldTick||
     !point(state.player)||!point(state.npc)||
     Math.hypot(state.player.x-state.npc.x,
      state.player.y-state.npc.y,state.player.z-state.npc.z)>maxDistance)
   return fail();
  let los;
  try{los=await verifyServerLineOfSight(Object.freeze({...identity,
   player:Object.freeze({...state.player}),npc:Object.freeze({...state.npc})}));}
  catch{return fail();}
  if(stopped||!object(los)||los.source!=='server-world-collision-177'||
     los.visible!==true||los.worldInstanceId!==receipt.worldInstanceId||
     los.worldEpoch!==receipt.worldEpoch||los.worldTick!==receipt.worldTick||
     now()-receipt.occurredAtMs>maxAgeMs)return fail();
  const usedKey=receipt.worldInstanceId+'\0'+receipt.worldEpoch+'\0'+receipt.receiptId;
  const current=now();
  for(const [key,expires] of used)if(expires<=current)used.delete(key);
  if(used.has(usedKey)||used.size>=4096)return fail();
  // No await between checking and consuming the key: concurrency safe in
  // this single JS worker. A distributed ledger is required for >1 replicas.
  used.set(usedKey,receipt.occurredAtMs+maxAgeMs);
  return Object.freeze({source:'trusted-server-npc-interaction-175',
   worldVerified:true,ownerId,characterId,questId,npcId,sessionId,
   worldInstanceId:receipt.worldInstanceId,
   interactionId:receipt.receiptId,occurredAtMs:receipt.occurredAtMs,
   player:Object.freeze({...state.player}),npc:Object.freeze({...state.npc}),
   lineOfSight:true});
 };
 return Object.freeze({version:'17.7',resolveTrustedInteraction,shutdown,
  serverWorldRequired:true,browserCoordinatesAccepted:false,
  worldHostInstalled:false,productionReady:false});
}
