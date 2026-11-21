import * as THREE from 'three';

// Where the water surface is: read from the water meshes themselves (the Wolfveil river strip, the Vortex Lake
// basin), so the height a hero swims at is the height that is drawn. GameWorld3D adds the meshes once the valley is
// built; player/playerSwimState.mjs and the camera ask surfaceAt(x, z).
//
// Every triangle that faces up (not the waterfall's face or a bank skirt) is bucketed once on a ground grid in world
// space; a query tests the few triangles of one cell. The water is not a collider: nothing here moves anything.
export function createWaterSurfaceIndex({ cellSize = 8, minUp = 0.5 } = {}) {
  const tris = []; // 9 numbers per triangle: a, b, c in world space
  const cells = new Map(); // "i,j" -> triangle numbers
  const sources = new Set();
  const cellOf = (v) => Math.floor(v / cellSize);
  const key = (i, j) => `${i},${j}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();

  function addTriangle() {
    ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
    const length = normal.length();
    if (!(length > 1e-9) || Math.abs(normal.y) / length < minUp) return false;
    const n = tris.length / 9;
    tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const i0 = cellOf(Math.min(a.x, b.x, c.x)), i1 = cellOf(Math.max(a.x, b.x, c.x));
    const j0 = cellOf(Math.min(a.z, b.z, c.z)), j1 = cellOf(Math.max(a.z, b.z, c.z));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(n);
    }
    return true;
  }

  return {
    /** Add a water mesh (or every mesh under an object) in its current world placement. Returns triangles added. */
    addMesh(object) {
      if (!object?.isObject3D || sources.has(object)) return 0;
      sources.add(object);
      object.updateWorldMatrix(true, true);
      let added = 0;
      object.traverse((mesh) => {
        const position = mesh.isMesh ? mesh.geometry?.attributes?.position : null;
        if (!position) return;
        const index = mesh.geometry.index;
        const count = index ? index.count : position.count;
        for (let t = 0; t + 2 < count; t += 3) {
          const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
          a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
          b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
          c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
          if (addTriangle()) added++;
        }
      });
      return added;
    },
    /**
     * The water surface height at (x, z), or null where there is no water. With nearY, the surface closest to it
     * (water over water is rare: a lake under a waterfall's pool); without, the highest.
     */
    surfaceAt(x, z, nearY = null) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const list = cells.get(key(cellOf(x), cellOf(z)));
      if (!list) return null;
      let best = null;
      for (const n of list) {
        const o = n * 9;
        const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
        const v1x = tris[o + 3] - ax, v1y = tris[o + 4] - ay, v1z = tris[o + 5] - az;
        const v2x = tris[o + 6] - ax, v2y = tris[o + 7] - ay, v2z = tris[o + 8] - az;
        const px = x - ax, pz = z - az;
        const den = v1x * v2z - v2x * v1z;
        if (Math.abs(den) < 1e-12) continue;
        const u = (px * v2z - v2x * pz) / den; // weight of b
        const v = (v1x * pz - px * v1z) / den; // weight of c
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const y = ay + u * v1y + v * v2y;
        if (best === null || (Number.isFinite(nearY) ? Math.abs(y - nearY) < Math.abs(best - nearY) : y > best)) best = y;
      }
      return best;
    },
    get triangles() { return tris.length / 9; },
    clear() { tris.length = 0; cells.clear(); sources.clear(); },
  };
}

// The follow camera's eye over water (PlayerCameraSystem): with a swimmer at the surface a low camera would sink into
// the river, so the eye stays this far above the water line under it.
export const WATER_CAMERA_CLEARANCE = 0.35;
export function keepEyeAboveWater(eye, surfaceAt, clearance = WATER_CAMERA_CLEARANCE) {
  const surface = typeof surfaceAt === 'function' ? surfaceAt(eye.x, eye.z, eye.y) : null;
  return Number.isFinite(surface) && eye.y < surface + clearance ? { x: eye.x, y: surface + clearance, z: eye.z } : eye;
}
