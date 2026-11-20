// Authored ONLY for the cloned Wolfveil plaza; no random building placements.
// +Z is town north. The southern entrance is at Z ~ -72 and the central
// owner tree is at (-7.85, 0). Preserve a 24m+ open walking corridor.
import {WOLFVEIL_IMPORTED_TOWN as T,WOLFVEIL_IMPORTED_TOWN_TREE as TREE}
  from './WolfveilImportedTownLayout.mjs';

const building=(id,name,role,x,z,w=14,d=12,side='left')=>Object.freeze({
  id,name,role,x,z,w,d,side,facade:side==='left'?'east':side==='right'?'west':'south',
});
// One large, detached hall/home behind the tree; four places on each side
// of the south-to-north avenue. Shops face inward, toward the walkable street.
export const CLONE_TOWN_HOUSES=Object.freeze([
  building('north_lodge','Northwatch Longhouse','lodge',2,54,26,15,'rear'),
  building('west_01','Cedar Tea House','shop',-39,-44,14,12,'left'),
  building('west_02','Moon Thread Tailor','shop',-39,-23,14,12,'left'),
  building('west_03','Clay and Ink','shop',-39,8,14,12,'left'),
  building('west_04','Cedar Hearth','home',-39,29,14,12,'left'),
  building('east_01','Riverstone Provisions','shop',39,-44,14,12,'right'),
  building('east_02','Lantern Apothecary','shop',39,-23,14,12,'right'),
  building('east_03','Ironleaf Smith','shop',39,8,14,12,'right'),
  building('east_04','Orchid Cottage','home',39,29,14,12,'right'),
]);
// Exactly two opposite-direction patrols down the open capital avenue.
// Keep their lanes 11m off center to avoid the plaza fountain/tree.
export const CLONE_TOWN_GUARDS=Object.freeze([
  Object.freeze({id:'guard_sera',name:'Sera',role:'guard',side:'left',
    variant:'blue',route:[[-11,-46],[-11,38]],speed:1.10,phase:0}),
  Object.freeze({id:'guard_ren',name:'Ren',role:'guard',side:'right',
    variant:'warden',route:[[11,38],[11,-46]],speed:1.10,phase:0}),
]);
export const CLONE_TOWN_CITIZENS=Object.freeze([
  ['nami','Nami','tea','west_01','archer_lyra'],
  ['ori','Ori','tailor','west_02','archer_noor'],
  ['kenji','Kenji','potter','west_03','archer_zephyr'],
  ['hana','Hana','resident','west_04','archer_kira'],
  ['toma','Toma','provisions','east_01','archer_vex'],
  ['yuki','Yuki','herbalist','east_02','archer_kira'],
  ['bren','Bren','smith','east_03','archer_vex'],
  ['mei','Mei','resident','east_04','archer_lyra'],
].map(([id,name,role,houseId,questNpcId])=>Object.freeze({
  id:'town_'+id,name,role,houseId,questNpcId,
})));

export function inTownBuildablePlot(h,{
  treeX=TREE.x,treeZ=TREE.z,
  maxX=T.width/2-5,maxZ=T.depth/2-5,
  centerCorridorHalfWidth=17,
}={}){
 if(!h||![h.x,h.z,h.w,h.d].every(Number.isFinite)||h.w<7||h.d<7)return false;
 if(Math.abs(h.x)+h.w/2>maxX||Math.abs(h.z)+h.d/2>maxZ)return false;
 if(h.side!=='rear'&&Math.abs(h.x)-h.w/2<centerCorridorHalfWidth)return false;
 // A central-tree preservation disc around the real FBX's trunk and canopy.
 const nearestX=Math.max(h.x-h.w/2,Math.min(treeX,h.x+h.w/2));
 const nearestZ=Math.max(h.z-h.d/2,Math.min(treeZ,h.z+h.d/2));
 if(Math.hypot(nearestX-treeX,nearestZ-treeZ)<13.5)return false;
 return true;
}
export function rectanglesOverlap(a,b,pad=0){
 return Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&
   Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;
}
export function verifyTownPlotPlan(plots=CLONE_TOWN_HOUSES){
 const violations=[];
 for(const h of plots){
  if(!inTownBuildablePlot(h))violations.push(h.id+': forbidden tree, entrance or floor boundary');
  for(const other of plots)if(h!==other&&rectanglesOverlap(h,other,1.2)&&h.id<other.id)
   violations.push(h.id+': overlaps '+other.id);
 }
 return {ok:violations.length===0,violations,houses:plots.length,
   shops:plots.filter(h=>h.role==='shop').length,
   largerHouses:plots.filter(h=>h.role==='lodge').length};
}
// World-ground checks must be made against the post-clearance collision index
// and do not move preexisting paving, canal/bridge faces, or the center tree.
export function chooseTownPlots(collision,{
 maxGrade=.65,allowUnsafe=false,
}={}){
 const accepted=[],rejected=[];
 const offsets=[[0,0],[-2,0],[2,0],[0,-2],[0,2],
  [-4,0],[4,0],[0,-4],[0,4],[-2,-2],[2,-2],[-2,2],[2,2]];
 for(const authored of CLONE_TOWN_HOUSES){
  if(!inTownBuildablePlot(authored)){
   rejected.push({id:authored.id,reason:'protected zone'});continue;
  }
  let picked=null;
  for(const [dx,dz] of offsets){
   const h={...authored,x:authored.x+dx,z:authored.z+dz};
   if(!inTownBuildablePlot(h)||
     accepted.some(other=>rectanglesOverlap(other,h,1.2))||
     CLONE_TOWN_HOUSES.some(other=>other!==authored&&rectanglesOverlap(other,h,1.2)))
     continue;
   const points=[[h.x,h.z],
     [h.x-h.w*.48,h.z-h.d*.48],[h.x+h.w*.48,h.z-h.d*.48],
     [h.x-h.w*.48,h.z+h.d*.48],[h.x+h.w*.48,h.z+h.d*.48]];
   const heights=points.map(([x,z])=>collision?.groundAt?.(x,z));
   // Never bridge water, place atop old stair risers, or tilt a building
   // across two conflicting tile elevations. Try a nearby safe location,
   // but never move a shop into the main plaza/path or another house.
   if(!allowUnsafe&&(!heights.every(Number.isFinite)||
     Math.max(...heights)-Math.min(...heights)>maxGrade||
     points.some(([x,z])=>collision?.isSolid?.(x,z))))continue;
   picked={...h,y:heights.every(Number.isFinite)?Math.max(...heights):0,
     shiftedMeters:Math.hypot(dx,dz)};
   break;
  }
  if(picked)accepted.push(picked);
  else rejected.push({id:authored.id,reason:'no level collision-safe foundation within 4m'});
 }
 return {accepted,rejected};
}
