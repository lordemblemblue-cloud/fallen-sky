/** Game 3D-only, source-only forest-floor recipe for ONE canonical Play-editor square.
 *  Plans authored Wolfveil coordinates; scene applies existing +70m world-Z ONCE.
 *  Pure decoration; does not create trees, change terrain heights or colliders.
 */
export const WOLFVEIL_SQUARE_X46_Z116 = Object.freeze({
  id:'X46-Z116', editorCellSizeM:5,
  minX:-320,maxX:-315,minZ:30,maxZ:35,
  worldMinZ:100,worldMaxZ:105,renderOffsetZ:70,
});
export const WOLFVEIL_X46_Z116_STYLE = Object.freeze({
  id:'wolfveil-living-sumie-west-forest-v1',
  grassMaterial:'Wolfveil_LivingSumiE_Grass_X46Z116',
  stoneMaterial:'Wolfveil_LivingSumiE_MossStone_X46Z116',
  grassColors:Object.freeze([0x4a7350,0x5a845f,0x648d6d,0x436c57,0x709476]),
  stoneColors:Object.freeze([0x64767b,0x728387,0x536970,0x79888a]),
  bladesPerClump:9,
  bladeShape:'individually tapered upright volumetric blades; never crossed cards',
  treeContract:'existing authoritative anchors and original bark/UVs; blue-cyan pigment within material, no detached glow',
  grassHeightM:Object.freeze([0.09,0.18]),
  grassClumpWidthM:Object.freeze([0.11,0.19]),
  newTreesAllowed:false, newCollidersAllowed:false, ambientVFXAllowed:false,
});
const finite=Number.isFinite;
const TAU=2*Math.PI;
function random(seed){let s=seed>>>0;return ()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function validRiverDistance(d){return d===Infinity||(finite(d)&&d>=18);}
function treeClear(x,z,trees,extra){
  return trees.every(t=>{
    if(!finite(t?.x)||!finite(t?.z))return false;
    return Math.hypot(x-t.x,z-t.z)>=(t.kind==='ancient'?2.4:1.6)+extra;
  });
}
function probeGround(x,z,heightAt,maxGrade){
  const h=heightAt(x,z),delta=.17;
  if(!finite(h))return null;
  const neighbors=[heightAt(x-delta,z),heightAt(x+delta,z),heightAt(x,z-delta),heightAt(x,z+delta)];
  if(!neighbors.every(finite)||neighbors.some(n=>Math.abs(n-h)>maxGrade*delta))return null;
  return h;
}
/**
 * All geometry uses *authored* Z [30,35); world Z [100,105) after the original
 * scene transform. Real scene callbacks are REQUIRED: no guessed ground at Y=0.
 * Clearances fail closed; Infinity river clearance is valid far from water.
 */
export function planWolfveilSquareX46Z116({heightAt,clearOf,distanceToRiver,trees,seed=0x4611607}={}){
  if(typeof heightAt!=='function'||typeof clearOf!=='function'||
    typeof distanceToRiver!=='function'||!Array.isArray(trees)||trees.length===0)
    throw new TypeError('X46-Z116 needs real ground, route/structure, river, and tree-anchor inputs');
  const b=WOLFVEIL_SQUARE_X46_Z116,rng=random(seed),grass=[],stones=[];
  // Keep a conservative route/tree clearance separate from the true 3D blade
  // footprint. Keep at least .158m at the boundary so high-gust plus TWO
  // player-contact traces remain in this one 5m square without bare .21m rims.
  const safe=(x,z,r,border=r)=>{
    if(x-border<=b.minX||x+border>=b.maxX||z-border<=b.minZ||z+border>=b.maxZ||
       !treeClear(x,z,trees,r))return false;
    try {return clearOf({x,z},r)===true&&validRiverDistance(distanceToRiver(x,z));}
    catch{return false;}
  };
  // Dense short front-yard lawn: 45 cells per axis produce 4x the previous
  // tuft count, yet retain exactly one grass draw batch and a fixed 1800-tuft
  // / 145,800-triangle ceiling. No crossed quads, dirt decals or new trees.
  // Blade tips and wind remain inside the exclusive 5m square border.
  const steps=45,cell=(b.maxX-b.minX)/steps;
  for(let row=0;row<steps;row++)for(let col=0;col<steps;col++){
    const x=b.minX+(col+.5+(rng()-.5)*.55)*cell;
    const z=b.minZ+(row+.5+(rng()-.5)*.55)*cell;
    if(grass.length>=1800||rng()<.07||!safe(x,z,.21,.158))continue;
    let y;
    try {y=probeGround(x,z,heightAt,.55);}catch{continue;}
    if(y===null)continue;
    grass.push({x,y,z,yaw:rng()*TAU,
      height:.09+rng()*.09,width:.11+rng()*.08,
      shade:Math.floor(rng()*WOLFVEIL_X46_Z116_STYLE.grassColors.length)});
  }
  // Only a few low, partially embedded rock accents; no canyon-sized blocks.
  for(const [x,z,size] of [[-318.6,31.2,.16],[-318.17,31.55,.11],[-316.2,33.7,.19]]){
    if(!safe(x,z,size+.11))continue;
    let y;
    try {y=probeGround(x,z,heightAt,.39);}catch{continue;}
    if(y===null)continue;
    stones.push({x,y:y+size*.08,z,size,yaw:rng()*TAU,
      shade:Math.floor(rng()*WOLFVEIL_X46_Z116_STYLE.stoneColors.length)});
  }
  return {
    id:b.id,renderOffsetZ:b.renderOffsetZ,
    grass,stones,styleId:WOLFVEIL_X46_Z116_STYLE.id,
    trees:[],visualOnly:true,terrainChanged:false,collisionChanged:false,
    mountedInPlay:false,
  };
}
