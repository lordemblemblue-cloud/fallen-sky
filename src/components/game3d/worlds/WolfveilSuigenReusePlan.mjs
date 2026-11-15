// Clone Game 3D — genuine source assets extracted from the owner's
// Wolfveil_Dominion_Of_Suigen_2400m_AAA_Map.mjs, not replacement world geometry.
// The 406,324-byte GLB holds source geometry/UVs/PBR materials in local pivots.
export const WOLFVEIL_SUIGEN_REUSE_ASSET_URL=
  'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/1c09c2eb8_wolfveil_suigen_selective_assets.glb';

export const WOLFVEIL_SUIGEN_REUSE_TYPES=Object.freeze({
  CherryTree:{parts:5,footprint:15,groundOffset:0,category:'tree'},
  OakTree:{parts:5,footprint:15,groundOffset:0,category:'tree'},
  MapleTree:{parts:5,footprint:16,groundOffset:0,category:'tree'},
  Bamboo:{parts:1,footprint:12,groundOffset:0,category:'bamboo'},
  MossRock:{parts:1,footprint:5,groundOffset:-1.45,category:'rock'},
  BasaltRock:{parts:1,footprint:4,groundOffset:-1.0,category:'rock'},
});

// These are curated forest-edge candidate positions on the EXISTING Wolfveil
// world, NOT the imported Suigen map. World X,Z include the Wolfveil +70m Z
// offset. Actual placement also checks paths, river, protected tiles, town,
// existing gameplay POIs and current playable boundaries at runtime.
// No permanent edit is made to any of the tile-ownership or terrain systems.
export const WOLFVEIL_SUIGEN_REUSE_PLACEMENTS=Object.freeze([
  {id:'cherry-nw-01',type:'CherryTree',x:-464,z:287,scale:.66,yaw:.45},
  {id:'cherry-nw-02',type:'CherryTree',x:-414,z:405,scale:.73,yaw:2.15},
  {id:'cherry-east-01',type:'CherryTree',x:465,z:235,scale:.69,yaw:1.65},
  {id:'oak-west-01',type:'OakTree',x:-468,z:175,scale:.78,yaw:1.04},
  {id:'oak-west-02',type:'OakTree',x:-440,z:345,scale:.70,yaw:3.35},
  {id:'oak-east-01',type:'OakTree',x:430,z:-280,scale:.80,yaw:2.13},
  {id:'maple-west-01',type:'MapleTree',x:-452,z:-314,scale:.72,yaw:3.12},
  {id:'maple-west-02',type:'MapleTree',x:-350,z:-361,scale:.66,yaw:1.22},
  {id:'maple-east-01',type:'MapleTree',x:445,z:-365,scale:.70,yaw:4.13},
  {id:'bamboo-east-01',type:'Bamboo',x:315,z:270,scale:.72,yaw:.21},
  {id:'bamboo-east-02',type:'Bamboo',x:356,z:280,scale:.67,yaw:1.13},
  {id:'bamboo-east-03',type:'Bamboo',x:400,z:260,scale:.75,yaw:3.32},
  {id:'bamboo-east-04',type:'Bamboo',x:435,z:313,scale:.64,yaw:2.55},
  {id:'bamboo-east-05',type:'Bamboo',x:454,z:369,scale:.80,yaw:.71},
  {id:'bamboo-south-01',type:'Bamboo',x:290,z:-348,scale:.66,yaw:1.21},
  {id:'bamboo-south-02',type:'Bamboo',x:355,z:-370,scale:.71,yaw:2.12},
  {id:'moss-rock-west-01',type:'MossRock',x:-481,z:217,scale:.72,yaw:.45},
  {id:'moss-rock-west-02',type:'MossRock',x:-453,z:379,scale:.83,yaw:1.25},
  {id:'moss-rock-west-03',type:'MossRock',x:-472,z:-354,scale:.62,yaw:2.56},
  {id:'moss-rock-east-01',type:'MossRock',x:475,z:309,scale:.80,yaw:2.56},
  {id:'moss-rock-east-02',type:'MossRock',x:419,z:-365,scale:.67,yaw:3.2},
  {id:'basalt-west-01',type:'BasaltRock',x:-480,z:-404,scale:1.25,yaw:.4},
  {id:'basalt-west-02',type:'BasaltRock',x:-415,z:452,scale:1.45,yaw:1.9},
  {id:'basalt-east-01',type:'BasaltRock',x:490,z:419,scale:1.35,yaw:3.4},
  {id:'basalt-east-02',type:'BasaltRock',x:464,z:126,scale:1.15,yaw:2.2},
  {id:'basalt-east-03',type:'BasaltRock',x:468,z:-289,scale:1.15,yaw:1.1},
].map(item=>Object.freeze(item)));

export function wolfveilSuigenReuseFootprint(item){
  const type=WOLFVEIL_SUIGEN_REUSE_TYPES[item?.type];
  return type?type.footprint*Math.max(.5,Number(item?.scale)||1):Infinity;
}

export function eligibleWolfveilSuigenReusePlacement(item,{
  sampleGroundY,insideTravel,routeDistance,riverDistance,
  protectedTile,insideTown,nearGameplaySite,
}={}){
  if(!item||!WOLFVEIL_SUIGEN_REUSE_TYPES[item.type]||
     !Number.isFinite(item.x)||!Number.isFinite(item.z))return false;
  const radius=wolfveilSuigenReuseFootprint(item);
  if(!Number.isFinite(radius))return false;
  if(insideTravel&&!insideTravel(item.x,item.z,radius+2))return false;
  // Route/river functions use Wolfveil LOCAL coords, not the +70m Z offset.
  const localZ=item.z-70;
  if(routeDistance&&routeDistance(item.x,localZ)<=radius+6)return false;
  if(riverDistance&&riverDistance(item.x,localZ)<=radius+7)return false;
  if(protectedTile&&protectedTile(item.x,localZ,radius+3))return false;
  if(insideTown&&insideTown(item.x,item.z,radius+7))return false;
  if(nearGameplaySite&&nearGameplaySite(item.x,item.z,radius+15))return false;
  if(sampleGroundY&&!Number.isFinite(sampleGroundY(item.x,item.z)))return false;
  return true;
}
