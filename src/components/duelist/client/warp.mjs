// Bent space: Telekinesis visibly warps the picture. A post-processing pass displaces the rendered image
// around world points: rings that run outward (a push, a throw, a resist burst) or fold inward (a pull, a
// breach), and a swirling lens around a body held in a grip. The bend splits the colours slightly at its edge
// and leaves a faint glow, so the wave reads as space moving, not as a light.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createWarpField, MAX_WARP_EFFECTS } from './warpField.mjs';

const MAX = MAX_WARP_EFFECTS;

const WarpShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: 1 },
    uCount: { value: 0 },
    uA: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // centre uv xy, radius (screen heights), strength
    uB: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // kind (0 out, 1 in, 2 lens), thickness, spin, 0
    uTint: { value: new THREE.Color(0x9fdcff) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uAspect; uniform int uCount; uniform vec4 uA[${MAX}]; uniform vec4 uB[${MAX}]; uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      vec2 offset = vec2(0.0);
      float glow = 0.0;
      float split = 0.0;
      for (int i = 0; i < ${MAX}; i++) {
        if (i >= uCount) break;
        vec4 a = uA[i];
        vec4 b = uB[i];
        vec2 d = p - vec2(a.x * uAspect, a.y);
        float r = length(d);
        vec2 n = r > 1e-5 ? d / r : vec2(0.0);
        if (b.x < 1.5) {
          // a ring: pixels near it are pulled from inside (out) or from outside (in), so the wave seems to move
          float band = exp(-pow((r - a.z) / max(1e-4, b.y), 2.0));
          float s = a.w * band;
          offset += n * (b.x < 0.5 ? -s : s);
          split += s;
          glow += band * a.w;
        } else {
          // a lens: inside the radius the picture swells and turns
          float inside = 1.0 - smoothstep(a.z * 0.15, a.z, r);
          float ang = b.z * inside * inside;
          vec2 turned = vec2(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang));
          offset += (turned - d) - d * inside * a.w;
          split += inside * a.w * 0.25;
          glow += inside * a.w * 0.35;
        }
      }
      offset.x /= uAspect;
      vec2 uv = vUv + offset;
      vec2 fringe = offset * (1.0 + split * 8.0) * 0.35;
      vec3 c = vec3(
        texture2D(tDiffuse, uv + fringe).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - fringe).b);
      c += uTint * min(0.6, glow * 1.6);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createWarp(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const pass = new ShaderPass(WarpShader);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  const u = pass.material.uniforms;
  const field = createWarpField();
  const ndc = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  // screen-height units per metre at a world point (0 when behind the camera)
  const project = (at) => {
    ndc.copy(at).project(camera);
    if (ndc.z > 1 || ndc.z < -1) return null;
    const distance = toCamera.copy(at).sub(camera.position).length();
    const perMetre = 1 / (2 * Math.max(0.1, distance) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    return { x: (ndc.x + 1) / 2, y: (ndc.y + 1) / 2, perMetre };
  };

  return {
    /**
     * A ring of bent space at a world point. kind 'out' (runs outward) or 'in' (folds inward); radius from
     * r0 to r1 metres over ttl seconds; strength in screen heights of displacement.
     */
    ring(options) { field.ring(options); },
    hold(list) { field.hold(list); },
    update(dt) { field.update(dt); },
    render() {
      const size = renderer.getSize(new THREE.Vector2());
      u.uAspect.value = size.x / Math.max(1, size.y);
      u.uCount.value = field.write(project, (i, x, y, radius, strength, kind, thickness, spin) => {
        u.uA.value[i].set(x, y, radius, strength);
        u.uB.value[i].set(kind, thickness, spin, 0);
      });
      composer.render();
    },
    setSize(width, height) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(width, height); },
    dispose() { composer.dispose(); pass.material.dispose(); },
  };
}
