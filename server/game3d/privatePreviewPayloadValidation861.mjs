// Game 3D Combat / Quest 86.1 — final private-preview HTTP data boundary.
// The original 84.9 producer already whitelists, but the actual Node HTTP
// adapter must independently verify scalar types, authority, and sequence.
// No reward engine, endpoint, auth provider, or DB writer is introduced.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const number=x=>typeof x==='number'&&Number.isFinite(x);
const id=/^[A-Za-z0-9_.:-]{8,128}$/;
const target=/^[A-Za-z0-9_.:-]{1,160}$/;
const status=/^[a-z][a-z_]{0,47}$/;
const kind=/^[a-z][a-z_]{0,63}$/;
const tier=/^[A-Za-z][A-Za-z_]{0,31}$/;
const eventFields=Object.freeze(['seq','kind','serverTime','targetId',
 'enemyId','tier','damage','enemyHp','playerHp','critical','killed','impactAt']);
const hasOptional=(e,k,pred)=>!Object.hasOwn(e,k)||pred(e[k]);
const safeEvent=e=>obj(e)&&Object.keys(e).every(k=>eventFields.includes(k))&&
 integer(e.seq)&&e.seq>0&&typeof e.kind==='string'&&kind.test(e.kind)&&
 number(e.serverTime)&&
 ['targetId','enemyId'].every(k=>hasOptional(e,k,v=>
  typeof v==='string'&&target.test(v)))&&
 hasOptional(e,'tier',v=>typeof v==='string'&&tier.test(v))&&
 ['damage','enemyHp','playerHp'].every(k=>hasOptional(e,k,v=>number(v)&&v>=0))&&
 hasOptional(e,'impactAt',number)&&
 ['critical','killed'].every(k=>hasOptional(e,k,v=>typeof v==='boolean'));
const safeEnemy=e=>exact(e,['id','x','z','hp','maxHp','alive',
 'pendingImpactAt'])&&typeof e.id==='string'&&target.test(e.id)&&
 number(e.x)&&number(e.z)&&number(e.hp)&&number(e.maxHp)&&
 e.hp>=0&&e.maxHp>0&&e.hp<=e.maxHp&&typeof e.alive==='boolean'&&
 (e.pendingImpactAt===null||number(e.pendingImpactAt));
const safeObjective=o=>exact(o,['questId','objectiveId','status',
 'current','required','targetReached'])&&
 typeof o.questId==='string'&&id.test(o.questId)&&
 typeof o.objectiveId==='string'&&id.test(o.objectiveId)&&
 typeof o.status==='string'&&status.test(o.status)&&
 integer(o.current)&&integer(o.required)&&o.required>=1&&
 o.required<=10000&&o.current<=o.required&&
 o.targetReached===(o.current===o.required);
export const PREVIEW_PAYLOAD_LIMITS_861=Object.freeze({
 maxEnemies:16,maxObjectives:128,maxEvents:40,
});
export function validateGame3DPrivatePreviewPayload861(p){
 try{
  if(!exact(p,['protocol','snapshot','questbook','events',
   'nextSeq','reset','gap','hasMore'])||
   p.protocol!=='game3d-private-presentation-849'||
   !exact(p.snapshot,['eventSeq','serverTime','player','enemies'])||
   !integer(p.snapshot.eventSeq)||!number(p.snapshot.serverTime)||
   !exact(p.snapshot.player,['x','z','hp','maxHp','stamina',
    'facing','lastIntentSeq']))return false;
  const player=p.snapshot.player;
  if(!['x','z','hp','maxHp','stamina','facing'].every(k=>number(player[k]))||
    !integer(player.lastIntentSeq)||player.maxHp<=0||
    player.hp<0||player.hp>player.maxHp||player.stamina<0)return false;
  if(!Array.isArray(p.snapshot.enemies)||
    p.snapshot.enemies.length>PREVIEW_PAYLOAD_LIMITS_861.maxEnemies||
    !p.snapshot.enemies.every(safeEnemy))return false;
  const seenEnemies=new Set();
  for(const enemy of p.snapshot.enemies){
   if(seenEnemies.has(enemy.id))return false;
   seenEnemies.add(enemy.id);
  }
  if(!exact(p.questbook,['objectives','objectiveTargetOnly',
   'turnInAuthorized'])||p.questbook.objectiveTargetOnly!==true||
   p.questbook.turnInAuthorized!==false||
   !Array.isArray(p.questbook.objectives)||
   p.questbook.objectives.length>PREVIEW_PAYLOAD_LIMITS_861.maxObjectives||
   !p.questbook.objectives.every(safeObjective))return false;
  const seenObjectives=new Set();
  for(const o of p.questbook.objectives){
   const k=o.questId+'\0'+o.objectiveId;
   if(seenObjectives.has(k))return false;
   seenObjectives.add(k);
  }
  if(!integer(p.nextSeq)||p.nextSeq>p.snapshot.eventSeq||
   typeof p.reset!=='boolean'||typeof p.gap!=='boolean'||
   typeof p.hasMore!=='boolean'||!Array.isArray(p.events)||
   p.events.length>PREVIEW_PAYLOAD_LIMITS_861.maxEvents||
   !p.events.every(safeEvent))return false;
  if(p.reset||p.gap){
   if(p.events.length!==0||p.hasMore||p.nextSeq!==p.snapshot.eventSeq)
    return false;
  }else{
   if(p.hasMore&&p.events.length===0)return false;
   let previous=-1;
   for(const e of p.events){
    if(e.seq<=previous||e.seq>p.snapshot.eventSeq)return false;
    previous=e.seq;
   }
   if(p.events.length>0&&p.events.at(-1).seq!==p.nextSeq)return false;
  }
  return true;
 }catch{return false}
}
