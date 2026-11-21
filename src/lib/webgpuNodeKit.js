/**
 * Helpers for the TSL versions of the game's GLSL materials (WebGPURenderer, either backend).
 *
 * Two ways a GLSL material gets its node version:
 *  - `onBeforeCompile` patches on built-in materials: `attachNodes(material, {positionNode, colorNode, ...})` puts
 *    the nodes on the SAME material. The classic WebGLRenderer ignores them and keeps running the GLSL patch;
 *    WebGPURenderer ignores the patch and builds from the nodes (it copies a classic material's properties into a
 *    node material when it builds the shader).
 *  - `ShaderMaterial`: a separate NodeMaterial twin (webgpuMaterialTwins.js).
 *
 * Rules that keep WebGPURenderer (three r171) both correct and cheap:
 *  - A node graph must be shared by every material that shares the classic program key (r171 keys a classic
 *    material's pipeline by `customProgramCacheKey()` plus property values, not by node identity). attachNodes
 *    appends the graph's node ids to the key, so a material with a different graph gets its own pipeline either way.
 *  - Per-material values go through `materialReference(...)` (read from whichever material is drawn), global ones
 *    through `uniformOf(...)` / `sharedUniform(...)`, which live in the per-render uniform group, so one upload
 *    serves every object.
 *  - Materials whose nodes hold only such uniforms are marked `nodesStatic`: r171 otherwise re-uploads every
 *    object's uniforms every frame as soon as a material has any node (see webgpuThreeFixes.js).
 *
 * No browser globals at import: node tests can load modules that use this.
 */
import { Node } from 'three/webgpu';
import {
  reference, renderGroup, nodeObject, mat4, float, vec2, vec4, Fn, fract, sin, dot, floor, mix, varying,
  modelWorldMatrix, normalLocal, positionLocal,
} from 'three/tsl';

// ---- the current object's instance matrix --------------------------------------------------------------------
// r171's InstanceNode applies the instance matrix to positionLocal before a material's positionNode runs, but does
// not expose it. webgpuThreeFixes.js records it on the node builder; this node reads it back (identity for meshes
// that are not instanced). GLSL patches that move `transformed` before instancing do the same with:
//   positionLocal + instanceMatrix * vec4(offset, 0)
class InstanceMatrixAccessNode extends Node {
  static get type() { return 'InstanceMatrixAccessNode'; }
  constructor() { super('mat4'); }
  setup(builder) {
    return builder.__sceneInstanceMatrixNode || mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }
}
export const instanceMatrix = () => nodeObject(new InstanceMatrixAccessNode());

/** World position of the instance's origin: GLSL `(modelMatrix * instanceMatrix * vec4(0,0,0,1)).xyz`. */
export const instanceRootWorld = () => modelWorldMatrix.mul(instanceMatrix().mul(vec4(0, 0, 0, 1))).xyz;

/**
 * A positionNode that moves the vertex by `offset` given in the instance's own space, as GLSL patches that add to
 * `transformed` before `project_vertex` applies instanceMatrix (`offset` may use positionGeometry for the
 * un-instanced position).
 */
export const offsetBeforeInstancing = (offset) => positionLocal.add(instanceMatrix().mul(vec4(offset, 0)).xyz);

// ---- uniforms -----------------------------------------------------------------------------------------------------
/** A classic `{ value }` uniform object as a live node in the shared per-render group (one upload per frame). */
export function uniformOf(uniformObject, type) {
  return reference('value', type, uniformObject).setGroup(renderGroup);
}
/** A property of any object (e.g. a Color, a Vector2 or a plain number field) as a shared live uniform. */
export function sharedUniform(object, property, type) {
  return reference(property, type, object).setGroup(renderGroup);
}

// ---- attaching nodes to a classic material ---------------------------------------------------------------------
const NODE_KEYS = ['positionNode', 'colorNode', 'normalNode', 'roughnessNode', 'metalnessNode', 'emissiveNode',
  'opacityNode', 'aoNode', 'alphaTestNode', 'outputNode', 'fragmentNode', 'vertexNode', 'castShadowNode',
  'receivedShadowNode', 'lightsNode', 'envNode', 'backdropNode', 'depthNode', 'mrtNode'];

const setupIds = new WeakMap();
let nextSetupId = 1;

/**
 * Put TSL nodes on a classic material (see the header). `nodesStatic` (default true) declares that the nodes only
 * use shared uniforms, materialReference() values and textures.
 *
 * `setup(nodeMaterial)` runs on the node material WebGPURenderer converts the classic one into, before it is
 * built, and may wrap its setup methods: e.g. a pigment that must come after vertex colours (GLSL after
 * `#include <color_fragment>`) wraps `setupDiffuseColor` and reassigns `diffuseColor`. Setups run in the order
 * they were attached, so patches compose as their GLSL hooks did. Share one setup function between all materials
 * of a shader variant.
 */
export function attachNodes(material, nodes = {}, { nodesStatic = true, setup = null } = {}) {
  if (!material) return material;
  for (const [key, node] of Object.entries(nodes)) {
    if (!NODE_KEYS.includes(key)) throw new Error(`attachNodes: unknown node slot ${key}`);
    material[key] = node ?? null;
  }
  if (typeof setup === 'function') {
    if (!setupIds.has(setup)) setupIds.set(setup, nextSetupId++);
    const setups = Array.isArray(material.nodeSetups) ? material.nodeSetups.filter((s) => s !== setup) : [];
    material.nodeSetups = [...setups, setup];
  }
  const ids = NODE_KEYS.filter((k) => material[k]?.isNode).map((k) => `${k}=${material[k].id}`);
  for (const s of material.nodeSetups || []) ids.push(`setup=${setupIds.get(s)}`);
  material.__sceneNodeKey = ids.length ? `|nodes:${ids.join(',')}` : '';
  material.nodesStatic = nodesStatic === true && material.nodesStatic !== false;
  if (!material.__sceneNodeKeyWrapped) {
    const prior = material.customProgramCacheKey;
    material.customProgramCacheKey = function sceneNodeProgramKey() {
      return String(prior.call(this)) + (this.__sceneNodeKey || '');
    };
    material.__sceneNodeKeyWrapped = true;
  }
  material.needsUpdate = true;
  return material;
}

/** Remove what attachNodes added (a decorator's dispose); the remaining setups/nodes keep their key. */
export function detachSetup(material, setup) {
  if (!material || !Array.isArray(material.nodeSetups)) return;
  material.nodeSetups = material.nodeSetups.filter((s) => s !== setup);
  attachNodes(material, {}, { nodesStatic: material.nodesStatic !== false });
}

/** Used by webgpuSceneRenderer.js on every classic material WebGPURenderer converts. */
export function applyNodeSetups(classic, nodeMaterial) {
  const setups = classic?.nodeSetups;
  if (!nodeMaterial || !Array.isArray(setups)) return nodeMaterial;
  for (const setup of setups) setup(nodeMaterial, classic);
  return nodeMaterial;
}

// ---- world-space geometry normal ---------------------------------------------------------------------------------
// The GLSL patches use normalize(mat3(modelMatrix) * objectNormal) (after instancing / skinning). three's
// `normalWorld` is not safe for that: it is a varying of normalView, which for `flatShading` materials is built
// from screen derivatives, invalid in the vertex stage (WGSL rejects it and, in WebGPU, one invalid pipeline
// voids the whole frame). Normalize it where it is read.
export const geometryNormalWorld = varying(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz, 'v_sceneGeometryNormalWorld');

// ---- small shared functions -----------------------------------------------------------------------------------
/** fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453) - the classic GLSL hash used by several patches. */
export const sinHash21 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

/** 2D value noise over sinHash21 (smoothstep interpolation), as `wvSplatNoise` / `livingInkNoise` in the GLSL. */
export const sinValueNoise2 = Fn(([p]) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();
  const a = sinHash21(i);
  const b = sinHash21(i.add(vec2(1, 0)));
  const c = sinHash21(i.add(vec2(0, 1)));
  const d = sinHash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});
