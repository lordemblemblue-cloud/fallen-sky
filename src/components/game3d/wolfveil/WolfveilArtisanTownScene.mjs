// Clone town replacement: mount the owner's Japanese/Egyptian wolf fountain
// on the existing, graded Wolfveil terrain. No second renderer or floor plate
// from the retired Blender town; shared player/camera/HUD systems are untouched.
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { createAXETownPlaza } from './AXETownPlaza.js';
import { createStaticMeshMerger } from '../performance/Game3DStaticMerging.mjs';
import {
  WOLFVEIL_IMPORTED_TOWN,
  WOLFVEIL_IMPORTED_TOWN_FLOOR_Y,
} from './WolfveilImportedTownLayout.mjs';
import { buildWolfveilTownLivingQuarter } from './WolfveilTownLivingQuarterScene.mjs';

const isFinitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function installWolfveilArtisanTown(scene, { renderer = null, onStatus, onReady } = {}) {
  if (!scene?.add) throw new Error('Artisan town requires an active Game 3D scene');
  const layout = WOLFVEIL_IMPORTED_TOWN;
  const root = new THREE.Group();
  root.name = 'Wolfveil_Artisan_Town_Replacement';
  root.userData.townId = 'wolfveil-artisan-town';
  scene.add(root);

  let active = true;
  let elapsed = 0;
  let livingQuarter = null;
  let town;
  try {
    // The authored plaza is 120m across, fitting inside Wolfveil's existing
    // 130 x 141m town footprint. Its own decorative stone paving is level
    // with the shared Wolfveil terrain; never add a second collision floor.
    town = createAXETownPlaza({
      THREE, renderer, includeLighting: false,
      showOuterHomes: true, showInnerShops: true, worldScale: 1,
    });
    town.group.position.set(layout.x, WOLFVEIL_IMPORTED_TOWN_FLOOR_Y + .025, layout.z + 70);
    root.add(town.group);
  } catch (error) {
    scene.remove(root);
    onStatus?.({ state: 'error', reason: error?.message || String(error) });
    throw error;
  }

  // Draw budget: the plaza is built from about 3,500 small parts, one draw
  // call each. Every part that stays still while the town plays its own
  // animation (and while its doors open and close) is merged into one mesh
  // per material; lanterns, doors, banners, water and effects keep moving as
  // separate meshes. It fails open: on any error the town stays as built.
  let merger = null;
  try {
    merger = createStaticMeshMerger({
      root: town.group,
      BufferGeometry: THREE.BufferGeometry,
      BufferAttribute: THREE.BufferAttribute,
      Mesh: THREE.Mesh,
      tag: 'wolfveilTownMergedBatch',
      // Aiming and the camera arm still collide with the merged walls.
      accelerateRaycast(batch) {
        batch.geometry.boundsTree = new MeshBVH(batch.geometry);
        batch.raycast = acceleratedRaycast;
      },
    });
    merger.snapshot();
    for (const moment of [0.37, 1.31, 2.93, 4.77, 7.13, 9.59]) {
      town.update(0.1, moment);
      merger.markMoved();
    }
    town.setDoorsOpen(true);
    for (let i = 0; i < 12; i++) { town.update(0.1, 11 + i * 0.1); merger.markMoved(); }
    town.setDoorsOpen(false);
    for (let i = 0; i < 90; i++) town.update(0.1, 12.2 + i * 0.1); // doors settle shut
    merger.build();
  } catch (error) {
    globalThis.console?.warn('[Wolfveil town] draw budget unavailable; town left as built:', error);
    try { merger?.dispose(); } catch { /* already as built */ }
    merger = null;
  }

  // Local authored town geometry is centered at the existing imported town
  // anchor. Collision in world space needs to offset by this same anchor.
  const toLocal = (x, z) => ({
    x: x - town.group.position.x,
    z: z - town.group.position.z,
  });
  const zones = town.collisionZones;
  const homes = town.refs.homes.children
    .filter(h => h?.isGroup)
    .map(h => ({ x: h.position.x, z: h.position.z, angle: h.rotation.y }));

  function localBlocked(x, z, padding = 0) {
    for (const zone of zones) {
      if (zone.type === 'circle') {
        if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + padding) return true;
      } else if (zone.type === 'box' &&
        Math.abs(x - zone.x) < zone.halfWidth + padding &&
        Math.abs(z - zone.z) < zone.halfDepth + padding) return true;
    }
    // Eight outer residences are not listed in the source's coarse collision
    // zones. Use small oriented envelopes rather than their roof overhangs.
    for (const h of homes) {
      const dx = x - h.x, dz = z - h.z;
      const c = Math.cos(h.angle), s = Math.sin(h.angle);
      const hx = c * dx - s * dz, hz = s * dx + c * dz;
      if (Math.abs(hx) < 4.8 + padding && Math.abs(hz) < 3.4 + padding) return true;
    }
    return false;
  }

  const collision = {
    groundAt(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const pt = toLocal(x, z);
      return Math.abs(pt.x) <= layout.width / 2 &&
        Math.abs(pt.z) <= layout.depth / 2
        ? WOLFVEIL_IMPORTED_TOWN_FLOOR_Y + .025 : null;
    },
    isSolid(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const pt = toLocal(x, z);
      return localBlocked(pt.x, pt.z, .3);
    },
  };

  // Keep the existing patrol/quest dialogue presentation; disable the old
  // procedural house generator so it cannot duplicate the authored residences.
  livingQuarter = buildWolfveilTownLivingQuarter(root, {
    collision, architectureEnabled: false,
    onStatus(report) { root.userData.cloneTownLivingQuarter = report; },
  });
  root.userData.townReplacement = {
    version: 'japanese-egyptian-wolf-fountain',
    source: 'user-supplied-3d-diorama',
    collision: 'coarse-static-envelopes',
    oldBlenderTownLoaded: false,
  };

  // Original GLB invoked onReady asynchronously. Preserve that contract:
  // GameWorld3D's questNPCs and ink shader are initialized later in the effect.
  queueMicrotask(() => {
    if (!active) return;
    onStatus?.({ state: 'ready', reason: 'Artisan town active on Wolfveil terrain' });
    onReady?.();
  });

  function blocked(x, z) {
    const pt = toLocal(x, z);
    return localBlocked(pt.x, pt.z, .3);
  }

  return {
    root,
    get status() { return active ? 'ready' : 'disposed'; },
    get model() { return town.group; },
    get livingQuarterReport() { return livingQuarter?.report || null; },
    // Draw budget numbers and A/B switch (diagnostics).
    drawBudget: {
      stats() { return merger?.stats() ?? null; },
      setEnabled(enabled) { return merger?.setEnabled(enabled) ?? false; },
    },
    groundY: collision.groundAt,
    isSolid(x, z) { return blocked(x, z) || Boolean(livingQuarter?.isSolid(x, z)); },
    nearestResident(position) { return livingQuarter?.nearestResident(position) || null; },
    interactResident(position) { return livingQuarter?.interact(position) || null; },
    resolveCollision(position, previous) {
      if (!isFinitePoint(position) || !isFinitePoint(previous)) return false;
      if (!blocked(position.x, position.z) || blocked(previous.x, previous.z)) {
        return livingQuarter?.resolveCollision(position, previous) || false;
      }
      const nextX = position.x, nextZ = position.z;
      if (!blocked(nextX, previous.z)) position.z = previous.z;
      else if (!blocked(previous.x, nextZ)) position.x = previous.x;
      else { position.x = previous.x; position.z = previous.z; }
      livingQuarter?.resolveCollision(position, previous);
      return true;
    },
    update(dt, playerPosition) {
      if (!active || !Number.isFinite(dt)) return;
      const step = Math.min(Math.max(dt, 0), .1);
      elapsed += step;
      town.update(step, elapsed);
      merger?.update(step);
      livingQuarter?.update(step, playerPosition);
    },
    dispose() {
      if (!active) return;
      active = false;
      livingQuarter?.dispose();
      livingQuarter = null;
      merger?.dispose();
      merger = null;
      town.dispose();
      scene.remove(root);
      root.clear();
    },
  };
}
