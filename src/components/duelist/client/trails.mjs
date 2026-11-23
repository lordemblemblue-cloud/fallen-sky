// Crystal sword trails: while the blade moves fast, a ribbon of light follows its edge and fades within a
// tenth of a second, so a swing reads as one clean arc. Samples are smoothed (Catmull-Rom) between frames.
import * as THREE from 'three';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { trailTwin } from './duelistNodes.mjs';

const VERTEX = /* glsl */`
  attribute float aAlpha; attribute float aEdge;
  varying float vAlpha; varying float vEdge;
  void main() { vAlpha = aAlpha; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uStrength;
  varying float vAlpha; varying float vEdge;
  void main() {
    float core = pow(vEdge, 2.5);              // brightest along the blade's edge
    float a = vAlpha * (0.25 + 0.75 * core) * uStrength;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6) * a * 1.4, a);
  }`;

const SAMPLES = 28; // kept samples (after smoothing)
const LIFE = 0.11; // seconds a sample lasts
const START_SPEED = 5.5; // m/s at the tip before the trail draws

export function createSwordTrail(scene, { color = 0x9fe8ff, base = 0.5, tip = 0.98 } = {}) {
  const positions = new Float32Array(SAMPLES * 2 * 3);
  const alphas = new Float32Array(SAMPLES * 2);
  const edges = new Float32Array(SAMPLES * 2);
  for (let i = 0; i < SAMPLES; i++) { edges[i * 2] = 0; edges[i * 2 + 1] = 1; }
  const index = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(edges, 1));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 1 } } });
  setNodeTwin(material, trailTwin);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const samples = []; // newest first: { b: Vector3, t: Vector3, age }
  const raw = []; // last raw frames (for the spline): { b, t }
  const nowBase = new THREE.Vector3();
  const nowTip = new THREE.Vector3();
  const lastTip = new THREE.Vector3();
  let hasLast = false;
  const catmull = (p0, p1, p2, p3, s, out) => {
    const s2 = s * s;
    const s3 = s2 * s;
    out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * s3 + s2 - 0.5 * s)
      .addScaledVector(p1, 1.5 * s3 - 2.5 * s2 + 1)
      .addScaledVector(p2, -1.5 * s3 + 2 * s2 + 0.5 * s)
      .addScaledVector(p3, 0.5 * s3 - 0.5 * s2);
    return out;
  };

  return {
    mesh,
    /** Each frame: the sword's group (blade along +Y), dt, how bright the trail may be (Will), and whether
     *  the blade is striking (only strikes draw: a hand raised for Telekinesis does not). */
    update(dt, swordGroup, strength = 1, striking = true) {
      swordGroup.updateWorldMatrix(true, false);
      nowBase.set(0, base, 0).applyMatrix4(swordGroup.matrixWorld);
      nowTip.set(0, tip, 0).applyMatrix4(swordGroup.matrixWorld);
      const speed = hasLast && dt > 0 ? nowTip.distanceTo(lastTip) / dt : 0;
      lastTip.copy(nowTip);
      hasLast = true;
      for (const s of samples) s.age += dt;
      while (samples.length && samples[samples.length - 1].age > LIFE) samples.pop();
      if (striking && speed > START_SPEED) {
        raw.unshift({ b: nowBase.clone(), t: nowTip.clone() });
        if (raw.length > 3) raw.pop();
        if (raw.length >= 2) {
          // Keep a comparable length of history at different refresh rates.
          const [r0, r1] = raw;
          const r2 = raw[2] || r1;
          const subdivisions = Math.max(1, Math.min(SAMPLES - 1, Math.round(dt * 180)));
          for (let j = 1; j < subdivisions; j++) {
            const u = j / subdivisions;
            samples.unshift({ b: catmull(r2.b, r1.b, r0.b, r0.b, u, new THREE.Vector3()), t: catmull(r2.t, r1.t, r0.t, r0.t, u, new THREE.Vector3()), age: dt * (1 - u) });
          }
        }
        samples.unshift({ b: nowBase.clone(), t: nowTip.clone(), age: 0 });
        if (samples.length > SAMPLES) samples.length = SAMPLES;
      } else raw.length = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const s = samples[Math.min(i, samples.length - 1)];
        if (!s) { alphas[i * 2] = 0; alphas[i * 2 + 1] = 0; continue; }
        positions.set([s.b.x, s.b.y, s.b.z], i * 6);
        positions.set([s.t.x, s.t.y, s.t.z], i * 6 + 3);
        const a = i < samples.length ? Math.max(0, 1 - s.age / LIFE) : 0;
        alphas[i * 2] = a;
        alphas[i * 2 + 1] = a;
      }
      material.uniforms.uStrength.value = strength;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
      mesh.visible = samples.length > 1;
    },
    dispose() { geometry.dispose(); material.dispose(); mesh.removeFromParent(); },
  };
}
