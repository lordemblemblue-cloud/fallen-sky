// 10 zombie camps × 15: deterministic reference positions in REAL Wolfveil Play.
// This is encounter layout, not a second map. X/Z are the unshifted layout
// coordinate system; renderer applies +70m to Z ONCE. No local random spawns.
import {isWolfveilHostileSourceXZ} from './WolfveilEnemySpawns.mjs';
export const WOLFVEIL_ZOMBIE_REVISION='wolfveil_zombie_camps_v1';
export const WOLFVEIL_ZOMBIE_GROUP_SIZE=15;
export const WOLFVEIL_ZOMBIE_MAX_ACTIVE=30;
export const WOLFVEIL_ZOMBIE_CAMPS=Object.freeze([
  {id:'scarred_south',label:'Scarred South',x:310,z:-260,level:3},
  {id:'fallen_gate',label:'Fallen Gate',x:390,z:-230,level:10},
  {id:'red_ravine',label:'Red Ravine',x:420,z:-95,level:15},
  {id:'east_quarry',label:'East Quarry',x:385,z:55,level:20},
  {id:'hidden_falls',label:'Hidden Falls Outskirts',x:380,z:175,level:25},
  {id:'northern_rift',label:'Northern Rift',x:300,z:285,level:30},
  {id:'wolfstone_reach',label:'Wolfstone Reach',x:-380,z:295,level:35},
  {id:'western_cedar',label:'Western Cedar',x:-430,z:165,level:40},
  {id:'bluewood',label:'Bluewood Hollow',x:-430,z:5,level:45},
  {id:'southwest_ruins',label:'Southwest Ruins',x:-390,z:-190,level:50},
].map((camp,i)=>Object.freeze({...camp,number:i+1,radius:24,groupSize:WOLFVEIL_ZOMBIE_GROUP_SIZE})));

export function zombieXPForKill(level){
  const n=Math.max(1,Math.min(60,Math.floor(Number(level)||1)));
  return Math.round(4+2.75*n+.045*n*n);
}
// A high-level player should not make old monsters completely harmless, but
// the camp level remains the chief difficulty and reward determinant.
export function zombieAttackLevel(campLevel,playerLevel){
  const camp=Math.max(1,Math.min(60,Math.floor(Number(campLevel)||1)));
  const player=Math.max(1,Math.min(60,Math.floor(Number(playerLevel)||1)));
  return Math.max(camp,Math.min(camp+8,Math.floor(player*.65)));
}
const GOLDEN_ANGLE=2.399963229728653;
export function planWolfveilZombieCamps({viewerOffsetZ=70}={}){
  if(!Number.isFinite(viewerOffsetZ))throw Error('Invalid Wolfveil viewer offset');
  return Object.freeze(WOLFVEIL_ZOMBIE_CAMPS.flatMap(camp=>{
    const positions=[];
    for(let i=0;i<camp.groupSize;i++){
      // Fibonacci disk layout: natural tight group, bodies stay ~4m apart.
      const radius=4.8+12*Math.sqrt((i+.5)/camp.groupSize);
      const theta=GOLDEN_ANGLE*i+camp.number*.31;
      const x=camp.x+Math.cos(theta)*radius;
      const z=camp.z+Math.sin(theta)*radius;
      positions.push(Object.freeze({
        id:'wolfveil_zombie_'+camp.id+'_'+String(i+1).padStart(2,'0'),
        campId:camp.id,campLabel:camp.label,campNumber:camp.number,
        index:i,groupSize:camp.groupSize,level:camp.level,
        xpReward:zombieXPForKill(camp.level),
        x,z,viewerZ:z+viewerOffsetZ,
        sourceXZ:[x,z],zoneCenter:[camp.x,0,camp.z+viewerOffsetZ],
        zoneRadius:camp.radius+10,
        isSafeSource:isWolfveilHostileSourceXZ(x,z),
      }));
    }
    return positions;
  }));
}
export function safeZombieGround(sampleGroundY,spawn,{maxNeighbourRise=1.5}={}){
  if(!spawn?.isSafeSource||typeof sampleGroundY!=='function')return null;
  const y=sampleGroundY(spawn.x,spawn.viewerZ);
  if(!Number.isFinite(y))return null;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const n=sampleGroundY(spawn.x+dx,spawn.viewerZ+dz);
    if(!Number.isFinite(n)||Math.abs(n-y)>maxNeighbourRise)return null;
  }
  return y;
}
