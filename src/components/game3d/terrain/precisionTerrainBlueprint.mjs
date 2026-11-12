/**
 * Game 3D precision terrain authoring — editor/blueprint data only.
 * Shares Luna's X/Z ground, Y-up and metre scene-unit convention, not its
 * landscaping objects. Persistent records use signed INTEGER MILLIMETRES.
 * No generated value in this file is a measured Wolfveil ground elevation.
 */
export const PRECISION_TERRAIN = Object.freeze({
  id:'game3d-authoring-500m-v1',
  revision:1,
  widthMm:500000,
  depthMm:500000,
  tileMm:10000,
  columns:50,
  rows:50,
  minXMm:-250000,
  maxXMm:250000,
  minZMm:-250000,
  maxZMm:250000,
  axis:'X=east/west; Z=north/south; Y=height',
  worldUnits:'1 Three.js unit = 1 metre; 1 metre = 1000 millimetres',
  referenceImage:'not yet supplied',
  terrainElevationSource:'UNSAMPLED — preserve existing Game 3D collision',
});

export const isIntegerMm = value => Number.isSafeInteger(value);
const finite = value => Number.isFinite(value);
export const toSceneMeters = mm => {
  if(!isIntegerMm(mm)) throw new TypeError('Expected safe integer millimetres');
  return mm / 1000;
};
export const toMillimetres = metres => {
  if(!finite(metres)) throw new TypeError('Expected finite metres');
  const result=Math.round(metres*1000);
  if(!isIntegerMm(result)) throw new RangeError('Coordinates exceed safe millimetres');
  return result;
};
export function tileByRowColumn(row,col,grid=PRECISION_TERRAIN){
  if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=grid.rows||col<0||col>=grid.columns)
    throw new RangeError('Tile outside blueprint');
  const minXMm=grid.minXMm+col*grid.tileMm;
  const maxZMm=grid.maxZMm-row*grid.tileMm;
  return {
    id:'T'+String(row+1).padStart(2,'0')+'-'+String(col+1).padStart(2,'0'),
    row,col,
    minXMm,maxXMm:minXMm+grid.tileMm,
    minZMm:maxZMm-grid.tileMm,maxZMm,
    centerXMm:minXMm+grid.tileMm/2,
    centerZMm:maxZMm-grid.tileMm/2,
    elevationYMm:null, // NOT zero until ground is measured or authored
    elevationStatus:'unsampled',
  };
}
export function tileAtWorldMm(xMm,zMm,grid=PRECISION_TERRAIN){
  if(!isIntegerMm(xMm)||!isIntegerMm(zMm))throw new TypeError('World coordinates must be integer millimetres');
  if(xMm<grid.minXMm||xMm>grid.maxXMm||zMm<grid.minZMm||zMm>grid.maxZMm)return null;
  const col=Math.min(grid.columns-1,Math.floor((xMm-grid.minXMm)/grid.tileMm));
  const row=Math.min(grid.rows-1,Math.floor((grid.maxZMm-zMm)/grid.tileMm));
  return tileByRowColumn(row,col,grid);
}
export function allBlueprintTiles(grid=PRECISION_TERRAIN){
  const result=[];
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.columns;col++)
    result.push(tileByRowColumn(row,col,grid));
  return result;
}
/**
 * Align reference pixels to tile/world coordinates. Image top = world +Z.
 * 'contain' preserves image proportions and rejects pixels outside the image.
 * 'stretch' deliberately fills the terrain even for a nonsquare reference.
 * Source pixel coordinates denote points, not image sample indices.
 */
export function imagePixelToWorldMm(px,py,widthPx,heightPx,{fit='contain',grid=PRECISION_TERRAIN}={}){
  if(![px,py,widthPx,heightPx].every(finite)||widthPx<=0||heightPx<=0||px<0||py<0||px>widthPx||py>heightPx)
    throw new RangeError('Invalid reference-image pixel coordinates');
  if(fit!=='contain'&&fit!=='stretch')throw new RangeError('Unknown image-fit mode');
  const scale=fit==='contain'?Math.min(grid.widthMm/widthPx,grid.depthMm/heightPx):null;
  const usedW=fit==='contain'?widthPx*scale:grid.widthMm;
  const usedD=fit==='contain'?heightPx*scale:grid.depthMm;
  const left=(grid.widthMm-usedW)/2,top=(grid.depthMm-usedD)/2;
  const u=(left+px*usedW/widthPx)/grid.widthMm;
  const v=(top+py*usedD/heightPx)/grid.depthMm;
  const xMm=Math.round(grid.minXMm+u*grid.widthMm);
  const zMm=Math.round(grid.maxZMm-v*grid.depthMm);
  return {xMm,zMm,tileId:tileAtWorldMm(xMm,zMm,grid).id,u,v,fit};
}
/** Bounding-box tile ownership of a prop, including multi-tile buildings and rocks. */
export function footprintTiles({xMm,zMm,widthMm,depthMm},grid=PRECISION_TERRAIN){
  if(![xMm,zMm,widthMm,depthMm].every(isIntegerMm)||widthMm<=0||depthMm<=0)
    throw new TypeError('Footprint position/dimensions must be positive integer millimetres');
  const minX=xMm-widthMm/2,maxX=xMm+widthMm/2,minZ=zMm-depthMm/2,maxZ=zMm+depthMm/2;
  if(minX<grid.minXMm||maxX>grid.maxXMm||minZ<grid.minZMm||maxZ>grid.maxZMm)
    throw new RangeError('Footprint extends outside blueprint');
  const c0=Math.max(0,Math.floor((minX-grid.minXMm)/grid.tileMm));
  const c1=Math.min(grid.columns-1,Math.floor((maxX-grid.minXMm-1e-6)/grid.tileMm));
  const r0=Math.max(0,Math.floor((grid.maxZMm-maxZ)/grid.tileMm));
  const r1=Math.min(grid.rows-1,Math.floor((grid.maxZMm-minZ-1e-6)/grid.tileMm));
  const ids=[];
  for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++)
    ids.push(tileByRowColumn(row,col,grid).id);
  return ids;
}
/**
 * Local curved 3D profile: cross-sections in ascending Y.
 * Each ring has heightMm, centerXMm/centerZMm and 2 radii in mm.
 * Model-level position gives the global origin; yaw is in degrees.
 * A runtime mesh can loft these rings without making up unseen geometry.
 */
export function validateProfile(profile){
  if(!Array.isArray(profile)||profile.length<2)throw new Error('A profile needs at least two sections');
  let last=-Infinity;
  for(const ring of profile){
    for(const k of ['heightMm','centerXMm','centerZMm','radiusXMm','radiusZMm'])
      if(!isIntegerMm(ring[k]))throw new TypeError('Profile '+k+' must be an integer in millimetres');
    if(ring.heightMm<=last||ring.radiusXMm<0||ring.radiusZMm<0)
      throw new RangeError('Profile heights must increase; radii cannot be negative');
    last=ring.heightMm;
  }
  return true;
}
export function profileAtHeight(profile,heightMm){
  validateProfile(profile);
  if(!isIntegerMm(heightMm))throw new TypeError('Height must be integer millimetres');
  if(heightMm<profile[0].heightMm||heightMm>profile.at(-1).heightMm)return null;
  for(let i=0;i<profile.length-1;i++){
    const a=profile[i],b=profile[i+1];
    if(heightMm<a.heightMm||heightMm>b.heightMm)continue;
    const t=(heightMm-a.heightMm)/(b.heightMm-a.heightMm),out={heightMm};
    for(const key of ['centerXMm','centerZMm','radiusXMm','radiusZMm'])
      out[key]=Math.round(a[key]+(b[key]-a[key])*t);
    return out;
  }
  return profile.at(-1);
}
export const EXAMPLE_PROPS=Object.freeze([
  {
    id:'EXAMPLE-TREE-01',status:'illustration_only',kind:'tree',
    modelId:'future_tree_asset',xMm:-45450,yMm:0,zMm:63225,
    widthMm:3200,depthMm:3000,heightMm:7000,yawDeg:17,
    source:'Example dimensions — not a measured Wolfveil asset',
    profile:[
      {heightMm:0,centerXMm:0,centerZMm:0,radiusXMm:160,radiusZMm:145},
      {heightMm:500,centerXMm:15,centerZMm:0,radiusXMm:154,radiusZMm:139},
      {heightMm:1500,centerXMm:45,centerZMm:22,radiusXMm:132,radiusZMm:125},
      {heightMm:3000,centerXMm:115,centerZMm:62,radiusXMm:109,radiusZMm:101},
      {heightMm:5000,centerXMm:260,centerZMm:155,radiusXMm:72,radiusZMm:67},
      {heightMm:7000,centerXMm:410,centerZMm:210,radiusXMm:12,radiusZMm:10},
    ],
  },
  {
    id:'EXAMPLE-ROCK-01',status:'illustration_only',kind:'rock',
    modelId:'future_rock_asset',xMm:74350,yMm:0,zMm:-30500,
    widthMm:3400,depthMm:2600,heightMm:2200,yawDeg:-11,
    source:'Example dimensions — not a measured Wolfveil rock',
    profile:[
      {heightMm:0,centerXMm:0,centerZMm:0,radiusXMm:1500,radiusZMm:1180},
      {heightMm:600,centerXMm:90,centerZMm:-90,radiusXMm:1690,radiusZMm:1290},
      {heightMm:1400,centerXMm:110,centerZMm:-150,radiusXMm:1110,radiusZMm:870},
      {heightMm:2200,centerXMm:60,centerZMm:-80,radiusXMm:70,radiusZMm:65},
    ],
  },
]);
/** Canonical CSV columns, matching the downloadable workbook tile sheet. */
export const TILE_CSV_COLUMNS=Object.freeze(['tile_id','row','column','min_x_mm','max_x_mm','min_z_mm','max_z_mm','center_x_mm','center_z_mm','elevation_y_mm','surface_material','reference_image_id','zone_id','prop_ids','authoring_status']);
export function exportTileCsv(grid=PRECISION_TERRAIN){
  const lines=[TILE_CSV_COLUMNS.join(',')];
  for(const tile of allBlueprintTiles(grid)){
    lines.push([
      tile.id,tile.row+1,tile.col+1,tile.minXMm,tile.maxXMm,
      tile.minZMm,tile.maxZMm,tile.centerXMm,tile.centerZMm,
      '','','','','','unsampled'
    ].join(','));
  }
  return lines.join('\n')+'\n';
}
