import test from 'node:test';
import assert from 'node:assert/strict';
import * as WGPU from 'three/webgpu';
import * as TSL from 'three/tsl';
import { createWatercolorNodeMaterial, WATERCOLOR_TSL_NODES } from '../src/components/fantasybattle/world/watercolorNodeMaterial.mjs';

// WGSL built-ins a vertex shader may not use; one in a vertex shader makes the module invalid, so the pipeline is
// invalid and WebGPU rejects every frame that draws it (2026-11-28: the battle arena's bedrock and crystals).
const FRAGMENT_ONLY = /\b(dpdx|dpdy|fwidth|dpdxFine|dpdyFine|dpdxCoarse|dpdyCoarse|fwidthFine|fwidthCoarse|textureSample)\s*\(/;

// three r171 writes a material's WGSL without a GPU: a WebGPURenderer that is never initialised, with a device stub
// for its feature checks, lit as the world is (shadow-casting key light + hemisphere).
function shadersOf(material, geometry = new WGPU.BoxGeometry()) {
  const renderer = new WGPU.WebGPURenderer({ canvas: {} });
  renderer.backend.device = { features: new Set(), limits: {} };
  renderer.shadowMap.enabled = true;
  const scene = new WGPU.Scene(), camera = new WGPU.PerspectiveCamera();
  const key = new WGPU.DirectionalLight('#fff2d6', 2.6);
  key.castShadow = true;
  scene.add(key, new WGPU.HemisphereLight('#d8efff', '#3d5b94', 1.48));
  const mesh = new WGPU.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const builder = renderer.backend.createNodeBuilder(mesh, renderer);
  Object.assign(builder, { scene, camera, material, lightsNode: renderer.lighting.getNode(scene, camera) });
  builder.context.material = material;
  builder.build();
  return { vertex: builder.vertexShader, fragment: builder.fragmentShader };
}

const pixel = () => new WGPU.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
const uniforms = () => Object.fromEntries(['uInk', 'uSat', 'uDiff', 'uReal', 'uEdge', 'uHigh', 'uGran'].map((k) => [k, TSL.uniform(0.5)]));
const watercolor = (params, opts) => createWatercolorNodeMaterial(WGPU, TSL, new WGPU.MeshStandardMaterial(params), opts, uniforms());

test('faceted watercolor materials (arena bedrock, crystals) keep fragment-only built-ins out of the vertex shader', () => {
  const bedrock = watercolor({ color: '#46566b', map: pixel(), normalMap: pixel(), aoMap: pixel(), aoMapIntensity: 0.8, roughness: 0.94 },
    { recess: '#080D1A', mid: '#252D3D', high: '#707D91', faceted: true });
  const crystal = watercolor({ color: '#346fe0', emissive: '#4ea2ff', emissiveMap: pixel(), emissiveIntensity: 0.95, roughness: 0.18, metalness: 0.18 },
    { recess: '#10182B', mid: '#2859B8', high: '#8EE0FF', faceted: true });
  for (const [name, material, geometry] of [['bedrock', bedrock, new WGPU.CylinderGeometry(1, 0.24, 6.4, 36, 8)],
    ['crystal', crystal, new WGPU.CylinderGeometry(0.18, 1, 2, 6)], ['rock', bedrock, new WGPU.IcosahedronGeometry(1, 1)]]) {
    assert.equal(material.flatShading, true, name);
    const { vertex, fragment } = shadersOf(material, geometry);
    assert.doesNotMatch(vertex, FRAGMENT_ONLY, `${name}: vertex shader`);
    assert.match(vertex, /v_watercolorNormalWorld/, `${name}: the tone reads the mesh normal`);
    assert.match(fragment, /\bdpdx\s*\(/, `${name}: three's lighting still uses the flat (face) normal`);
  }
});

test('smooth watercolor materials are unchanged: the tone reads three\'s normalWorld', () => {
  const wetStone = watercolor({ color: '#3f4b58', map: pixel(), normalMap: pixel(), roughness: 0.42 },
    { recess: '#10182B', mid: '#394654', high: '#C6E4F7' });
  assert.equal(wetStone.flatShading, false);
  const { vertex } = shadersOf(wetStone);
  assert.doesNotMatch(vertex, FRAGMENT_ONLY);
  assert.match(vertex, /v_normalWorld/);
  assert.doesNotMatch(vertex, /v_watercolorNormalWorld/);
});

test('the WebGPU world checks for every TSL node the watercolor material uses', () => {
  for (const name of WATERCOLOR_TSL_NODES) assert.ok(TSL[name] != null, name);
});

// What broke the arena in three r171: normalWorld is a vertex-to-fragment varying of normalView, which for a
// flat-shaded material is built from screen derivatives. Remove this control once a three upgrade stops doing it.
test('r171 control: a flat material whose colour reads normalWorld puts dpdx in its vertex shader', () => {
  const material = new WGPU.MeshStandardNodeMaterial({ flatShading: true });
  material.colorNode = TSL.vec4(TSL.normalize(TSL.normalWorld), 1);
  assert.match(shadersOf(material).vertex, FRAGMENT_ONLY);
});
