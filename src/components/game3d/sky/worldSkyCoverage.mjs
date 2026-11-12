/**
 * Camera-relative Game 3D sky coverage. A world-origin sky of radius ~198m
 * was easy to walk out of on Wolfveil's larger terrain. The sky is background,
 * not geometry delimiting the map: it must surround the *current camera*.
 *
 * Camera.far is 3200m. Keep all shells inside that distance and put sun,
 * moon and stars safely INSIDE the gradient sky sphere.
 * One shell/point draw call each; no tiling, duplicate star emitters or physics.
 */
export const WORLD_SKY_RADIUS = 1400;
export const WORLD_STAR_RADIUS = 1340;
export const WORLD_CELESTIAL_RADIUS = 1320;
export const WORLD_STAR_SIZE_SCALE = WORLD_STAR_RADIUS / 190;
export const WORLD_CELESTIAL_SIZE_SCALE = WORLD_CELESTIAL_RADIUS / 180;

export function worldSkyAnchor(cameraPosition) {
  const x = Number(cameraPosition?.x);
  const y = Number(cameraPosition?.y);
  const z = Number(cameraPosition?.z);
  if (![x,y,z].every(Number.isFinite)) return {x:0,y:0,z:0};
  return {x,y,z};
}

export function skyShellEnclosesCamera(anchor, worldPoint) {
  if (!anchor || !worldPoint) return false;
  const dx=worldPoint.x-anchor.x,dy=worldPoint.y-anchor.y,dz=worldPoint.z-anchor.z;
  return Number.isFinite(dx)&&Number.isFinite(dy)&&Number.isFinite(dz)&&
    dx*dx+dy*dy+dz*dz < WORLD_STAR_RADIUS*WORLD_STAR_RADIUS;
}
