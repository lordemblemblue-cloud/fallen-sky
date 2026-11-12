// Combat 13.3 — reuse the existing PvE enemy attack-planning math for a
// *private, read-only* server preview. No parallel AI loop or damage writer.
import {
 combatEnemyProfile,planEnemyStrike,isWithinEnemyStrike,horizontalDistance,
} from '../../src/components/game3d/ai/EnemyCombatIntelligence.mjs';
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=100000;
const denied=code=>({ok:false,code,version:'13.3',
 previewOnly:true,enemyAuthorityInstalled:false,
 telegraphBroadcast:false,damageAuthorized:false,
 rewardAuthorized:false,productionReady:false});

export function previewGame3DServerEnemyStrike133({
 enemy,target,serverTick
}={}){
 const position=enemy?.group?.position;
 if(!Number.isSafeInteger(serverTick)||serverTick<0||
    enemy?.alive!==true||enemy?.dying===true||
    enemy?.isBoss===true||!position||
    !numeric(position.x)||!numeric(position.z)||
    !numeric(target?.x)||!numeric(target?.z)||
    !Number.isSafeInteger(enemy?.combatStrikeSerial)||
    enemy.combatStrikeSerial<0||enemy.combatStrikeSerial>1000000)
  return denied('invalid_enemy_server_observation');
 const profile=combatEnemyProfile(enemy);
 const plan=planEnemyStrike(enemy,target,profile);
 const distance=horizontalDistance(position,target);
 if(!Number.isFinite(distance)||
    !Number.isFinite(plan.facingYaw)||!Number.isFinite(plan.windup)||
    plan.windup<=0)
  return denied('invalid_enemy_attack_plan');
 const targetInSector=isWithinEnemyStrike({
  origin:position,target,facingYaw:plan.facingYaw,
  range:plan.range,arcDegrees:plan.arcDegrees,
 });
 return {ok:true,version:'13.3',previewOnly:true,serverTick,
  variant:plan.variant,windupSeconds:plan.windup,
  cooldownSeconds:plan.cooldown,
  facingYaw:plan.facingYaw,range:plan.range,
  arcDegrees:plan.arcDegrees,distance,
  targetInFrozenSectorAtPreview:targetInSector,
  // No authoritative NPC world position or collision source is connected.
  // No enemy attack is committed, hit applied or broadcast from here.
  enemyAuthorityInstalled:false,telegraphBroadcast:false,
  damageAuthorized:false,rewardAuthorized:false,productionReady:false};
}
