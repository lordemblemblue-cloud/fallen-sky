/**
 * Runtime fixes for three.js 0.171's WebGPURenderer, applied once per page by webgpuSceneRenderer.js.
 * Each fix replaces one method with a copy of three's own code (MIT, three.js authors) plus the change described;
 * remove a fix when the `three` version in package-lock.json ships the equivalent.
 *
 * 1. MorphNode.setup: skip morph targets whose influence is 0.
 *    r171's TSL loop reads every morph target (position and normal) for every vertex, whatever its influence.
 *    WebGL's GLSL (morphtarget_vertex) skips zero influences. The fused characters have 44-73 shape keys and
 *    only a handful active, so on WebGPU 25 such meshes cost ~30 ms of GPU time a frame in Wolfveil town
 *    (measured 2026-11-20 on an AMD Radeon 780M: 40.3 ms scene pass, 10.8 ms without those meshes).
 *
 * 2. InstanceNode.setup: also record its instance-matrix node on the node builder, so a material's positionNode can
 *    read it (webgpuNodeKit.js `instanceMatrix()`): GLSL wind patches move vertices before instancing.
 *
 * 3. NodeMaterialObserver.containsNode: a material marked `nodesStatic` (webgpuNodeKit.js attachNodes) does not
 *    count as "has nodes". r171 re-uploads the uniforms of EVERY object whose material has any node, every frame
 *    (~37 us an object on this PC); the node graphs this game attaches only read shared per-render uniforms,
 *    materialReference() values and textures, which three already refreshes once per render (the first object of
 *    each shader in a render is always refreshed) or when the material changes.
 */
import { MorphNode, InstanceNode, NodeMaterialObserver } from 'three/webgpu';
import {
  float, int, ivec2, If, Loop, textureLoad, reference, positionLocal, normalLocal, instanceIndex, vertexIndex, Fn,
} from 'three/tsl';
import { DataArrayTexture, FloatType, Vector2, Vector4 } from 'three';

let installed = false;

// --- 1. morph targets ----------------------------------------------------------------------------------------------
const morphTextures = new WeakMap();
const morphVec4 = new Vector4();

const getMorph = Fn(({ bufferMap, influence, stride, width, depth, offset }) => {
  const texelIndex = int(vertexIndex).mul(stride).add(offset);
  const y = texelIndex.div(width);
  const x = texelIndex.sub(y.mul(width));
  const bufferAttrib = textureLoad(bufferMap, ivec2(x, y)).depth(depth);
  return bufferAttrib.mul(influence);
});

// three's getEntry (MorphNode.js, not exported): every morph target packed into one DataArrayTexture per geometry
function getMorphEntry(geometry) {
  const hasMorphPosition = geometry.morphAttributes.position !== undefined;
  const hasMorphNormals = geometry.morphAttributes.normal !== undefined;
  const hasMorphColors = geometry.morphAttributes.color !== undefined;
  const morphAttribute = geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color;
  const morphTargetsCount = morphAttribute !== undefined ? morphAttribute.length : 0;
  let entry = morphTextures.get(geometry);
  if (entry === undefined || entry.count !== morphTargetsCount) {
    if (entry !== undefined) entry.texture.dispose();
    const morphTargets = geometry.morphAttributes.position || [];
    const morphNormals = geometry.morphAttributes.normal || [];
    const morphColors = geometry.morphAttributes.color || [];
    let vertexDataCount = 0;
    if (hasMorphPosition === true) vertexDataCount = 1;
    if (hasMorphNormals === true) vertexDataCount = 2;
    if (hasMorphColors === true) vertexDataCount = 3;
    let width = geometry.attributes.position.count * vertexDataCount;
    let height = 1;
    const maxTextureSize = 4096;
    if (width > maxTextureSize) {
      height = Math.ceil(width / maxTextureSize);
      width = maxTextureSize;
    }
    const buffer = new Float32Array(width * height * 4 * morphTargetsCount);
    const bufferTexture = new DataArrayTexture(buffer, width, height, morphTargetsCount);
    bufferTexture.type = FloatType;
    bufferTexture.needsUpdate = true;
    const vertexDataStride = vertexDataCount * 4;
    for (let i = 0; i < morphTargetsCount; i++) {
      const morphTarget = morphTargets[i];
      const morphNormal = morphNormals[i];
      const morphColor = morphColors[i];
      const offset = width * height * 4 * i;
      for (let j = 0; j < morphTarget.count; j++) {
        const stride = j * vertexDataStride;
        if (hasMorphPosition === true) {
          morphVec4.fromBufferAttribute(morphTarget, j);
          buffer[offset + stride + 0] = morphVec4.x;
          buffer[offset + stride + 1] = morphVec4.y;
          buffer[offset + stride + 2] = morphVec4.z;
          buffer[offset + stride + 3] = 0;
        }
        if (hasMorphNormals === true) {
          morphVec4.fromBufferAttribute(morphNormal, j);
          buffer[offset + stride + 4] = morphVec4.x;
          buffer[offset + stride + 5] = morphVec4.y;
          buffer[offset + stride + 6] = morphVec4.z;
          buffer[offset + stride + 7] = 0;
        }
        if (hasMorphColors === true) {
          morphVec4.fromBufferAttribute(morphColor, j);
          buffer[offset + stride + 8] = morphVec4.x;
          buffer[offset + stride + 9] = morphVec4.y;
          buffer[offset + stride + 10] = morphVec4.z;
          buffer[offset + stride + 11] = morphColor.itemSize === 4 ? morphVec4.w : 1;
        }
      }
    }
    entry = { count: morphTargetsCount, texture: bufferTexture, stride: vertexDataCount, size: new Vector2(width, height) };
    morphTextures.set(geometry, entry);
    const disposeTexture = () => {
      bufferTexture.dispose();
      morphTextures.delete(geometry);
      geometry.removeEventListener('dispose', disposeTexture);
    };
    geometry.addEventListener('dispose', disposeTexture);
  }
  return entry;
}

function morphSetupSkippingZeroInfluence(builder) {
  const { geometry } = builder;
  const hasMorphPosition = geometry.morphAttributes.position !== undefined;
  const hasMorphNormals = geometry.hasAttribute('normal') && geometry.morphAttributes.normal !== undefined;
  const morphAttribute = geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color;
  const morphTargetsCount = morphAttribute !== undefined ? morphAttribute.length : 0;
  const { texture: bufferMap, stride, size } = getMorphEntry(geometry);
  if (hasMorphPosition === true) positionLocal.mulAssign(this.morphBaseInfluence);
  if (hasMorphNormals === true) normalLocal.mulAssign(this.morphBaseInfluence);
  const width = int(size.width);
  Loop(morphTargetsCount, ({ i }) => {
    const influence = float(0).toVar();
    if (this.mesh.count > 1 && (this.mesh.morphTexture !== null && this.mesh.morphTexture !== undefined)) {
      influence.assign(textureLoad(this.mesh.morphTexture, ivec2(int(i).add(1), int(instanceIndex))).r);
    } else {
      influence.assign(reference('morphTargetInfluences', 'float').element(i).toVar());
    }
    // the fix: as WebGL's morphtarget_vertex, nothing is read for a target that is not in use
    If(influence.notEqual(0), () => {
      if (hasMorphPosition === true) {
        positionLocal.addAssign(getMorph({ bufferMap, influence, stride, width, depth: i, offset: int(0) }));
      }
      if (hasMorphNormals === true) {
        normalLocal.addAssign(getMorph({ bufferMap, influence, stride, width, depth: i, offset: int(1) }));
      }
    });
  });
}

// --- 2. instance matrix for material nodes ---------------------------------------------------------------------
function patchInstanceNode() {
  const setup = InstanceNode?.prototype?.setup;
  if (!setup) return;
  InstanceNode.prototype.setup = function setupRecordingMatrix(builder) {
    const result = setup.call(this, builder);
    if (this.instanceMatrixNode) builder.__sceneInstanceMatrixNode = this.instanceMatrixNode;
    return result;
  };
}

// --- 3. static node materials ----------------------------------------------------------------------------------
// ...and `material.nodeVersion`: bump it when something a static graph reads changes outside three's view (a
// texture node swapped from a placeholder to the loaded texture); every object of that material then refreshes once.
function patchObserver() {
  const containsNode = NodeMaterialObserver?.prototype?.containsNode;
  if (!containsNode) return;
  const equals = NodeMaterialObserver.prototype.equals;
  NodeMaterialObserver.prototype.equals = function equalsWithNodeVersion(renderObject) {
    const version = renderObject?.material?.nodeVersion;
    if (version !== undefined) {
      const data = this.getRenderObjectData(renderObject);
      if (data.sceneNodeVersion !== version) {
        data.sceneNodeVersion = version;
        return false;
      }
    }
    return equals.call(this, renderObject);
  };
  NodeMaterialObserver.prototype.containsNode = function containsDynamicNode(builder) {
    if (builder?.material?.nodesStatic === true &&
        builder.renderer?.nodes?.modelViewMatrix == null && builder.renderer?.nodes?.modelNormalViewMatrix == null) {
      return false;
    }
    return containsNode.call(this, builder);
  };
}

export function installWebGPUThreeFixes() {
  if (installed) return;
  installed = true;
  if (MorphNode?.prototype?.setup) MorphNode.prototype.setup = morphSetupSkippingZeroInfluence;
  patchInstanceNode();
  patchObserver();
}
