// The practice arena: a circular duelling floor on a high platform at dusk, a ring of light at its edge,
// crystal pylons around it and a far skyline. Original; procedural (no textures to load).
// Waves of Telekinesis light the floor's hex lines as they pass: arc(), from a body outward or inward.
import * as THREE from 'three';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { arenaFloorTwin } from './duelistNodes.mjs';

export const FLOOR_VERTEX = /* glsl */`
  varying vec2 vXZ;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Any floor can carry the waves (the arena's, a mission's rooms): this chunk in its fragment shader, and
// createFloorWaves() for the uniforms and the waves themselves.
export const WAVE_GLSL = /* glsl */`
  uniform vec3 uWaveColor; uniform int uWaveCount;
  uniform vec4 uWaveA[6]; // origin x, z, front radius (m), strength
  uniform vec4 uWaveB[6]; // facing (rad), cos(half arc), band width (m), 0
  float floorWave(vec2 xz) {
    float wave = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= uWaveCount) break;
      vec2 d = xz - uWaveA[i].xy;
      float dist = length(d);
      vec2 facing = vec2(sin(uWaveB[i].x), cos(uWaveB[i].x));
      float along = dist > 1e-3 ? dot(d / dist, facing) : 1.0;
      float inArc = smoothstep(uWaveB[i].y - 0.12, uWaveB[i].y + 0.04, along);
      float band = exp(-pow((dist - uWaveA[i].z) / uWaveB[i].z, 2.0));
      wave += band * inArc * uWaveA[i].w;
    }
    return wave;
  }`;

export function createFloorWaves({ color = 0x9fe6ff } = {}) {
  const uniforms = { uWaveColor: { value: new THREE.Color(color) }, uWaveCount: { value: 0 },
    uWaveA: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uWaveB: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } };
  const waves = []; // { x, z, yaw, cosHalf, from, to, width, strength, ttl, age }
  return {
    uniforms,
    /**
     * A wave across the floor from (x, z): facing yaw (rad), arc (deg, 360 = a full ring), its front running
     * from `from` to `to` metres (to < from: it folds inward) over ttl seconds.
     */
    arc({ x, z, yaw = 0, arc = 360, from = 0.3, to = 8, width = 0.7, strength = 1, ttl = 0.5 }) {
      if (waves.length >= 6) waves.shift();
      waves.push({ x, z, yaw, cosHalf: arc >= 359 ? -2 : Math.cos(THREE.MathUtils.degToRad(arc / 2)), from, to, width, strength, ttl, age: 0 });
    },
    update(dt) {
      let n = 0;
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.age += dt / w.ttl;
        if (w.age >= 1) { waves.splice(i, 1); continue; }
      }
      for (const w of waves) {
        const k = 1 - Math.pow(1 - w.age, 2);
        uniforms.uWaveA.value[n].set(w.x, w.z, w.from + (w.to - w.from) * k, w.strength * (1 - w.age));
        uniforms.uWaveB.value[n].set(w.yaw, w.cosHalf, w.width, 0);
        n += 1;
      }
      uniforms.uWaveCount.value = n;
    },
  };
}

const FLOOR_FRAGMENT = /* glsl */`
  uniform float uRadius; uniform float uTime; uniform vec3 uBase; uniform vec3 uLine; uniform vec3 uEdge;
  ${WAVE_GLSL}
  varying vec2 vXZ;
  // hexagonal cell distance (0 at a cell centre, 0.5 at its edge)
  float hexEdge(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5;
    vec2 b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    return max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
  }
  void main() {
    float r = length(vXZ);
    float cells = smoothstep(0.47, 0.5, hexEdge(vXZ * 0.9));
    float rings = smoothstep(0.92, 1.0, abs(sin(r * 0.9 - uTime * 0.6)));
    float edge = smoothstep(uRadius - 0.6, uRadius - 0.05, r) * (1.0 - smoothstep(uRadius, uRadius + 0.05, r));
    vec3 c = uBase + uLine * (cells * 0.35 + rings * 0.12 * (1.0 - r / uRadius)) + uEdge * edge * 2.2;
    c += uWaveColor * floorWave(vXZ) * (0.18 + cells * 1.8);
    gl_FragColor = vec4(c, 1.0);
  }`;

export function createArena({ radius = 18 } = {}) {
  const group = new THREE.Group();
  group.name = 'DuelArena';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const waves = createFloorWaves();
  const floorUniforms = { uRadius: { value: radius }, uTime: { value: 0 }, uBase: { value: new THREE.Color(0x0d1420) },
    uLine: { value: new THREE.Color(0x3fa7ff) }, uEdge: { value: new THREE.Color(0x7fe9ff) }, ...waves.uniforms };
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(radius + 0.3, 96)),
    keep(setNodeTwin(new THREE.ShaderMaterial({ vertexShader: FLOOR_VERTEX, fragmentShader: FLOOR_FRAGMENT, uniforms: floorUniforms }), arenaFloorTwin)));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // shadow catcher over the patterned floor
  const shadow = new THREE.Mesh(keep(new THREE.CircleGeometry(radius, 64)), keep(new THREE.ShadowMaterial({ opacity: 0.35 })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.receiveShadow = true;
  group.add(shadow);
  // the platform's rim and underside
  const rim = new THREE.Mesh(keep(new THREE.CylinderGeometry(radius + 0.3, radius - 1.5, 2.4, 96, 1, true)),
    keep(new THREE.MeshStandardMaterial({ color: 0x1a2232, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })));
  rim.position.y = -1.2;
  group.add(rim);
  // crystal pylons
  const pylonMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x2a3b55, emissive: 0x2bb8ff, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25, flatShading: true }));
  const pylonGeometry = keep(new THREE.CylinderGeometry(0.0, 0.55, 5.5, 6));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pylon = new THREE.Mesh(pylonGeometry, pylonMaterial);
    pylon.position.set(Math.sin(a) * (radius + 2.2), 2.4, Math.cos(a) * (radius + 2.2));
    pylon.castShadow = true;
    group.add(pylon);
    const light = new THREE.PointLight(0x58c8ff, 6, 12, 2);
    light.position.set(pylon.position.x * 0.94, 3, pylon.position.z * 0.94);
    group.add(light);
  }
  // far skyline
  const towerMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x0b111c, emissive: 0x0a1a2c, emissiveIntensity: 0.6, roughness: 0.9 }));
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const h = 8 + ((i * 37) % 19);
    const tower = new THREE.Mesh(keep(new THREE.BoxGeometry(3 + (i % 3), h, 3 + ((i + 1) % 3))), towerMaterial);
    const d = 70 + ((i * 13) % 25);
    tower.position.set(Math.sin(a) * d, h / 2 - 12, Math.cos(a) * d);
    group.add(tower);
  }
  return {
    group,
    /** A wave of Telekinesis across the floor (see createFloorWaves). */
    arc: (options) => waves.arc(options),
    update(dt) {
      floorUniforms.uTime.value += dt;
      waves.update(dt);
    },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

export function createSceneLighting(scene) {
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.Fog(0x070b14, 40, 140);
  const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a2130, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2c4, 2.2);
  sun.position.set(12, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 22;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rimLight = new THREE.DirectionalLight(0x6fd0ff, 1.1);
  rimLight.position.set(-14, 10, -16);
  scene.add(rimLight);
  // Two soft fills from the other two quarters: the camera is mostly behind the player's own fighter, and with only
  // the sun and the rim a body seen from the wrong side was almost black. No shadows from these.
  const fills = [[-12, 9, 14], [14, 9, -12]].map(([x, y, z]) => {
    const fill = new THREE.DirectionalLight(0xb9d4ff, 0.75);
    fill.position.set(x, y, z);
    scene.add(fill);
    return fill;
  });
  return { hemi, sun, rimLight, fills };
}
