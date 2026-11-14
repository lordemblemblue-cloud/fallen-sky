import * as THREE from 'three';

// An arrow is a straight ray from the on-screen centre point. Actor hitboxes
// are separate from thin animated mesh triangles and decorative effects.
// Only actual in-range, visible hostiles behind unobstructed shot paths can
// receive damage. Damage/loot/authority stay in the existing combat engine.
export const BOW_PVE_RANGE = 40; // AI encounters only; PvP/server range is unchanged.
export const BOW_AIM_SETTINGS = Object.freeze({
  maxRange: BOW_PVE_RANGE,
  edgeNdc: 0.014,
  lockedEdgeNdc: 0.018,
  blockPadding: 0.15,
  markerRadiusPx: 3,
});

const rawBounds = new THREE.Box3();
const bodyBounds = new THREE.Box3();
const center = new THREE.Vector3();
const size = new THREE.Vector3();
const projected = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const aimRay = new THREE.Raycaster();
const blockerRay = new THREE.Raycaster();
const muzzleRay = new THREE.Raycaster();
const hitPoint = new THREE.Vector3();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);

function visibleHostile(target) {
  return Boolean(target?.id && target.group?.position &&
    target.group.visible !== false && target.alive !== false &&
    !target.dying && !target.defeated && Number(target.hp ?? 1) > 0);
}

// The bounding volume is intentionally limited to the actor's body; a huge
// weapon swing, particle mesh, or invisible animation prop must not make a
// target hittable across half the screen. Unloaded models get a small capsule-
// like volume, so a valid AI can still be hit while its mesh loads.
export function getBowEnemyHitbox(target, out = new THREE.Box3()) {
  if (!target?.group) return null;
  target.group.updateWorldMatrix?.(true, true);
  target.group.getWorldPosition?.(worldPos);
  if (!finitePoint(worldPos)) worldPos.copy(target.group.position);
  const isBoss = !!(target.isBoss || /boss/i.test(String(target.tier || '')));
  let valid = false;
  try {
    rawBounds.setFromObject(target.group);
    if (!rawBounds.isEmpty()) {
      rawBounds.getCenter(center);
      rawBounds.getSize(size);
      valid = finitePoint(center) && finitePoint(size);
    }
  } catch { /* Model has not decoded yet. */ }
  if (!valid) {
    center.copy(worldPos).add(new THREE.Vector3(0, 1.05, 0));
    size.set(1.2, 2.1, 1.2);
  } else {
    const offset = isBoss ? 3 : 0.6;
    center.x = clamp(center.x, worldPos.x - offset, worldPos.x + offset);
    center.y = clamp(center.y, worldPos.y - 0.25, worldPos.y + (isBoss ? 5 : 2.1));
    center.z = clamp(center.z, worldPos.z - offset, worldPos.z + offset);
    // Hold this to a solid, reasonable torso. Extremely wide decorative
    // mesh bounds cannot be used as a free target acquisition zone.
    size.set(
      clamp(size.x + 0.3, 0.85, isBoss ? 10 : 2.35),
      clamp(size.y + 0.3, 1.3, isBoss ? 11 : 3.4),
      clamp(size.z + 0.3, 0.85, isBoss ? 10 : 2.35),
    );
  }
  return out.setFromCenterAndSize(center, size);
}

function firstSolidHit(raycaster, meshes = []) {
  if (!Array.isArray(meshes) || !meshes.length) return null;
  return raycaster.intersectObjects(meshes.filter(Boolean), true)
    .find(hit => Number.isFinite(hit.distance) && hit.object?.visible !== false &&
      !hit.object?.userData?.otsCameraIgnore) || null;
}

function clearMuzzlePath(origin, point, meshes) {
  muzzle.copy(origin);
  muzzle.y += 1.45;
  direction.copy(point).sub(muzzle);
  const length = direction.length();
  if (!Number.isFinite(length) || length < 0.3) return false;
  muzzleRay.set(muzzle, direction.divideScalar(length));
  muzzleRay.near = 0.3;
  muzzleRay.far = Math.max(0.31, length - BOW_AIM_SETTINGS.blockPadding);
  const obstruction = firstSolidHit(muzzleRay, meshes);
  return !obstruction || obstruction.distance >= length - BOW_AIM_SETTINGS.blockPadding;
}

export function selectCameraBowTarget({
  camera, origin, enemies = [], bosses = [], maxRange = BOW_PVE_RANGE,
  lockedEnemyId = null, groundMeshes = [],
} = {}) {
  if (!camera?.isCamera || !finitePoint(origin) || !(maxRange > 0)) return null;
  camera.updateMatrixWorld(true);
  aimRay.setFromCamera({ x: 0, y: 0 }, camera);
  aimRay.near = 0.2;
  aimRay.far = maxRange + 12;
  // Do this expensive world raycast once, not once for each enemy in a horde.
  blockerRay.set(aimRay.ray.origin, aimRay.ray.direction);
  blockerRay.near = 0.2;
  blockerRay.far = aimRay.far;
  const worldBlock = firstSolidHit(blockerRay, groundMeshes);
  const obstructionDistance = worldBlock?.distance ?? Infinity;

  const candidates = [];
  const seen = new Set();
  for (const target of [...enemies, ...bosses]) {
    if (!visibleHostile(target) || seen.has(target)) continue;
    seen.add(target);
    const box = getBowEnemyHitbox(target, bodyBounds);
    if (!box) continue;
    const intersection = aimRay.ray.intersectBox(box, hitPoint);
    const locked = String(target.id) === String(lockedEnemyId);
    let point;
    let rayDistance = Infinity;
    if (intersection && finitePoint(intersection)) {
      point = intersection.clone();
      rayDistance = point.distanceTo(aimRay.ray.origin);
    } else {
      // A tiny grace for clipped animation bodies, never the old broad
      // auto-aim cone. Project the hitbox centre rather than the feet.
      box.getCenter(center);
      projected.copy(center).project(camera);
      if (!(projected.z > -1 && projected.z < 1)) continue;
      const error = Math.hypot(projected.x, projected.y);
      if (error > (locked ? BOW_AIM_SETTINGS.lockedEdgeNdc : BOW_AIM_SETTINGS.edgeNdc)) continue;
      point = center.clone();
      rayDistance = point.distanceTo(aimRay.ray.origin);
    }
    if (!finitePoint(point) || rayDistance > aimRay.far) continue;
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
    if (!Number.isFinite(distance) || distance > maxRange || distance < 0.2) continue;
    // Neither a camera ray through a wall nor a muzzle behind a rock can
    // award an AI hit. The muzzle converges on this exact reticle hit point.
    if (obstructionDistance < rayDistance - BOW_AIM_SETTINGS.blockPadding) continue;
    candidates.push({ target, distance, locked, point, rayHit: !!intersection, rayDistance });
  }

  candidates.sort((a, b) => a.rayDistance - b.rayDistance || Number(b.rayHit) - Number(a.rayHit));
  // Try the closest unobstructed hitbox first; don't auto-hit a farther
  // creature if a nearer visible creature occupies the actual crosshair.
  for (const candidate of candidates) {
    if (!clearMuzzlePath(origin, candidate.point, groundMeshes)) continue;
    return candidate;
  }
  return null;
}

export function cameraBowImpactPoint(camera, groundMeshes = [], maxDistance = BOW_PVE_RANGE) {
  if (!camera?.isCamera) return null;
  camera.updateMatrixWorld(true);
  const caster = new THREE.Raycaster();
  caster.setFromCamera({ x: 0, y: 0 }, camera);
  caster.near = 0.25;
  caster.far = maxDistance;
  const wall = firstSolidHit(caster, groundMeshes);
  return wall?.point?.clone() || caster.ray.at(maxDistance, new THREE.Vector3());
}

export function pickCameraBowCombatTargets(args = {}) {
  const hit = selectCameraBowTarget(args);
  return hit ? [{ target: hit.target, distance: hit.distance, locked: hit.locked, point: hit.point }] : [];
}
