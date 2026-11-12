// Auto PvE target acquisition for the created Eve/Adam Game 3D fighters.
// Pure model-independent math. Never targets players or changes attack damage,
// movement, terrain collision, GLBs, or the server-authoritative duel.
export const GAME3D_EVE_ADAM_AUTO_LOCK=Object.freeze({
  acquireRange:9.5,
  retainRange:13,
  acquireHalfArcDegrees:75,
  scanIntervalSeconds:.15,
  enterDelaySeconds:2.7, // do not interrupt portrait -> Play camera handoff
});
const finite=Number.isFinite;
export function isEveAdamGame3DHero(model,character){
  const creatorBody=String(character?.creator_body||'');
  const savedRig=String(model?.userData?.rigId||'');
  const selectedGender=/^fused-(female|male)-v\d+$/.exec(creatorBody)?.[1];
  const loadedGender=/^fused-(female|male)-v\d+$/.exec(savedRig)?.[1];
  // A saved Eve/Adam selection can exist while the previous actor is still
  // loading. Do not auto-target with an explicitly different live rig.
  if(savedRig&&!loadedGender)return false;
  if(selectedGender&&loadedGender&&selectedGender!==loadedGender)return false;
  // Never use display-name text or avatar gender alone: only the actual
  // artist-fused character selection/rig enables this behavior.
  return Boolean(model?.position&&(selectedGender||loadedGender));
}
export function isAutoLockEnemyValid(enemy,origin,maxRange=GAME3D_EVE_ADAM_AUTO_LOCK.retainRange){
  if(!enemy||!origin||enemy.alive!==true||enemy.dying||enemy.defeated||
      enemy.kind==='player'||enemy.isPlayer||enemy.remotePlayerId||
      !enemy.group||enemy.group.visible===false||!enemy.group.position||
      enemy.id==null)return false;
  const {x,z}=enemy.group.position;
  if(![x,z,origin.x,origin.z].every(finite))return false;
  const distance=Math.hypot(x-origin.x,z-origin.z);
  return finite(distance)&&distance>0.1&&distance<=maxRange;
}
// Camera yaw 0 looks down -Z in Game 3D. Only acquire threats in front
// (150-degree total cone), nearest to the camera center and player.
export function chooseEveAdamAutoTarget({
  origin,yaw=0,enemies=[],bosses=[],rogues=[],excludeIds=[],
  range=GAME3D_EVE_ADAM_AUTO_LOCK.acquireRange,
}={}){
  if(!origin||![origin.x,origin.z,yaw,range].every(finite)||range<=0)
    return null;
  const exclusions=new Set(excludeIds.map(String));
  const aheadX=-Math.sin(yaw),aheadZ=-Math.cos(yaw);
  const cutoff=Math.cos(GAME3D_EVE_ADAM_AUTO_LOCK.acquireHalfArcDegrees*Math.PI/180);
  const seen=new Set();
  let best=null,bestScore=Infinity;
  for(const source of [enemies,bosses,rogues]){
    if(!Array.isArray(source))continue;
    for(const enemy of source){
      if(!isAutoLockEnemyValid(enemy,origin,range))continue;
      const id=String(enemy.id);
      if(seen.has(id)||exclusions.has(id))continue;
      seen.add(id);
      const dx=enemy.group.position.x-origin.x;
      const dz=enemy.group.position.z-origin.z;
      const dist=Math.hypot(dx,dz);
      const aim=(dx*aheadX+dz*aheadZ)/dist;
      if(aim<cutoff)continue;
      const score=dist+(1-aim)*3.5;
      if(score<bestScore){best=enemy;bestScore=score;}
    }
  }
  return best;
}
export function makeEveAdamAutoLockTarget(enemy,source='enemy'){
  const id=enemy?.id;
  if(id==null||!enemy?.group)return null;
  const name=enemy.name||enemy.bossName||'Enemy';
  const kind=enemy.isBoss||source==='boss'?'boss':
    source==='rogue'||enemy.color!==undefined?'rogue':'enemy';
  return {
    id,group:enemy.group,name,kind,autoAcquired:true,
    sourceEnemy:enemy,
    aliveRef:()=>!!enemy.alive&&!enemy.dying&&!enemy.defeated&&
      enemy.group?.visible!==false,
  };
}
