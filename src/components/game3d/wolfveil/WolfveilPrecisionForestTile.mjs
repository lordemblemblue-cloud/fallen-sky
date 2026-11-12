// Game 3D-only, one-square forest-detail plan for the LIVE Wolfveil world.
// The precision blueprint uses world coordinates, while Wolfveil's authored
// ground and decorations use local Z (world Z minus the existing +70m offset).
// All props are visual-only and reuse the existing terrain and grass/stone rigs.
import {tileByRowColumn} from '../terrain/precisionTerrainBlueprint.mjs';

const row=6,col=4,renderOffsetZ=70;
const tile=tileByRowColumn(row,col); // world T07-05: X[-210,-200], Z[180,190]
export const WOLFVEIL_FOREST_DETAIL_TILE=Object.freeze({
  id:tile.id,
  row:tile.row,
  column:tile.col,
  renderOffsetZ,
  minX:tile.minXMm/1000,
  maxX:tile.maxXMm/1000,
  minZ:tile.minZMm/1000-renderOffsetZ,
  maxZ:tile.maxZMm/1000-renderOffsetZ,
  worldMinZ:tile.minZMm/1000,
  worldMaxZ:tile.maxZMm/1000,
});
// Square-scoped material accents that harmonize with the cyan ancient-tree
// canopy and the adjacent green Wolfveil ground. No brown or gold grass.
export const WOLFVEIL_FOREST_DETAIL_STYLE=Object.freeze({
  id:'sumie-luminous-understory-v1',
  grassColors:Object.freeze([
    0x4a7350,0x5b8561,0x6d966c,0x456b58,0x638e71,
  ]),
  stoneColors:Object.freeze([
    0x66777c,0x7c898a,0x596c74,0x718286,0x5f777b,
  ]),
  bladesPerClump:7,
  materialMood:'matte watercolor greens; cool mossy slate',
  windBehavior:'root-stable, softly animated leaf tips',
});
const rngFromSeed=(seed)=>{
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=Math.imul(state^(state>>>15),state|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
};
const finite=Number.isFinite;
/**
 * Apply subtle matte meadow-green pigment to EXISTING terrain vertex colors.
 * No overlay mesh, new collider, custom shader, terrain height or index change.
 * This is intentionally disabled for Game 1 and all other tiles.
 * Existing stylized stone/grass/ancient-tree PBR assets are untouched.
 */
export function applyWolfveilPrecisionForestGroundPigment(geometry,{
  enabled=false,paintableAt=()=>true,routeDistance=()=>Infinity,
  riverDistance=()=>Infinity,
}={}){
  if(enabled&&[paintableAt,routeDistance,riverDistance].some(f=>typeof f!=='function'))
    throw new TypeError('T07-05 ground pigment requires valid route/river clearances');
  if(!enabled)return {applied:false,vertices:0};
  const position=geometry?.getAttribute?.('position');
  const colors=geometry?.getAttribute?.('color');
  if(!position||!colors||position.count!==colors.count)
    throw new TypeError('T07-05 requires actual existing vertex-color terrain');
  const bounds=WOLFVEIL_FOREST_DETAIL_TILE;
  const fadeBeyond=(distance,start,full)=>{
    if(distance===Infinity)return 1; // no nearby route or water
    if(!finite(distance))return 0;   // unknown land use is unsafe
    const t=Math.max(0,Math.min(1,(distance-start)/(full-start)));
    return t*t*(3-2*t);
  };
  let vertices=0;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i);
    const edge=Math.min(x-bounds.minX,bounds.maxX-x,
      z-bounds.minZ,bounds.maxZ-z);
    if(!(edge>0)||!paintableAt(x,z))continue;
    // No green road/river paint. Soft falloffs preserve the authored
    // road shoulders and liquid-glass water banks without a square seam.
    const routeFade=fadeBeyond(routeDistance(x,z),.3,4);
    const riverFade=fadeBeyond(riverDistance(x,z),18,26);
    if(routeFade===0||riverFade===0)continue;
    // Flat-topped, 1.8m feather so no hard grass-green tile rectangle.
    const t=Math.max(0,Math.min(1,edge/1.8)),fade=t*t*(3-2*t);
    const wash=Math.sin(x*.63+z*.34)*.5+
      Math.sin(z*.37-x*.21)*.5;
    const weight=fade*routeFade*riverFade*(.55+.09*wash);
    const green=[.265+.018*wash,.407+.022*wash,.293+.012*wash];
    const base=[colors.getX(i),colors.getY(i),colors.getZ(i)];
    if(!base.every(Number.isFinite))continue;
    colors.setXYZ(i,
      base[0]*(1-weight)+green[0]*weight,
      base[1]*(1-weight)+green[1]*weight,
      base[2]*(1-weight)+green[2]*weight);
    vertices++;
  }
  if(vertices)colors.needsUpdate=true;
  return {applied:vertices>0,vertices};
}

// Existing ancient-tree FBX roots span farther than the authoritative trunk
// collider. Reserve extra visual room without moving any shared tree anchor.
const treeClear=(x,z,trees,radius)=>!trees.some(t=>{
  if(!finite(t?.x)||!finite(t?.z))return false;
  const rootMargin=t.kind==='ancient'?2.4:t.kind==='maple'?.65:.35;
  return Math.hypot(x-t.x,z-t.z)<radius+rootMargin;
});
const riverClear=(distance)=>distance===Infinity||(finite(distance)&&distance>=19);

/**
 * A fixed and reproducible 10m forest understory tile, not a global scatter.
 * The authored tree/collider map is deliberately left unchanged. All geometry
 * stays within T07-05 after the existing +70m render transform; callers supply
 * the SAME terrain surface sampler used to place their existing grass.
 */
export function planWolfveilPrecisionForestTile({
  heightAt,clearOf=()=>true,distanceToRiver=()=>Infinity,trees=[],
  grassHeading=()=>0,seed=0x720705,
}={}){
  if(typeof heightAt!=='function'||typeof clearOf!=='function'||
     typeof distanceToRiver!=='function'||typeof grassHeading!=='function'||
     !Array.isArray(trees))throw new TypeError('Forest tile requires valid scene samplers');
  const bounds=WOLFVEIL_FOREST_DETAIL_TILE,rng=rngFromSeed(seed);
  const grass=[],stones=[];
  const minX=bounds.minX+.7,maxX=bounds.maxX-.7;
  const minZ=bounds.minZ+.7,maxZ=bounds.maxZ-.7;
  // Organic meadow-like pockets, avoiding square rows and hard lawn stripes.
  const pockets=[
    {x:-207.2,z:113.5,rx:2.5,rz:2.3},
    {x:-202.8,z:116.0,rx:2.4,rz:2.8},
    {x:-206.0,z:118.0,rx:2.5,rz:1.8},
  ];
  for(let i=0;i<2600&&grass.length<360;i++){
    const x=minX+rng()*(maxX-minX),z=minZ+rng()*(maxZ-minZ);
    const pocketStrength=Math.max(...pockets.map(p=>
      Math.exp(-.5*(((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2))));
    // Gradual occupancy falloff prevents a square density seam between tiles.
    // Never spill decorative grass outside the claimed T07-05 square.
    const edgeDistance=Math.min(x-bounds.minX,bounds.maxX-x,
      z-bounds.minZ,bounds.maxZ-z);
    const edgeBlend=Math.max(0,Math.min(1,(edgeDistance-.45)/.85));
    if(rng()>(.13+.80*pocketStrength)*edgeBlend||!clearOf({x,z},.33)||
       !riverClear(distanceToRiver(x,z))||!treeClear(x,z,trees,1.1))continue;
    const y=heightAt(x,z),heading=grassHeading(x,z);
    const foot=.22;
    const neighbors=[heightAt(x-foot,z),heightAt(x+foot,z),
      heightAt(x,z-foot),heightAt(x,z+foot)];
    // Center-only grounding can make blades float or intersect clifflets.
    if(!finite(y)||!finite(heading)||!neighbors.every(finite)||
       Math.max(y,...neighbors)-Math.min(y,...neighbors)>.38)continue;
    grass.push({x,y,z,yaw:heading+(rng()-.5)*.34,
      width:.46+rng()*.34,height:.17+rng()*.11,
      shade:Math.floor(rng()*5)});
  }
  // Discrete grounded stones in two asymmetrical groups, not a stone fence.
  const stonesAt=[
    [-208.0,112.6,.34],[-207.25,112.95,.22],[-208.45,113.45,.19],
    [-202.05,117.0,.31],[-202.9,117.6,.21],[-201.75,118.0,.18],
    [-205.0,114.7,.23],
  ];
  for(const [x,z,size] of stonesAt){
    if(x-size*1.2<=bounds.minX||x+size*1.2>=bounds.maxX||
       z-size*1.2<=bounds.minZ||z+size*1.2>=bounds.maxZ||
       !clearOf({x,z},.65)||!riverClear(distanceToRiver(x,z))||
       !treeClear(x,z,trees,size+1.1))continue;
    const y=heightAt(x,z);
    const sides=[heightAt(x-size,z),heightAt(x+size,z),
      heightAt(x,z-size),heightAt(x,z+size)];
    if(!finite(y)||!sides.every(finite)||
       Math.max(...sides,y)-Math.min(...sides,y)>.52)continue;
    stones.push({x,y:y+size*.13,z,yaw:rng()*Math.PI*2,size,
      shade:Math.floor(rng()*5)});
  }
  // Keep the authored rocks readable rather than burying them in grass.
  const clearGrass=grass.filter(p=>stones.every(s=>
    Math.hypot(p.x-s.x,p.z-s.z)>s.size*1.2+.16));
  return {id:bounds.id,grass:clearGrass,stones,styleId:WOLFVEIL_FOREST_DETAIL_STYLE.id,
    visualOnly:true,collisionChanged:false,terrainChanged:false};
}
