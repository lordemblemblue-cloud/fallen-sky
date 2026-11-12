// Player-requested WESTERN hillside landscaping for LIVE Game 3D Wolfveil.
// Unshifted coordinates; GameWorld3D offsets the entire world +70m on Z.
// The same deterministic grade feeds rendered triangles, terrain BVH,
// planting elevations and the server's imported wolfveilHeight function.
export const WOLFVEIL_WEST_HILLSIDE=Object.freeze({
  minX:-550,maxX:-55,minZ:-220,maxZ:325,
  forestAnchorMinX:-430,forestAnchorMaxX:-160,
  forestAnchorMinZ:-115,forestAnchorMaxZ:205,
  targetReduction:0.64,
  grassHeightFactor:0.5,
});
const clamp=(n)=>Math.max(0,Math.min(1,n));
const smooth=(a,b,value)=>{
  const t=clamp((value-a)/(b-a));
  return t*t*(3-2*t);
};

// Broad feathered mask, not a square-cut flattening stamp.
// Protect the northern scenic ridge, the Luna house and village approaches.
export function wolfveilWestHillsideMask(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  return smooth(-640,-500,x)*(1-smooth(-170,-55,x))*
    smooth(-220,-115,z)*(1-smooth(205,325,z));
}

export function isWolfveilWestHillsideForest(x,z){
  return wolfveilWestHillsideMask(x,z)>.70;
}

export function gradeWolfveilWestHillside(x,z,height,sideHillHeight){
  if(![x,z,height,sideHillHeight].every(Number.isFinite))return height;
  const mask=wolfveilWestHillsideMask(x,z);
  if(mask<=0)return height;
  // Reduce the former steep lateral uplift while retaining the entire
  // large-scale north rise, measured landform and soft rolling relief.
  const lowered=sideHillHeight*WOLFVEIL_WEST_HILLSIDE.targetReduction;
  const roll=1.8*Math.sin(x*.016+z*.013)*Math.cos(z*.021-x*.006)+
    .65*Math.sin(x*.045-z*.038);
  return height+mask*(roll-lowered);
}

// Used only by the original groundcover geometry (not player collision).
export function wolfveilWestGrassHeightScale(x,z){
  return 1-.5*wolfveilWestHillsideMask(x,z);
}
