// The existing Wolfveil PLAY world uses its own encounter sites. The legacy
// AXE combat test world spans are mostly outside Wolfveil and MUST NOT be
// reused here. IDs/positions/levels are fixed across clients; no random spawn
// coordinates, no client-granted server loot/reward authority.
//
// Character art uses the owner's existing Admin Model3D C1 enemy and its
// explicit AnimationFBX assignments. Additional owner enemy models can be
// assigned without changing the original scene/world coordinates.
import {WOLFVEIL_BRIDGES,WOLFVEIL_RIVER,WOLFVEIL_SITES}
  from './WolfveilLayout.js';

export const WOLFVEIL_HOSTILE_SPAWN_REVISION='wolfveil_play_hostiles_v1';

export const WOLFVEIL_HOSTILE_ZONES=Object.freeze([
  Object.freeze({
    id:'wolfveil_shadow_ravine',
    sourceCenter:[340,-165],radius:24,levels:[2,5],
    fixedTier:null,
    locations:[[325,-169],[337,-181],[352,-160],[347,-185]],
  }),
  Object.freeze({
    id:'wolfveil_ruined_watch',
    sourceCenter:[296,-205],radius:19,levels:[4,6],
    fixedTier:'champion',
    locations:[[285,-213],[298,-220],[309,-206]],
  }),
  Object.freeze({
    id:'wolfveil_wolfstone_outskirts',
    sourceCenter:[-325,235],radius:18,levels:[5,8],
    fixedTier:null,
    locations:[[-338,230],[-324,222],[-314,243]],
  }),
]);

const distanceToSegment=(x,z,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length));
  return Math.hypot(x-(a[0]+t*dx),z-(a[1]+t*dz));
};
const validXY=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&
  Math.abs(x)<530&&Math.abs(z)<530;

export function isWolfveilHostileSourceXZ(x,z){
  if(!validXY(x,z))return false;
  // Protect the market/sanctuary training and southern settlement. Keep
  // ordinary enemies around the actual encounter landmarks instead.
  for(const [site,safeRadius] of [
    [WOLFVEIL_SITES.market,100],
    [WOLFVEIL_SITES.southGate,60],
    [WOLFVEIL_SITES.sanctuary,50],
    [WOLFVEIL_SITES.training,65],
  ])if(Math.hypot(x-site.x,z-site.z)<safeRadius)return false;
  const river=WOLFVEIL_RIVER.points;
  for(let i=1;i<river.length;i++){
    if(distanceToSegment(x,z,river[i-1],river[i])<
      WOLFVEIL_RIVER.width/2+10)return false;
  }
  // Avoid placing an enemy on a landing/deck or directly beneath a rail.
  for(const bridge of WOLFVEIL_BRIDGES){
    if(distanceToSegment(x,z,bridge.from,bridge.to)<
      bridge.width/2+9)return false;
  }
  return true;
}

export function selectWolfveilGroundedEnemySpawns(
  sampleViewerGround,{viewerOffsetZ=70,maxNeighbourRise=1.8}={}){
  if(typeof sampleViewerGround!=='function'||
     !Number.isFinite(viewerOffsetZ)||
     !(maxNeighbourRise>0))throw Error('Missing runtime Wolfveil ground sampler');
  const selected=[];
  for(const zone of WOLFVEIL_HOSTILE_ZONES){
    for(let i=0;i<zone.locations.length;i++){
      const [x,z]=zone.locations[i];
      if(!isWolfveilHostileSourceXZ(x,z))continue;
      const viewerZ=z+viewerOffsetZ;
      // Use the loaded terrain/deck raycast, NOT a guessed analytic Y=0.
      const y=sampleViewerGround(x,viewerZ);
      if(!Number.isFinite(y))continue;
      const neighborY=[
        sampleViewerGround(x+1,viewerZ),
        sampleViewerGround(x-1,viewerZ),
        sampleViewerGround(x,viewerZ+1),
        sampleViewerGround(x,viewerZ-1),
      ];
      if(!neighborY.every(n=>Number.isFinite(n)&&
         Math.abs(n-y)<=maxNeighbourRise))continue;
      const tierRoll=((i+1)*37+(zone.levels[0]*19))%101/101;
      selected.push(Object.freeze({
        id:zone.id+'_'+i,
        zoneId:zone.id,
        zoneCenter:[zone.sourceCenter[0],0,zone.sourceCenter[1]+viewerOffsetZ],
        zoneRadius:zone.radius,
        home:[x,y,viewerZ],
        tierRoll,
        level:zone.levels[0]+i%(zone.levels[1]-zone.levels[0]+1),
        fixedTier:zone.fixedTier,
        aiProfile:zone.fixedTier==='champion'?'aggressive':'standard',
        modelAssetKey:'admin_model_c1',
        animationSet:'admin_c1_assigned',
        sourceXZ:[x,z],
        wolfveilVisualSpawn:true,
        authoritativeServerSpawnVerified:false,
      }));
    }
  }
  return selected;
}
