// Combat Foundation 3.3 — deterministic 2D duel-body and arena boundary resolver.
// Only the worker invokes this for authority. These are NOT world terrain meshes.
export const DUEL_BODY_RADIUS = 0.55;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function confineDuelBody(point, arenaRadius = 100, bodyRadius = DUEL_BODY_RADIUS) {
  if (!finite(point?.x) || !finite(point?.z) || !finite(arenaRadius) ||
      !finite(bodyRadius) || bodyRadius <= 0 || arenaRadius <= bodyRadius)
    throw Error('Invalid duel collision coordinates');
  const edge = arenaRadius - bodyRadius;
  const distance = Math.hypot(point.x, point.z);
  if (distance <= edge) return {x:point.x,z:point.z};
  return {x:point.x * edge / distance, z:point.z * edge / distance};
}

export function advanceDuelBody(position, dx, dz, arenaRadius = 100) {
  if (!finite(dx) || !finite(dz)) throw Error('Invalid duel movement');
  return confineDuelBody({x:position.x+dx,z:position.z+dz},arenaRadius);
}

// Symmetric capsule footprints: actors cannot stand inside each other.
// Resolve overlap deterministically (including exact coincident spawns).
// Collision is post-integration and intentionally does not implement 3D terrain.
export function separateDuelBodies(a, b, arenaRadius = 100) {
  let left = confineDuelBody(a, arenaRadius);
  let right = confineDuelBody(b, arenaRadius);
  const minimum = 2 * DUEL_BODY_RADIUS;
  for (let i=0;i<5;i++) {
    const dx=right.x-left.x, dz=right.z-left.z;
    const distance=Math.hypot(dx,dz);
    if (distance>=minimum-1e-6) break;
    const nx=distance>1e-9?dx/distance:1;
    const nz=distance>1e-9?dz/distance:0;
    const push=(minimum-distance)/2;
    const oldLeft=left, oldRight=right;
    left=confineDuelBody({x:left.x-nx*push,z:left.z-nz*push},arenaRadius);
    right=confineDuelBody({x:right.x+nx*push,z:right.z+nz*push},arenaRadius);
    if (Math.hypot(right.x-left.x,right.z-left.z)>=minimum-1e-6) break;
    // At the arena edge one body may be pinned: shift the other by the deficit.
    const deficit=minimum-Math.hypot(right.x-left.x,right.z-left.z);
    if (Math.hypot(left.x-oldLeft.x,left.z-oldLeft.z) <
        Math.hypot(right.x-oldRight.x,right.z-oldRight.z))
      right=confineDuelBody({x:right.x+nx*deficit,z:right.z+nz*deficit},arenaRadius);
    else left=confineDuelBody({x:left.x-nx*deficit,z:left.z-nz*deficit},arenaRadius);
  }
  return [left,right];
}
