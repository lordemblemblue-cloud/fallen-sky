// Plant card atlas layout (2026-11-18 landscaping, round 2). Pure data.
// Baked by tools/landscape-bake/bake_plants.py, which also writes
// public/game3d/landscape/wv_plants.json; a test keeps this table equal to it.
// Cell index = row * 4 + col; v runs from the bottom of the image (flipY).
// `size` is the square card's edge in metres; the plant stands on its bottom
// edge, centred.

export const WOLFVEIL_PLANT_ATLAS=Object.freeze({
  revision:'wolfveil-plants-v1-20261118',
  albedoUrl:'/game3d/landscape/wv_plants_albedo.webp',
  normalUrl:'/game3d/landscape/wv_plants_normal.webp',
  grid:4,cellPixels:512,
  cells:Object.freeze({
    shrub:Object.freeze({index:0,size:1.5318}),
    shrub_dry:Object.freeze({index:1,size:1.5286}),
    shrub_flowering:Object.freeze({index:2,size:1.5118}),
    fern:Object.freeze({index:3,size:1.1988}),
    reeds:Object.freeze({index:4,size:1.6329}),
    flower_white:Object.freeze({index:5,size:.4215}),
    flower_yellow:Object.freeze({index:6,size:.3477}),
    flower_purple:Object.freeze({index:7,size:.6897}),
    flower_red:Object.freeze({index:8,size:.4914}),
    flower_pink:Object.freeze({index:9,size:.2973}),
    tuft_green:Object.freeze({index:10,size:.6781}),
    tuft_dry:Object.freeze({index:11,size:.6028}),
  }),
});

/** Flower species order shared with WolfveilLivingLandscape (BLOOM_TONES). */
export const WOLFVEIL_FLOWER_CELLS=Object.freeze(['flower_white','flower_yellow','flower_purple','flower_red','flower_pink']);

/**
 * {name,size,uv:[u0,v0,du,dv]} for a cell, inset by 1.5 texels so mip
 * levels never sample the neighbouring plant.
 */
export function wolfveilPlantCell(name){
  const A=WOLFVEIL_PLANT_ATLAS,cell=A.cells[name]||A.cells.tuft_green;
  const col=cell.index%A.grid,row=Math.floor(cell.index/A.grid);
  const e=1.5/(A.grid*A.cellPixels),d=1/A.grid;
  return {name:A.cells[name]?name:'tuft_green',size:cell.size,
    uv:[col*d+e,row*d+e,d-2*e,d-2*e]};
}
