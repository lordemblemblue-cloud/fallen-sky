// Owner-supplied, optimized Tripo guard models. Media assets are staged in the
// Base44 copy library; they are referenced by URL, not embedded into JS bundles.
// The originals are unskinned static GLBs, so this presenter provides a small
// procedural walk deformation (not a retargeted skeletal animation).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const WOLFVEIL_GUARD_MODELS = Object.freeze({
  blue: 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/18d7c6281_falling_sky_guard_blue_optimized.glb',
  warden: 'https://media.base44.com/files/public/6ab42219a52fd34656a53b37/b06321b8e_falling_sky_guard_warden_game.glb',
});

const loader = new GLTFLoader();
const promises = new Map();
function getModel(variant) {
  const url = WOLFVEIL_GUARD_MODELS[variant];
  if (!url) return Promise.reject(new Error('Unknown guard type'));
  if (!promises.has(url)) {
    promises.set(url, new Promise((resolve, reject) => loader.load(url,
      gltf => resolve(gltf.scene),
      undefined, reject)).catch(error => { promises.delete(url); throw error; }));
  }
  return promises.get(url);
}

function animatedMaterial(source, uniforms) {
  const mat = source.clone();
  mat.onBeforeCompile = shader => {
    shader.uniforms.uGuardStep = uniforms.step;
    shader.uniforms.uGuardStride = uniforms.stride;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGuardStep;\nuniform float uGuardStride;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
       // Approximate the two separate walking legs on unskinned Tripo meshes.
       float leg = 1.0 - smoothstep(0.29, 0.60, position.y);
       float side = position.x < 0.0 ? -1.0 : 1.0;
       float swing = sin(uGuardStep + side * 1.5707963);
       transformed.z += leg * 0.075 * swing * uGuardStride;
       transformed.y += leg * 0.018 * abs(swing) * uGuardStride;
      `);
  };
  mat.customProgramCacheKey = () => 'wolfveil-guard-gait-v1';
  return mat;
}

/** Attach one lightweight visual clone; the caller owns all dialogue and movement.
 * Model loading failures preserve the original procedure-built guard instead.
 */
export function attachWolfveilGuardVisual(parent, variant = 'blue', { onAttached = () => {} } = {}) {
  let disposed = false, root = null, materials = [], time = 0, lastMoving = false;
  const uniforms = { step: {value:0}, stride: {value:0} };
  // Headless Node tests and SSR have no ProgressEvent. Keep the procedural
  // guard in those environments instead of attempting a browser-only GLB fetch.
  if(typeof window!=='undefined'&&typeof ProgressEvent!=='undefined')getModel(variant).then(original => {
    if (disposed || !parent?.parent) return;
    const visual = original.clone(true);
    // Tripo exports stand about 1m high with feet at local y=0.
    // Parent actor is on its actual terrain floor; do not add a new collider.
    visual.scale.setScalar(1.83);
    visual.position.set(0,0,0);
    visual.name = 'FallingSky_'+variant+'_Guard';
    visual.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = false;
      const shared = Array.isArray(node.material) ? node.material : [node.material];
      const unique = shared.filter(Boolean).map(mat => animatedMaterial(mat,uniforms));
      materials.push(...unique);
      if (unique.length) node.material = Array.isArray(node.material) ? unique : unique[0];
    });
    root = visual;
    parent.add(root);
    onAttached(root);
  }).catch(() => { /* An offline/CDN failure keeps the functional low-poly guard. */ });
  return {
    get loaded() { return Boolean(root); },
    update(dt, moving = false) {
      const step = Math.max(0,Math.min(0.1,Number(dt)||0));
      time += step * (moving ? 8 : 0.9);
      lastMoving = moving;
      uniforms.step.value = time;
      uniforms.stride.value = moving ? 1 : 0.04;
      if (root) root.position.y = moving ? Math.abs(Math.sin(time))*0.025 : Math.sin(time)*0.004;
    },
    dispose() {
      disposed = true;
      root?.removeFromParent();
      // Mesh geometry and texture are cached and shared across NPCs; never
      // dispose those for one departing actor. Only release material clones.
      for (const mat of materials) mat.dispose();
      materials = []; root = null;
    },
  };
}
