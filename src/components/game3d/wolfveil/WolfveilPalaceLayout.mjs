/**
 * Game 3D Wolfveil staged town-reset layout. The existing 1100m terrain and
 * all world routes remain in place. Coordinates are local source X/Z metres;
 * the Game 3D scene adds +70m world Z exactly once.
 */
export const WOLFVEIL_PALACE=Object.freeze({
  id:'wolfveil-luna-manor-palace',
  label:'Wolfveil Mountain Palace',
  x:0,z:115,width:53,depth:33,entranceSide:'south',
  halfDoor:3.25,frontStepsStartZ:24,
  // Visible preview boundary; the old 30+ buildings are not part of this town.
  townBuildingBounds:Object.freeze({minX:-100,maxX:100,minZ:-165,maxZ:30}),
});
export const WOLFVEIL_PALACE_APPROACH=Object.freeze({
  id:'palace-hillside-stairway',
  // Stop precisely at the OUTER edge of Luna's first actual front tread:
// 115 - (22.75 + 1.04 / 2) = 91.73. Previously z=98 overlapped
// and covered the raised manor entrance with duplicate paving.
  x:0,fromZ:25,toZ:91.73,width:7.8,
  stairs:62,rocksPerSide:29,
  fencePostSpacing:3.4,
});
// The next village houses derive their styling from the SAME Luna facade,
// roof tiles, carved posts and satin-oak trim. Concepts are NOT constructed
// on the playable map until their individual cell is approved.
export const WOLFVEIL_FUTURE_HOUSE_KIT=Object.freeze([
  Object.freeze({id:'luna-cedar-cottage',style:'Luna manor timber and shoji',w:12,d:10,stories:1}),
  Object.freeze({id:'luna-courtyard-house',style:'Luna plaster, stone base and deep roof eaves',w:15,d:12,stories:1}),
  Object.freeze({id:'luna-merchant-home',style:'Luna walnut posts and double-level balcony',w:16,d:13,stories:2}),
]);
export function isInsideVillageBuildLimit(x,z){
  const b=WOLFVEIL_PALACE.townBuildingBounds;
  return Number.isFinite(x)&&Number.isFinite(z)&&x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
}
/** True when moving across a wall; the southern main entrance stays open. */
export function palaceWallCrosses(from,to,radius=.65,offsetZ=70){
  if(!from||!to||![from.x,from.z,to.x,to.z,radius].every(Number.isFinite))return true;
  const b=WOLFVEIL_PALACE,front=b.z-b.depth/2+offsetZ,back=b.z+b.depth/2+offsetZ;
  const left=b.x-b.width/2,right=b.x+b.width/2;
  const intersects=(a,c,w)=>(a-w)*(c-w)<=0&&Math.abs(a-c)>1e-8;
  const crossAt=(a,c,o,other,w)=>o+(other-o)*(w-a)/(c-a);
  for(const x of [left,right])if(intersects(from.x,to.x,x)){
    const z=crossAt(from.x,to.x,from.z,to.z,x);
    if(z>=front-radius&&z<=back+radius)return true;
  }
  if(intersects(from.z,to.z,back)){
    const x=crossAt(from.z,to.z,from.x,to.x,back);
    if(x>=left-radius&&x<=right+radius)return true;
  }
  if(intersects(from.z,to.z,front)){
    const x=crossAt(from.z,to.z,from.x,to.x,front);
    if(x>=left-radius&&x<=right+radius &&
       Math.abs(x-b.x)>Math.max(0,b.halfDoor-radius))return true;
  }
  return false;
}
