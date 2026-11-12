// Game 3D Combat / Quest 86.2 — immutable, plain-data copy at final HTTP edge.
// Original 84.9 read-only projection is authoritative. Never forward its
// object references, getters, prototype, custom toJSON, or hidden properties.
import {validateGame3DPrivatePreviewPayload861}
 from './privatePreviewPayloadValidation861.mjs';

const object=entries=>Object.freeze(Object.assign(Object.create(null),entries));
const array=values=>{
 // Shield our new arrays from any inherited Array.prototype.toJSON hook.
 Object.defineProperty(values,'toJSON',{value:undefined,
  enumerable:false,writable:false,configurable:false});
 return Object.freeze(values);
};
const EVENT_FIELDS=Object.freeze(['seq','kind','serverTime','targetId',
 'enemyId','tier','damage','enemyHp','playerHp','critical','killed','impactAt']);
export const GAME3D_IMMUTABLE_PREVIEW_VERSION_862='86.2';

export function cloneGame3DPrivatePreviewPayload862(source){
 try{
  // Validate source AND the newly materialized copy to defeat value changes
  // caused by getters between check and serialization.
  if(!validateGame3DPrivatePreviewPayload861(source))return null;
  const p=source.snapshot.player;
  const player=object({x:p.x,z:p.z,hp:p.hp,maxHp:p.maxHp,
   stamina:p.stamina,facing:p.facing,lastIntentSeq:p.lastIntentSeq});
  const enemies=array(source.snapshot.enemies.map(e=>object({
   id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,alive:e.alive,
   pendingImpactAt:e.pendingImpactAt,
  })));
  const snapshot=object({
   eventSeq:source.snapshot.eventSeq,serverTime:source.snapshot.serverTime,
   player,enemies,
  });
  const objectives=array(source.questbook.objectives.map(o=>object({
   questId:o.questId,objectiveId:o.objectiveId,status:o.status,
   current:o.current,required:o.required,targetReached:o.targetReached,
  })));
  const questbook=object({
   objectives,objectiveTargetOnly:true,turnInAuthorized:false,
  });
  const events=array(source.events.map(e=>object(
   Object.fromEntries(EVENT_FIELDS.filter(k=>Object.hasOwn(e,k))
    .map(k=>[k,e[k]])))));
  const cloned=object({
   protocol:'game3d-private-presentation-849',
   snapshot,questbook,events,
   nextSeq:source.nextSeq,reset:source.reset,gap:source.gap,
   hasMore:source.hasMore,
  });
  return validateGame3DPrivatePreviewPayload861(cloned)?cloned:null;
 }catch{return null}
}
