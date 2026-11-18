// Targeted restoration pass for ONE existing Stronghold upper-gallery panel
// and ONE adjacent square floor tile from the owner's October 27 screenshot.
// Render decoration only: do not add solids, navigation geometry or interaction.
export const STRONGHOLD_METAL_SAMPLE=Object.freeze({
  mapId:'sumi_stronghold',
  area:'upper_gallery_entry',
  // First fully enclosed gallery section immediately beyond medical mezzanine.
  // East/RIGHT wall faces into the walkable x=15..21 corridor.
  wall:Object.freeze({x0:20.60,x1:20.77,y0:5.10,y1:7.55,z0:61.40,z1:63.82}),
  floor:Object.freeze({x0:18.32,x1:20.47,y0:4.271,y1:4.291,z0:61.49,z1:63.64}),
  marker:Object.freeze([20.53,6.34,61.51]),
});
const SILVER='steelGloss',SAMPLE='sumiTrialSteel',SHADOW='metalDark',GRATE='gratedSteel';
const B=(k,a,b,m)=>k.deco(a,b,m);
const W=STRONGHOLD_METAL_SAMPLE.wall,F=STRONGHOLD_METAL_SAMPLE.floor;

export function addStrongholdOnePanelOneTile(k){
  // Crucial: this function draws only one panel and one tile, not a loop
  // across every wall/plate like the initial Stronghold decoration.
  // Thick perimeter is separated from the slightly recessed inner panel.
  B(k,[20.67,5.12,61.43],[20.78,7.53,63.79],SHADOW);
  B(k,[20.625,5.26,61.58],[20.68,7.39,63.65],SAMPLE);
  B(k,[20.595,5.34,61.67],[20.625,7.31,63.56],SAMPLE);
  // Precision machined steel edge rail, real 3D relief in 8 parts.
  for(const y of [W.y0,W.y1-.11]){
    B(k,[20.55,y,W.z0],[20.78,y+.11,W.z1],SILVER);
    B(k,[20.52,y+.112,W.z0+.03],[20.57,y+.131,W.z1-.03],SHADOW);
  }
  for(const z of [W.z0,W.z1-.09]){
    B(k,[20.54,W.y0,z],[20.78,W.y1,z+.09],SILVER);
    B(k,[20.51,W.y0+.14,z+.025],[20.56,W.y1-.14,z+.06],SHADOW);
  }
  // One narrow inset ventilation grille, matching the screenshot's thin
  // repeated metal louvers instead of a painted solid rectangle.
  B(k,[20.575,5.49,61.71],[20.621,6.96,62.21],SHADOW);
  B(k,[20.550,5.45,61.68],[20.583,6.99,61.72],SILVER);
  B(k,[20.550,5.45,62.18],[20.583,6.99,62.22],SILVER);
  for(let i=0;i<24;i++){
    const y=5.51+i*.059;
    B(k,[20.541,y,61.75],[20.568,y+.017,62.17],
      i%5===0?SILVER:GRATE);
  }
  // A single stamped maintenance seam/inspection recess to the right.
  B(k,[20.558,5.52,62.38],[20.588,5.57,63.43],SHADOW);
  B(k,[20.558,7.17,62.38],[20.588,7.22,63.43],SHADOW);
  // Four countersunk dark wells and proud torx-type screw heads. Each
  // is an actual radial mesh oriented perpendicular to the EAST wall,
  // not a white painted dot on its surface.
  for(const y of [5.35,7.28])for(const z of [61.57,63.66]){
    k.pipe([20.539,y,z],[20.557,y,z],.071,SHADOW,16);
    k.pipe([20.523,y,z],[20.536,y,z],.049,SILVER,16);
    B(k,[20.509,y-.007,z-.034],[20.528,y+.007,z+.034],SHADOW);
    B(k,[20.508,y-.034,z-.007],[20.529,y+.034,z+.007],SHADOW);
  }
  // Only ONE approximately 2.15m square floor plate in front of the wall.
  // Main tile is mounted just above the original existing floor detail.
  B(k,[F.x0,F.y0,F.z0],[F.x1,F.y1,F.z1],SAMPLE);
  // Continuous dark gasket and chamfered stainless perimeter relief.
  const e=.065,w=.028;
  for(const x of [F.x0+.028,F.x1-.028]){
    B(k,[x-w,F.y1+.002,F.z0+.06],
      [x+w,F.y1+.024,F.z1-.06],SHADOW);
  }
  for(const z of [F.z0+.028,F.z1-.028]){
    B(k,[F.x0+.06,F.y1+.002,z-w],
      [F.x1-.06,F.y1+.024,z+w],SILVER);
  }
  B(k,[F.x0+.17,F.y1+.002,F.z0+.24],
    [F.x1-.17,F.y1+.012,F.z0+.275],SHADOW);
  for(const x of [F.x0+.15,F.x1-.15])
    for(const z of [F.z0+.15,F.z1-.15]){
      // A black recessed fastener well underneath a metallic cross head.
      k.pipe([x,F.y1+.012,z],[x,F.y1+.021,z],.054,SHADOW,16);
      k.pipe([x,F.y1+.023,z],[x,F.y1+.030,z],.032,SILVER,12);
      B(k,[x-.023,F.y1+.031,z-.004],
        [x+.023,F.y1+.035,z+.004],SHADOW);
    }
  // The distinctive fixture from the owner's photo is built OUT of the
  // panel, not merely drawn into its image. A projecting housing, THREE
  // independent red pilot lamps at the top, and one vertical warm lamp.
  // Its emission is rendered by existing Game 2 glow meshes; spot glints
  // on the sampled metal use the separate, panel-only light response.
  B(k,[20.365,5.80,61.405],[20.55,7.33,61.70],SHADOW);
  B(k,[20.330,5.84,61.438],[20.375,7.27,61.67],SILVER);
  B(k,[20.305,5.91,61.474],[20.331,6.75,61.632],SHADOW);
  B(k,[20.282,5.96,61.489],[20.306,6.71,61.619],'orange');
  for(let i=0;i<3;i++){
    const z=61.445+i*.091;
    B(k,[20.278,6.99,z],[20.347,7.16,z+.080],SHADOW);
    B(k,[20.259,7.030,z+.016],[20.279,7.122,z+.063],'red');
  }
  return STRONGHOLD_METAL_SAMPLE;
}
