// Game 1 / Game 3D terrain contract. This is deliberately not imported from
// Game 2: the two games have independent engines, maps, and combat state.
// Sampling this one function powers the real terrain mesh, waterbanks, trees,
// wildlife feet, mud basins, and the Game 3D ground raycast.
export const GAME1_FOREST_SPAN = 240;
export const GAME1_FOREST_SEED = 0x7a4e19;
export const GAME1_FOREST_CLEARINGS = Object.freeze([
  Object.freeze({x:0,z:0,r:11}),
  Object.freeze({x:6,z:-22,r:6}),
  Object.freeze({x:24,z:-13,r:6}),
  Object.freeze({x:-26,z:18,r:6}),
]);
export const clamp01 = x => Math.max(0,Math.min(1,Number(x)||0));
export const smoothstep = (a,b,x) => {
  const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);
};
export function seededRandom(seed=GAME1_FOREST_SEED) {
  let state=seed>>>0;
  return ()=>{state=(state+0x6d2b79f5)>>>0;let t=state;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
export function forestStreamX(z){return 30+5.5*Math.sin(z*.047)+2.4*Math.sin(z*.106);}
export function forestStreamDistance(x,z){return Math.abs(x-forestStreamX(z));}
export const GAME1_FOREST_TRAIL_POINTS = Object.freeze([
  Object.freeze([0,0]), Object.freeze([-12,7]),
  Object.freeze([-26,18]), Object.freeze([-43,25]),
  Object.freeze([-70,38]),
]);
// A continuous verge sampler shared by small stones and living grass.
// Paths retain their own clear walking corridor; this only scatters art.
export function game1ForestTrailVergePoint(fraction, side, offset) {
  const points = GAME1_FOREST_TRAIL_POINTS;
  const distances = points.slice(1).map((p,i) =>
    Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  const total = distances.reduce((sum,n)=>sum+n,0);
  let remaining = clamp01(fraction)*total;
  let index=distances.length-1;
  for(let i=0;i<distances.length;i++){
    if(remaining<=distances[i]){index=i;break;}
    remaining-=distances[i];
  }
  const [ax,az]=points[index],[bx,bz]=points[index+1];
  const len=distances[index],t= len ? Math.min(1,remaining/len):0;
  const sign=side<0?-1:1, verge=Math.max(1.25,Math.min(6,offset));
  return Object.freeze({
    x:ax+(bx-ax)*t-sign*(bz-az)/len*verge,
    z:az+(bz-az)*t+sign*(bx-ax)/len*verge,
  });
}
export function forestTrailDistance(x,z) {
  const points=GAME1_FOREST_TRAIL_POINTS;
  let min=Infinity;
  for(let i=0;i<points.length-1;i++){
    const [ax,az]=points[i],[bx,bz]=points[i+1],dx=bx-ax,dz=bz-az;
    const u=clamp01(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz));
    min=Math.min(min,Math.hypot(x-ax-u*dx,z-az-u*dz));
  }
  return min;
}
export const GAME1_MUD_BASINS=Object.freeze((()=>{
  const random=seededRandom(0x314164),puddles=[];
  for(let i=0;i<1000&&puddles.length<28;i++){
    const x=(random()-.5)*144,z=(random()-.5)*144;
    if(Math.hypot(x,z)<13 || forestStreamDistance(x,z)<9 || forestTrailDistance(x,z)>13)continue;
    const radius=1.7+random()*1.5;
    if(puddles.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+radius+1.3))continue;
    puddles.push(Object.freeze({x,z,radius,depth:.12+random()*.16}));
  }
  return puddles;
})());
export function forestMudBasin(x,z) {
  let result=0;
  for(const p of GAME1_MUD_BASINS) {
    const d=Math.hypot(x-p.x,z-p.z)/p.radius;
    if(d<1){const w=1-d;result=Math.max(result,p.depth*w*w*(3-2*w));}
  }
  return result;
}
export function game1ForestHeight(x,z) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  // Near the live hub and saved spawn positions the ground remains level
  // enough for quest NPCs, mounts, and boss encounters to work unchanged.
  const distance=Math.hypot(x,z);
  // Rolling forest floor: broad hills, smaller root berms and shallow
  // drainage folds. Slopes remain walkable, with safe flat quest clearings.
  let grade=1.05*Math.sin(x*.030+Math.cos(z*.023)*1.6)
    +.57*Math.cos(z*.044-x*.018)+.22*Math.sin(x*.16+z*.09)
    +.12*Math.sin(z*.33+x*.27)*Math.cos(x*.22);
  grade*=smoothstep(7,20,distance);
  for(const c of GAME1_FOREST_CLEARINGS)
    grade*=smoothstep(c.r-2,c.r+2,Math.hypot(x-c.x,z-c.z));
  const river=1-smoothstep(2.5,7,forestStreamDistance(x,z));
  return grade - river*.75 - forestMudBasin(x,z);
}
export function game1ForestPatches(x,z) {
  const dryTrail=1-smoothstep(2,6,forestTrailDistance(x,z));
  const bank=1-smoothstep(3.8,9,forestStreamDistance(x,z));
  const wetBasin=clamp01(forestMudBasin(x,z)*6);
  const shade=.5+.5*Math.sin(x*.16+Math.cos(z*.11))*Math.cos(z*.19);
  return {dryTrail,bank,wetBasin,shade};
}
export function game1ForestTrees() {
  const random=seededRandom(),result=[];
  for(let z=-112;z<=112;z+=7.5)for(let x=-112;x<=112;x+=7.5){
    const px=x+(random()-.5)*5,pz=z+(random()-.5)*5;
    if(Math.hypot(px,pz)>114||Math.hypot(px,pz)<10.5)continue;
    if(forestStreamDistance(px,pz)<6.8||forestTrailDistance(px,pz)<3.2)continue;
    if(GAME1_FOREST_CLEARINGS.some(c=>Math.hypot(px-c.x,pz-c.z)<c.r+2.1))continue;
    if(random()>(Math.hypot(px,pz)<70?.72:.48))continue;
    const species=random()<.42?'pine':random()<.65?'oak':'birch';
    const near=Math.hypot(px,pz)<68;
    result.push(Object.freeze({
      x:px,z:pz,y:game1ForestHeight(px,pz),
      species,near,radius:.44+random()*.37,
      height:(near?11:10)+random()*(near?11:8),
      canopy:2.5+random()*2.1,
      seed:(random()*4294967295)>>>0,
    }));
  }
  return result;
}
export function game1ForestGrassPositions(trees=game1ForestTrees(),count=14000){
  const random=seededRandom(0x46b4a2),result=[];
  for(let tries=0;tries<count*7&&result.length<count;tries++){
    // Most blade density lives inside the playable hero radius and in the
    // middle distance. Far trees remain a silhouette without overdraw-heavy
    // foreground clumps covering the whole 240m world.
    // Beside the walking trail, short grass grows in continuous overlapping
    // banks instead of scattered, equally spaced tufts. Unchanged total
    // clump budget preserves the existing WebGL geometry/draw-call budget.
    const verge=random()<.38;
    const close=random()<.69;
    const extent=close?102:190;
    const point=verge
      ?game1ForestTrailVergePoint(random(),random()<.5?-1:1,1.35+random()*3.8)
      :{x:(random()-.5)*extent,z:(random()-.5)*extent};
    const {x,z}=point;
    if(Math.hypot(x,z)>(close?51:95)||forestStreamDistance(x,z)<4.3)continue;
    if(forestTrailDistance(x,z)<1.2)continue;
    if(trees.some(t=>Math.abs(t.x-x)<1.2&&Math.abs(t.z-z)<1.2&&Math.hypot(t.x-x,t.z-z)<t.radius+.5))continue;
    result.push(Object.freeze({x,z,y:game1ForestHeight(x,z),h:.20+random()*.56,
      angle:random()*Math.PI*2,phase:random()*6.28,color:random()}));
  }
  return result;
}
