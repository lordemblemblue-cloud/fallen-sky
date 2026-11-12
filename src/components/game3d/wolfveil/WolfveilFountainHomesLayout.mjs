/**
 * Four distinct building lots around the existing Wolf-Spirit fountain.
 * Coordinates are native Wolfveil layout metres (Game 3D renders them with
 * the existing +70m world-Z offset). This is a TWO-ROW, staggered arrangement:
 * the southern pair shifts around the protected public-road corridors.
 *
 * The user's uploaded Tripo temple-house source is 0.98099 x 0.655 x 0.79419
 * model units. A UNIFORM 20x scale gives a 19.62 x 15.88m footprint and
 * 13.10m architectural height; no stretching or replacing its geometry.
 * A 3.55m grid-vertex margin around the footprint makes the coarse physical
 * heightfield flat all the way beneath the rendered foundation.
 */
export const WOLFVEIL_FOUNTAIN_HOME_SCALE=20;
export const WOLFVEIL_FOUNTAIN_PAD=Object.freeze({
  coreHalfWidth:14,
  coreHalfDepth:12.5,
  featherX:8,
  featherZ:11,
  embed:0.10,
  revision:1,
});
const P=WOLFVEIL_FOUNTAIN_PAD;
const positions=[
  ['fountain_home_northwest','Northwest Fountain Residence',-58,-26,Math.PI],
  ['fountain_home_northeast','Northeast Fountain Residence',56,-26,Math.PI],
  ['fountain_home_southwest','Southwest Fountain Residence',-66,-126,0],
  ['fountain_home_southeast','Southeast Fountain Residence',56,-82,0],
];
export const WOLFVEIL_FOUNTAIN_HOMES=Object.freeze(positions.map(([id,label,x,z,yaw])=>
  Object.freeze({
    id,label,x,z,yaw,scale:WOLFVEIL_FOUNTAIN_HOME_SCALE,
    // Axis-aligned architectural footprint, NOT the decorative eaves.
    w:19.62,d:15.88,height:13.10,kind:'fountain_home',
    solid:true,interiorAuthored:false,
  }),
));
const smooth01=t=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
export function isInsideWolfveilFountainHomeClearance(x,z,extra=0){
  if(![x,z,extra].every(Number.isFinite)||extra<0)return false;
  return WOLFVEIL_FOUNTAIN_HOMES.some(p=>
    Math.abs(x-p.x)<p.w*.5+extra+2.5 &&
    Math.abs(z-p.z)<p.d*.5+extra+2.5);
}
/**
 * Grade the REAL heightfield, never draw an unwalkable false floor.
 * Core footprint stays rigorously level; 8–11m rounded earth shoulders
 * transition to untouched grass/path terrain with zero height jumps.
 */
export function gradeWolfveilFountainHomeTerrain(x,z,terrainY,centerHeights,getRoadClearance=null){
  if(![x,z,terrainY].every(Number.isFinite)||
      !Array.isArray(centerHeights)||centerHeights.length!==4)return terrainY;
  let height=terrainY;
  for(let i=0;i<WOLFVEIL_FOUNTAIN_HOMES.length;i++){
    const p=WOLFVEIL_FOUNTAIN_HOMES[i],dx=Math.abs(x-p.x),dz=Math.abs(z-p.z);
    if(dx>=P.coreHalfWidth+P.featherX ||
       dz>=P.coreHalfDepth+P.featherZ)continue;
    if(!Number.isFinite(centerHeights[i]))continue;
    const wx=1-smooth01((dx-P.coreHalfWidth)/P.featherX);
    const wz=1-smooth01((dz-P.coreHalfDepth)/P.featherZ);
    // Protect the actual authored pedestrian road and its shoulders. Only
    // call the clearance sampler on the bounded 4-house grading footprints.
    // All four level house cores are far enough from those same roads.
    const roadFade=typeof getRoadClearance==='function'
      ?smooth01((getRoadClearance(x,z)-.5)/5)
      :1;
    const weight=wx*wz*roadFade;
    height=height*(1-weight)+centerHeights[i]*weight;
  }
  return height;
}
