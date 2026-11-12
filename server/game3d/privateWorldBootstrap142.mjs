// Combat 14.2 — compose EXISTING 13.6 PvE simulation, 13.7 sync,
// 13.9 durable recovery, 14.0 loopback HTTP and 14.1 bearer verification.
// This never mounts the public GameWorld3D page or starts a second engine.
// World actors are loaded exclusively from a sealed private PostgreSQL seed.
// Player HTTP packets can only move/attack, not manufacture actors/rewards.
import {createGame3DPrivateEncounter136} from './privateWorldEncounter136.mjs';
import {createGame3DPrivateWorldRecovery139} from './privateWorldRecovery139.mjs';
import {createGame3DPrivateWorldGateway140} from './privateWorldGateway140.mjs';
import {createGame3DTrustedSessionAdapter141} from './trustedWorldSession141.mjs';
import {createGame3DTrustedWorldSeedReader142}
 from './trustedWorldSeed142.mjs';
import {configuredGame3DMapCollision,WOLFVEIL_MAP_ID}
 from './mapCollision.mjs';

const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 x!=='__anon__'&&x!=='__default__';
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validScope=s=>s&&key(s.instanceId)&&key(s.instanceEpoch)&&
 key(s.holderId)&&who(s.ownerId)&&who(s.characterId)&&
 hash(s.mapFingerprint);
const same=(a,b)=>a?.instanceId===b?.instanceId&&
 a?.instanceEpoch===b?.instanceEpoch&&a?.holderId===b?.holderId&&
 a?.ownerId===b?.ownerId&&a?.characterId===b?.characterId&&
 a?.mapFingerprint===b?.mapFingerprint;

export async function createGame3DPrivateWorldBootstrap142({
 pool,scope,mapId=WOLFVEIL_MAP_ID,allowedOrigins,
 authorizeServerOperation,resolvePlayerStrike,resolveEnemyStrike,
 trustedCombatSheetReader143=null,trustedSessionAdapter149=null,
 now=Date.now,leaseMs=10000,
}={}){
 if(typeof pool?.connect!=='function'||!validScope(scope)||
    mapId!==WOLFVEIL_MAP_ID||
    typeof authorizeServerOperation!=='function'||
    typeof resolvePlayerStrike!=='function'||
    typeof resolveEnemyStrike!=='function'||
    (trustedCombatSheetReader143!==null&&
     (typeof trustedCombatSheetReader143.read!=='function'||
      typeof trustedCombatSheetReader143.apply!=='function'))||
    (trustedSessionAdapter149!==null&&
     typeof trustedSessionAdapter149.authenticateRequest!=='function')||
    typeof now!=='function')
  throw Error('14.2 requires private DB, pinned world and combat resolvers');
 // Freeze deployment-owned scope; never allow changes from HTTP arguments.
 const identity=Object.freeze({
  instanceId:scope.instanceId,instanceEpoch:scope.instanceEpoch,
  holderId:scope.holderId,ownerId:scope.ownerId,
  characterId:scope.characterId,mapFingerprint:scope.mapFingerprint,
 });
 const mapWorld=configuredGame3DMapCollision(mapId);
 if(!mapWorld||mapWorld.fingerprint!==identity.mapFingerprint)
  throw Error('14.2 server map fingerprint does not match instance');
 const seeds=createGame3DTrustedWorldSeedReader142({pool});
 // Strict 14.9 is opt-in; legacy private 14.1 integration is preserved.
 const sessions=trustedSessionAdapter149??
  createGame3DTrustedSessionAdapter141({pool});

 const attestEncounter=async({scope:given,resolveAuthenticatedSubject})=>{
  if(!same(given,identity)||typeof resolveAuthenticatedSubject!=='function')
   throw Error('14.2 private recovery instance scope mismatch');
  // Each constructed encounter is re-provisioned by the DB, even during
  // takeover. No caller can pass an NPC array, hero stats or world origin.
  const seed=await seeds.read({scope:identity,map:mapWorld});
  // 14.3 opt-in: the matching trusted character progress row derives
  // player/enemy baseline stats. We never let browser HP/gear change it.
  const snapshot=trustedCombatSheetReader143?
   trustedCombatSheetReader143.apply({
    seed,
    progress:await trustedCombatSheetReader143.read({
     scope:identity,seedRevision:seed.trustedSeedRevision,
    }),
   }):seed;
  return createGame3DPrivateEncounter136({
   instanceId:identity.instanceId,
   ownerId:identity.ownerId,characterId:identity.characterId,
   mapWorld,worldOrigin:seed.worldOrigin,
   attestWorldSnapshot:async request=>{
    if(request.instanceId!==identity.instanceId||
       request.ownerId!==identity.ownerId||
       request.characterId!==identity.characterId||
       request.mapId!==mapWorld.id||
       request.mapFingerprint!==mapWorld.fingerprint||
       request.worldOrigin?.x!==seed.worldOrigin.x||
       request.worldOrigin?.z!==seed.worldOrigin.z)
     throw Error('14.2 private encounter attestation mismatch');
    return snapshot;
   },
   resolveAuthenticatedSubject,resolvePlayerStrike,resolveEnemyStrike,now,
  });
 };
 const gateway=await createGame3DPrivateWorldGateway140({
  pool,scope:identity,allowedOrigins,authorizeServerOperation,
  authenticateRequest:sessions.authenticateRequest,now,leaseMs,
  // The 14.0 gateway takes the attested factory. Only its private
  // symbol-gated resolver can be forwarded to the 13.9/13.6 engine.
  createEncounter:async({scope:given,resolveAuthenticatedSubject})=>
   attestEncounter({scope:given,resolveAuthenticatedSubject}),
  createOwner:async cfg=>{
   if(!same(cfg.scope,identity))
    throw Error('14.2 private owner instance mismatch');
   return createGame3DPrivateWorldRecovery139({
    ...cfg,
    createEncounter:({scope:given})=>attestEncounter({
     scope:given,
     resolveAuthenticatedSubject:cfg.resolveAuthenticatedSubject,
    }),
   });
  },
 });
 return Object.freeze({
  version:'14.2',listen:gateway.listen,
  close:gateway.close,scheduleTick:gateway.scheduleTick,
  mapId:mapWorld.id,mapFingerprint:mapWorld.fingerprint,
  instanceId:identity.instanceId,
  privateServerOnly:true,loopbackOnly:true,
  trustedWorldSeedDatabaseReadAvailable:true,
  privateSessionDigestLookupAvailable:true,
  fullCheckpointRecoverySourceAvailable:true,
  publicGameWorldMounted:false,multiplayerReplicationEnabled:false,
  productionReady:false,rewardWriterEnabled:false,
  lootWriterEnabled:false,questGrantWriterEnabled:false,
 });
}
