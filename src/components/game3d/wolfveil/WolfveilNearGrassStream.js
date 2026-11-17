// Dense individual grass around the player. The valley-wide field is far too
// thin to read as a lawn on its own, so 10m cells of closely planted blades are
// built as the player approaches and released once they are left behind.
// Decoration only: no colliders, no raycasts.
import * as THREE from 'three';
import { mulberry32 } from './WolfveilGeometry.js';
import { nearGrassDetailLevel } from './WolfveilNearGrassDetail.mjs';

const CELL = 10, RADIUS = 46, KEEP = 62, PER_CELL = 900, BUILDS_PER_UPDATE = 2;

// `lighterGeometries`: the same blade with fewer segments, lightest last.
// Cells farther from the player draw every blade with one of these; nothing
// is planted more thinly (see WolfveilNearGrassDetail.mjs).
export function createWolfveilNearGrassStream({ group, geometry, material, accept, palette, lighterGeometries = [] }) {
  const cells = new Map();
  const dummy = new THREE.Object3D();
  const levels = [geometry, ...lighterGeometries];
  let detailLevels = levels.length > 1;
  const applyDetail = (mesh, distance) => {
    const current = mesh.userData.grassDetail;
    const level = detailLevels
      ? Math.min(levels.length - 1, nearGrassDetailLevel(distance, current)) : 0;
    if (level === current) return;
    mesh.userData.grassDetail = level;
    mesh.geometry = levels[level];
  };

  function build(cx, cz, distance) {
    const rand = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const spots = [];
    for (let i = 0; i < PER_CELL; i++) {
      const x = (cx + rand()) * CELL, z = (cz + rand()) * CELL;
      const yaw = rand() * Math.PI * 2, w = 1.2 + rand() * 0.8, h = 0.5 + rand() * 0.5;
      const shade = Math.floor(rand() * palette.length);
      const y = accept(x, z);
      if (y !== false) spots.push({ x, y, z, yaw, w, h, shade });
    }
    if (!spots.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    spots.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.02, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.w, p.h, p.w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, palette[p.shade]);
    });
    mesh.computeBoundingSphere();
    mesh.name = `SWV_Near_GrassBlades_${cx}:${cz}`;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    mesh.userData = { decorativeOnly: true, nonCollider: true, individualBlades: true, grassDetail: null };
    applyDetail(mesh, distance);
    group.add(mesh);
    return mesh;
  }

  function release(key) {
    const mesh = cells.get(key);
    if (mesh) { group.remove(mesh); mesh.dispose(); }
    cells.delete(key);
  }

  return {
    get cells() { return cells.size; },
    /** How many cells are drawn at each detail level, fullest first. */
    get detail() {
      const counts = levels.map(() => 0);
      for (const mesh of cells.values()) if (mesh) counts[mesh.userData.grassDetail || 0]++;
      return counts;
    },
    /** A/B switch: false draws every cell with the full blade, as before. */
    setDetailLevels(enabled) { detailLevels = Boolean(enabled) && levels.length > 1; return detailLevels; },
    update(player) {
      if (!player) return;
      for (const [key, mesh] of cells) {
        const [cx, cz] = key.split(':').map(Number);
        const distance = Math.hypot((cx + 0.5) * CELL - player.x, (cz + 0.5) * CELL - player.z);
        if (distance > KEEP) release(key);
        else if (mesh) { mesh.visible = true; applyDetail(mesh, distance); }
      }
      const reach = Math.ceil(RADIUS / CELL), px = Math.floor(player.x / CELL), pz = Math.floor(player.z / CELL);
      const wanted = [];
      for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
        const cx = px + dx, cz = pz + dz, key = `${cx}:${cz}`;
        if (cells.has(key)) continue;
        const d = Math.hypot((cx + 0.5) * CELL - player.x, (cz + 0.5) * CELL - player.z);
        if (d <= RADIUS) wanted.push({ cx, cz, key, d });
      }
      wanted.sort((a, b) => a.d - b.d);
      for (const c of wanted.slice(0, BUILDS_PER_UPDATE)) cells.set(c.key, build(c.cx, c.cz, c.d));
    },
    dispose() { for (const key of [...cells.keys()]) release(key); },
  };
}