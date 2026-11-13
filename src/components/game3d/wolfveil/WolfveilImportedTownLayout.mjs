// The user's assembled Blender town, on the canonical Wolfveil heightfield.
// Positions are local Wolfveil coordinates; Game 3D renders them at +70m Z.
// 30% larger than the first install (130 x 141m). It grows westward so the
// east edge stays where it was, clear of the river and its bridge landing.
export const WOLFVEIL_IMPORTED_TOWN=Object.freeze({
 id:'wolfveil-assembled-town',name:'Wolfveil Town Plaza',
 x:-19.5,z:-70,width:169,depth:183.3,blendMeters:38,
 floorSourceY:0.690998,floorLiftMeters:0.07,
 // Size of the GLB in its own units; the model is centred on its origin.
 sourceWidth:10.423466,sourceDepth:11.330666,
});
/** World metres per model unit. */
export const WOLFVEIL_IMPORTED_TOWN_SCALE=Math.min(
 WOLFVEIL_IMPORTED_TOWN.width/WOLFVEIL_IMPORTED_TOWN.sourceWidth,
 WOLFVEIL_IMPORTED_TOWN.depth/WOLFVEIL_IMPORTED_TOWN.sourceDepth);
/** A point in the model's own units, as Game 3D render coordinates. */
export function wolfveilImportedTownPoint(sourceX,sourceZ){
 const p=WOLFVEIL_IMPORTED_TOWN,s=WOLFVEIL_IMPORTED_TOWN_SCALE;
 return {x:p.x+sourceX*s,z:p.z+70+sourceZ*s};
}
const clamp01=n=>Math.max(0,Math.min(1,n));
const smooth=t=>{const u=clamp01(t);return u*u*(3-2*u);};
export const WOLFVEIL_IMPORTED_TOWN_FLOOR_Y=80*smooth(155/445)+.3;
// The gold-ringed planter in the plaza. The model's own blossom tree inside
// sourceRadius is removed and the owner's ancient tree stands in its place.
export const WOLFVEIL_IMPORTED_TOWN_TREE=Object.freeze({
 ...wolfveilImportedTownPoint(-.63,-.02),
 sourceX:-.63,sourceZ:-.02,sourceRadius:.74,
 radius:2.2,height:24,maxWidth:26,
});
// Canal water sits just above the lawn instead of standing proud of it.
export const WOLFVEIL_IMPORTED_TOWN_WATER_SOURCE_Y=.703;
// Render coordinates. Each one is on open, reachable street.
export const WOLFVEIL_PLAYER_TOWN_SPAWN=Object.freeze({x:-29,z:32});
// Quest givers by id: the first one greets new players, the rest stand in
// the four quarters of the town.
export const WOLFVEIL_TOWN_QUEST_NPC_SPOTS=Object.freeze({
 archer_lyra:Object.freeze({x:-27,z:35}),
 archer_vex:Object.freeze({x:-61,z:-59}),
 archer_kira:Object.freeze({x:15,z:-60}),
 archer_noor:Object.freeze({x:-62,z:45}),
 archer_zephyr:Object.freeze({x:20,z:54}),
});
/** Where a quest giver stands and faces: around the town in Wolfveil, its own spot elsewhere. */
export function wolfveilQuestNpcSpot(region,npc){
 const spot=region==='wolfveil'?WOLFVEIL_TOWN_QUEST_NPC_SPOTS[npc.id]:null;
 if(!spot)return {x:npc.pos[0],z:npc.pos[2],facing:Math.atan2(-npc.pos[0],-npc.pos[2])};
 return {x:spot.x,z:spot.z,facing:Math.atan2(WOLFVEIL_PLAYER_TOWN_SPAWN.x-spot.x,WOLFVEIL_PLAYER_TOWN_SPAWN.z-spot.z)};
}
export function insideWolfveilImportedTown(x,z,margin=0){
 const p=WOLFVEIL_IMPORTED_TOWN;
 return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x-p.x)<=p.width/2+margin&&Math.abs(z-p.z)<=p.depth/2+margin;
}
export function gradeWolfveilImportedTown(x,z,previousHeight){
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(previousHeight))return previousHeight;
 const p=WOLFVEIL_IMPORTED_TOWN;
 const dx=Math.max(0,Math.abs(x-p.x)-p.width/2);
 const dz=Math.max(0,Math.abs(z-p.z)-p.depth/2);
 const distance=Math.hypot(dx,dz);
 if(distance>=p.blendMeters)return previousHeight;
 const naturalWeight=smooth(distance/p.blendMeters);
 return WOLFVEIL_IMPORTED_TOWN_FLOOR_Y*(1-naturalWeight)+previousHeight*naturalWeight;
}