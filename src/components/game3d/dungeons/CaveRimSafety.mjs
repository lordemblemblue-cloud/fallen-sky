// Cave approach safety for the Game 3D CLONE only.
// Approx. seven-foot buffer around cave rims = 2.1336 metres.
// Never changes terrain height or awards rewards; guards client movement while
// real ground collision and dedicated multiplayer authority remain unchanged.
export const CAVE_RIM_BUFFER_METRES=7*0.3048;
export const MAX_SAFE_CAVE_STEP_METRES=1.1;

// The imported Suigen 2.4 km grid is ~7.06 m between samples.
// Removing a triangle when *any* vertex touched the excavation removed intact
// outer bank triangles and created holes well outside the authored trench.
export const SUIGEN_ABYSS_CUT=Object.freeze({
  centerX:-440,minZ:320,maxZ:427,halfWidth:12.5,
});
export function isInsideSuigenAbyssCut(x,z){
  return Number.isFinite(x)&&Number.isFinite(z)
    &&Math.abs(x-SUIGEN_ABYSS_CUT.centerX)<SUIGEN_ABYSS_CUT.halfWidth
    &&z>=SUIGEN_ABYSS_CUT.minZ&&z<=SUIGEN_ABYSS_CUT.maxZ;
}
export function shouldCarveSuigenAbyssTriangle(vertices){
  return Array.isArray(vertices)&&vertices.length===3&&vertices.every(v=>
    v&&isInsideSuigenAbyssCut(v.x,v.z));
}

// The seven-foot safety band covers the sides AND ends of the excavation.
// Only discontinuous floor contact is rejected; genuine stair steps remain
// walkable and the E-activated official dungeon portal is untouched.
export function nearSuigenAbyssRim(x,z,radius=0){
  if(![x,z,radius].every(Number.isFinite)||radius<0)return false;
  const half=SUIGEN_ABYSS_CUT.halfWidth+CAVE_RIM_BUFFER_METRES+radius;
  const r=CAVE_RIM_BUFFER_METRES+radius;
  return Math.abs(x-SUIGEN_ABYSS_CUT.centerX)<=half
    &&z>=SUIGEN_ABYSS_CUT.minZ-r&&z<=SUIGEN_ABYSS_CUT.maxZ+r;
}
export const CLASSIC_CAVE_MOUTHS=Object.freeze([
  Object.freeze({id:'lunar-gate',x:171,z:225,radius:5.5}),
  Object.freeze({id:'astral-gate',x:197,z:225,radius:5.2}),
  // Wolfveil local-Z sites translate +70 to Game 3D world coordinates.
  Object.freeze({id:'jade-lantern',x:-360,z:-330,radius:5}),
  Object.freeze({id:'whispering-root',x:-500,z:370,radius:5}),
  Object.freeze({id:'inkstone-cistern',x:-40,z:618,radius:5}),
  Object.freeze({id:'crystal-vault',x:500,z:34,radius:5}),
]);
export function nearClassicCaveRim(x,z,radius=0){
  if(![x,z,radius].every(Number.isFinite)||radius<0)return false;
  return CLASSIC_CAVE_MOUTHS.some(site=>
    Math.hypot(x-site.x,z-site.z)<=site.radius+CAVE_RIM_BUFFER_METRES+radius);
}
// The selected Suigen copy also has Lunar/Celestial mountain gate sites.
// Their required E-portal interaction is handled by the existing world code.
export const SUIGEN_CAVE_MOUTHS=Object.freeze([
  Object.freeze({id:'moonstone-gate',x:171,z:222,radius:5.2}),
  Object.freeze({id:'celestial-gate',x:197,z:224,radius:5.2}),
]);
export function nearSuigenCaveGround(x,z,radius=0){
  if(nearSuigenAbyssRim(x,z,radius))return true;
  if(![x,z,radius].every(Number.isFinite)||radius<0)return false;
  return SUIGEN_CAVE_MOUTHS.some(site=>
    Math.hypot(x-site.x,z-site.z)<=site.radius+CAVE_RIM_BUFFER_METRES+radius);
}
export function shouldRejectCaveGroundStep({
  from,to,fromGroundY,toGroundY,variant='classic',actorRadius=.62,
}={}){
  if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite))return false;
  const close=variant==='suigen'
    ?nearSuigenCaveGround(to.x,to.z,actorRadius)||nearSuigenCaveGround(from.x,from.z,actorRadius)
    :nearClassicCaveRim(to.x,to.z,actorRadius)||nearClassicCaveRim(from.x,from.z,actorRadius);
  if(!close)return false;
  // A missing hit is a void, not a second legitimate floor. Never step into it.
  if(!Number.isFinite(toGroundY))return true;
  if(!Number.isFinite(fromGroundY))return false; // spawn recovery is handled elsewhere
  // The 0.17 m Abyss treads work; a steep plunge/roof snap cannot be mistaken
  // for a walkable surface. Both abrupt rises and drops are dangerous.
  return Math.abs(toGroundY-fromGroundY)>MAX_SAFE_CAVE_STEP_METRES;
}
