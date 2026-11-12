// Combat 14.3 — strict opt-in private Game 3D PvE bootstrap.
// Continues the SAME 13.6 NPC loop, 13.7 world sync, 13.9 checkpoint,
// 14.0 loopback gateway and 14.1 session authentication from 14.2.
// No browser mount, public ports, equipment affix admission or payouts.
import {createGame3DPrivateWorldBootstrap142}
 from './privateWorldBootstrap142.mjs';
import {createGame3DTrustedCombatSheetReader143}
 from './trustedCombatSheet143.mjs';
import {createGame3DPrivateAXEPveResolvers143}
 from './privateAXEPveResolver143.mjs';

export async function createGame3DPrivateWorldBootstrap143({
 pool,scope,allowedOrigins,authorizeServerOperation,
 now=Date.now,leaseMs=10000,trustedSessionAdapter149=null,
 // Only a privileged testing process should override the cryptographic RNG.
 randomRoll,
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('14.3 requires private PostgreSQL and trusted worker');
 const sheet=createGame3DTrustedCombatSheetReader143({pool});
 const resolvers=createGame3DPrivateAXEPveResolvers143({
  randomRoll,
 });
 const privateWorld=await createGame3DPrivateWorldBootstrap142({
  pool,scope,allowedOrigins,authorizeServerOperation,
  now,leaseMs,trustedSessionAdapter149,
  trustedCombatSheetReader143:sheet,
  resolvePlayerStrike:resolvers.resolvePlayerStrike,
  resolveEnemyStrike:resolvers.resolveEnemyStrike,
 });
 return Object.freeze({
  version:'14.3',listen:privateWorld.listen,
  close:privateWorld.close,scheduleTick:privateWorld.scheduleTick,
  instanceId:privateWorld.instanceId,
  mapId:privateWorld.mapId,
  mapFingerprint:privateWorld.mapFingerprint,
  privateServerOnly:true,loopbackOnly:true,
  sharedAXEPveDamageRules:true,
  baseCharacterProgressionBound:true,
  equipmentStatsAuthenticated:false,
  equipmentBonusesEnabled:false,
  masteryBonusesEnabled:false,
  publicGameWorldMounted:false,
  multiplayerReplicationEnabled:false,
  questRewardWriterEnabled:false,
  lootWriterEnabled:false,
  marketWalletEnabled:false,
  productionReady:false,
 });
}
