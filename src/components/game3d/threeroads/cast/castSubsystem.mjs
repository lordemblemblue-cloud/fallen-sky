// Cast: the people of The War of Three Roads in the current scene.
//
// - Everyone with a `home` in this scene's area (script/cast.mjs) is brought in and
//   stood on clear, flat ground within 6 m of that home, once the ground has loaded
//   (castPlacement.mjs). With ?wholeWorld=1 (ctx.areaScenes false) every area's people.
// - Each wears a clone of a rig the game already ships (castModels.mjs), scaled to
//   their height, tinted with their two colours, playing an idle.
// - People with `giver: true` are pushed into ctx.questNPCs in the shape GameWorld3D
//   builds for its five archers, so its own "Speak with ..." prompt, quest marker,
//   click target and map dot work for them unchanged. GameWorld3D advances those
//   entries' mixers itself (GameWorld3D.jsx questNPCs loop), so this file does not.
// - They act on the bus (BUILD_RULES.md section 4): cast:spawn, cast:despawn,
//   cast:moveTo, cast:follow, cast:say; they announce cast:ready and cast:arrived.
// - At most CAST_MAX_PEOPLE in a scene; dispose() removes and frees everything and
//   takes this file's entries back out of ctx.questNPCs.
// - Test door (only exists with ?threeRoads=1): window.__gw3dThreeRoads.get('cast')
//   has spawn, despawn, moveTo, follow, say and status().
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { THREE_ROADS_CAST, threeRoadsCastAtHome, threeRoadsPerson } from '../script/cast.mjs';
import { localToWorld } from '../coords.mjs';
import { pickAXEEmbeddedIdleClip } from '../../npc/axeAnimatedQuestNpcGLB.mjs';
import { playPledgeLine } from '../../pledges/voice/pledgeVoice.mjs';
import {
  townObstacles, makeBlockedTest, findStandingSpot, clearDestination, CAST_FOOT_RADIUS,
} from './castPlacement.mjs';
import { planWalk } from './castPath.mjs';
import {
  stepToward, steerAround, followGoal, followSpeed, turnToward, headingTo, shouldGreet,
  walkTimeScale, CAST_WALK_SPEED, CAST_TURN_RATE, CAST_FOLLOW_DISTANCE,
} from './castMotion.mjs';
import { captionSeconds, captionOpacity, captionDistanceFade } from './castCaption.mjs';
import { createCaptionView } from './castCaptionView.mjs';
import { CAST_MODEL_SOURCES, castModelFor, distinctColours } from './castModels.mjs';

export const CAST_MAX_PEOPLE = 8;
export const CAST_AREAS = Object.freeze([...new Set(
  THREE_ROADS_CAST.filter(person => person.home?.area).map(person => person.home.area))]);

const PLACE_EVERY = 0.25; // seconds between placement attempts (one person each)
const REGROUND_EVERY = 1;  // seconds between ground re-checks of people standing still
const WALK_GROUND_EVERY = 0.1;

// ─── Model sources: one download and parse per source per scene ───
let configModule = null;
async function resolveRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('config:')) return ref || null;
  configModule ||= import('../../gameWorldConfig.jsx');
  const config = await configModule;
  const key = ref.slice('config:'.length);
  return config[key] ?? config.ANIMATION_URLS?.[key] ?? null;
}
const loadWith = (loader, url) => new Promise((resolve, reject) => {
  if (!loader?.load || !url) { reject(new Error('No loader or URL for ' + url)); return; }
  loader.load(url, resolve, undefined, reject);
});
const firstClip = (loader, ref) => resolveRef(ref)
  .then(url => (url ? loadWith(loader, url) : null))
  .then(object => object?.animations?.[0] || null, () => null);

async function defaultLoadSource(key, def, ctx) {
  if (!def) throw new Error('Unknown cast model source ' + key);
  const url = await resolveRef(def.url);
  if (def.kind === 'fbx') {
    const [model, idleClip, walkClip] = await Promise.all([
      loadWith(ctx.fbxLoader, url), firstClip(ctx.fbxLoader, def.idle), firstClip(ctx.fbxLoader, def.walk),
    ]);
    return {
      scene: model, idleClip, walkClip, format: 'fbx', url,
      walkClipSpeed: def.walkClipSpeed, tint: def.tint, tintMeshes: def.tintMeshes || null,
    };
  }
  const gltf = await loadWith(ctx.gltfLoader, url);
  const clips = gltf?.animations || [];
  return {
    scene: gltf?.scene || gltf?.scenes?.[0], idleClip: pickAXEEmbeddedIdleClip(clips),
    walkClip: clips.find(c => /walk/i.test(c.name)) || clips.find(c => /run/i.test(c.name)) || null,
    format: 'glb', url, walkClipSpeed: def.walkClipSpeed || CAST_WALK_SPEED, tint: def.tint || 'multiply',
  };
}

// A run clip with the hips' forward travel taken out, so a person walks on the spot
// the subsystem moves.
function inPlace(clip) {
  if (!clip) return null;
  const copy = clip.clone();
  for (const track of copy.tracks) {
    if (!/hips\.position$/i.test(track.name)) continue;
    const v = track.values;
    for (let i = 0; i + 2 < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
  }
  return copy;
}

// The archer FBX comes in with one copy of its skeleton per mesh (Body, Clothes,
// Eyes and Eyelashes each bound to their own nested `mixamorigHips` chain). A mixer
// on the model drives only the first bone of each name it finds, so three of the
// four meshes would stand frozen. Rebind every mesh to those first-found bones (the
// same depth-first search PropertyBinding uses), once, on the template.
export function unifySkeletons(THREE_, model) {
  const firstByName = new Map();
  model.traverse(node => { if (node !== model && node.name && !firstByName.has(node.name)) firstByName.set(node.name, node); });
  let rebound = 0;
  model.traverse(node => {
    if (!node.isSkinnedMesh || !node.skeleton) return;
    const bones = node.skeleton.bones.map(bone => firstByName.get(bone.name) || bone);
    if (bones.every((bone, i) => bone === node.skeleton.bones[i])) return;
    node.bind(new THREE_.Skeleton(bones, node.skeleton.boneInverses), node.bindMatrix);
    rebound++;
  });
  return rebound;
}

function disposeObjectTree(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object?.traverse?.(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const m of [].concat(node.material || [])) materials.add(m);
    if (node.isSkinnedMesh) node.skeleton?.dispose?.();
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    m.dispose?.();
  }
  for (const t of textures) t.dispose?.();
  for (const g of geometries) g.dispose?.();
}

// VOICE: the one place a cast line's recording is played. pledgeVoice.mjs shows the
// caption text through its own callback (unused here: the caption is drawn over the
// head) and plays /game3d/voice/pledges/<file> when voiceIndex.json lists the line.
const defaultPlayVoice = (lineId, options) => (lineId ? playPledgeLine(lineId, options) : null);

export function createCastSubsystem(ctx, deps = {}) {
  if (!ctx || ctx.region !== 'wolfveil' || !ctx.scene) return null;
  const warn = deps.warn || ((...args) => globalThis.console?.warn(...args));
  const loadSource = deps.loadSource || defaultLoadSource;
  const playVoice = deps.playVoice || defaultPlayVoice;
  const scene = ctx.scene;
  const bus = ctx.bus;

  const root = new THREE.Group();
  root.name = 'ThreeRoadsCast';
  root.userData.threeRoadsCast = true;
  scene.add(root);

  const obstacles = townObstacles();
  const blocked = makeBlockedTest(obstacles);
  const ringGeometry = new THREE.RingGeometry(0.7, 0.95, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.7,
  });
  const captionGeometry = new THREE.PlaneGeometry(1, 1);

  const actors = new Map();
  const actorList = []; // the same people, for allocation-free iteration each frame
  const templates = new Map();
  const offs = [];
  let disposed = false;
  let placeTimer = PLACE_EVERY; // first attempt on the first frame
  let regroundTimer = 0;
  const step = { x: 0, z: 0, heading: 0, remaining: 0, arrived: false };
  const steer = { x: 0, z: 0, heading: 0, blocked: false };
  const goal = { x: 0, z: 0, gap: 0 };

  const groundAt = (x, z, feetY) => {
    const y = ctx.sampleGroundY?.(x, z, feetY);
    return Number.isFinite(y) ? y : null;
  };

  // ─── templates ───
  function prepareTemplate(value) {
    if (!value?.scene) throw new Error('Cast model source gave no scene');
    value.scene.updateMatrixWorld(true);
    value.reboundMeshes = unifySkeletons(THREE, value.scene);
    const box = new THREE.Box3().setFromObject(value.scene);
    value.sourceHeight = Math.max(1e-3, box.max.y - box.min.y);
    value.footY = box.min.y;
    value.walkClip = value.format === 'fbx' ? inPlace(value.walkClip) : value.walkClip;
    value.materialCount = 0;
    const seen = new Set();
    value.scene.traverse(node => {
      if (!node.isMesh) return;
      for (const m of [].concat(node.material || [])) if (!seen.has(m)) { seen.add(m); value.materialCount++; }
    });
    return value;
  }
  function templateFor(sourceKey) {
    let entry = templates.get(sourceKey);
    if (entry) return entry;
    entry = { key: sourceKey, value: null, error: null, promise: null };
    templates.set(sourceKey, entry);
    entry.promise = Promise.resolve()
      .then(() => loadSource(sourceKey, CAST_MODEL_SOURCES[sourceKey], ctx))
      .then(value => {
        if (disposed) { disposeObjectTree(value?.scene); return; }
        entry.value = prepareTemplate(value);
      })
      .catch(error => {
        entry.error = error;
        warn('Three Roads cast: model source ' + sourceKey + ' could not load; its people stay out', error);
      });
    return entry;
  }

  // ─── people ───
  function addActor(person, { x, z, facing, fromHome }) {
    if (actors.size >= CAST_MAX_PEOPLE) {
      warn('Three Roads cast: already ' + CAST_MAX_PEOPLE + ' people in this scene; ' + person.id + ' stays out');
      return null;
    }
    const look = castModelFor(person);
    look.colours = distinctColours(look.colours, actorList.map(a => a.look.colours));
    const rest = Number.isFinite(facing) ? facing : 0;
    const actor = {
      id: person.id, person, look, giver: Boolean(person.giver), fromHome: Boolean(fromHome),
      want: { x, z }, x, z, y: 0, facing: rest, restFacing: rest,
      state: 'waiting', placement: null, waited: 0, probeMs: 0, offset: 0,
      template: templateFor(look.source),
      group: null, model: null, mixer: null, idleAction: null, walkAction: null, ring: null,
      entry: null, materials: [], moving: false, groundClock: 0,
      task: null, pendingTask: null, followMoving: false,
      caption: null, captionTime: 0, captionSeconds: 0, voice: null,
    };
    actors.set(person.id, actor);
    actorList.push(actor);
    return actor;
  }

  function removeActor(actor) {
    if (!actor) return;
    actors.delete(actor.id);
    const index = actorList.indexOf(actor);
    if (index >= 0) actorList.splice(index, 1);
    if (actor.entry && Array.isArray(ctx.questNPCs)) {
      const at = ctx.questNPCs.indexOf(actor.entry);
      if (at >= 0) ctx.questNPCs.splice(at, 1);
    }
    try { actor.voice?.stop?.(); } catch { /* already stopped */ }
    actor.voice = null;
    if (actor.mixer) {
      actor.mixer.stopAllAction();
      if (actor.model) actor.mixer.uncacheRoot(actor.model);
    }
    actor.model?.traverse(node => { if (node.isSkinnedMesh) node.skeleton?.dispose?.(); });
    actor.group?.removeFromParent();
    for (const m of actor.materials) m.dispose();
    actor.materials.length = 0;
    actor.caption?.dispose();
    actor.caption = null;
    actor.state = 'gone';
  }

  // ─── the scene probe: what is actually drawn around a spot ───
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  function makeProbe(cx, cz, reach) {
    const meshes = [];
    const instances = [];
    const sphere = new THREE.Sphere();
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3(), scale = new THREE.Vector3(), turn = new THREE.Quaternion();
    // Leave out the ground (sampleGroundY's business) and this file's own people:
    // hide them for the walk only; nothing renders in between.
    const hidden = [root, ...(ctx.groundMeshes || [])].filter(o => o && o.visible);
    for (const o of hidden) o.visible = false;
    try {
      scene.traverseVisible(node => {
        if (!node.isMesh || node.isSkinnedMesh) return;
        const material = Array.isArray(node.material) ? node.material[0] : node.material;
        if (!material || material.visible === false || (material.transparent && material.opacity < 0.05)) return;
        const geometry = node.geometry;
        if (!geometry) return;
        if (node.isInstancedMesh) {
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          const bb = geometry.boundingBox;
          for (let i = 0; i < node.count; i++) {
            node.getMatrixAt(i, matrix);
            matrix.premultiply(node.matrixWorld);
            const e = matrix.elements;
            if (Math.abs(e[12] - cx) > reach + 4 || Math.abs(e[14] - cz) > reach + 4) continue;
            matrix.decompose(at, turn, scale);
            const bottom = at.y + bb.min.y * scale.y, top = at.y + bb.max.y * scale.y;
            if (top - bottom < 0.6) continue; // grass, pebbles, flowers
            const r = Math.max((bb.max.x - bb.min.x) * scale.x, (bb.max.z - bb.min.z) * scale.z) / 2;
            instances.push({ x: at.x, z: at.z, r: Math.min(r, 1), bottom, top });
          }
          return;
        }
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        if (!geometry.boundingSphere) return;
        sphere.copy(geometry.boundingSphere).applyMatrix4(node.matrixWorld);
        if (Math.hypot(sphere.center.x - cx, sphere.center.z - cz) > sphere.radius + reach) return;
        meshes.push(node);
      });
    } finally {
      for (const o of hidden) o.visible = true;
    }
    return (x, y, z) => {
      for (const it of instances) {
        if (it.top > y + 0.6 && it.bottom < y + 2 &&
          Math.hypot(it.x - x, it.z - z) < CAST_FOOT_RADIUS + it.r * 0.5) return false;
      }
      if (!meshes.length) return true;
      raycaster.near = 0;
      raycaster.far = CAST_FOOT_RADIUS + 0.05;
      for (const h of [0.45, 1.3]) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          rayOrigin.set(x, y + h, z);
          rayDir.set(Math.sin(a), 0, Math.cos(a));
          raycaster.set(rayOrigin, rayDir);
          if (raycaster.intersectObjects(meshes, false).length) return false;
        }
      }
      rayOrigin.set(x, y + 1.9, z);
      rayDir.set(0, -1, 0);
      raycaster.set(rayOrigin, rayDir);
      raycaster.far = 1.7; // stops 0.2 m above the ground: paving and kerbs do not count
      return raycaster.intersectObjects(meshes, false).length === 0;
    };
  }

  const white = new THREE.Color(0xffffff);
  function tint(material, colour, mode) {
    if (!material.color) return;
    material.color.setHex(colour);
    // Textured rigs: lighten the colour so the texture under it still reads, and add
    // it as a faint glow so it shows even on a dark texture.
    if (mode === 'multiply') {
      material.color.lerp(white, 0.4);
      material.emissive?.setHex(colour).multiplyScalar(0.3);
    }
  }

  function buildVisual(actor, t, spot) {
    const model = cloneSkinned(t.scene);
    const s = actor.look.height / t.sourceHeight;
    model.scale.set(s * actor.look.width, s, s * actor.look.width);
    model.position.y = -t.footY * s;
    // Clone this person's materials and tint them. With `tintMeshes` the source names
    // which mesh takes which colour (others keep theirs); without it the first
    // material in the rig takes the first colour and every other one the second.
    const clones = new Map();
    let order = 0;
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = !node.isSkinnedMesh;
      node.receiveShadow = true;
      let colourIndex = null;
      if (t.tintMeshes) {
        const rule = t.tintMeshes.find(([pattern]) => pattern.test(node.name));
        if (!rule) return;
        colourIndex = rule[1];
      }
      const swap = m => {
        const key = colourIndex === null ? m : m.uuid + ':' + colourIndex;
        if (!clones.has(key)) {
          const copy = m.clone();
          tint(copy, actor.look.colours[colourIndex ?? (order === 0 ? 0 : 1)], t.tint);
          order++;
          clones.set(key, copy);
          actor.materials.push(copy);
        }
        return clones.get(key);
      };
      node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
    });
    const group = new THREE.Group();
    group.name = 'ThreeRoadsCast_' + actor.id;
    group.userData.threeRoadsCast = actor.id;
    group.add(model);
    group.position.set(spot.x, spot.y, spot.z);
    group.rotation.y = actor.facing;
    if (actor.giver) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      ring.name = 'ThreeRoadsCastRing';
      group.add(ring);
      actor.ring = ring;
    }
    const mixer = new THREE.AnimationMixer(model);
    const idle = t.idleClip ? mixer.clipAction(t.idleClip) : null;
    if (idle) {
      idle.play();
      idle.time = Math.random() * (t.idleClip.duration || 1); // not all breathing in step
    }
    actor.walkAction = t.walkClip ? mixer.clipAction(t.walkClip) : null;
    actor.model = model;
    actor.group = group;
    actor.mixer = mixer;
    actor.idleAction = idle;
    root.add(group);
  }

  function tryPlace(actor) {
    const t = actor.template;
    if (t.error) { actor.state = 'failed'; return; }
    if (!t.value) return;
    const started = globalThis.performance?.now?.() ?? Date.now();
    const probe = deps.probe || makeProbe(actor.want.x, actor.want.z, 8);
    let spot = findStandingSpot(actor.want, { groundY: groundAt, isBlocked: blocked, probe });
    actor.probeMs = Math.round(((globalThis.performance?.now?.() ?? Date.now()) - started) * 10) / 10;
    if (spot.status === 'no-ground') return; // the ground has not loaded here yet: ask again soon
    if (spot.status === 'blocked') {
      // Ground, but every spot within 6 m is inside something named: stand on the
      // nearest ground and say so in status().
      spot = { ...findStandingSpot(actor.want, { groundY: groundAt, maxStep: Infinity }), status: 'blocked' };
      if (!Number.isFinite(spot.y)) return;
    }
    if (spot.status !== 'found')
      warn('Three Roads cast: ' + actor.id + ' has no clear spot near the asked one (' + spot.status + ')');
    actor.placement = spot.status;
    actor.x = spot.x; actor.z = spot.z; actor.y = spot.y;
    actor.offset = spot.distance;
    buildVisual(actor, t.value, spot);
    if (actor.giver && Array.isArray(ctx.questNPCs)) {
      // The shape GameWorld3D.jsx builds for its archers (the questNPCs.push in the
      // quest-giver spawn loop); every field it reads is listed in
      // tests/game3d-three-roads-cast-subsystem.test.mjs.
      actor.entry = {
        id: actor.id,
        name: actor.person.name,
        group: actor.group,
        mixer: actor.mixer,
        idleAction: actor.idleAction,
        ringMesh: actor.ring,
        // Without an idle clip of its own, the game's player idle is handed over here.
        _pendingMixer: actor.idleAction ? null : actor.mixer,
        modelFormat: t.value.format,
        modelSource: t.value.url,
        threeRoadsCast: true,
      };
      ctx.questNPCs.push(actor.entry);
    }
    actor.state = 'ready';
    bus?.emit('cast:ready', { id: actor.id });
    if (actor.pendingTask) {
      const task = actor.pendingTask;
      actor.pendingTask = null;
      if (task.kind === 'move') api.moveTo(task.detail);
      else if (task.kind === 'follow') api.follow(task.detail);
    }
  }

  function setMoving(actor, moving, speed) {
    const walk = actor.walkAction, idle = actor.idleAction;
    if (moving && walk) walk.timeScale = walkTimeScale(speed, actor.template.value?.walkClipSpeed);
    if (moving === actor.moving) return;
    actor.moving = moving;
    if (!walk || !idle) return;
    if (moving) {
      walk.reset().play();
      idle.crossFadeTo(walk, 0.25, false);
    } else {
      idle.reset().play();
      walk.crossFadeTo(idle, 0.3, false);
    }
  }

  // Moves an actor toward (tx, tz); returns true when there.
  function walkToward(actor, tx, tz, speed, dt, arrive) {
    stepToward(step, actor.x, actor.z, tx, tz, speed, dt, arrive);
    let heading = step.heading;
    if (!step.arrived && blocked(step.x, step.z) && !blocked(actor.x, actor.z)) {
      steerAround(steer, actor.x, actor.z, step.heading, speed * dt, blocked);
      step.x = steer.x; step.z = steer.z; heading = steer.heading;
    }
    actor.x = step.x; actor.z = step.z;
    actor.facing = turnToward(actor.facing, heading, CAST_TURN_RATE * dt);
    actor.groundClock -= dt;
    if (actor.groundClock <= 0) {
      actor.groundClock = WALK_GROUND_EVERY;
      const y = groundAt(actor.x, actor.z, actor.y);
      if (y !== null && Math.abs(y - actor.y) < 3) actor.y = y;
    }
    return step.arrived;
  }

  function updateActor(actor, dt, playerPosition) {
    const task = actor.task;
    if (task?.kind === 'move') {
      const wp = task.path[task.index];
      setMoving(actor, true, task.speed);
      if (walkToward(actor, wp.x, wp.z, task.speed, dt, task.index === task.path.length - 1 ? 0.15 : 0.4)) {
        task.index++;
        if (task.index >= task.path.length) {
          actor.task = null;
          actor.restFacing = actor.facing;
          setMoving(actor, false, 0);
          bus?.emit('cast:arrived', { id: actor.id, x: actor.x, z: actor.z });
        }
      }
    } else if (task?.kind === 'follow') {
      const target = task.target === 'player' ? playerPosition : actors.get(task.target)?.group?.position;
      if (target && Number.isFinite(target.x)) {
        followGoal(goal, actor.x, actor.z, target.x, target.z, task.distance);
        if (!actor.followMoving && goal.gap > 0.9) actor.followMoving = true;
        else if (actor.followMoving && goal.gap < 0.15) actor.followMoving = false;
        if (actor.followMoving) {
          const speed = Math.max(CAST_WALK_SPEED * 0.6, followSpeed(goal.gap));
          setMoving(actor, true, speed);
          walkToward(actor, goal.x, goal.z, speed, dt, 0.05);
        } else {
          setMoving(actor, false, 0);
          actor.facing = turnToward(actor.facing, headingTo(actor.x, actor.z, target.x, target.z), CAST_TURN_RATE * dt);
        }
      } else setMoving(actor, false, 0);
    } else if (playerPosition && Number.isFinite(playerPosition.x)) {
      const d = Math.hypot(playerPosition.x - actor.x, playerPosition.z - actor.z);
      const desired = shouldGreet(d) ? headingTo(actor.x, actor.z, playerPosition.x, playerPosition.z) : actor.restFacing;
      actor.facing = turnToward(actor.facing, desired, 2.5 * dt);
    }
    const g = actor.group;
    g.position.x = actor.x;
    g.position.y = actor.y;
    g.position.z = actor.z;
    g.rotation.y = actor.facing;
    // Givers' mixers are advanced by GameWorld3D's questNPCs loop; the others' here.
    if (!actor.entry) actor.mixer?.update(dt);

    if (actor.captionSeconds > 0) {
      actor.captionTime += dt;
      if (actor.captionTime >= actor.captionSeconds) {
        actor.captionSeconds = 0;
        actor.caption?.hide();
      } else if (actor.caption) {
        const listener = playerPosition && Number.isFinite(playerPosition.x) ? playerPosition : ctx.camera?.position;
        const d = listener ? Math.hypot(listener.x - actor.x, listener.z - actor.z) : 0;
        const camD = ctx.camera ? ctx.camera.position.distanceTo(g.position) : d;
        const opacity = g.visible ? captionOpacity(actor.captionTime, actor.captionSeconds) * captionDistanceFade(d) : 0;
        actor.caption.place(actor.x, actor.y + actor.look.height + 0.3, actor.z, ctx.camera, opacity,
          Math.min(2.2, Math.max(1, camD / 10)));
      }
    }
  }

  // ─── commands (bus and test door) ───
  const detailOf = (a, b) => (typeof a === 'string' ? { ...(b || {}), id: a } : (a || {}));
  const api = {
    spawn(a, b) {
      if (disposed) return false;
      const detail = detailOf(a, b);
      const person = threeRoadsPerson(detail.id);
      if (!person || person.existing) { warn('Three Roads cast: cannot spawn ' + detail.id); return false; }
      let x = detail.x, z = detail.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        if (!person.home) { warn('Three Roads cast: ' + detail.id + ' has no home; spawn needs x and z'); return false; }
        ({ x, z } = localToWorld(person.home.x, person.home.z));
      }
      removeActor(actors.get(person.id)); // asking again moves them
      let facing = detail.facing;
      if (!Number.isFinite(facing)) facing = person.home?.facing;
      const player = ctx.getPlayer?.()?.position;
      if (!Number.isFinite(facing) && player) facing = headingTo(x, z, player.x, player.z);
      return Boolean(addActor(person, { x, z, facing, fromHome: false }));
    },
    despawn(a) {
      const actor = actors.get(detailOf(a).id);
      if (!actor) return false;
      removeActor(actor);
      return true;
    },
    moveTo(a, b) {
      const detail = detailOf(a, b);
      const actor = actors.get(detail.id);
      if (!actor || !Number.isFinite(detail.x) || !Number.isFinite(detail.z)) return false;
      if (actor.state !== 'ready') { actor.pendingTask = { kind: 'move', detail }; return true; }
      const speed = Number.isFinite(detail.speed) && detail.speed > 0 ? Math.min(8, Math.max(0.3, detail.speed)) : CAST_WALK_SPEED;
      // A destination inside the fountain (its centre, say) becomes the rim on the walker's side.
      let tx = detail.x, tz = detail.z;
      tx += (actor.x - tx) * 1e-3; tz += (actor.z - tz) * 1e-3;
      const dest = clearDestination(tx, tz, obstacles);
      const path = planWalk({ x: actor.x, z: actor.z }, dest, obstacles, blocked) || [{ x: dest.x, z: dest.z }];
      actor.task = { kind: 'move', speed, path, index: 0, x: dest.x, z: dest.z };
      return true;
    },
    follow(a, b) {
      const detail = detailOf(a, b);
      const actor = actors.get(detail.id);
      if (!actor) return false;
      if (actor.state !== 'ready') { actor.pendingTask = { kind: 'follow', detail }; return true; }
      if (detail.target === null || detail.target === undefined) {
        if (actor.task?.kind === 'follow') { actor.task = null; actor.restFacing = actor.facing; setMoving(actor, false, 0); }
        return true;
      }
      if (detail.target !== 'player' && !actors.has(detail.target)) return false;
      actor.followMoving = false;
      actor.task = {
        kind: 'follow', target: detail.target,
        distance: Number.isFinite(detail.distance) && detail.distance > 0 ? detail.distance : CAST_FOLLOW_DISTANCE,
      };
      return true;
    },
    say(a, b) {
      const detail = detailOf(a, b);
      const actor = actors.get(detail.id);
      if (!actor) return false;
      const text = detail.text ? String(detail.text) : '[line: ' + (detail.lineId || 'unnamed') + ']';
      if (!actor.caption) {
        actor.caption = createCaptionView(THREE, { geometry: captionGeometry });
        root.add(actor.caption.mesh);
      }
      actor.caption.setText(text, actor.person.name);
      actor.captionTime = 0;
      actor.captionSeconds = captionSeconds(text, detail.seconds);
      try { actor.voice?.stop?.(); } catch { /* already stopped */ }
      actor.voice = null;
      Promise.resolve()
        .then(() => playVoice(detail.lineId, { caption: text }))
        .then(handle => {
          if (disposed || actors.get(actor.id) !== actor) handle?.stop?.();
          else actor.voice = handle || null;
        })
        .catch(() => {});
      return true;
    },
    status() {
      const templateState = {};
      for (const [key, t] of templates) templateState[key] = t.error ? 'failed' : t.value ? 'ready' : 'loading';
      const r = v => Math.round(v * 100) / 100;
      return {
        area: ctx.worldArea ?? null, areaScenes: ctx.areaScenes !== false, max: CAST_MAX_PEOPLE,
        count: actors.size, templates: templateState,
        people: actorList.map(actor => ({
          id: actor.id, name: actor.person.name, state: actor.state, giver: actor.giver,
          inQuestList: Boolean(actor.entry && ctx.questNPCs?.includes(actor.entry)),
          asked: { x: r(actor.want.x), z: r(actor.want.z) },
          at: actor.state === 'ready' ? { x: r(actor.x), y: r(actor.y), z: r(actor.z) } : null,
          offset: actor.state === 'ready' ? r(actor.offset) : null,
          placement: actor.placement, probeMs: actor.probeMs, waited: r(actor.waited),
          facing: r(actor.facing), task: actor.task?.kind || null, moving: actor.moving,
          colours: actor.look.colours.map(c => '#' + c.toString(16).padStart(6, '0')),
          caption: actor.captionSeconds > 0,
        })),
      };
    },
    update(dt, playerPosition) {
      if (disposed || !(dt >= 0)) return;
      const delta = Math.min(dt, 0.1);
      placeTimer += delta;
      if (placeTimer >= PLACE_EVERY) {
        placeTimer = 0;
        for (let i = 0; i < actorList.length; i++) {
          const actor = actorList[i];
          if (actor.state !== 'waiting') continue;
          actor.waited += PLACE_EVERY;
          if (!actor.template.value && !actor.template.error) continue;
          tryPlace(actor);
          break; // one placement per tick
        }
      }
      regroundTimer += delta;
      const reground = regroundTimer >= REGROUND_EVERY;
      if (reground) regroundTimer = 0;
      for (let i = 0; i < actorList.length; i++) {
        const actor = actorList[i];
        if (actor.state !== 'ready') continue;
        if (reground && !actor.moving) {
          const y = groundAt(actor.x, actor.z, actor.y);
          if (y !== null && Math.abs(y - actor.y) < 3) actor.y = y;
        }
        updateActor(actor, delta, playerPosition);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* bus already cleared */ } }
      offs.length = 0;
      for (const actor of [...actorList]) removeActor(actor);
      for (const t of templates.values()) if (t.value) disposeObjectTree(t.value.scene);
      templates.clear();
      ringGeometry.dispose();
      ringMaterial.dispose();
      captionGeometry.dispose();
      root.removeFromParent();
      root.clear();
    },
  };

  if (bus?.on) {
    offs.push(bus.on('cast:spawn', d => api.spawn(d)));
    offs.push(bus.on('cast:despawn', d => api.despawn(d)));
    offs.push(bus.on('cast:moveTo', d => api.moveTo(d)));
    offs.push(bus.on('cast:follow', d => api.follow(d)));
    offs.push(bus.on('cast:say', d => api.say(d)));
  }

  const areas = ctx.areaScenes === false ? CAST_AREAS : (ctx.worldArea ? [ctx.worldArea] : []);
  for (const area of areas) {
    for (const person of threeRoadsCastAtHome({ area })) {
      const home = localToWorld(person.home.x, person.home.z);
      addActor(person, { x: home.x, z: home.z, facing: person.home.facing, fromHome: true });
    }
  }
  return api;
}
