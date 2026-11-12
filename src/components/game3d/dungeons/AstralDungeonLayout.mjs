// Moonfall Expanse layout is the single authority for rendered platforms,
// bridge connections, collision and both map views. The central spine remains
// the primary route; paired side rings form linked, optional flanking routes.
export const ASTRAL_DUNGEON_REGION='astral-dungeon';
export const ASTRAL_DUNGEON_TITLE='Moonfall Expanse';
export const ASTRAL_DUNGEON_ENTRANCE=Object.freeze({
  x:197,z:224,approachX:197,approachZ:207,portalZ:225,
});
export const ASTRAL_PAD_RADIUS=26;
export const ASTRAL_BRIDGE_HALF_WIDTH=5.5;
export const ASTRAL_SPINE_PADS=Object.freeze([
  {id:'moonfall-landing',index:1,name:'Lunar Arrival',x:0,z:0,level:45,count:6,role:'spine'},
  {id:'moonfall-crossing',index:2,name:'Starfall Crossing',x:22,z:84,level:52,count:7,role:'spine'},
  {id:'moonfall-observatory',index:3,name:'Astral Observatory',x:-17,z:168,level:60,count:8,role:'spine'},
  {id:'moonfall-sanctum',index:4,name:'Eclipse Sanctum',x:15,z:252,level:70,count:9,role:'final'},
].map(p=>Object.freeze(p)));
const FLANK_NAMES=Object.freeze([
  ['Moonshadow Terrace','Starlit Terrace'],
  ['Comet Gallery','Nebula Gallery'],
  ['Umbral Array','Radiant Array'],
  ['Eclipse Watch West','Eclipse Watch East'],
]);
// Last flanking rings sit behind the farthest spine circle; both routes
// ultimately converge at Eclipse Sanctum instead of continuing beyond it.
export const ASTRAL_FLANK_PADS=Object.freeze(ASTRAL_SPINE_PADS.flatMap((p,i)=>
  [-1,1].map((sign,j)=>Object.freeze({
    id:p.id+(sign<0?'-left':'-right'),index:5+i*2+j,
    name:FLANK_NAMES[i][j],x:p.x+sign*78,z:p.z-18,
    level:p.level+1,count:3,role:'flank',side:sign<0?'left':'right',stage:p.index,
  }))
));
export const ASTRAL_PADS=Object.freeze([...ASTRAL_SPINE_PADS,...ASTRAL_FLANK_PADS]);
const bridge=(id,a,b,kind)=>Object.freeze({
  id,kind,ax:a.x,az:a.z,bx:b.x,bz:b.z,
  from:a.id,to:b.id,
});
const flank=(i,side)=>ASTRAL_FLANK_PADS[i*2+(side==='right'?1:0)];
export const ASTRAL_BRIDGES=Object.freeze([
  ...ASTRAL_SPINE_PADS.slice(1).map((p,i)=>
    bridge('astral-spine-'+(i+1),ASTRAL_SPINE_PADS[i],p,'spine')),
  ...ASTRAL_SPINE_PADS.flatMap((p,i)=>[
    bridge('astral-spoke-left-'+(i+1),p,flank(i,'left'),'spoke'),
    bridge('astral-spoke-right-'+(i+1),p,flank(i,'right'),'spoke'),
  ]),
  ...[0,1,2].flatMap(i=>[
    bridge('astral-flank-left-'+(i+1),flank(i,'left'),flank(i+1,'left'),'flank'),
    bridge('astral-flank-right-'+(i+1),flank(i,'right'),flank(i+1,'right'),'flank'),
  ]),
]);
export const ASTRAL_RETURN_PORTAL=Object.freeze({x:0,z:-14});
export function isInsideAstralDungeon(x,z,radius=.6){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return false;
  if(ASTRAL_PADS.some(p=>Math.hypot(x-p.x,z-p.z)<=ASTRAL_PAD_RADIUS-radius))return true;
  return ASTRAL_BRIDGES.some(b=>{
    const dx=b.bx-b.ax,dz=b.bz-b.az,len=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-b.ax)*dx+(z-b.az)*dz)/len));
    return Math.hypot(x-(b.ax+t*dx),z-(b.az+t*dz))<=ASTRAL_BRIDGE_HALF_WIDTH-radius;
  });
}
// All expanded training spawns reuse normal Game 3D combat AI. Loot remains
// server-authoritative and no client-side drops are invented here.
export const ASTRAL_MONSTER_SPAWNS=Object.freeze(ASTRAL_PADS.flatMap(pad=>
  Array.from({length:pad.count},(_,i)=>{
    const angle=2*Math.PI*(i+.35)/pad.count;
    const radius=i%2?16:20;
    const x=pad.x+Math.cos(angle)*radius,z=pad.z+Math.sin(angle)*radius;
    return Object.freeze({
      id:'astral_moonfall_'+pad.index+'_'+(i+1),
      home:[x,0,z],zoneCenter:[pad.x,0,pad.z],zoneRadius:20,
      level:pad.level+i%4,tierRoll:.55+(i%3)*.12,
      fixedTier:i===pad.count-1?'elite':undefined,
      aiProfile:'standard',dungeonTrainingSpawn:true,
      astralDungeonSpawn:true,pad:pad.index,
    });
  })
));
export const ASTRAL_LOOT_PROFILE=Object.freeze({
  id:'moonfall-expanse-high-level',minLevel:45,maxLevel:75,
  targetRarities:Object.freeze(['Rare','Epic','Legendary']),
  rewardAuthority:'server-required',
});
