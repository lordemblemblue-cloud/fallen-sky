/**
 * Wolfveil preview-only compact village and continuous four-route layout.
 * Canonical geometry coordinates are local X/Z; +70m Z is applied by the
 * existing workstream preview scene ONCE. This is a visual planning contract,
 * not a modification of server mapCollision or the playable Game 3D layout.
 */
export const COMPACT_TOWN = Object.freeze({
  id:'wolfveil-small-town-01', centerX:0, centerZ:-70, halfExtent:100,
  minX:-100,maxX:100,minZ:-170,maxZ:30,
  housesMax:10,
  gateOrigins:{
    north:[0,30], east:[100,-70], west:[-100,-70], south:[0,-170],
  },
});
export const COMPACT_TOWN_STRUCTURES = Object.freeze([
  {id:'home-01',kind:'home',x:-54,z:-139,w:15,d:13},
  {id:'home-02',kind:'home',x:54,z:-139,w:15,d:13},
  {id:'home-03',kind:'home',x:-54,z:-108,w:15,d:13},
  {id:'home-04',kind:'home',x:54,z:-108,w:15,d:13},
  {id:'home-05',kind:'home',x:-54,z:-39,w:15,d:13},
  {id:'home-06',kind:'home',x:54,z:-39,w:15,d:13},
  {id:'home-07',kind:'home',x:-54,z:-6,w:15,d:13},
  {id:'home-08',kind:'home',x:54,z:-6,w:15,d:13},
  {id:'tea-house',kind:'tea',x:-74,z:-88,w:13,d:12},
  {id:'craft-forge',kind:'forge',x:74,z:-88,w:13,d:12},
]);
export const COMPACT_TOWN_ROUTES = Object.freeze([
  {id:'north-mountain',label:'North · Mountain',gate:'north',width:5,
    points:[[0,-70],[0,30],[4,135],[4,220],[-45,330],[2,470]]},
  {id:'east-river',label:'East · River',gate:'east',width:5,
    points:[[0,-70],[100,-70],[113,-40],[117,30],[132,166]]},
  {id:'west-meadow',label:'West · Meadow',gate:'west',width:5,
    points:[[0,-70],[-100,-70],[-210,-80],[-360,-120],[-440,-220],
      [-310,-350],[-150,-400],[-80,-350],[0,-225]]},
  {id:'south-gate',label:'South · City Gate',gate:'south',width:6,
    points:[[0,-70],[0,-170],[0,-225],[0,-430]]},
]);
export const WOLFVEIL_MEADOW = Object.freeze({
  id:'wolfveil-living-meadow-01',
  minX:-475,maxX:-145,minZ:-405,maxZ:-55,
  seed:0x51c0f22,clumps:6600,flowerClusters:860,
});
export function isInsideCompactHouseBoundary(x,z,town=COMPACT_TOWN){
  return Number.isFinite(x)&&Number.isFinite(z)&&x>=town.minX&&
    x<=town.maxX&&z>=town.minZ&&z<=town.maxZ;
}
export function routeLengthMeters(points){
  if(!Array.isArray(points)||points.length<2)return 0;
  return points.slice(1).reduce((total,point,index)=>
    total+Math.hypot(point[0]-points[index][0],point[1]-points[index][1]),0);
}
export function meadowTravelSeconds(speed=5.5){
  if(!Number.isFinite(speed)||speed<=0)return null;
  const path=COMPACT_TOWN_ROUTES.find(route=>route.id==='west-meadow');
  return routeLengthMeters(path.points.slice(1,-1))/speed;
}


/**
 * Local preview camera only. Blocks walking through the modular house walls
 * while allowing a 2.6m front doorway and 2.4m interior passage.
 * No client-derived position is ever granted server movement authority.
 */
export function resolveCompactTownPreviewCollision(next,previous,radius=.65,offsetZ=70){
  if(!next||!previous||![next.x,next.z,previous.x,previous.z,radius].every(Number.isFinite))
    return false;
  const from={x:previous.x,z:previous.z-offsetZ};
  const to={x:next.x,z:next.z-offsetZ};
  const crosses=(a,b,wall)=>(a-wall)*(b-wall)<=0&&Math.abs(a-b)>1e-8;
  const at=(a,b,otherA,otherB,wall)=>otherA+(otherB-otherA)*(wall-a)/(b-a);
  for(const building of COMPACT_TOWN_STRUCTURES){
    const left=building.x-building.w/2,right=building.x+building.w/2;
    const front=building.z-building.d/2,rear=building.z+building.d/2;
    let blocked=false;
    for(const x of [left,right]){
      if(crosses(from.x,to.x,x)){
        const z=at(from.x,to.x,from.z,to.z,x);
        if(z>=front-radius&&z<=rear+radius)blocked=true;
      }
    }
    for(const z of [rear,building.z]){
      if(crosses(from.z,to.z,z)){
        const x=at(from.z,to.z,from.x,to.x,z);
        if(x>=left-radius&&x<=right+radius){
          if(z===rear||Math.abs(x-building.x)>1.2-radius)blocked=true;
        }
      }
    }
    if(crosses(from.z,to.z,front)){
      const x=at(from.z,to.z,from.x,to.x,front);
      if(x>=left-radius&&x<=right+radius&&
        Math.abs(x-building.x)>1.3-radius)blocked=true;
    }
    if(blocked){
      next.x=previous.x;next.z=previous.z;
      return true;
    }
  }
  return false;
}
