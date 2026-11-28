// Places: dresses the adventure spots that lie in the current area.
//
// Builds every place of the loaded area (or of the whole valley with
// ?wholeWorld=1) from the layout data in layouts/*.mjs with pieces of the
// valley kit, standing on the real ground:
//   - one InstancedMesh per piece and level of detail, under the Wolfveil
//     group in LOCAL metres; LOD0 near, LOD1 beyond 60 m, nothing beyond
//     150 m except landmarks, re-sorted four times a second;
//   - tints by per-instance colour; glowing pieces on the kit's glow material;
//     at most two real lights per place, none casting shadows;
//   - solid pieces push the player out (resolveCollision);
//   - painted ground (threshing circle, field strips, yards, plots) draped on
//     the terrain in one mesh per build.
// Announces `places:ready` { area } on the bus once everything of an area
// stands on the ground. See docs/game3d/three-empires/BUILD_RULES.md.
//
// Places of a band still being built (layout `preview: true`: band 2's camps)
// are built only with the preview switch (?threeRoads=1&threeRoadsPreview=1).
//
// A place marked `merge: true` (a camp) draws all its pieces except its
// landmarks as ONE mesh per kit and material, built from the placed pieces,
// switched between LOD0 and LOD1 by the player's distance from the place as a
// whole: a few draw calls a camp instead of one per kind of piece. A camp is
// at most about 60 m across, so drawing it whole at one level costs little.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { storyZOffset } from '../coords.mjs';
import { storyFrame } from '../storyFrame.mjs';
import { createValleyKit, createEmpireKit } from './valleyKit.mjs';
import { drapePaintedGround } from './paintedGround.mjs';
import { THREE_ROADS_PLACES, placeLayout } from './layouts/index.mjs';
import {
  placeInstances, groundUnder, instanceMatrix, lodForDistance, solidFor,
  createSolidGrid, resolveAgainstGrid,
} from './placeMath.mjs';
import { wolfveilHeight, wolfveilRiverHeightAtZ } from '../../wolfveil/WolfveilLayout.js';
import { threeRoadsPreviewEnabled } from '../threeRoadsFlag.mjs';

const LOD_SECONDS = 0.25;
const GROUND_RETRY_SECONDS = 0.5;
const GROUND_GIVE_UP_SECONDS = 20; // then the analytic height stands in
const RESETTLE_AT = Object.freeze([4, 12]); // late floors (the town) re-checked
const LIGHT_RANGE = 70; // a place's lights are on only this near

export function createPlacesSubsystem(ctx, {
  preview = threeRoadsPreviewEnabled(globalThis.window),
  layouts = THREE_ROADS_PLACES,
} = {}) {
  if (!storyFrame().regions.includes(ctx?.region) || !ctx.wolfveilWorld?.group) return null;
  const areas = ctx.areaScenes === false ? storyFrame().areaIds : [ctx.worldArea];
  const places = layouts.filter(place => areas.includes(place.area) && (preview || !place.preview));
  if (!places.length) return null;

  const root = new THREE.Group();
  root.name = 'TR_Places';
  // The area loader leaves this alone: in an area scene only this area exists,
  // and the subsystem does its own distance culling; splitting its batches
  // would fight the level-of-detail rewrites.
  root.userData.wolfveilAreaShared = true;
  ctx.wolfveilWorld.group.add(root);

  // One kit object per kit the built places use: the valley's, and in band 2's
  // camps an empire's.
  const kits = new Map();
  const kitFor = name => {
    if (!kits.has(name)) {
      const options = { gltfLoader: ctx.gltfLoader, onSwap: () => adoptKit() };
      kits.set(name, name === 'valley' ? createValleyKit(options) : createEmpireKit(name, options));
    }
    return kits.get(name);
  };
  const pieceOf = inst => kitFor(inst.kit).get(inst.piece);
  // The ground a piece stands on, or for a piece afloat the river's water.
  const heightFor = (inst, heightAt) => (inst.afloat
    ? wolfveilRiverHeightAtZ(inst.z)
    : groundUnder(inst, heightAt));

  // ---- Instances, grouped into one batch per piece --------------------
  const placeState = new Map(); // id -> { place, members: [index], grounded, ... }
  const all = []; // { inst, ground, lod, batch, slot | mesh, solid }
  for (const place of places) {
    const state = { place, members: [], grounded: false, groundedAt: 0, resettled: [], lights: [] };
    placeState.set(place.id, state);
    for (const inst of placeInstances(place)) {
      state.members.push(all.length);
      all.push({ inst, ground: heightFor(inst, wolfveilHeight) ?? 0, lod: -2 });
    }
  }

  // Merged groups: per merging place, one group per kit and material.
  const groups = new Map(); // placeId:kit:material -> group
  for (const record of all) {
    const place = placeState.get(record.inst.placeId).place;
    if (!place.merge || record.inst.landmark || record.inst.spin) continue;
    const material = pieceOf(record.inst).material;
    const key = place.id + ':' + record.inst.kit + ':' + material;
    if (!groups.has(key)) {
      groups.set(key, { key, place, kit: kitFor(record.inst.kit), material, members: [], meshes: [null, null], lod: -2, dirty: true });
    }
    record.merged = groups.get(key);
    record.merged.members.push(record);
  }

  const batches = new Map(); // piece id -> batch
  const spinners = [];
  for (const record of all) {
    if (record.merged) continue;
    if (record.inst.spin) { spinners.push(record); continue; }
    const key = record.inst.kit + ':' + record.inst.piece;
    if (!batches.has(key)) {
      batches.set(key, { key, kit: kitFor(record.inst.kit), id: record.inst.piece, members: [], meshes: [null, null], dirty: true });
    }
    record.batch = batches.get(key);
    record.slot = record.batch.members.length;
    record.batch.members.push(record);
  }

  const colour = new THREE.Color();
  const writeColour = (batch, record, slot) => {
    colour.setHex(batch.kit.colourFor(batch.id, record.inst.tint));
    batch.colours[slot * 3] = colour.r; batch.colours[slot * 3 + 1] = colour.g; batch.colours[slot * 3 + 2] = colour.b;
  };
  for (const batch of batches.values()) {
    const n = batch.members.length;
    batch.matrices = new Float32Array(n * 16);
    batch.colours = new Float32Array(n * 3);
    const entry = batch.kit.get(batch.id);
    for (let lod = 0; lod < 2; lod++) {
      const mesh = new THREE.InstancedMesh(lod ? entry.lod1 : entry.lod0, batch.kit.materials[entry.material], n);
      mesh.name = 'TR_Place_' + (batch.kit.id === 'valley' ? '' : batch.kit.id + '_') + batch.id + '_LOD' + lod;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Every batch has instance colours, so all of them share one pipeline.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      root.add(mesh);
      batch.meshes[lod] = mesh;
    }
    batch.members.forEach((record, slot) => {
      writeColour(batch, record, slot);
      instanceMatrix(record.inst, record.ground, batch.matrices, slot * 16);
    });
  }

  // A merged group's two meshes, built (again) from its members as they stand.
  const vertexColourMaterials = new Map(); // kit material -> its vertex-coloured twin
  const twinOf = material => {
    if (!vertexColourMaterials.has(material)) {
      const twin = material.clone();
      twin.vertexColors = true;
      twin.name = (material.name || 'TR_Kit') + '_Merged';
      vertexColourMaterials.set(material, twin);
    }
    return vertexColourMaterials.get(material);
  };
  const scratch = new THREE.Matrix4();
  const scratchArray = new Array(16);
  function buildGroup(group) {
    const material = twinOf(group.kit.materials[group.material]);
    for (let lod = 0; lod < 2; lod++) {
      const parts = [];
      for (const record of group.members) {
        const entry = pieceOf(record.inst);
        const source = lod ? entry.lod1 : entry.lod0;
        let part = source.index ? source.toNonIndexed() : source.clone();
        // Only what every kit geometry has, so the parts merge.
        for (const name of Object.keys(part.attributes))
          if (!['position', 'normal', 'uv'].includes(name)) part.deleteAttribute(name);
        if (!part.attributes.normal) part.computeVertexNormals();
        if (!part.attributes.uv) part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(part.attributes.position.count * 2), 2));
        part.applyMatrix4(scratch.fromArray(instanceMatrix(record.inst, record.ground, scratchArray)));
        colour.setHex(group.kit.colourFor(record.inst.piece, record.inst.tint));
        const n = part.attributes.position.count, rgb = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { rgb[i * 3] = colour.r; rgb[i * 3 + 1] = colour.g; rgb[i * 3 + 2] = colour.b; }
        part.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
        parts.push(part);
      }
      const geometry = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
      for (const part of parts) part.dispose();
      geometry.computeBoundingSphere();
      geometry.name = 'TR_Place_' + group.key + '_LOD' + lod;
      let mesh = group.meshes[lod];
      if (mesh) { mesh.geometry.dispose(); mesh.geometry = geometry; mesh.material = material; } else {
        mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'TR_Place_' + group.key.replace(/:/g, '_') + '_merged_LOD' + lod;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.visible = false;
        mesh.raycast = () => {}; // drawn only: collision is the solids' job
        root.add(mesh);
        group.meshes[lod] = mesh;
      }
    }
    group.dirty = false;
    showGroup(group);
  }
  function showGroup(group) {
    const grounded = placeState.get(group.place.id).grounded;
    group.meshes.forEach((mesh, lod) => { if (mesh) mesh.visible = grounded && group.lod === lod; });
  }

  // Pieces that turn (the windmill's sails): one plain mesh each.
  for (const record of spinners) {
    const entry = pieceOf(record.inst);
    const mesh = new THREE.Mesh(entry.lod0, kitFor(record.inst.kit).materials[entry.material]);
    mesh.name = 'TR_Place_' + record.inst.piece + '_spin';
    mesh.rotation.order = 'YXZ';
    mesh.position.set(record.inst.x, record.ground + record.inst.y, record.inst.z);
    mesh.rotation.set(record.inst.pitch, record.inst.yaw, record.inst.roll);
    mesh.scale.setScalar(record.inst.scale);
    mesh.visible = false;
    mesh.castShadow = false;
    record.mesh = mesh;
    record.angle = 0;
    root.add(mesh);
  }

  // ---- Lights: made now, so the scene's light count never changes later --
  for (const state of placeState.values()) {
    for (const spec of (state.place.lights || []).slice(0, 2)) {
      const light = new THREE.PointLight(spec.colour ?? 0xffb060, 0, spec.distance ?? 14, 2);
      light.name = 'TR_Place_' + state.place.id + '_light';
      light.castShadow = false;
      const x = state.place.x + (spec.x || 0), z = state.place.z + (spec.z || 0);
      light.userData.threeRoads = { spec, x, z, on: false };
      light.position.set(x, wolfveilHeight(x, z) + (spec.y ?? 1.6), z);
      root.add(light);
      state.lights.push(light);
    }
  }

  // ---- Painted ground: one draped mesh for everything built -------------
  let groundMesh = null;
  const painted = drapePaintedGround(places, wolfveilHeight);
  if (painted.triangles) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(painted.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(painted.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    material.name = 'TR_Place_PaintedGround';
    groundMesh = new THREE.Mesh(geometry, material);
    groundMesh.name = 'TR_Place_PaintedGround';
    groundMesh.receiveShadow = true;
    groundMesh.raycast = () => {}; // decorative: never a floor
    groundMesh.userData.wolfveilAreaKeepWhole = true;
    root.add(groundMesh);
  }

  // ---- Collision ---------------------------------------------------------
  const solids = [];
  for (const record of all) {
    const solid = solidFor(record.inst, record.ground);
    if (solid) { record.solid = solid; solids.push(solid); }
  }
  const grid = createSolidGrid(solids);
  const probe = { x: 0, z: 0 };

  // ---- Ground -------------------------------------------------------------
  let clock = 0, groundTimer = 0, lodTimer = LOD_SECONDS;
  const announced = new Set();
  const worldGround = (x, z) => {
    const y = ctx.sampleGroundY?.(x, z + storyZOffset());
    return Number.isFinite(y) ? y : null;
  };
  const groundOrHeight = (x, z) => worldGround(x, z) ?? wolfveilHeight(x, z);
  function settle(state, heightAt) {
    for (const index of state.members) {
      const record = all[index];
      const y = heightFor(record.inst, heightAt);
      if (y === null || Math.abs(y - record.ground) < 0.02) continue;
      record.ground = y;
      if (record.merged) {
        record.merged.dirty = true;
      } else if (record.batch) {
        instanceMatrix(record.inst, y, record.batch.matrices, record.slot * 16);
        record.batch.dirty = true;
      } else if (record.mesh) {
        record.mesh.position.y = y + record.inst.y;
      }
      if (record.solid) {
        record.solid.top = y + record.inst.y + pieceOf(record.inst).table.size[2] * record.inst.scale;
      }
    }
    for (const light of state.lights) {
      const data = light.userData.threeRoads;
      const y = heightAt(data.x, data.z);
      if (Number.isFinite(y)) light.position.y = y + (data.spec.y ?? 1.6);
    }
  }
  function tryGround(force) {
    for (const state of placeState.values()) {
      if (state.grounded) {
        // Re-check once or twice: a town floor can load after the terrain.
        const since = clock - state.groundedAt;
        const due = RESETTLE_AT.find(at => since >= at && !state.resettled.includes(at));
        if (due !== undefined) {
          state.resettled.push(due);
          settle(state, groundOrHeight);
        }
        continue;
      }
      const centre = worldGround(state.place.x, state.place.z);
      if (centre === null && !force) continue;
      settle(state, groundOrHeight);
      state.grounded = true;
      state.groundedAt = clock;
      for (const index of state.members) {
        if (all[index].batch) all[index].batch.dirty = true;
        if (all[index].merged) all[index].merged.dirty = true;
      }
    }
    for (const group of groups.values()) if (group.dirty && placeState.get(group.place.id).grounded) buildGroup(group);
    for (const area of areas) {
      if (announced.has(area)) continue;
      const mine = [...placeState.values()].filter(state => state.place.area === area);
      if (!mine.length || !mine.every(state => state.grounded)) continue;
      announced.add(area);
      ctx.bus?.emit('places:ready', { area });
    }
  }

  // ---- Level of detail ------------------------------------------------------
  function rewrite(batch) {
    const [m0, m1] = batch.meshes;
    const shared = m0.geometry === m1.geometry;
    let n0 = 0, n1 = 0;
    const a0 = m0.instanceMatrix.array, a1 = m1.instanceMatrix.array;
    const c0 = m0.instanceColor.array, c1 = m1.instanceColor.array;
    for (const record of batch.members) {
      if (record.lod < 0 || !placeState.get(record.inst.placeId).grounded) continue;
      const first = record.lod === 0 || shared;
      const target = first ? a0 : a1, colours = first ? c0 : c1;
      const k = first ? n0++ : n1++;
      for (let e = 0; e < 16; e++) target[k * 16 + e] = batch.matrices[record.slot * 16 + e];
      for (let e = 0; e < 3; e++) colours[k * 3 + e] = batch.colours[record.slot * 3 + e];
    }
    m0.count = n0; m1.count = n1;
    for (const mesh of batch.meshes) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = null; // recomputed by the renderer for culling
    }
    batch.dirty = false;
  }
  function sortLod(px, pz) {
    // A merged group by its place: the nearest edge of the place's circle.
    for (const group of groups.values()) {
      const d = Math.max(0, Math.hypot(group.place.x - px, group.place.z - pz) - group.place.radius * 0.5);
      const lod = lodForDistance(d, false, group.lod < -1 ? null : group.lod);
      if (lod !== group.lod) { group.lod = lod; showGroup(group); }
    }
    for (const record of all) {
      if (record.merged) continue;
      const d = Math.hypot(record.inst.x - px, record.inst.z - pz);
      const lod = lodForDistance(d, record.inst.landmark, record.lod < -1 ? null : record.lod);
      if (lod === record.lod) continue;
      record.lod = lod;
      if (record.batch) record.batch.dirty = true;
      else if (record.mesh && lod >= 0) {
        const entry = pieceOf(record.inst);
        record.mesh.geometry = lod === 0 ? entry.lod0 : entry.lod1;
      }
    }
    for (const record of spinners)
      record.mesh.visible = record.lod >= 0 && placeState.get(record.inst.placeId).grounded;
    for (const batch of batches.values()) if (batch.dirty) rewrite(batch);
  }
  function adoptKit() {
    if (disposed) return;
    for (const batch of batches.values()) {
      const entry = batch.kit.get(batch.id);
      batch.meshes[0].geometry = entry.lod0;
      batch.meshes[1].geometry = entry.lod1;
      batch.meshes[0].material = batch.meshes[1].material = batch.kit.materials[entry.material];
      // The atlas carries the colour from now on, except on tinted pieces.
      batch.members.forEach((record, slot) => writeColour(batch, record, slot));
      rewrite(batch);
    }
    for (const record of spinners) {
      const entry = pieceOf(record.inst);
      record.mesh.geometry = record.lod === 0 ? entry.lod0 : entry.lod1;
      record.mesh.material = kitFor(record.inst.kit).materials[entry.material];
    }
    // The kit's own materials changed: their merged twins are made again.
    for (const twin of vertexColourMaterials.values()) twin.dispose();
    vertexColourMaterials.clear();
    for (const group of groups.values()) if (placeState.get(group.place.id).grounded) buildGroup(group);
  }

  let disposed = false;
  tryGround(false);

  return {
    update(dt, playerPosition) {
      if (disposed) return;
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
      clock += step;
      groundTimer += step;
      if (groundTimer >= GROUND_RETRY_SECONDS) {
        groundTimer = 0;
        tryGround(clock >= GROUND_GIVE_UP_SECONDS);
      }
      lodTimer += step;
      const px = playerPosition?.x, pz = playerPosition?.z - storyZOffset();
      if (lodTimer >= LOD_SECONDS && Number.isFinite(px) && Number.isFinite(pz)) {
        lodTimer = 0;
        sortLod(px, pz);
        for (const state of placeState.values()) {
          if (!state.lights.length) continue;
          const on = state.grounded && Math.hypot(state.place.x - px, state.place.z - pz) < LIGHT_RANGE;
          for (const light of state.lights) light.userData.threeRoads.on = on;
        }
      }
      for (const record of spinners) {
        if (!record.mesh.visible) continue;
        record.angle = (record.angle + step * record.inst.spin) % (Math.PI * 2);
        record.mesh.rotation.z = record.inst.roll + record.angle;
      }
      for (const state of placeState.values()) {
        for (const light of state.lights) {
          const data = light.userData.threeRoads;
          const base = data.on ? (data.spec.intensity ?? 4) : 0;
          // Fire flickers; paper lanterns hold steady.
          light.intensity = base && data.spec.flicker
            ? base * (0.86 + 0.09 * Math.sin(clock * 13.1) + 0.05 * Math.sin(clock * 29.7))
            : base;
        }
      }
    },
    resolveCollision(position, from, radius) {
      if (disposed || !position || !solids.length) return false;
      probe.x = position.x; probe.z = position.z - storyZOffset();
      if (!Number.isFinite(probe.x) || !Number.isFinite(probe.z)) return false;
      if (!resolveAgainstGrid(grid, probe, Number.isFinite(radius) ? radius : 0.6,
        Number.isFinite(position.y) ? position.y : -Infinity)) return false;
      position.x = probe.x;
      position.z = probe.z + storyZOffset();
      return true;
    },
    // Test door: window.__gw3dThreeRoads.get('places').status()
    status() {
      let drawCalls = 0, triangles = 0, instances = 0;
      const pieces = new Set();
      for (const batch of batches.values()) {
        pieces.add(batch.key);
        for (const mesh of batch.meshes) {
          if (!mesh.visible || !mesh.count) continue;
          drawCalls++;
          instances += mesh.count;
          triangles += mesh.count * batch.kit.trianglesOf(mesh.geometry);
        }
      }
      for (const group of groups.values()) {
        for (const record of group.members) pieces.add(record.inst.kit + ':' + record.inst.piece);
        const mesh = group.meshes[group.lod];
        if (!mesh?.visible) continue;
        drawCalls++; instances += group.members.length;
        triangles += group.kit.trianglesOf(mesh.geometry);
      }
      for (const record of spinners) {
        pieces.add(record.inst.piece);
        if (!record.mesh.visible) continue;
        drawCalls++; instances++;
        triangles += kitFor(record.inst.kit).trianglesOf(record.mesh.geometry);
      }
      if (groundMesh) { drawCalls++; triangles += painted.triangles; }
      const states = [...placeState.values()];
      return {
        areas: [...areas], places: places.map(place => place.id), preview,
        kit: kits.get('valley')?.source ?? null, kits: Object.fromEntries([...kits].map(([name, k]) => [name, k.source])),
        pieces: pieces.size, instancesTotal: all.length, instances, drawCalls, triangles,
        paintedTriangles: painted.triangles, solids: solids.length,
        lightsOn: states.reduce((n, s) => n + s.lights.filter(light => light.intensity > 0).length, 0),
        grounded: states.filter(state => state.grounded).map(state => state.place.id),
        ready: [...announced],
      };
    },
    // A named point of a place: local and world metres, and the ground under it.
    anchor(placeId, name) {
      const place = placeLayout(placeId);
      const found = place?.anchors?.[name];
      if (!found) return null;
      const x = place.x + found.x, z = place.z + found.z;
      return {
        placeId, name, localX: x, localZ: z,
        x, y: groundOrHeight(x, z), z: z + storyZOffset(), facing: found.facing ?? 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const batch of batches.values()) for (const mesh of batch.meshes) mesh.dispose?.();
      for (const group of groups.values()) for (const mesh of group.meshes) mesh?.geometry.dispose();
      for (const twin of vertexColourMaterials.values()) twin.dispose();
      for (const state of placeState.values()) for (const light of state.lights) light.dispose?.();
      if (groundMesh) { groundMesh.geometry.dispose(); groundMesh.material.dispose(); }
      for (const k of kits.values()) k.dispose();
      batches.clear();
      spinners.length = 0;
    },
  };
}
