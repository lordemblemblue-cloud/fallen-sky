// Wolfveil near grass: how detailed a blade needs to be at a distance.
//
// Every planted blade is three curved shoots of four segments each: 21
// triangles. A blade is 2.4 cm wide, which is under two pixels from 18 m and
// under one from 32 m, so the curve inside it cannot be seen from there. The
// lawn keeps every blade; cells farther from the player just draw each blade
// with fewer segments, on the same curve, with the same height and tip.
//
// Pure numbers, no Three.js: the stream and the tests share them.

/** Triangles in one planted blade (three shoots) built with `segments`. */
export const nearGrassBladeTriangles=segments=>3*((Math.max(1,segments|0)-1)*2+1);

// Segments per shoot at each level, and the distance beyond which the next,
// lighter level takes over. Level 0 is the blade as it was always built.
export const WOLFVEIL_NEAR_GRASS_DETAIL=Object.freeze({
  segments:Object.freeze([4,2,1]),
  beyondMeters:Object.freeze([18,32]),
  hysteresisMeters:2,
});

/**
 * Detail level for a cell `distance` metres away that is drawn at `current`.
 * A cell changes level only after moving `hysteresis` past the edge, so a
 * player standing on an edge does not make the lawn flicker.
 */
export function nearGrassDetailLevel(distance,current=null,
  {beyondMeters=WOLFVEIL_NEAR_GRASS_DETAIL.beyondMeters,
    hysteresisMeters=WOLFVEIL_NEAR_GRASS_DETAIL.hysteresisMeters}={}){
  if(!Number.isFinite(distance))return 0;
  let level=0;
  for(let i=0;i<beyondMeters.length;i++){
    const slack=current===null||current===undefined?0:current>i?-hysteresisMeters:hysteresisMeters;
    if(distance>beyondMeters[i]+slack)level=i+1;
  }
  return level;
}
