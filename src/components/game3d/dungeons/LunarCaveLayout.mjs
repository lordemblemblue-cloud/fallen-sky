// Game 3D only. Original concept: an accessible water-side mountain gate and
// a *separate* winding training dungeon, not a new Game 1 village/collision map.
export const LUNAR_CAVE_REGION = 'lunar-cave';
export const LUNAR_CAVE_ENTRANCE = Object.freeze({
  id: 'wolfveil_lunar_mountain_gate',
  // Existing Wolfveil waterfall cave at local (163, 155), +70 world-Z offset.
  // Moved east along the rock face, angled into the cave.
  x: 171, z: 222, approachX: 165, approachZ: 208, portalZ: 225, yaw: Math.PI/8,
  terrainSiteId: 'wolfveil_waterfall_cave',
});
// Each hall is a real open arena; their centres move laterally so the route
// changes direction rather than following a single straight corridor.
export const LUNAR_CAVE_ROOM_RADIUS = 40;
export const LUNAR_CAVE_PASSAGE_HALF_WIDTH = 10;
export const LUNAR_CAVE_CHAMBERS = Object.freeze([
  {id:'moonstone-hall-1',name:'Moonstone Threshold',index:1,x:0,z:80,level:1,count:5},
  {id:'moonstone-hall-2',name:'Echoing Gallery',index:2,x:38,z:190,level:5,count:5},
  {id:'moonstone-hall-3',name:'Shadowed Vault',index:3,x:-36,z:300,level:9,count:5},
  {id:'moonstone-hall-4',name:'Runebound Hollow',index:4,x:32,z:410,level:13,count:5},
  {id:'moonstone-hall-5',name:'Eclipse Sanctuary',index:5,x:-26,z:520,level:17,count:5},
]);
export const LUNAR_CAVE_WATER_END = Object.freeze({x:-26,z:624,returnPortalZ:649});

// One discoverable cache in each genuine chamber. Visual discovery does NOT
// grant Silver/items/XP; trusted server completion and chest settlement are
// required before any persistent reward may be claimed.
export const LUNAR_CAVE_TREASURE_SITES = Object.freeze(
  LUNAR_CAVE_CHAMBERS.map((chamber,i)=>Object.freeze({
    id:'moonstone-cache-'+(i+1),
    name:['Threshold Reliquary','Echo Cache','Shadow Chest','Runebound Trove',
      'Eclipse Treasury'][i],
    chamberId:chamber.id,level:chamber.level,
    x:chamber.x+(i%2===0?29:-29),y:0,z:chamber.z+6,
    rewardAuthority:'server-required',
  }))
);

// Linked axis-aligned sections make visible 90-degree bends. Their caps overlap
// the arena floors, leaving no dead-end gaps in collision or geometry.
const segment=(ax,az,bx,bz)=>Object.freeze({ax,az,bx,bz});
export const LUNAR_CAVE_PASSAGES = Object.freeze([
  segment(0,-31,0,80),
  segment(0,80,0,136), segment(0,136,38,136), segment(38,136,38,190),
  segment(38,190,38,246), segment(38,246,-36,246), segment(-36,246,-36,300),
  segment(-36,300,-36,356), segment(-36,356,32,356), segment(32,356,32,410),
  segment(32,410,32,466), segment(32,466,-26,466), segment(-26,466,-26,520),
  segment(-26,520,-26,624), segment(-26,624,-26,651),
]);
export function chamberForDungeonZ(z){
  if(!Number.isFinite(z))return null;
  const i=Math.max(0,Math.min(4,Math.round((z-80)/110)));
  return LUNAR_CAVE_CHAMBERS[i];
}
// Uses existing local GameWorld3D creature combat. No server-authoritative
// rewards are inferred from this preview-only training roster.
export const LUNAR_CAVE_TRAINING_SPAWNS = Object.freeze(
  LUNAR_CAVE_CHAMBERS.flatMap(chamber=>
    Array.from({length:chamber.count},(_,i)=>{
      const angle=(i+.5)*Math.PI*2/chamber.count;
      const radius=i%2===0?16:23;
      const x=chamber.x+Math.cos(angle)*radius,z=chamber.z+Math.sin(angle)*radius;
      return Object.freeze({
        id:`lunar_train_${chamber.index}_${i+1}`,
        home:[x,0,z],zoneCenter:[x,0,z],zoneRadius:10,
        level:chamber.level+(i%3),tierRoll:.18+((i+chamber.index)%5)*.12,
        aiProfile:'standard',dungeonTrainingSpawn:true,
        chamber:chamber.index,
      });
    })
  )
);
export function isInsideDungeonWalkway(x,z,radius=.5){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return false;
  if(z<-35+radius||z>675-radius)return false;
  const insideRoom = [...LUNAR_CAVE_CHAMBERS,LUNAR_CAVE_WATER_END].some(c=>
    Math.hypot(x-c.x,z-c.z)<=LUNAR_CAVE_ROOM_RADIUS-radius);
  if(insideRoom)return true;
  // Capsule-shaped collision corridors exactly match the pieces rendered by
  // LunarCaveScene; player radius is subtracted for solid tunnel boundaries.
  return LUNAR_CAVE_PASSAGES.some(({ax,az,bx,bz})=>{
    const dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len2));
    return Math.hypot(x-(ax+t*dx),z-(az+t*dz))<=LUNAR_CAVE_PASSAGE_HALF_WIDTH-radius;
  });
}
