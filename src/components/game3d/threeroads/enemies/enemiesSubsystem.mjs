// Enemies of The War of Three Roads: groups of monsters put on the ground at
// a place, fought by the game's own combat.
//
// Each monster is an ordinary entry of GameWorld3D's `enemies` list, shaped
// like the entries GameWorld3D.jsx (spawn table) and WolfveilZombieHordeRuntime
// create, so the game's one AI loop, attack telegraphs, health bars, lock-on
// and kill path run it. This subsystem only creates, watches and removes them.
//
// Flags on every entry, and why (BUILD_RULES section 10: the browser grants
// nothing of value):
//   wolfveilVisualSpawn: true   the AI loop plays the entry's own attackClip
//                               and the main kill path its own deathClip; the
//                               kill path then skips the peer kill broadcast and
//                               every reward (title kill, gold, score, XP,
//                               old-quest credit, axeRuntimeEnemyDefeated), and
//                               a peer's replayed kill ignores the entry.
//   dungeonTrainingSpawn: true  a second lock on the same reward branch.
//   xpReward: 0                 nothing to hand out if a path ignores the flags.
//   isQuestSpawn: (not set)     it would swap the kind's AI profile for the
//                               quest profile and dispose the clone's SHARED
//                               geometry at the end of the fade. Instead this
//                               subsystem clears `respawnAt` every frame on its
//                               dying entries (the kill path sets 10 s; this
//                               runs first on the next frame) and removes the
//                               body itself once the fade is done.
//   wolfveilZombieCampSpawn: (not set)  alone it grants experience, and it
//                               makes attacks ignore the tier.
// The legacy targeted spells and companion abilities ignore all flags; see
// docs/game3d/three-empires/build-notes/ENEMIES.md.
//
// Bus: listens for enemies:spawnGroup / enemies:despawnGroup; announces
// enemies:defeated / enemies:groupCleared. Also tells the pledges (window
// 'axePledgeEvent', never 'axeQuestEvent': the older kill quests must not
// count these; PLEDGE_ENGINE.md section 5) with { type: 'enemy_killed',
// targetId: groupId, placeId (only when the request had one), kind, tier,
// count: 1 }.
//
// A group asked for with `passive: true` is scenery that looks like a
// monster: it is never put in the game's enemy list, so the AI loop, combat,
// lock-on and health bars never see it; it stands where it is put, idles,
// cannot be hurt, reports no deaths, and goes only on enemies:despawnGroup
// (or dispose). It still counts against the limit of 12 animated bodies.
import * as THREE from 'three';
import { getAXEEnemyStats } from '../../axe/balance/AXEPowerBudget.js';
import { createSharedSkinnedFBXSpawner } from '../../performance/SharedSkinnedFBXSpawner.mjs';
import { ENEMY_KINDS, ENEMY_TIERS, ENEMY_TIER_SCALE, INK_LOOK } from './enemyKinds.mjs';
import { planGroupPositions } from './enemyPlacement.mjs';
import { createEnemyGroupWatcher } from './enemyGroupWatcher.mjs';

export const MAX_THREE_ROADS_ENEMIES = 12;
export const MAX_GROUP_RADIUS = 40;
export const ENEMY_LEVEL_CAP = 155;
const RING_COLOR = Object.freeze({ normal: 0xff3030, champion: 0xcc00ff, elite: 0xff6600 });
const CLIP_ROLES = Object.freeze(['idle', 'walk', 'run', 'attack', 'dying', 'death']);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// One parse per clip url per world.
function createClipLoader(loader) {
  const cache = new Map();
  return (url, label) => {
    if (!url || !loader?.load) return Promise.resolve(null);
    if (!cache.has(url)) {
      cache.set(url, new Promise(resolve => {
        loader.load(url, fbx => resolve(fbx?.animations?.[0] || null), undefined, error => {
          globalThis.console?.warn('Three Roads enemy clip ' + label + ' could not be loaded', error);
          resolve(null);
        });
      }));
    }
    return cache.get(url);
  };
}

// Default model source of a kind: its asset list, one shared skinned FBX
// spawner (one download and parse, cloned skeletons, two clones per frame) and
// its clips. `ready` resolves to the clips by role (null where missing).
function createDefaultKindSource(kind, { fbxLoader, loadClip }) {
  let spawner = null;
  let disposed = false;
  const ready = Promise.resolve().then(() => kind.loadAssets()).then(async assets => {
    if (disposed) return null;
    spawner = createSharedSkinnedFBXSpawner(fbxLoader, assets.model);
    void spawner.warm().catch(() => {});
    const clips = {};
    await Promise.all(CLIP_ROLES.map(async role => {
      clips[role] = assets.clips[role] ? await loadClip(assets.clips[role], kind.id + ' ' + role) : null;
    }));
    return clips;
  });
  return {
    ready,
    spawn(onLoaded, onError) {
      ready.then(() => {
        if (disposed || !spawner) return;
        spawner.spawn(onLoaded, onError);
      }, onError);
    },
    dispose() { disposed = true; spawner?.dispose(); },
  };
}

function createDefaultPlayerLevel() {
  let hud = null;
  const ready = import('../../playerHUDStore.jsx').then(m => { hud = m; }).catch(() => null);
  return { ready, get: () => Number(hud?.getPlayerHUD?.()?.level) || 1 };
}

const dispatchWindowQuestEvent = detail => {
  const win = globalThis.window;
  if (!win?.dispatchEvent || typeof globalThis.CustomEvent !== 'function') return;
  win.dispatchEvent(new globalThis.CustomEvent('axePledgeEvent', { detail }));
};

// Scale a model so it stands kind.height × tier scale tall. A model whose
// box is wider than tall (arms out, lying) is measured by its largest side.
function standModel(model, kind, tier) {
  model.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const height = size.y > maxDim * 0.6 ? size.y : maxDim;
  const scale = Number.isFinite(height) && height > 1e-4
    ? (kind.height * (ENEMY_TIER_SCALE[tier] || 1)) / height : 1;
  model.scale.setScalar(scale);
  return scale;
}

// Some rigs arrive split into many draw groups (the legacy creature: 101
// groups over 2 materials, so 101 draw calls per monster). Re-index the
// triangles material by material: one group per material, or none when the
// whole body takes one material (the ink look). The vertex attributes are
// shared with the source, nothing is copied but the index. Built once per
// source geometry (every clone shares it) and never disposed while the world
// runs, like the source geometry itself.
const collapsedGeometries = new WeakMap();
export function collapseDrawGroups(geometry, { single = false } = {}) {
  const groups = geometry?.groups || [];
  if (groups.length <= 1 && !(single && groups.length)) return geometry;
  const key = single ? 'single' : 'byMaterial';
  let cached = collapsedGeometries.get(geometry);
  if (cached?.[key]) return cached[key];
  const source = geometry.index ? geometry.index.array : null;
  const total = groups.reduce((n, g) => n + Math.max(0, Math.min(g.count, (source ? source.length : geometry.attributes.position.count) - g.start)), 0);
  const vertexCount = geometry.attributes.position.count;
  const index = vertexCount > 65535 ? new Uint32Array(total) : new Uint16Array(total);
  const ordered = [...groups].sort((a, b) => (a.materialIndex || 0) - (b.materialIndex || 0) || a.start - b.start);
  const out = new THREE.BufferGeometry();
  let at = 0;
  let groupStart = 0;
  let currentMaterial = null;
  for (const g of ordered) {
    const material = g.materialIndex || 0;
    if (!single && currentMaterial !== null && material !== currentMaterial) {
      out.addGroup(groupStart, at - groupStart, currentMaterial);
      groupStart = at;
    }
    currentMaterial = material;
    const end = Math.min(g.start + g.count, source ? source.length : vertexCount);
    for (let i = g.start; i < end; i++) index[at++] = source ? source[i] : i;
  }
  if (!single && currentMaterial !== null) out.addGroup(groupStart, at - groupStart, currentMaterial);
  out.setIndex(new THREE.BufferAttribute(index, 1));
  for (const name of Object.keys(geometry.attributes)) out.setAttribute(name, geometry.attributes[name]);
  out.morphAttributes = geometry.morphAttributes;
  out.morphTargetsRelative = geometry.morphTargetsRelative;
  if (geometry.boundingBox) out.boundingBox = geometry.boundingBox.clone();
  if (geometry.boundingSphere) out.boundingSphere = geometry.boundingSphere.clone();
  out.name = (geometry.name || 'geometry') + '_threeRoadsGroups';
  cached = cached || {};
  cached[key] = out;
  collapsedGeometries.set(geometry, cached);
  return out;
}

function dressModel(model, kind) {
  const tintMaterials = [];
  const ink = kind.look === 'ink' ? new THREE.MeshStandardMaterial({
    color: INK_LOOK.color, roughness: INK_LOOK.roughness, metalness: INK_LOOK.metalness,
  }) : null;
  if (ink) { ink.name = 'ThreeRoads_Ink_' + kind.id; tintMaterials.push(ink); }
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = !node.isSkinnedMesh;
    node.receiveShadow = true;
    // Skinned bounds follow the bind pose, not the animation: never cull.
    if (node.isSkinnedMesh) node.frustumCulled = false;
    if (!node.material) return;
    if (ink) {
      // One (non-array) material draws the whole body in one call, whatever
      // groups the geometry has.
      node.material = ink;
      return;
    }
    if (Array.isArray(node.material)) node.geometry = collapseDrawGroups(node.geometry);
    // Each monster fades on its own: its own copies of the materials.
    node.material = Array.isArray(node.material)
      ? node.material.map(m => m.clone()) : node.material.clone();
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) tintMaterials.push(m);
  });
  return tintMaterials;
}

export function createEnemiesSubsystem(ctx, deps = {}) {
  if (!ctx?.scene?.add || !Array.isArray(ctx.enemies)) return null;
  const { scene, enemies } = ctx;
  const bus = ctx.bus || { on: () => () => {}, emit: () => {} };
  const kinds = deps.kinds || ENEMY_KINDS;
  const maxAlive = deps.maxAlive || MAX_THREE_ROADS_ENEMIES;
  const loadClip = deps.loadClip || createClipLoader(ctx.fbxLoader);
  const makeKindSource = deps.createKindSource
    || (kind => createDefaultKindSource(kind, { fbxLoader: ctx.fbxLoader, loadClip }));
  const playerLevel = deps.playerLevel || createDefaultPlayerLevel();
  const enemyStats = deps.enemyStats || getAXEEnemyStats;
  const warn = deps.warn || ((...args) => globalThis.console?.warn(...args));
  const watcher = createEnemyGroupWatcher({
    emit: (type, detail) => bus.emit(type, detail),
    dispatchQuestEvent: deps.dispatchQuestEvent || dispatchWindowQuestEvent,
  });

  const sources = new Map();        // kind id -> kind source
  const mine = [];                  // every entry this subsystem put in `enemies`
  const pendingByGroup = new Map(); // groupId -> monsters asked for, not yet made
  const groupMeta = new Map();      // groupId -> meta of open groups
  let pending = 0;
  let passiveCount = 0;             // passive bodies standing in the scene
  let disposed = false;
  let spawnSerial = 0;

  const sourceFor = kind => {
    if (!sources.has(kind.id)) sources.set(kind.id, makeKindSource(kind));
    return sources.get(kind.id);
  };
  const aliveCount = () => watcher.aliveCount() + pending + passiveCount;
  const resolveLevel = asked => (asked === 'player' || asked === undefined || asked === null
    ? clamp(Math.floor(playerLevel.get()), 1, ENEMY_LEVEL_CAP)
    : clamp(Math.floor(Number(asked) || 1), 1, ENEMY_LEVEL_CAP));

  function buildEntry(model, kind, meta, spot, index, clips) {
    const tier = meta.tier;
    const scale = standModel(model, kind, tier);
    const tintMaterials = dressModel(model, kind);
    // The hostile ring marks something to fight; a passive figure has none.
    let ringGeometry = null;
    let ringMaterial = null;
    if (!meta.passive) {
      ringGeometry = new THREE.RingGeometry(0.7 / scale, 0.9 / scale, 24);
      ringMaterial = new THREE.MeshBasicMaterial({
        color: RING_COLOR[tier] || RING_COLOR.normal, side: THREE.DoubleSide,
        transparent: true, opacity: 0.55, depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.name = 'ThreeRoads_Enemy_Ring';
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02 / scale;
      model.add(ring);
    }
    model.name = 'ThreeRoads_Enemy_' + meta.groupId + '_' + index;
    model.position.set(spot.x, spot.y, spot.z);
    model.rotation.y = Math.atan2(spot.x - meta.x, spot.z - meta.z) + ((index * 1.7) % 1.2) - 0.6;
    scene.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const derived = enemyStats(meta.level, tier);
    const entry = {
      id: 'tr_' + meta.groupId + '_' + index + '_' + (++spawnSerial),
      name: kind.name,
      group: model,
      mixer,
      walkAction: null, runAction: null, idleAction: null,
      attackClip: clips?.attack || null,
      // The main kill path plays deathClip (wolfveilVisualSpawn). For a kind
      // with two death clips it is the first; update() chains the second.
      deathClip: (kind.deathChain ? clips?.dying : null) || clips?.death || clips?.dying || null,
      hitClip: null, dodgeClip: null,
      state: 'idle',
      stateTimer: (index % 5) * 0.4,
      target: null,
      alive: true,
      dying: false,
      hitCooldown: 0,
      tintMaterials,
      zoneCenter: [meta.x, 0, meta.z],
      zoneRadius: meta.radius,
      home: [spot.x, spot.y, spot.z],
      respawnAt: null,
      tier,
      level: meta.level,
      hp: derived.maxHP,
      maxHp: derived.maxHP,
      derived,
      xpReward: 0,
      wolfveilVisualSpawn: true,
      dungeonTrainingSpawn: true,
      authoritativeServerSpawnVerified: false,
      attackCooldown: 0.4 + (index % 6) * 0.25,
      aiProfile: kind.aiProfile,
      attacking: false,
      attackWindupTimer: 0,
      thinkInterval: 0.3 + (index % 5) * 0.2,
      thinkTimer: (index % 4) * 0.2,
      speedJitter: 0.85 + (index % 7) * 0.045,
      idleVariance: 0.8 + (index % 3) * 0.2,
      walkVariance: 0.8 + (index % 4) * 0.15,
      // This subsystem's own bookkeeping.
      threeRoads: {
        groupId: meta.groupId, kind: kind.id, placeId: meta.placeId, passive: !!meta.passive,
        finalDeathClip: kind.deathChain && clips?.dying ? clips?.death || null : null,
        ringGeometry, ringMaterial, deathSeen: false, deathChained: false, released: false,
      },
    };
    if (clips) {
      if (clips.idle) entry.idleAction = mixer.clipAction(clips.idle);
      if (clips.run) {
        entry.runAction = mixer.clipAction(clips.run);
        entry.runAction.setEffectiveTimeScale(kind.clipSpeed.run);
      }
      const walk = clips.walk || clips.run?.clone() || null;
      if (walk) {
        entry.walkAction = mixer.clipAction(walk);
        entry.walkAction.setEffectiveTimeScale(kind.clipSpeed.walk);
      }
      entry.idleAction?.reset().fadeIn(0.2).play();
    }
    return entry;
  }

  function release(entry) {
    const own = entry.threeRoads;
    if (!own || own.released) return;
    own.released = true;
    if (own.passive) passiveCount = Math.max(0, passiveCount - 1);
    const at = enemies.indexOf(entry);
    if (at !== -1) enemies.splice(at, 1);
    const mineAt = mine.indexOf(entry);
    if (mineAt !== -1) mine.splice(mineAt, 1);
    entry.alive = false;
    entry.dying = false;
    entry.attacking = false;
    entry.respawnAt = null;
    entry.mixer?.stopAllAction();
    entry.mixer?.uncacheRoot(entry.group);
    entry.group?.parent?.remove(entry.group);
    // Only what this subsystem made: the per-monster materials and the ring.
    // The skinned geometry is shared with the other clones of the kind.
    for (const m of new Set(entry.tintMaterials)) m?.dispose?.();
    own.ringGeometry?.dispose();
    own.ringMaterial?.dispose();
  }

  function spawnGroup(detail = {}) {
    if (disposed) return { ok: false, reason: 'disposed' };
    const kind = hasOwn(kinds, detail?.kind) ? kinds[detail.kind] : null;
    const groupId = detail?.groupId === undefined || detail?.groupId === null ? '' : String(detail.groupId);
    if (!groupId) return { ok: false, reason: 'no groupId' };
    if (!kind) return { ok: false, reason: 'unknown kind ' + detail?.kind };
    if (watcher.isLive(groupId) || groupMeta.get(groupId)?.passive)
      return { ok: false, reason: 'group is live' };
    const passive = detail.passive === true;
    const x = Number(detail.x), z = Number(detail.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: 'no point' };
    const asked = clamp(Math.floor(Number(detail.count) || 1), 1, maxAlive);
    const room = maxAlive - aliveCount();
    if (room <= 0) {
      warn('Three Roads enemies: ' + maxAlive + ' monsters already in the scene; group ' + groupId + ' not placed');
      return { ok: false, reason: 'limit' };
    }
    const radius = clamp(Number(detail.radius) || 8, 3, MAX_GROUP_RADIUS);
    const spots = planGroupPositions({
      x, z, radius, count: Math.min(asked, room), sampleGroundY: ctx.sampleGroundY, seed: groupId,
    });
    if (!spots.length) return { ok: false, reason: 'no standable ground' };
    // A cleared group of the same id may still have bodies fading: forget it.
    if (groupMeta.has(groupId)) {
      watcher.closeGroup(groupId);
      // Its last bodies are still fading: they belong to no group now.
      for (const entry of mine) if (entry.threeRoads.groupId === groupId) entry.threeRoads.groupId = null;
    }
    const tier = ENEMY_TIERS.includes(detail.tier) ? detail.tier : kind.defaultTier;
    const askedLevel = detail.level ?? 'player';
    const meta = {
      groupId, kind: kind.id, tier, placeId: detail.placeId ?? null, passive,
      x, z, radius, askedLevel, level: resolveLevel(askedLevel),
    };
    groupMeta.set(groupId, meta);
    if (!passive) watcher.openGroup(meta, spots.length);
    pending += spots.length;
    pendingByGroup.set(groupId, spots.length);
    const source = sourceFor(kind);
    const current = () => !disposed && groupMeta.get(groupId) === meta;
    const settle = () => {
      pending = Math.max(0, pending - 1);
      pendingByGroup.set(groupId, Math.max(0, (pendingByGroup.get(groupId) || 0) - 1));
    };
    // The player's level is read once the HUD store and the clips are ready.
    Promise.all([source.ready, playerLevel.ready]).then(([clips]) => {
      if (!current()) return;
      if (askedLevel === 'player') meta.level = resolveLevel('player');
      spots.forEach((spot, index) => {
        source.spawn(model => {
          if (!current()) return;
          settle();
          let entry = null;
          try { entry = buildEntry(model, kind, meta, spot, index, clips); } catch (error) {
            warn('Three Roads enemies: could not build a ' + kind.id, error);
            model?.parent?.remove(model);
            watcher.dropPlanned(groupId);
            return;
          }
          mine.push(entry);
          if (passive) { passiveCount += 1; return; }
          enemies.push(entry);
          watcher.addEntry(groupId, entry);
        }, error => {
          if (!current()) return;
          settle();
          warn('Three Roads enemies: ' + kind.id + ' model unavailable', error);
          watcher.dropPlanned(groupId);
        });
      });
    }, error => {
      if (!current()) return;
      warn('Three Roads enemies: ' + kind.id + ' assets unavailable', error);
      for (let i = 0; i < spots.length; i++) { settle(); watcher.dropPlanned(groupId); }
    });
    return { ok: true, groupId, placed: spots.length, asked: Number(detail.count) || 1 };
  }

  function despawnGroup(groupId) {
    const id = String(groupId ?? '');
    if (!groupMeta.has(id)) return false;
    groupMeta.delete(id);
    watcher.closeGroup(id);
    pending = Math.max(0, pending - (pendingByGroup.get(id) || 0));
    pendingByGroup.delete(id);
    for (let i = mine.length - 1; i >= 0; i--) {
      if (mine[i].threeRoads.groupId === id) release(mine[i]);
    }
    return true;
  }

  // Make sure the monster falls with its own death clip whatever killed it:
  // the legacy spell and companion paths play the creature's clip on every
  // rig and leave the run clip running.
  function ownDeath(entry) {
    const own = entry.threeRoads;
    if (!own.deathSeen) {
      own.deathSeen = true;
      const clip = entry.deathClip;
      if (clip && entry.mixer && entry.deathAction?.getClip?.() !== clip) {
        entry.mixer.stopAllAction();
        const action = entry.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset().play();
        entry.deathAction = action;
      }
    }
    // Two-stage death (the owner's zombie): Dying, then Death.
    if (own.finalDeathClip && !own.deathChained && entry.mixer) {
      const first = entry.deathAction?.getClip?.();
      const length = Math.min(1.3, Math.max(0.45, (Number(first?.duration) || 1.5) * 0.72));
      if ((Number(entry.deathTimer) || 0) >= length) {
        own.deathChained = true;
        entry.deathAction?.fadeOut(0.16);
        const action = entry.mixer.clipAction(own.finalDeathClip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset().fadeIn(0.16).play();
        entry.deathAction = action;
      }
    }
  }

  const offSpawn = bus.on('enemies:spawnGroup', detail => { spawnGroup(detail); });
  const offDespawn = bus.on('enemies:despawnGroup', detail => { despawnGroup(detail?.groupId); });

  return {
    update(dt) {
      if (disposed) return;
      const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
      for (let i = mine.length - 1; i >= 0; i--) {
        const entry = mine[i];
        if (entry.threeRoads.passive) {
          // Not in the game's list: nothing else animates it.
          entry.mixer?.update(step);
          continue;
        }
        if (entry.dying) {
          entry.respawnAt = null; // never back: the kill path set 10 s
          ownDeath(entry);
          if (entry.deathFinalized) release(entry);
        } else if (entry.alive === false || enemies.indexOf(entry) === -1) {
          // Finished, or taken out of the list by someone else.
          release(entry);
        }
      }
      // Released entries are no longer in `enemies`, so a death this frame is
      // still seen: as dying or as gone.
      watcher.scan(enemies);
      // Forget a cleared group once its last body is gone, so its id can be
      // asked for again.
      for (const id of groupMeta.keys()) {
        const group = watcher.getGroup(id);
        if (groupMeta.get(id).passive || (group && !group.cleared)) continue;
        let bodies = false;
        for (let i = 0; i < mine.length && !bodies; i++) bodies = mine[i].threeRoads.groupId === id;
        if (bodies) continue;
        watcher.closeGroup(id);
        groupMeta.delete(id);
        pendingByGroup.delete(id);
      }
    },
    spawnGroup,
    despawnGroup,
    status() {
      const groups = [];
      for (const [id, meta] of groupMeta) {
        const group = watcher.getGroup(id);
        groups.push({
          groupId: id, kind: meta.kind, tier: meta.tier, placeId: meta.placeId, level: meta.level,
          passive: !!meta.passive,
          planned: group?.planned ?? 0, made: group?.entries.length ?? 0,
          defeated: group?.defeated ?? 0, cleared: !!group?.cleared,
          pending: pendingByGroup.get(id) || 0,
        });
      }
      return {
        max: maxAlive, alive: watcher.aliveCount(), passive: passiveCount, pending, inScene: mine.length,
        kinds: Object.keys(kinds), groups, ids: mine.map(e => e.id),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offSpawn?.();
      offDespawn?.();
      for (let i = mine.length - 1; i >= 0; i--) release(mine[i]);
      mine.length = 0;
      watcher.clear();
      groupMeta.clear();
      pendingByGroup.clear();
      pending = 0;
      passiveCount = 0;
      for (const source of sources.values()) {
        try { source.dispose?.(); } catch { /* already gone */ }
      }
      sources.clear();
    },
  };
}
