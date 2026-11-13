// Asset URLs were returned by the connected Atom x Eve OS Base44 media library
// on 2026-11-08. Public URL != browser/GPU load verified. Preserve procedural
// Wolfveil if any upload is unavailable, slow, or rejected by the client.
export const WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS=Object.freeze({
 grass:Object.freeze({
  url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/f5e95a78a_realistics_grass_06_1_.glb',
  type:'glb',maxCopies:12,maxWidth:1.35,maxHeight:.42,
  // maxTriangles: per-copy budget applied on load (source is 6,552).
  // maxTrailCopies: extra copies spread along the valley's trails.
  maxTriangles:1400,maxTrailCopies:44,
 }),
 plants:Object.freeze({
  url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/42cb63080_stylized_plant_pack_1_.glb',
  type:'glb',maxCopies:12,maxWidth:1.6,maxHeight:1.05,
  maxTriangles:1800,maxTrailCopies:30,
 }),
 garden:Object.freeze({
  url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/3f9132732_wolfveil_garden_leaves_optimized.glb',
  type:'glb',maxCopies:8,maxWidth:1.8,maxHeight:.48,
  maxTriangles:1300,maxTrailCopies:16,
 }),
 tree:Object.freeze({
  url:'https://media.base44.com/files/public/6876751a602125f45f1861b9/3522223cf_ancient_tree_3d_model_1_.fbx',
  basecolor:'https://media.base44.com/images/public/6876751a602125f45f1861b9/78dd6d60b_ancient_tree_3d_model_basecolor.jpg',
  type:'fbx',maxCopies:24,maxWidth:10,maxHeight:17,
  maxTriangles:5000,maxTrailCopies:0,
 }),
});
const finite=(v)=>Number.isFinite(v);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function chooseSpaced(items,max,minDistance){
 const chosen=[];
 for(const p of items){
  if(!p||!finite(p.x)||!finite(p.z)||!finite(p.y))continue;
  if(Math.abs(p.x)>540||Math.abs(p.z)>540)continue;
  if(chosen.some(q=>dist(p,q)<minDistance))continue;
  chosen.push(p);
  if(chosen.length>=max)break;
 }
 return chosen;
}
function interleaveRoutes(items){
 const byRoute=new Map();
 for(const p of items){
  if(!p||typeof p.route!=='string')continue;
  if(!byRoute.has(p.route))byRoute.set(p.route,[]);
  byRoute.get(p.route).push(p);
 }
 const result=[];let had=true;
 while(had){
  had=false;
  for(const list of byRoute.values())if(list.length){
   had=true;result.push(list.shift());
  }
 }
 return result;
}
// Reuse already validated route and forest coordinates. Crucially, ancient
// trees only overlay existing *server-authoritative* forest-trunk colliders;
// no new impassable visual trunk is placed where the server permits walking.
export function chooseWolfveilOwnerAssetAnchors({grass=[],shrubs=[],forestTrees=[],trail={}}={}){
 const A=WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS;
 // Trail-side spots are added after the original route anchors and never
 // crowd them, so existing placements stay exactly where they were.
 const along=(base,extra=[],max,spacing)=>{
  const chosen=[];
  for(const p of extra){
   if(chosen.length>=max)break;
   if(!p||!finite(p.x)||!finite(p.y)||!finite(p.z))continue;
   if([...base,...chosen].some(q=>dist(p,q)<spacing))continue;
   chosen.push(p);
  }
  return [...base,...chosen];
 };
 const trailGrass=trail.grass??[],trailPlants=trail.plants??[];
 const routedGrass=interleaveRoutes(grass);
 const routedShrubs=interleaveRoutes(shrubs);
 const trees=forestTrees.filter(t=>t&&t.kind==='ancient'&&
   finite(t.x)&&finite(t.y)&&finite(t.z)&&
   Math.abs(t.x)<450&&Math.abs(t.z)<440);
 return Object.freeze({
  grass:along(chooseSpaced(routedGrass,A.grass.maxCopies,17),
    trailGrass.filter((_,i)=>i%3!==1),A.grass.maxTrailCopies,24),
  plants:along(chooseSpaced(routedShrubs,A.plants.maxCopies,23),
    trailPlants,A.plants.maxTrailCopies,30),
  garden:along(chooseSpaced(routedGrass.filter((p,i)=>i%3===1),A.garden.maxCopies,25),
    trailGrass.filter((_,i)=>i%3===1),A.garden.maxTrailCopies,40),
  tree:chooseSpaced(trees,WOLFVEIL_UPLOADED_LANDSCAPE_ASSETS.tree.maxCopies,18),
 });
}