// WEAPON enchantment renderer (separate from armor, same stage + rarity rules):
//   1. internal light: the shared surface patch (enchantGlowMaterial.js) on CLONES of the held
//      weapon's materials, flowing from the grip to the tip (both limbs from the grip on a bow);
//   2. external aura: a tight, low-overdraw fresnel shell around the weapon's own meshes, never
//      around the player; Common/Unique nearly invisible, layered on Legendary;
//   3. a few anchored sparks for Rare+ at the spark stages (half on the mobile profile).
// It only decorates whatever the weapon runtime currently holds (playerWeaponRuntime getRoots()).
// Nothing here touches combat, hitboxes, damage, skills or the equipment store.
import * as THREE from 'three';
import { resolveEnchantVisualStyle } from './enchantVisualRules.mjs';
import { computeEnchantGeometryAttributes } from './enchantMasks.mjs';
import {
  ENCHANT_FLOW_ATTRIBUTE, ENCHANT_TIME, ENCHANT_TRIM_ATTRIBUTE, ensureEnchantGlowMaterial,
  getEnchantGlowState, isEnchantableMaterial, makeOrnamentMaskTexture, setEnchantGlowStyle,
} from './enchantGlowMaterial.js';
import { enchantMaskDataForMaterial } from './armorEnchantGlow.js';
import { getEnchantQuality } from './enchantQuality.js';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { createWeaponAuraTwin, createWeaponSparkTwin } from './weaponEnchantVfxNodes.mjs';

export const WEAPON_ENCHANT_EXPOSURE = 2.0;
export const WEAPON_COVERAGE_SCALE = 1.25;
// Shell widths in metres (view space), innermost first.
export const WEAPON_AURA_WIDTHS = Object.freeze([0.01, 0.02, 0.032]);
const RETIRE_SECONDS = 4;
const DRAWING_BUFFER = new THREE.Vector2();
const MAX_SPARK_ANCHORS = 192;

const AURA_VERTEX = /* glsl */`
attribute float ${ENCHANT_FLOW_ATTRIBUTE};
uniform float uWidth;
varying float vFlow;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vFlow = ${ENCHANT_FLOW_ATTRIBUTE};
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uWidth;            // inflate in view space: metres, whatever the GLB's scale
  vNormalV = n;
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const AURA_FRAGMENT = /* glsl */`
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uStrength;
uniform float uTime;
uniform float uMotion;
uniform float uStage;
uniform float uLayer;
uniform float uBow;
varying float vFlow;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.0);
  float wave = 0.5 + 0.5 * sin(vFlow * 9.0 - uTime * mix(0.6, 3.0, uMotion) + uLayer * 1.7);
  float sparkStage = step(1.5, uStage) * step(uStage, 4.5);
  float flick = 1.0 - sparkStage * 0.12 * (0.5 + 0.5 * sin(uTime * 13.0 + vFlow * 31.0));
  vec3 col = mix(uColB, uColA, fres);
  col = mix(col, uColC, smoothstep(0.7, 1.0, wave) * uMotion * 0.6);
  if (uStage > 5.5) {
    // Ascended: silver sheath with separate crimson and blue bands (no purple mix)
    float band = fract(vFlow * 2.0 - uTime * 0.08 + uLayer * 0.33);
    col = band < 0.5 ? mix(uColA, uColB, fres) : mix(uColA, uColC, fres);
  }
  float alpha = uStrength * (0.18 + 0.82 * fres) * mix(1.0, 0.65 + 0.55 * wave, uMotion) * flick;
  // hug the blade or limbs, not the hand around the grip
  alpha *= mix(smoothstep(0.04, 0.2, vFlow), 1.0, uBow * 0.4);
  gl_FragColor = vec4(col * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SPARK_VERTEX = /* glsl */`
attribute float aLife;
attribute float aSize;
uniform float uScale;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // aSize is a world size in metres; uScale is the camera's pixels-per-metre at 1 m
  gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.5, 9.0) * step(0.001, aLife);
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FRAGMENT = /* glsl */`
uniform vec3 uColA;
uniform vec3 uColB;
varying float vLife;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.0, r);
  float a = core * core * vLife;
  gl_FragColor = vec4(mix(uColB, uColA, core) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function auraMaterial(layer) {
  const material = new THREE.ShaderMaterial({
    name: `AXE_WeaponEnchantAura_${layer}`,
    vertexShader: AURA_VERTEX,
    fragmentShader: AURA_FRAGMENT,
    uniforms: {
      uWidth: { value: WEAPON_AURA_WIDTHS[layer] },
      uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() },
      uStrength: { value: 0 }, uTime: ENCHANT_TIME, uMotion: { value: 0 }, uStage: { value: 0 },
      uLayer: { value: layer }, uBow: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    fog: false,
  });
  setNodeTwin(material, (classic) => createWeaponAuraTwin(classic, ENCHANT_FLOW_ATTRIBUTE)); // WebGPURenderer
  return material;
}

function sparkMaterial() {
  const material = new THREE.ShaderMaterial({
    name: 'AXE_WeaponEnchantSparks',
    vertexShader: SPARK_VERTEX,
    fragmentShader: SPARK_FRAGMENT,
    uniforms: { uScale: { value: 300 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  setNodeTwin(material, createWeaponSparkTwin); // WebGPURenderer: instanced sprite quads
  return material;
}

/** The weapon frame like the construct effect measures it: longest axis, grip at the root origin. */
export function measureWeaponFrame(root, meshes, kind = 'blade') {
  root.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
  }
  const size = box.getSize(new THREE.Vector3());
  const axis = size.y >= size.x && size.y >= size.z ? new THREE.Vector3(0, 1, 0)
    : size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const lo = box.min.dot(axis); const hi = box.max.dot(axis);
  let reachPos = Math.max(1e-3, hi); let reachNeg = Math.max(1e-3, -lo);
  if (kind !== 'bow' && reachNeg > reachPos) { axis.negate(); [reachPos, reachNeg] = [reachNeg, reachPos]; }
  return { inverse, axis, reach: kind === 'bow' ? Math.max(reachPos, reachNeg) : reachPos, symmetric: kind === 'bow' };
}

// Flow (grip -> tip) and trim attributes for a weapon mesh, in the weapon's root frame.
function prepareWeaponGeometry(mesh, frame) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position) return;
  const meshToRoot = new THREE.Matrix4().multiplyMatrices(frame.inverse, mesh.matrixWorld);
  const key = `w:${frame.axis.toArray().join(',')}:${frame.reach.toFixed(4)}:${frame.symmetric ? 1 : 0}:${meshToRoot.elements.map((v) => v.toFixed(4)).join(',')}`;
  if (geometry.userData.axeEnchantFlow === key && geometry.getAttribute(ENCHANT_FLOW_ATTRIBUTE)) return;
  const positions = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(meshToRoot);
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }
  const { trim, flow } = computeEnchantGeometryAttributes({
    positions, indices: geometry.index ? geometry.index.array : null, flow: 'axis',
    axis: { origin: [0, 0, 0], dir: frame.axis.toArray(), length: frame.reach, symmetric: frame.symmetric },
  });
  // shared with the runtime's cached source scene: deterministic per model, so sharing is safe
  geometry.setAttribute(ENCHANT_TRIM_ATTRIBUTE, new THREE.BufferAttribute(trim, 1));
  geometry.setAttribute(ENCHANT_FLOW_ATTRIBUTE, new THREE.BufferAttribute(flow, 1));
  geometry.userData.axeEnchantFlow = key;
}

function sparkAnchors(root, meshes, frame) {
  const points = [];
  const normals = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const flow = mesh.geometry.getAttribute(ENCHANT_FLOW_ATTRIBUTE);
    if (!position || !normal || !flow) continue;
    const meshToRoot = new THREE.Matrix4().multiplyMatrices(frame.inverse, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(meshToRoot);
    const stride = Math.max(1, Math.floor(position.count / MAX_SPARK_ANCHORS));
    for (let i = 0; i < position.count && points.length < MAX_SPARK_ANCHORS * 3; i += stride) {
      if (flow.getX(i) < 0.25) continue; // anchored along the blade / limbs, never at the hand
      v.fromBufferAttribute(position, i).applyMatrix4(meshToRoot);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      points.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
    }
  }
  return { points: new Float32Array(points), normals: new Float32Array(normals) };
}

function createSparks(root, anchors, count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = 0.006 + Math.random() * 0.006; // 6-12 mm sparks
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2); // anchored to the weapon: no per-frame bounds
  const material = sparkMaterial();
  const points = new THREE.Points(geometry, material);
  points.name = 'AXE_WeaponEnchantSparks';
  points.frustumCulled = false;
  points.renderOrder = 3;
  // world-sized points: pixels per metre at 1 m for this camera and drawing buffer
  points.onBeforeRender = (renderer, scene, camera) => {
    const height = renderer.getDrawingBufferSize(DRAWING_BUFFER).y;
    material.uniforms.uScale.value = camera?.isPerspectiveCamera
      ? height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
      : height;
  };
  root.add(points);
  const state = {
    points, geometry, material, anchors, count,
    age: new Float32Array(count), life: new Float32Array(count),
    origin: new Float32Array(count * 3), drift: new Float32Array(count * 3),
  };
  for (let i = 0; i < count; i++) state.age[i] = -Math.random() * 1.2; // staggered start
  return state;
}

function updateSparks(sparks, delta, rate) {
  const { anchors, count, age, life, origin, drift } = sparks;
  const anchorCount = anchors.points.length / 3;
  const pos = sparks.geometry.attributes.position;
  const alpha = sparks.geometry.attributes.aLife;
  for (let i = 0; i < count; i++) {
    age[i] += delta * rate;
    if (age[i] >= life[i]) {
      if (!anchorCount) { alpha.array[i] = 0; continue; }
      const a = Math.floor(Math.random() * anchorCount);
      origin[i * 3] = anchors.points[a * 3]; origin[i * 3 + 1] = anchors.points[a * 3 + 1]; origin[i * 3 + 2] = anchors.points[a * 3 + 2];
      const out = 0.025 + Math.random() * 0.035;
      drift[i * 3] = anchors.normals[a * 3] * out + (Math.random() - 0.5) * 0.012;
      drift[i * 3 + 1] = anchors.normals[a * 3 + 1] * out + (Math.random() - 0.5) * 0.012;
      drift[i * 3 + 2] = anchors.normals[a * 3 + 2] * out + (Math.random() - 0.5) * 0.012;
      life[i] = 0.35 + Math.random() * 0.4;
      age[i] = age[i] >= 0 ? 0 : age[i];
    }
    const t = Math.max(0, age[i]) / Math.max(1e-3, life[i]);
    pos.array[i * 3] = origin[i * 3] + drift[i * 3] * t;
    pos.array[i * 3 + 1] = origin[i * 3 + 1] + drift[i * 3 + 1] * t;
    pos.array[i * 3 + 2] = origin[i * 3 + 2] + drift[i * 3 + 2] * t;
    alpha.array[i] = age[i] < 0 ? 0 : Math.sin(Math.PI * Math.min(1, t)) * 0.9;
  }
  pos.needsUpdate = true;
  alpha.needsUpdate = true;
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse((node) => {
    if (!node.isMesh || node.isSkinnedMesh || !node.geometry || node.userData.axeEnchantOwned) return;
    if (node.name === 'WeaponBowString' || node.parent?.userData?.axeEnchantOwned) return;
    meshes.push(node);
  });
  return meshes;
}

/**
 * Decorate one weapon root for a resolved style. Returns an entry the controller keeps;
 * restore(entry) puts the original materials back and frees everything the entry owns.
 */
export function decorateWeaponRoot(root, style, { kind = 'blade' } = {}) {
  const meshes = collectMeshes(root);
  const entry = { root, kind, meshes: [], auras: [], sparks: null, style: null, retiredAt: null };
  if (!meshes.length) return entry;
  const frame = measureWeaponFrame(root, meshes, kind);
  for (const mesh of meshes) {
    prepareWeaponGeometry(mesh, frame);
    const original = mesh.material;
    const list = Array.isArray(original) ? original : [original];
    if (!list.length || !list.every(isEnchantableMaterial)) {
      entry.meshes.push({ mesh, original, patched: null });
      continue;
    }
    const clones = list.map((material) => {
      const clone = material.clone();
      clone.name = `${material.name || 'weapon'}_enchant`;
      const data = enchantMaskDataForMaterial(material);
      const mask = data ? makeOrnamentMaskTexture(data) : null;
      ensureEnchantGlowMaterial(clone, { mask });
      return clone;
    });
    const patched = Array.isArray(original) ? clones : clones[0];
    mesh.material = patched;
    entry.meshes.push({ mesh, original, patched });
  }
  entry.anchors = sparkAnchors(root, meshes, frame);
  applyWeaponStyle(entry, style);
  return entry;
}

function ensureAuras(entry, layers) {
  while (entry.auras.length > layers) {
    const aura = entry.auras.pop();
    aura.meshes.forEach((m) => m.removeFromParent());
    aura.material.dispose();
  }
  while (entry.auras.length < layers) {
    const layer = entry.auras.length;
    const material = auraMaterial(layer);
    const meshes = entry.meshes.map(({ mesh }) => {
      const shell = new THREE.Mesh(mesh.geometry, material); // shares the weapon geometry: no copy
      shell.name = `AXE_WeaponEnchantAura_${layer}`;
      shell.userData.axeEnchantOwned = true;
      shell.castShadow = false;
      shell.receiveShadow = false;
      shell.renderOrder = 2 + layer;
      shell.frustumCulled = mesh.frustumCulled;
      mesh.add(shell);
      return shell;
    });
    entry.auras.push({ material, meshes });
  }
}

export function applyWeaponStyle(entry, style) {
  entry.style = style;
  const active = Boolean(style?.active);
  // a weapon is small on screen: a little more of its engraving carries light than on armor
  const surface = active ? { ...style, coverage: style.coverage * WEAPON_COVERAGE_SCALE } : style;
  for (const { patched } of entry.meshes) {
    for (const material of patched ? (Array.isArray(patched) ? patched : [patched]) : []) {
      setEnchantGlowStyle(material, surface, { exposure: WEAPON_ENCHANT_EXPOSURE });
    }
  }
  const aura = active && style.externalAura ? style.externalAura : null;
  ensureAuras(entry, aura ? aura.layers : 0);
  entry.auras.forEach(({ material }, layer) => {
    const u = material.uniforms;
    u.uColA.value.set(style.palette.primary);
    u.uColB.value.set(style.palette.secondary);
    u.uColC.value.set(style.palette.tertiary);
    if (style.accent && layer > 0) u.uColB.value.set(style.accent); // outer layers carry the rarity accent
    u.uStrength.value = aura.strength * (layer === 0 ? 0.7 : layer === 1 ? 0.42 : 0.26);
    u.uMotion.value = style.motion;
    u.uStage.value = style.stageIndex;
    u.uBow.value = entry.kind === 'bow' ? 1 : 0;
  });
  const sparkCount = active ? style.sparks : 0;
  if (entry.sparks && entry.sparks.count !== sparkCount) disposeSparks(entry);
  if (!entry.sparks && sparkCount > 0 && entry.anchors?.points.length) entry.sparks = createSparks(entry.root, entry.anchors, sparkCount);
  if (entry.sparks) {
    entry.sparks.material.uniforms.uColA.value.set(style.palette.tertiary);
    entry.sparks.material.uniforms.uColB.value.set(style.stageIndex > 5 ? style.palette.secondary : style.palette.primary);
  }
}

function disposeSparks(entry) {
  if (!entry.sparks) return;
  entry.sparks.points.removeFromParent();
  entry.sparks.geometry.dispose();
  entry.sparks.material.dispose();
  entry.sparks = null;
}

/** Put the weapon's own materials back and free everything this entry created. */
export function restoreWeaponRoot(entry) {
  ensureAuras(entry, 0);
  disposeSparks(entry);
  for (const record of entry.meshes) {
    const { mesh, original, patched } = record;
    if (!patched) continue;
    // the construct effect may hold its own clone right now; it restores `patched` later, so
    // only swap back what is actually on the mesh
    if (mesh.material === patched) mesh.material = original;
    (Array.isArray(patched) ? patched : [patched]).forEach((material) => material.dispose());
    record.patched = null;
  }
}

const setVisible = (entry, visible) => {
  entry.auras.forEach(({ meshes }) => meshes.forEach((m) => { m.visible = visible; }));
  if (entry.sparks) entry.sparks.points.visible = visible;
};

/**
 * The per-player controller. Call update() every frame after the weapon runtime has posed the
 * weapon: update(delta, { roots, item, kind }) where roots = runtime.getRoots(), item = the active
 * equipped weapon item and kind = 'bow' | 'blade'. getPercent(item) supplies the enchant percent.
 */
export function createWeaponEnchantVfx({ getPercent, getQuality = getEnchantQuality } = {}) {
  const entries = new Map(); // root -> entry
  const retiring = new Set();
  let elapsed = 0;

  function retire(entry) {
    entry.retiredAt = elapsed;
    setVisible(entry, false); // no ghost aura while the old weapon melts away
    for (const { patched } of entry.meshes) {
      (patched ? (Array.isArray(patched) ? patched : [patched]) : []).forEach((material) => {
        const state = getEnchantGlowState(material);
        if (state) state.uniforms.uAxeGain.value = 0;
      });
    }
    retiring.add(entry);
  }

  let lastKey = null;
  let lastStyle = null;
  let lastSignature = '';
  const live = [];

  function update(delta, { roots = [], item = null, kind = 'blade', visible = true } = {}) {
    elapsed += Math.max(0, Number(delta) || 0);
    live.length = 0;
    for (const root of roots || []) if (root) live.push(root);
    for (const [root, entry] of entries) {
      if (!live.includes(root)) { entries.delete(root); retire(entry); }
    }
    // resolve the style only when the item, its percentage, the quality or the kind changes
    const percent = item ? Number(getPercent?.(item)) || 0 : 0;
    const quality = getQuality();
    const key = item ? `${item.instanceId || item.id}|${percent}|${item.rarity}|${quality}|${kind}` : '';
    if (key !== lastKey) {
      lastKey = key;
      lastStyle = item ? resolveEnchantVisualStyle({ rarity: item.rarity, percent, category: 'weapon', quality }) : null;
      lastSignature = lastStyle?.active ? key : '';
    }
    const style = lastStyle;
    for (const root of live) {
      let entry = entries.get(root);
      if (!entry) {
        if (!lastSignature) continue; // an unenchanted weapon keeps its own materials untouched
        entry = decorateWeaponRoot(root, style, { kind });
        entry.signature = lastSignature;
        entries.set(root, entry);
      } else if (entry.signature !== lastSignature) {
        applyWeaponStyle(entry, style);
        entry.signature = lastSignature;
      }
      // while the forming/melting effect has swapped the materials, hide the aura and sparks
      const constructing = entry.meshes.some(({ mesh, patched }) => patched && mesh.material !== patched);
      setVisible(entry, visible && !constructing && Boolean(style?.active));
      if (entry.sparks && entry.sparks.points.visible) updateSparks(entry.sparks, delta, 1 + style.motion);
    }
    for (const entry of retiring) {
      // free once the old weapon has left the scene graph (melt done) or after a short grace
      if (!entry.root.parent || elapsed - entry.retiredAt > RETIRE_SECONDS) {
        restoreWeaponRoot(entry);
        retiring.delete(entry);
      }
    }
  }

  return {
    update,
    /** QA: what the held weapon shows. */
    describe: () => [...entries.values()].map((entry) => ({
      root: entry.root.name, stage: entry.style?.stageLabel || null, rarity: entry.style?.rarity || null,
      percent: entry.style?.percent ?? null, meshes: entry.meshes.length, auraLayers: entry.auras.length,
      sparks: entry.sparks?.count || 0, auraVisible: entry.auras[0]?.meshes[0]?.visible ?? false,
    })),
    activeCount: () => entries.size,
    retiringCount: () => retiring.size,
    dispose() {
      for (const entry of entries.values()) restoreWeaponRoot(entry);
      for (const entry of retiring) restoreWeaponRoot(entry);
      entries.clear();
      retiring.clear();
    },
  };
}
