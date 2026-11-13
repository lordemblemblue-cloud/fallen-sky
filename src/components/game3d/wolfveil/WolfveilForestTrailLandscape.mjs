// WS15 Game 3D visual-only forest trail enhancement.
// Original biome study: Hoh Rain Forest (mossy soft shoulders), Epping Forest
// (intersecting woodland walks), Saugatuck Dunes (undulating transition).
// These are ART DIRECTION references, not copied Google Maps geometries.
// Positions are Wolfveil-local; Game 3D's existing parent applies +70m Z once.
import {WOLFVEIL_ROUTES} from './WolfveilLayout.js';

const clamp01=n=>Math.max(0,Math.min(1,n));
const smooth=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
const finite=Number.isFinite;
const FOREST_ROUTE_IDS=new Set(['west_woodland_fork','training_forest']);
const forestRoutes=WOLFVEIL_ROUTES.filter(r=>FOREST_ROUTE_IDS.has(r.id));
// Read-only safety reservations: never shade/scatter into a separately owned
// tile. SW workstream exclusions are supplied by the caller as reservedAt.
const protectedSquares=Object.freeze([
  {id:'X40-Z123',minX:-350,maxX:-345,minZ:65,maxZ:70},
  {id:'X49-Z113',minX:-305,maxX:-300,minZ:15,maxZ:20},
  {id:'X64-Z130',minX:-230,maxX:-225,minZ:100,maxZ:105},
  {id:'X46-Z116',minX:-320,maxX:-315,minZ:30,maxZ:35},
  {id:'T07-05',minX:-210,maxX:-200,minZ:110,maxZ:120},
]);
export const WOLFVEIL_FOREST_TRAIL_STUDY=Object.freeze({
  id:'ws15-geo-forest-trails-v1',
  routes:Object.freeze([...FOREST_ROUTE_IDS]),
  references:Object.freeze([
    'Hoh Rain Forest, Olympic National Park: soft moss/fern woodland edges',
    'Epping Forest, London: branching waymarked walks and irregular verges',
    'Saugatuck Dunes State Park: subtle rolling, sandy woodland transition',
  ]),
  coordinates:'Wolfveil-local metres, render Z offset +70 applied by parent',
  decorativeOnly:true,terrainHeightsChanged:false,collidersAdded:0,
});
export function forestTrailIsProtected(x,z,radius=0,reservedAt=()=>false){
  if(!finite(x)||!finite(z)||!finite(radius)||radius<0)return true;
  if(protectedSquares.some(q=>x>=q.minX-radius&&x<=q.maxX+radius&&
    z>=q.minZ-radius&&z<=q.maxZ+radius))return true;
  return Boolean(reservedAt(x,z,radius));
}
function segmentDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
  const t=clamp01(((x-a[0])*dx+(z-a[1])*dz)/(length2||1));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
// Distance is measured from the EXISTING route edge, not its centerline;
// this pass never narrows or moves the playable path.
export function forestTrailDistanceFromEdge(x,z){
  if(!finite(x)||!finite(z))return Infinity;
  let best=Infinity;
  for(const r of forestRoutes){
    for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1],b=r.points[i];
      const d=segmentDistance(x,z,a,b)-r.width*.5;
      if(d<best)best=d;
    }
  }
  return best;
}
export function forestTrailShoulderWeight(x,z){
  const d=forestTrailDistanceFromEdge(x,z);
  if(!finite(d))return 0;
  return smooth(.85,3.7,d)*(1-smooth(12.5,20,d));
}
const grain=(x,z)=>.55*Math.sin(x*.083+z*.047)+
  .27*Math.sin(z*.19-x*.11)+.18*Math.cos(x*.37+z*.33);
// Pigment ONLY the existing physical terrain's vertex colors. No overlay mesh,
// route geometry edits, UV or collider/BVH changes. Disabled in Game 1.
export function applyWolfveilForestTrailPigment(geometry,{
  enabled=false,riverDistance=()=>Infinity,reservedAt=()=>false,
}={}){
  if(!enabled)return {applied:false,vertices:0,collidersAdded:0};
  if(typeof riverDistance!=='function'||typeof reservedAt!=='function')
    throw new TypeError('Forest pigment requires callable water/owner exclusions');
  const pos=geometry?.getAttribute?.('position');
  const col=geometry?.getAttribute?.('color');
  if(!pos||!col||pos.count!==col.count)
    throw new TypeError('Forest pigment needs the original indexed color terrain');
  let vertices=0;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);
    const weight=forestTrailShoulderWeight(x,z);
    if(weight<.005||forestTrailIsProtected(x,z,5,reservedAt)||
      riverDistance(x,z)<20)continue;
    const base=[col.getX(i),col.getY(i),col.getZ(i)];
    if(!base.every(finite))continue;
    const noise=grain(x,z);
    const mossMix=smooth(-.18,.56,noise);
    const loam=[.38,.35,.29],moss=[.255,.377,.265];
    const target=loam.map((c,k)=>c*(1-mossMix)+moss[k]*mossMix);
    const strength=weight*(.27+.18*smooth(-.8,.8,noise));
    col.setXYZ(i,...base.map((c,k)=>c*(1-strength)+target[k]*strength));
    vertices++;
  }
  if(vertices)col.needsUpdate=true;
  return {applied:vertices>0,vertices,collidersAdded:0,
    terrainHeightsChanged:false,routeGeometryChanged:false};
}
// Make the existing forest-route grass low, varied and edge-clustered. This
// adjusts only cosmetic instance dimensions/tints, never their anchors.
export function refineWolfveilForestTrailPlanting(flow,{
  reservedAt=()=>false,
}={}){
  if(!flow||!Array.isArray(flow.grass)||typeof reservedAt!=='function')
    throw new TypeError('Forest planting requires a route flow plan');
  let styled=0;
  flow.grass=flow.grass.map(p=>{
    if(!FOREST_ROUTE_IDS.has(p.route)||forestTrailIsProtected(p.x,p.z,2,reservedAt))
      return p;
    const weight=forestTrailShoulderWeight(p.x,p.z);
    if(weight<.06)return p;
    const noise=grain(p.x,p.z);
    styled++;
    return {...p,height:Math.min(p.height,.34+.15*smooth(-.8,.8,noise)),
      width:Math.min(p.width,.58+.19*smooth(-.7,.7,-noise)),
      shade:Math.floor(smooth(-1,1,noise)*4.999),
      forestReferenceStyle:true};
  });
  return {styled,collidersAdded:0,positionsChanged:false};
}
// Small embedded mineral accents at staggered trail shoulders. Keep the route
// corridor open; reject steep bases, rivers, owned squares and actual FBX roots.
export function planWolfveilForestTrailAccents({
  heightAt,clearOf=()=>true,riverDistance=()=>Infinity,
  trees=[],reservedAt=()=>false,maxStones=90,
}={}){
  if(typeof heightAt!=='function'||typeof clearOf!=='function'||
    typeof riverDistance!=='function'||typeof reservedAt!=='function'||
    !Array.isArray(trees)||!Number.isInteger(maxStones)||maxStones<0||maxStones>200)
    throw new TypeError('Forest accents require finite terrain and safety services');
  const stones=[];
  for(const route of forestRoutes){
    for(let segment=1;segment<route.points.length;segment++){
      const a=route.points[segment-1],b=route.points[segment];
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<=0)continue;
      for(let along=3.1;along<length-3.1;along+=3.65){
        if(stones.length>=maxStones)return stones;
        const t=along/length,side=Math.sin(along*.27+segment*2.3)>0?1:-1;
        const jitter=.5+.5*Math.sin(along*.43+segment*4.1);
        if(jitter<.33)continue; // natural gaps, not a continuous stone fence
        const reach=route.width*.5+2.0+2.2*jitter;
        const x=a[0]+dx*t+side*(-dz/length)*reach;
        const z=a[1]+dz*t+side*(dx/length)*reach;
        const size=.16+.15*jitter;
        if(forestTrailIsProtected(x,z,2.0,reservedAt)||!clearOf({x,z},.7)||
          riverDistance(x,z)<20||trees.some(tree=>
            finite(tree?.x)&&finite(tree?.z)&&
            Math.hypot(tree.x-x,tree.z-z)<(tree.kind==='ancient'?3.7:2.5)))
          continue;
        const y=heightAt(x,z),r=size*.85;
        const heights=[y,heightAt(x-r,z),heightAt(x+r,z),
          heightAt(x,z-r),heightAt(x,z+r)];
        if(!heights.every(finite)||Math.max(...heights)-Math.min(...heights)>.29)
          continue;
        stones.push({x,y:y+size*.08,z,size,yaw:along*.37+segment*.8,
          shade:(segment+Math.floor(along/11))%5,forestReferenceStyle:true});
      }
    }
  }
  return stones;
}
