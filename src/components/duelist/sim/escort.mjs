import {isDown} from '../core/index.mjs';
import {bodyOf} from './world.mjs';
import data from './importedEscortData.mjs';

export const ESCORT_RADIUS=9;
export const ESCORT_SPEED=3.5; // meters/second, constant distance along the imported route
export const ESCORT_ROUTE=Object.freeze(data.route.map(Object.freeze));
const legs=ESCORT_ROUTE.slice(1).map((end,i)=>{const start=ESCORT_ROUTE[i],dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;return {start,dx,dy,dz,length:Math.hypot(dx,dy,dz),yaw:Math.atan2(dx,dz)};});
let cumulative=0;for(const leg of legs){leg.begin=cumulative;cumulative+=leg.length;}
export const ESCORT_LENGTH=cumulative;
export function payloadPose(distance){const d=Math.max(0,Math.min(distance,ESCORT_LENGTH));let lo=0,hi=legs.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(legs[mid].begin+legs[mid].length<d)lo=mid+1;else hi=mid;}const l=legs[lo],t=Math.max(0,Math.min(1,(d-l.begin)/(l.length||1)));return{x:l.start.x+t*l.dx,y:l.start.y+t*l.dy,z:l.start.z+t*l.dz,yaw:l.yaw};}
const checkpointDistance=(x,z)=>{let best=Infinity,d=0;for(const l of legs){const v=(x-l.start.x)**2+(z-l.start.z)**2;if(v<best){best=v;d=l.begin;}}return d;};
export const ESCORT_CHECKPOINTS=Object.freeze([checkpointDistance(54,-54),checkpointDistance(-56,56)]);
export function makeEscort(){return{distance:0,progress:0,...payloadPose(0),attackers:0,defenders:0,moving:false,contested:false,overtime:false,pointACaptured:false,captureProgress:0,stage:0,bonusTime:0};}
export function stepEscort(match,dt){
 const cart=match.escort,target=cart.pointACaptured?cart:{x:0,y:0,z:-148};let attackers=0,defenders=0;
 for(const fighter of match.world.fighters.values()){
  if(fighter.vitals.dead||isDown(fighter,match.world.time)||fighter.heldBy||fighter.activeRelicUntil>match.world.time)continue;
  const body=bodyOf(match.world,fighter.id);if(!body||Math.abs(body.y-target.y)>2||Math.hypot(body.x-target.x,body.z-target.z)>ESCORT_RADIUS)continue;
  if(fighter.team==='red')attackers++;if(fighter.team==='blue')defenders++;
 }
 Object.assign(cart,{attackers,defenders,contested:attackers>0&&defenders>0,moving:false});
 if(!cart.pointACaptured){if(attackers&&!defenders){cart.captureProgress=Math.min(100,cart.captureProgress+24*dt*(attackers===1?1:attackers===2?1.3:1.55));if(cart.captureProgress>=100){cart.pointACaptured=true;cart.bonusTime+=60;}}}
 else if(attackers&&!defenders){cart.moving=true;cart.distance=Math.min(ESCORT_LENGTH,cart.distance+dt*ESCORT_SPEED);Object.assign(cart,payloadPose(cart.distance));cart.progress=cart.distance/ESCORT_LENGTH*100;
  while(cart.stage<2&&cart.distance>=ESCORT_CHECKPOINTS[cart.stage]){cart.stage++;cart.bonusTime+=90;}
 }
 const expired=match.clock>=match.def.clock+cart.bonusTime;
 cart.overtime=expired&&attackers>0&&cart.distance<ESCORT_LENGTH;
 if(cart.distance>=ESCORT_LENGTH)return'red';if(expired&&!attackers)return'blue';return null;
}
