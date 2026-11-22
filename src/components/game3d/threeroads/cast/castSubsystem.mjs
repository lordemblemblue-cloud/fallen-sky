// Cast: the people of The War of Three Roads in the current scene.
//
// - Everyone with a `home` in this scene's area (script/cast.mjs) is brought in and
//   stood on clear, flat ground within 6 m of that home, once the ground has loaded
//   (castPlacement.mjs). With ?wholeWorld=1 (ctx.areaScenes false) every area's people.
//   Homes depend on the quest store's story flags (`homeAfter`): the store is read
//   at start and on every change, and people are brought in or taken out without a
//   remount.
// - Each wears a clone of a rig the game already ships (castModels.mjs), scaled to
//   their height, tinted with their two colours, playing an idle.
// - People with `giver: true` are pushed into ctx.questNPCs in the shape GameWorld3D
//   builds for its five archers, so its own "Speak with ..." prompt, quest marker,
//   click target and map dot work for them unchanged. GameWorld3D advances those
//   entries' mixers itself (GameWorld3D.jsx questNPCs loop), so this file does not.
// - They act on the bus (BUILD_RULES.md section 4): cast:spawn, cast:despawn,
//   cast:moveTo, cast:follow, cast:say; they announce cast:ready and cast:arrived.
// - Lines (cast:say) show over the speaker's head within 25 m of the player; a
//   speaker who is further away, or not in this scene, or one of the game's own
//   archers, is shown as a subtitle at the foot of the view instead.
// - At most CAST_MAX_PEOPLE in a scene and CAST_MAX_DRAWN drawn (the nearest to the
//   player); dispose() removes and frees everything and takes this file's entries
//   back out of ctx.questNPCs.
// - Test door (only exists with ?threeRoads=1): window.__gw3dThreeRoads.get('cast')
//   has spawn, despawn, moveTo, follow, say and status().
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { THREE_ROADS_CAST, threeRoadsCastAtHome, threeRoadsPerson } from '../script/cast.mjs';
import { localToWorld } from '../coords.mjs';
import { threeRoadsLine } from '../script/index.mjs';
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
import {
  captionSeconds, captionOpacity, captionDistanceFade, wrapCaptionText,
  CAPTION_LINE_CHARS, CAPTION_MAX_LINES, SUBTITLE_LINE_CHARS, SUBTITLE_MAX_LINES,
} from './castCaption.mjs';
import { createCaptionView } from './castCaptionView.mjs';
import {
  castSourceDef, castModelFor, castFallbackLook, distinctColours, CAST_OWN_SOURCE_PREFIX,
} from './castModels.mjs';

// The opening's parley puts 11 people in the town (7 at home, the 3 travellers, Elder
// Maren). BUILD_RULES allows more than 8 when measured: each drawn person costs
// about 4 to 5 draw calls and 20,000 triangles (the archer rig), so at most 8 are
// drawn, the nearest to the player; the rest stand there undrawn and unanimated
// until they are among the nearest again.
export const CAST_MAX_PEOPLE = 12;
export const CAST_MAX_DRAWN = 8;
export const CAST_AREAS = Object.freeze([...new Set(THREE_ROADS_CAST.flatMap(person => [
  person.home, person.homeAfter?.home, ...(person.alsoAt || []),
]).filter(home => home?.area).map(home => home.area))]);

const PLACE_EVERY = 0.25; // seconds between placement attempts (one person each)
const REGROUND_EVERY = 1;  // seconds between ground re-checks of people standing still
const WALK_GROUND_EVERY = 0.1;
const DRAW_EVERY = 0.5;    // seconds between choosing who is drawn
const FOLLOW_CATCH_UP = 35; // a follower this far behind is put back behind the player
const PERSONAL_SPACE = 0.75; // two of the cast walking never come closer than this
const SUBTITLE_DISTANCE = 1.25;    // metres in front of the camera
const SUBTITLE_LINE_SCREEN = 0.034; // one line's share of the screen's height
const SUBTITLE_FOOT = 0.17;         // its foot, below the centre, as a share of the screen

// The quest store, read lazily so this file stays importable in node.
const defaultQuestStore = () => import('../../useQuestStore.jsx')
  .then(store => ({ getState: store.getQuestState, subscribe: store.subscribeQuests }));

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
  return ownOrSharedGlb(gltf, def, url);
}

// What a loaded GLB gives the cast. A person's own file names its clips exactly
// (`Idle`, `Talk`, `Walk`) and must carry every one in `required`, or it is
// refused and that person wears the shared figure.
export function ownOrSharedGlb(gltf, def, url) {
  const scene = gltf?.scene || gltf?.scenes?.[0];
  const clips = gltf?.animations || [];
  if (!scene) throw new Error('No scene in ' + url);
  if (def?.clips) {
    const named = key => clips.find(clip => clip?.name === def.clips[key] && clip.duration > 0 && clip.tracks?.length) || null;
    const found = { idle: named('idle'), talk: named('talk'), walk: named('walk') };
    const missing = (def.required || []).filter(key => !found[key]);
    if (missing.length) throw new Error(url + ' has no ' + missing.map(key => def.clips[key]).join(', ') + ' clip');
    return {
      scene, idleClip: found.idle, talkClip: found.talk, walkClip: found.walk, format: 'glb', url,
      own: Boolean(def.own), walkClipSpeed: def.walkClipSpeed || CAST_WALK_SPEED, tint: def.tint || 'none',
      yaw: Number(def.yaw) || 0, extraClips: clips,
    };
  }
  return {
    scene, idleClip: pickAXEEmbeddedIdleClip(clips), talkClip: null,
    walkClip: clips.find(c => /walk/i.test(c.name)) || clips.find(c => /run/i.test(c.name)) || null,
    format: 'glb', url, walkClipSpeed: def?.walkClipSpeed || CAST_WALK_SPEED, tint: def?.tint || 'multiply', yaw: Number(def?.yaw) || 0,
  };
}

/**
 * How fast an in-place walk clip carries the body, in the model's own world units
 * per second: the planted (lower) foot slides back at that speed. Sampled over one
 * cycle; the model's pose is put back as it was. null when it cannot tell.
 */
export function measureWalkSpeed(THREE_, model, clip, samples = 48) {
  if (!model || !clip || !(clip.duration > 0)) return null;
  const feet = [];
  model.traverse(node => { if ((node.isBone || node.type === 'Bone') && /foot/i.test(node.name) && !/toe|end/i.test(node.name)) feet.push(node); });
  if (feet.length < 2) return null;
  const saved = [];
  model.traverse(node => saved.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
  const mixer = new THREE_.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.play();
  const now = feet.map(() => new THREE_.Vector3());
  const before = feet.map(() => new THREE_.Vector3());
  const dt = clip.duration / samples;
  let total = 0, count = 0;
  try {
    mixer.setTime(0);
    model.updateMatrixWorld(true);
    feet.forEach((foot, i) => foot.getWorldPosition(before[i]));
    for (let k = 1; k <= samples; k++) {
      mixer.setTime(k * dt);
      model.updateMatrixWorld(true);
      feet.forEach((foot, i) => foot.getWorldPosition(now[i]));
      let low = 0;
      for (let i = 1; i < feet.length; i++) if (now[i].y < now[low].y) low = i;
      total += Math.hypot(now[low].x - before[low].x, now[low].z - before[low].z) / dt;
      count++;
      feet.forEach((_, i) => before[i].copy(now[i]));
    }
  } finally {
    action.stop();
    mixer.uncacheRoot(model);
    for (const [node, p, q, s] of saved) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
    model.updateMatrixWorld(true);
  }
  const speed = count ? total / count : null;
  return Number.isFinite(speed) && speed > 0.05 ? speed : null;
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
  let drawTimer = DRAW_EVERY;
  let flags = null; // the quest store's story flags, once read
  const step = { x: 0, z: 0, heading: 0, remaining: 0, arrived: false };
  const steer = { x: 0, z: 0, heading: 0, blocked: false };
  const goal = { x: 0, z: 0, gap: 0 };
  const captions = new Map(); // speaker id -> { view, name, time, seconds, voice }
  const captionList = [];     // the same records, for allocation-free iteration
  let subtitleOwner = null;   // the record shown as a subtitle, if any
  let lineCounter = 0;
  const subtitleAt = new THREE.Vector3();
  const projected = new THREE.Vector3();
  // True when a point is in front of the camera and inside its view (a little
  // margin, so a head at the very edge still counts as seen). No camera: assume so.
  const onScreen = (camera, p) => {
    if (!camera?.isCamera) return true;
    camera.updateMatrixWorld?.();
    projected.set(p.x, p.y, p.z).project(camera);
    return projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1.05 && Math.abs(projected.y) <= 1.05;
  };
  const drawOrder = [];

  // Steering for one walker: the town's named obstacles and the other people.
  let steerSelf = null;
  const blockedForSteer = (x, z) => {
    if (blocked(x, z)) return true;
    for (let i = 0; i < actorList.length; i++) {
      const other = actorList[i];
      if (other === steerSelf || other.state !== 'ready') continue;
      if (Math.abs(other.x - x) < PERSONAL_SPACE && Math.abs(other.z - z) < PERSONAL_SPACE &&
        Math.hypot(other.x - x, other.z - z) < PERSONAL_SPACE) return true;
    }
    return false;
  };

  const groundAt = (x, z, feetY) => {
    const y = ctx.sampleGroundY?.(x, z, feetY);
    return Number.isFinite(y) ? y : null;
  };

  // ─── templates ───
  function prepareTemplate(value) {
    if (!value?.scene) throw new Error('Cast model source gave no scene');
    value.scene.updateMatrixWorld(true);
    value.reboundMeshes = unifySkeletons(THREE, value.scene);
    // Height from the skinned mesh's world box in its rest pose (an own file's
    // "Armature" is scaled 0.01: the bones are in centimetres).
    const box = new THREE.Box3().setFromObject(value.scene);
    value.sourceHeight = Math.max(1e-3, box.max.y - box.min.y);
    value.footY = box.min.y;
    value.walkClip = value.format === 'fbx' ? inPlace(value.walkClip) : value.walkClip;
    // An own walk clip's natural speed, in the file's own metres per second.
    value.walkSpeedMeasured = value.own ? measureWalkSpeed(THREE, value.scene, value.walkClip) : null;
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
      .then(() => loadSource(sourceKey, castSourceDef(sourceKey), ctx))
      .then(value => {
        if (disposed) { disposeObjectTree(value?.scene); return; }
        entry.value = prepareTemplate(value);
      })
      .catch(error => {
        entry.error = error;
        warn('Three Roads cast: model source ' + sourceKey + ' could not load; ' +
          (sourceKey.startsWith(CAST_OWN_SOURCE_PREFIX) ? 'they wear the shared figure' : 'its people stay out'), error);
      });
    return entry;
  }

  // ─── people ───
  function addActor(person, { x, z, facing, fromHome }) {
    if (actors.has(person.id)) return actors.get(person.id);
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
      group: null, model: null, mixer: null, idleAction: null, walkAction: null, talkAction: null, ring: null,
      anim: 'idle', walkClipSpeed: null,
      entry: null, materials: [], moving: false, groundClock: 0,
      task: null, pendingTask: null, followMoving: false, drawn: true,
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
    if (actor.mixer) {
      actor.mixer.stopAllAction();
      if (actor.model) actor.mixer.uncacheRoot(actor.model);
    }
    actor.model?.traverse(node => { if (node.isSkinnedMesh) node.skeleton?.dispose?.(); });
    actor.group?.removeFromParent();
    for (const m of actor.materials) m.dispose();
    actor.materials.length = 0;
    // A line they were speaking carries on as a subtitle until its time is up.
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
    model.rotation.y = t.yaw || 0;
    // Clone this person's materials and tint them. With `tintMeshes` the source names
    // which mesh takes which colour (others keep theirs); without it the first
    // material in the rig takes the first colour and every other one the second.
    // An own model (tint 'none') keeps the file's material: its texture is its look,
    // and its geometry, material and texture are freed with the template.
    const clones = new Map();
    let order = 0;
    model.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = !node.isSkinnedMesh;
      node.receiveShadow = true;
      if (t.tint === 'none') return;
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
    actor.talkAction = t.talkClip ? mixer.clipAction(t.talkClip) : null;
    actor.anim = 'idle';
    // The walk's natural speed for this person: measured on the file (scaled to their
    // height), or the source's own figure.
    actor.walkClipSpeed = t.walkSpeedMeasured ? t.walkSpeedMeasured * s : t.walkClipSpeed;
    actor.own = Boolean(t.own);
    actor.model = model;
    actor.group = group;
    actor.mixer = mixer;
    actor.idleAction = idle;
    root.add(group);
  }

  function tryPlace(actor) {
    const t = actor.template;
    if (t.error) {
      // Their own model did not load (or lacks a clip): the shared figure, as before.
      const fallback = castFallbackLook(actor.look);
      if (fallback) {
        actor.look = fallback;
        actor.ownFailed = String(t.error?.message || t.error);
        actor.template = templateFor(fallback.source);
      } else actor.state = 'failed';
      return;
    }
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
    actor.moving = moving;
    // Feet that keep pace with the ground: the clip plays at the body's speed over
    // the walk's natural speed (an own model may play faster when following at a run).
    if (moving && actor.walkAction)
      actor.walkAction.timeScale = walkTimeScale(speed, actor.walkClipSpeed, actor.own ? 2.5 : undefined);
  }

  // Walk while moving, else Talk while one of their lines is up, else Idle; a
  // quarter-second crossfade between them. The shared figure has no Talk: Idle.
  const actionOf = (actor, name) => (name === 'walk' ? actor.walkAction : name === 'talk' ? actor.talkAction : actor.idleAction);
  function chooseAnim(actor) {
    const talking = (captions.get(actor.id)?.seconds || 0) > 0;
    const want = actor.moving && actor.walkAction ? 'walk' : talking && actor.talkAction ? 'talk' : 'idle';
    if (want === actor.anim) return;
    const from = actionOf(actor, actor.anim), to = actionOf(actor, want);
    actor.anim = want;
    if (!to) return;
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, 0.25, false);
  }

  // Moves an actor toward (tx, tz); returns true when there.
  function walkToward(actor, tx, tz, speed, dt, arrive) {
    stepToward(step, actor.x, actor.z, tx, tz, speed, dt, arrive);
    let heading = step.heading;
    // Round the named obstacles, and round each other when several walk at once.
    steerSelf = actor;
    if (!step.arrived && blockedForSteer(step.x, step.z) && !blockedForSteer(actor.x, actor.z)) {
      steerAround(steer, actor.x, actor.z, step.heading, speed * dt, blockedForSteer);
      step.x = steer.x; step.z = steer.z; heading = steer.heading;
    }
    steerSelf = null;
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

  // A follow point inside the fountain or a shop: the nearest clear point at the
  // same distance round the target (so a follower waits beside, not in, the basin).
  function clearFollowGoal(out, target, distance) {
    const base = Math.atan2(out.x - target.x, out.z - target.z);
    for (let k = 1; k <= 12; k++) {
      const turn = Math.ceil(k / 2) * (Math.PI / 12) * (k % 2 ? 1 : -1);
      const x = target.x + Math.sin(base + turn) * distance;
      const z = target.z + Math.cos(base + turn) * distance;
      if (!blocked(x, z)) { out.x = x; out.z = z; return true; }
    }
    return false;
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
        if (blocked(goal.x, goal.z) && clearFollowGoal(goal, target, task.distance))
          goal.gap = Math.max(goal.gap, Math.hypot(actor.x - goal.x, actor.z - goal.z));
        if (goal.gap > FOLLOW_CATCH_UP && !blocked(goal.x, goal.z)) {
          // Left far behind (the player rode or ran off): put them back behind.
          const y = groundAt(goal.x, goal.z, Number.isFinite(target.y) ? target.y : actor.y);
          if (y !== null) {
            actor.x = goal.x; actor.z = goal.z; actor.y = y;
            followGoal(goal, actor.x, actor.z, target.x, target.z, task.distance);
          }
        }
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
    chooseAnim(actor);
    // Givers' mixers are advanced by GameWorld3D's questNPCs loop; the others' here,
    // while they are drawn.
    if (!actor.entry && actor.drawn) actor.mixer?.update(dt);
  }

  // Who is drawn: the CAST_MAX_DRAWN nearest to the player. The others stay in
  // place (and stay speakable) with their model hidden.
  function chooseDrawn(playerPosition) {
    drawOrder.length = 0;
    for (const actor of actorList) if (actor.state === 'ready') drawOrder.push(actor);
    if (playerPosition && Number.isFinite(playerPosition.x)) {
      const px = playerPosition.x, pz = playerPosition.z;
      drawOrder.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    }
    for (let i = 0; i < drawOrder.length; i++) {
      const actor = drawOrder[i];
      const drawn = i < CAST_MAX_DRAWN;
      if (drawn === actor.drawn) continue;
      actor.drawn = drawn;
      if (actor.model) actor.model.visible = drawn;
      if (actor.ring) actor.ring.visible = drawn;
    }
  }

  // ─── lines over heads, or as subtitles ───
  const pose = { x: 0, y: 0, z: 0 };
  function speakerPose(id) {
    const actor = actors.get(id);
    if (actor?.state === 'ready') {
      if (!actor.drawn || actor.group.visible === false) return null;
      pose.x = actor.x; pose.y = actor.y + actor.look.height + 0.3; pose.z = actor.z;
      return pose;
    }
    // One of the game's own quest givers (the Fountain Watch archers).
    const list = Array.isArray(ctx.questNPCs) ? ctx.questNPCs : [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (entry?.id !== id || !entry.group || entry.group.visible === false) continue;
      pose.x = entry.group.position.x; pose.y = entry.group.position.y + 2; pose.z = entry.group.position.z;
      return pose;
    }
    return null;
  }
  function updateCaptions(dt, playerPosition) {
    const camera = ctx.camera;
    let newestFar = null;
    for (let i = 0; i < captionList.length; i++) {
      const rec = captionList[i];
      rec.far = false;
      if (rec.seconds <= 0) continue;
      rec.time += dt;
      if (rec.time >= rec.seconds) { rec.view.hide(); rec.seconds = 0; continue; }
      const at = speakerPose(rec.id);
      const listener = playerPosition && Number.isFinite(playerPosition.x) ? playerPosition : camera?.position;
      const d = at && listener ? Math.hypot(listener.x - at.x, listener.z - at.z) : Infinity;
      // Over the head only when that head is on screen: a speaker within 25 m but
      // behind the camera (or off its edge) gets the subtitle, or the line is lost.
      if (at && captionDistanceFade(d) > 0 && onScreen(camera, at)) {
        setMode(rec, 'head');
        const camD = camera ? Math.hypot(camera.position.x - at.x, camera.position.y - at.y, camera.position.z - at.z) : d;
        rec.view.place(at.x, at.y, at.z, camera, captionOpacity(rec.time, rec.seconds) * captionDistanceFade(d),
          Math.min(2.2, Math.max(1, camD / 10)));
      } else {
        rec.far = true;
        if (!newestFar || rec.order > newestFar.order) newestFar = rec;
      }
    }
    // Speakers too far to read over their heads, or not in this scene: the newest
    // of their lines is a subtitle low in the view (above the game's own prompts),
    // each line about SUBTITLE_LINE_SCREEN of the screen's height; the others wait.
    subtitleOwner = newestFar;
    for (let i = 0; i < captionList.length; i++) {
      const rec = captionList[i];
      if (!rec.far) continue;
      if (rec !== newestFar || !camera) { rec.view.hide(); continue; }
      setMode(rec, 'subtitle');
      const viewHeight = 2 * SUBTITLE_DISTANCE * Math.tan(((camera.fov || 60) * Math.PI) / 360);
      const height = Math.max(1, rec.lines + (rec.name ? 0.7 : 0)) * SUBTITLE_LINE_SCREEN * viewHeight;
      const grow = height / Math.max(1e-3, rec.view.height);
      // place() stands the caption on the point it is given: its foot sits here.
      subtitleAt.set(0, -SUBTITLE_FOOT * viewHeight, -SUBTITLE_DISTANCE).applyQuaternion(camera.quaternion).add(camera.position);
      rec.view.place(subtitleAt.x, subtitleAt.y, subtitleAt.z, camera, captionOpacity(rec.time, rec.seconds), grow);
    }
  }
  // Over a head the line wraps narrow and tall; as a subtitle wide and low.
  function setMode(rec, mode) {
    if (rec.mode === mode) return;
    rec.mode = mode;
    const subtitle = mode === 'subtitle';
    const wrap = subtitle
      ? { maxChars: SUBTITLE_LINE_CHARS, maxLines: SUBTITLE_MAX_LINES }
      : { maxChars: CAPTION_LINE_CHARS, maxLines: CAPTION_MAX_LINES };
    rec.lines = wrapCaptionText(rec.text, wrap.maxChars, wrap.maxLines).length;
    rec.view.setText(rec.text, rec.name, wrap);
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
    // A line: `id` is the speaker (or, given only a `lineId`, the script's speaker);
    // `text` defaults to the script's line. Anyone in the cast table or the game's
    // quest-giver list can speak, whether or not they stand in this scene.
    say(a, b) {
      if (disposed) return false;
      const detail = detailOf(a, b);
      const line = detail.lineId ? threeRoadsLine(detail.lineId) : null;
      const id = detail.id || line?.speaker;
      if (!id) return false;
      const entry = Array.isArray(ctx.questNPCs) ? ctx.questNPCs.find(q => q?.id === id) : null;
      const name = actors.get(id)?.person.name || threeRoadsPerson(id)?.name || entry?.name;
      if (!name) return false;
      const text = detail.text ? String(detail.text) : line?.text || '[line: ' + (detail.lineId || 'unnamed') + ']';
      let rec = captions.get(id);
      if (!rec) {
        rec = { id, view: createCaptionView(THREE, { geometry: captionGeometry }), time: 0, seconds: 0, voice: null };
        root.add(rec.view.mesh);
        captions.set(id, rec);
        captionList.push(rec);
      }
      rec.text = text;
      rec.name = name;
      rec.mode = null; // drawn for over-head or subtitle on its first frame
      rec.time = 0;
      rec.seconds = captionSeconds(text, detail.seconds);
      rec.order = ++lineCounter; // the newest far line takes the subtitle place
      try { rec.voice?.stop?.(); } catch { /* already stopped */ }
      rec.voice = null;
      const order = rec.order;
      Promise.resolve()
        .then(() => playVoice(detail.lineId, { caption: text }))
        .then(handle => {
          if (disposed || rec.order !== order) handle?.stop?.();
          else rec.voice = handle || null;
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
        maxDrawn: CAST_MAX_DRAWN, count: actors.size, templates: templateState,
        flagsRead: flags !== null,
        subtitle: subtitleOwner && subtitleOwner.seconds > 0 ? subtitleOwner.id : null,
        people: actorList.map(actor => ({
          id: actor.id, name: actor.person.name, state: actor.state, giver: actor.giver,
          inQuestList: Boolean(actor.entry && ctx.questNPCs?.includes(actor.entry)),
          asked: { x: r(actor.want.x), z: r(actor.want.z) },
          at: actor.state === 'ready' ? { x: r(actor.x), y: r(actor.y), z: r(actor.z) } : null,
          offset: actor.state === 'ready' ? r(actor.offset) : null,
          placement: actor.placement, probeMs: actor.probeMs, waited: r(actor.waited),
          facing: r(actor.facing), task: actor.task?.kind || null, moving: actor.moving,
          colours: actor.look.colours.map(c => '#' + c.toString(16).padStart(6, '0')),
          fromHome: actor.fromHome, drawn: actor.drawn,
          model: actor.look.source, ownFailed: actor.ownFailed || null, anim: actor.anim,
          walkClipSpeed: actor.walkClipSpeed ? r(actor.walkClipSpeed) : null,
          caption: (captions.get(actor.id)?.seconds || 0) > 0,
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
      drawTimer += delta;
      if (drawTimer >= DRAW_EVERY) { drawTimer = 0; chooseDrawn(playerPosition); }
      updateCaptions(delta, playerPosition);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* bus already cleared */ } }
      offs.length = 0;
      for (const actor of [...actorList]) removeActor(actor);
      for (const rec of captionList) {
        try { rec.voice?.stop?.(); } catch { /* already stopped */ }
        rec.view.dispose();
      }
      captionList.length = 0;
      captions.clear();
      subtitleOwner = null;
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
    // A synchronous question from the pledge world (escorts, a choice beside its
    // giver, a trail target): query = { id, x: null, z: null, found: false }. For
    // one of this scene's people who stands on the ground, set the current world
    // position and found = true; for anyone else leave the query alone.
    offs.push(bus.on('cast:locate', query => {
      const actor = query && actors.get(query.id);
      if (!actor || actor.state !== 'ready') return;
      query.x = actor.x;
      query.z = actor.z;
      query.y = actor.y;
      query.found = true;
    }));
  }

  // ─── people at home, by the story so far ───
  const areas = ctx.areaScenes === false ? CAST_AREAS : (ctx.worldArea ? [ctx.worldArea] : []);
  function reconcile(storyFlags) {
    if (disposed) return;
    flags = storyFlags && typeof storyFlags === 'object' ? storyFlags : {};
    const wanted = new Map();
    for (const area of areas) {
      for (const person of threeRoadsCastAtHome({ area, flags })) if (!wanted.has(person.id)) wanted.set(person.id, person);
    }
    // People a pledge brought in or is moving (fromHome false) are the pledge's to keep.
    for (const actor of [...actorList]) {
      if (!actor.fromHome) continue;
      const person = wanted.get(actor.id);
      const home = person ? localToWorld(person.home.x, person.home.z) : null;
      if (!home || Math.hypot(home.x - actor.want.x, home.z - actor.want.z) > 0.01) removeActor(actor);
    }
    for (const person of wanted.values()) {
      if (actors.has(person.id)) continue;
      const home = localToWorld(person.home.x, person.home.z);
      addActor(person, { x: home.x, z: home.z, facing: person.home.facing, fromHome: true });
    }
  }
  const onStore = state => reconcile(state?.storyFlags);
  Promise.resolve(deps.questStore || defaultQuestStore())
    .then(store => {
      if (disposed) return;
      const off = store?.subscribe?.(onStore); // subscribeQuests calls back once at once
      if (typeof off === 'function') offs.push(off);
      if (flags === null) reconcile(store?.getState?.()?.storyFlags);
    })
    .catch(error => {
      warn('Three Roads cast: the quest store could not be read; homes ignore the story flags', error);
      if (flags === null) reconcile({});
    });
  return api;
}
