// The practice arena: a circular duelling floor on a high platform at dusk, a ring of light at its edge,
// crystal pylons around it and a far skyline. Original; procedural (no textures to load).
import * as THREE from 'three';

const FLOOR_VERTEX = /* glsl */`
  varying vec2 vXZ;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAGMENT = /* glsl */`
  uniform float uRadius; uniform float uTime; uniform vec3 uBase; uniform vec3 uLine; uniform vec3 uEdge;
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
    gl_FragColor = vec4(c, 1.0);
  }`;

export function createArena({ radius = 18 } = {}) {
  const group = new THREE.Group();
  group.name = 'DuelArena';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const floorUniforms = { uRadius: { value: radius }, uTime: { value: 0 }, uBase: { value: new THREE.Color(0x0d1420) },
    uLine: { value: new THREE.Color(0x3fa7ff) }, uEdge: { value: new THREE.Color(0x7fe9ff) } };
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(radius + 0.3, 96)),
    keep(new THREE.ShaderMaterial({ vertexShader: FLOOR_VERTEX, fragmentShader: FLOOR_FRAGMENT, uniforms: floorUniforms })));
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
    update(dt) { floorUniforms.uTime.value += dt; },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

export function createSceneLighting(scene) {
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.Fog(0x070b14, 40, 140);
  const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x10141c, 0.9);
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
  return { hemi, sun, rimLight };
}
