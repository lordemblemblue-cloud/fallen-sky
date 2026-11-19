// Natural-zone streaming for Wolfveil, Phase B prototype (behind a flag that
// is OFF by default: WolfveilNaturalZoneFlag.mjs).
//
// The valley stays the legacy zone ("surface", the five-area loader is
// untouched and remains the rollback). The Jade Lantern Grotto becomes two
// zones that are built only when the player commits through an authored
// doorway and are released completely when the player leaves them:
//
//   surface --mouth arch (relocate)--> grotto_hall --stone door (walk)--> grotto_chamber
//
// Each zone is a ZoneRuntime (WolfveilZoneRuntime.mjs) that owns its scene
// objects, geometries + BVHs, materials, textures, audio nodes, timers and
// per-frame updates. The doorway state machine (WolfveilDoorwayStateMachine)
// decides when to build, hand over and release.
//
// GameWorld3D hooks (all no-ops while the player is on the surface, except the
// arch's rock collision): playerGroundY, ceilingY, resolveCollision, isInside,
// safeCheckpoint, cameraRoot (OTS camera collision) and update().
import * as THREE from 'three';
import {createZoneRuntime, zoneRuntimeDiagnostics} from './WolfveilZoneRuntime.mjs';
import {createDoorwayStateMachine} from './WolfveilDoorwayStateMachine.mjs';
import {
  GROTTO_PLAN, planGrottoDoorways, sampleGrottoSpace, resolveGrottoMovement,
  resolveGrottoFacadeCollision, grottoFrameOf,
} from './WolfveilGrottoZonePlan.mjs';
import {WOLFVEIL_PROTOTYPE_ZONE_GRAPH} from './WolfveilZoneGraph.mjs';
import {
  buildGrottoHall, buildGrottoChamber, buildGrottoMouthFacade,
  prefetchGrottoZoneArrays, grottoPrefetchCacheStats,
} from './WolfveilGrottoZoneBuilders.js';

const ZONE_BUILDERS = {grotto_hall: buildGrottoHall, grotto_chamber: buildGrottoChamber};
const RUNTIME_ZONES = Object.keys(ZONE_BUILDERS);

// Phase B.2: scene-level layers of the legacy valley that are created by
// other modules (no reference reaches GameWorld3D). Matched by name; the
// valley group, town, meadow, vortex lake and mountain gates are passed in
// by reference (GameWorld3D's classicWorldRoots).
export const WOLFVEIL_SURFACE_LAYER_NAMES = /^(?:BlazeStreamedBiomeLandscaping|Wolfveil_Classic_Reused_Suigen_Trees_Bamboo_Rocks|Game3D_Clone_AmbientBirds_VisualOnly|SWV_CaveDestinationPortals|AXE World Respawn Shrines|AXE_SilverBlueQuestTrail|WV_Area_Far_\w+|Discovery_\w+)$/;
/**
 * Roots of the valley to stop drawing while the player is inside a sealed
 * zone: the explicit ones plus matching direct children of the scene. Never
 * lights, cameras, the player, or the natural-zone root itself.
 */
export function collectWolfveilSurfaceRoots(scene, explicit = [], {exclude = []} = {}) {
  const skip = new Set(exclude.filter(Boolean));
  const roots = new Set(explicit.filter(Boolean));
  for (const child of scene?.children || [])
    if (WOLFVEIL_SURFACE_LAYER_NAMES.test(child.name || '')) roots.add(child);
  return [...roots].filter(root => !skip.has(root) && !root.isLight && !root.isCamera);
}

function createOcclusionOverlay(container, doc = globalThis.document) {
  if (!container || !doc?.createElement) return null;
  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.dataset.wolfveilZoneSeal = 'true';
  Object.assign(el.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '31', opacity: '0',
    background: 'radial-gradient(ellipse at 50% 55%, rgba(6,9,8,.86) 0%, rgba(3,4,4,.97) 60%, #020302 100%)',
  });
  container.append(el);
  let last = -1;
  return {
    set(value) {
      const v = Math.max(0, Math.min(1, Number(value) || 0));
      if (Math.abs(v - last) < .01) return;
      last = v; el.style.opacity = v.toFixed(3);
    },
    dispose() { el.remove(); },
  };
}

export function createWolfveilNaturalZones({
  scene, offsetZ = 70, container = null, audio = true,
  onNotice = () => {}, onEvent = () => {}, requestShadowUpdate = () => {},
  // The game's ground-ray list: a loaded zone registers its floor and wall
  // meshes there (the exploration camera clips against them and jumps meet
  // the cave roof) and removes them again before it is released.
  addGroundMeshes = () => {}, removeGroundMeshes = () => {},
  // Phase B.2: while the player is inside a sealed zone the legacy valley is
  // not drawn (render suspension: nothing is disposed, raycasts and server
  // state are untouched). `surfaceRoots()` lists what to hide; GameWorld3D
  // bumps the camera-collider revision in `onSurfaceVisibility`.
  surfaceRoots = () => [], onSurfaceVisibility = () => {}, suspendSurface = true,
  options = {},
} = {}) {
  if (!scene?.add) throw new TypeError('Natural zones need the Game 3D scene');
  const root = new THREE.Group();
  root.name = 'WV_NaturalZones';
  root.position.z = offsetZ;
  root.userData.otsCameraRevision = 0;
  scene.add(root);
  const bump = () => { root.userData.otsCameraRevision++; };

  // The doorway's facade: persistent while the flag is on, its own ledger.
  const facadeLedger = createZoneRuntime({id: 'facade:grotto_mouth', root: new THREE.Group(), parent: root});
  buildGrottoMouthFacade(facadeLedger);
  requestShadowUpdate();

  let audioContext = null, ownsAudioContext = false;
  const audioFor = () => {
    if (!audio || globalThis.__gw3dNaturalZonesMute) return null;
    if (!audioContext) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return null;
      try { audioContext = new Ctor(); ownsAudioContext = true; } catch { return null; }
    }
    if (audioContext.state === 'suspended') audioContext.resume?.().catch?.(() => {});
    return audioContext;
  };

  const released = [];          // {id, ref: WeakRef(root), report, at}
  const timings = [];           // load ms per zone build
  let player = null, lastLocal = null, disposed = false;
  // ---- Phase B.2: legacy valley render suspension
  const hidden = new Map();     // root -> it was visible when suspended
  let suspensionEnabled = Boolean(suspendSurface), suspensions = 0, enforced = 0;
  function suspendValley() {
    if (!suspensionEnabled || hidden.size) return 0;
    let list = [];
    try { list = surfaceRoots() || []; } catch { list = []; }
    for (const target of [...list, facadeLedger.root]) {
      if (!target || target === root || hidden.has(target)) continue;
      const wasVisible = target.visible !== false;
      hidden.set(target, wasVisible);
      if (wasVisible) target.visible = false;
    }
    suspensions++;
    try { onSurfaceVisibility(false); } catch { /* cosmetic */ }
    return hidden.size;
  }
  // Something re-showed a root while the player is underground: hide it again.
  function enforceSuspension() {
    for (const [target, wasVisible] of hidden)
      if (wasVisible && target.visible !== false) { target.visible = false; enforced++; }
  }
  function resumeValley() {
    if (!hidden.size) return 0;
    const count = hidden.size;
    for (const [target, wasVisible] of hidden) if (wasVisible) target.visible = true;
    hidden.clear();
    // Shadows were not re-rendered while hidden; casters are back now.
    requestShadowUpdate();
    try { onSurfaceVisibility(true); } catch { /* cosmetic */ }
    return count;
  }
  const zones = {
    surface: {
      kind: 'legacy',
      // LOAD(surface) = draw the valley again (it never left memory).
      load: () => { resumeValley(); return 'legacy'; },
      // UNLOAD(surface) = stop drawing it. Phase B.2 does not dispose the
      // legacy valley; it stays resident for raycasts, server state and AI.
      unload: () => ({legacy: true, resident: true, renderSuspendedRoots: suspendValley()}),
    },
  };
  for (const id of RUNTIME_ZONES) {
    zones[id] = {
      kind: 'runtime',
      prefetch: () => prefetchGrottoZoneArrays(id),
      load() {
        const started = globalThis.performance?.now?.() ?? Date.now();
        const zone = createZoneRuntime({id, root: new THREE.Group(), parent: root});
        try {
          zone.api = ZONE_BUILDERS[id](zone, {audio: audioFor()});
        } catch (error) {
          zone.dispose();
          throw error;
        }
        zone.root.updateMatrixWorld(true);
        const solid = [];
        zone.root.traverse(node => { if (node.isMesh && node.geometry?.boundsTree) solid.push(node); });
        addGroundMeshes(solid);
        zone.onDispose(() => { removeGroundMeshes(solid); solid.length = 0; });
        timings.push({id, ms: +((globalThis.performance?.now?.() ?? Date.now()) - started).toFixed(2)});
        if (timings.length > 120) timings.shift();
        bump();
        return zone;
      },
      verify(zone, anchor) {
        if (!zone || zone.disposed) return 'zone missing';
        if (!anchor) return true;
        return sampleGrottoSpace(anchor.x, anchor.z, {zones: [id], margin: .62}) ? true : 'no floor under the arrival anchor';
      },
      unload(zone) {
        const ref = zone.weakRoot();
        const report = zone.dispose();
        released.push({id, ref, report, at: Date.now()});
        if (released.length > 200) released.shift();
        bump();
        return report;
      },
    };
  }

  const machine = createDoorwayStateMachine({
    doorways: planGrottoDoorways(), zones, initialZone: WOLFVEIL_PROTOTYPE_ZONE_GRAPH.initialZone,
    options,
    hooks: {
      relocate(anchor) {
        if (!player?.position) return false;
        player.position.set(anchor.x, anchor.y + .02, anchor.z + offsetZ);
        if (Number.isFinite(anchor.yaw)) player.rotation.y = anchor.yaw;
        lastLocal = {x: anchor.x, y: anchor.y, z: anchor.z};
        return true;
      },
      onEvent(event) {
        if (event.type === 'commit') {
          const label = WOLFVEIL_PROTOTYPE_ZONE_GRAPH.zones.find(z => z.id === event.to)?.label;
          if (event.to !== 'surface' && label) onNotice(label);
        } else if (event.type === 'blocked') {
          onNotice(event.reason === 'mounted' ? 'Dismount to enter the grotto' : 'Land first to enter the grotto');
        } else if (event.type === 'load-failed') {
          onNotice('The way into the grotto is blocked');
        }
        try { onEvent(event); } catch { /* listener errors never break travel */ }
      },
    },
  });
  const overlay = createOcclusionOverlay(container);

  const loadedRuntime = () => machine.loadedZones().filter(id => zones[id]?.kind === 'runtime');
  const innerDoorOpen = () => machine.doorOpen('grotto_inner');
  const isInside = () => !disposed && zones[machine.activeZone]?.kind === 'runtime';
  const toLocal = position => ({x: Number(position.x), y: Number(position.y), z: Number(position.z) - offsetZ});

  function update(dt, {player: actor = null, mounted = false, airborne = false} = {}) {
    if (disposed) return null;
    player = actor || player;
    if (!player?.position) return null;
    const local = toLocal(player.position);
    // Respawn, teleport or reconnect away from the cave: leave every zone.
    if (isInside() && !machine.transition) {
      const space = sampleGrottoSpace(local.x, local.z, {zones: loadedRuntime(), margin: -3, doorOpen: true});
      if (!space || local.y > space.ceilingY + 6 || local.y < space.floorY - 8) machine.evict('surface', 'left-zone');
    }
    const frame = machine.update(dt, {position: local, mounted, airborne});
    lastLocal = local;
    if (hidden.size) enforceSuspension();
    const open = innerDoorOpen();
    for (const id of loadedRuntime()) {
      const zone = machine.handle(id);
      zone?.api?.setDoor?.(open);
      zone?.update(dt, {player: local});
    }
    overlay?.set(frame.occlusion);
    return frame;
  }
  function playerGroundY(position) {
    if (!isInside() || !position) return null;
    const p = toLocal(position);
    const space = sampleGrottoSpace(p.x, p.z, {zones: loadedRuntime(), doorOpen: innerDoorOpen() > 0});
    return space ? space.floorY : null;
  }
  function ceilingY(position) {
    if (!isInside() || !position) return null;
    const p = toLocal(position);
    const space = sampleGrottoSpace(p.x, p.z, {zones: loadedRuntime(), doorOpen: innerDoorOpen() > 0});
    return space ? space.ceilingY - .15 : null;
  }
  /** WORLD positions (like resolveBuildingCollision). Mutates `position`. */
  function resolveCollision(position, previous, radius = .62) {
    if (disposed || !position || !previous) return false;
    const p = toLocal(position), q = toLocal(previous);
    let pushed;
    if (isInside()) {
      // Only a fully open inner door lets a body through.
      pushed = resolveGrottoMovement(p, q, {zones: loadedRuntime(), radius, doorOpen: innerDoorOpen() >= .98});
    } else {
      pushed = resolveGrottoFacadeCollision(p, radius);
    }
    if (pushed) { position.x = p.x; position.z = p.z + offsetZ; }
    return pushed;
  }
  /** Where a save made inside the grotto should put the player back. */
  function safeCheckpoint() {
    if (!isInside()) return null;
    const a = GROTTO_PLAN.anchors.outside;
    return {x: a.x, y: a.y + .05, z: a.z + offsetZ};
  }
  function liveReleasedRoots() {
    return released.filter(entry => entry.ref?.deref?.() !== undefined).map(entry => entry.id);
  }
  function stats() {
    const loaded = machine.loadedZones();
    return {
      enabled: true, state: machine.state, active: machine.activeZone, inside: isInside(),
      transition: machine.transition, loaded,
      zones: Object.fromEntries(loaded.filter(id => zones[id].kind === 'runtime')
        .map(id => [id, machine.handle(id)?.stats?.() ?? null])),
      facade: facadeLedger.stats(),
      counters: machine.counters(),
      released: released.length,
      releasedStillReachable: liveReleasedRoots().length,
      lastReport: released.at(-1)?.report ?? null,
      loadMs: timings.slice(-6),
      prefetch: grottoPrefetchCacheStats(),
      runtimes: zoneRuntimeDiagnostics(),
      surface: {suspensionEnabled, suspended: hidden.size > 0, hiddenRoots: hidden.size, suspensions, reshownWhileHidden: enforced},
      position: lastLocal && {...grottoFrameOf(lastLocal.x, lastLocal.z), y: lastLocal.y},
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    machine.dispose();
    resumeValley(); // never leave the valley hidden behind an unmounted controller
    facadeLedger.dispose();
    overlay?.dispose();
    root.parent?.remove(root);
    if (ownsAudioContext) audioContext?.close?.().catch?.(() => {});
    audioContext = null;
  }
  return {
    root, cameraRoot: root, update, playerGroundY, ceilingY, resolveCollision, isInside, safeCheckpoint,
    stats, history: () => machine.history(), machine, dispose, liveReleasedRoots,
    /** Phase B.2 switch (measurements, rollback): suspend the valley underground or not. */
    setSurfaceSuspension(enabled) {
      suspensionEnabled = Boolean(enabled);
      if (!suspensionEnabled) resumeValley();
      else if (isInside()) suspendValley();
      return suspensionEnabled;
    },
    get state() { return machine.state; },
    get activeZone() { return machine.activeZone; },
  };
}
