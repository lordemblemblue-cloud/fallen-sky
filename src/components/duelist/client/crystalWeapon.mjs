// The crystal sword: one Will-forged crystal, faceted, glowing from inside. Its light follows the wielder's
// Will (bright when the Veil is stable, flickering when unstable, dark when it has collapsed).
// Weapon frame: the grip at the origin, the blade along +Y, the edge along +Z, metres.
import * as THREE from 'three';

const SHELL_VERTEX = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uIntensity; uniform float uTime; uniform float uFlicker;
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main() {
    float rim = pow(1.0 - abs(dot(vN, vV)), 1.6);
    float flow = 0.75 + 0.25 * sin(vY * 22.0 - uTime * 7.0);
    float flicker = mix(1.0, step(0.35, fract(sin(floor(uTime * 24.0) * 12.9898) * 43758.5453)), uFlicker);
    float a = rim * flow * uIntensity * flicker;
    gl_FragColor = vec4(uColor * a * 1.6, a);
  }`;

// A six-sided crystal that tapers to a point: base half-widths (edge, flat) at y0 to a tip at y1.
function crystalGeometry(y0, y1, edge, flat) {
  const ring = [[0, edge], [flat, edge * 0.35], [flat, -edge * 0.35], [0, -edge], [-flat, -edge * 0.35], [-flat, edge * 0.35]];
  const positions = [];
  const tip = [0, y1, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    positions.push(a[0], y0, a[1], b[0], y0, b[1], ...tip); // sides
    positions.push(b[0], y0, b[1], a[0], y0, a[1], 0, y0 - 0.02, 0); // the base
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createCrystalSword({ color = 0x9fe8ff, length = 0.98 } = {}) {
  const group = new THREE.Group();
  group.name = 'CrystalSword';
  const tint = new THREE.Color(color);
  const crystal = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.55), emissive: tint, emissiveIntensity: 0.9,
    metalness: 0.15, roughness: 0.12, transparent: true, opacity: 0.88, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.7, roughness: 0.35 });
  const shellMaterial = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERTEX, fragmentShader: SHELL_FRAGMENT, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { uColor: { value: tint.clone() }, uIntensity: { value: 1 }, uTime: { value: 0 }, uFlicker: { value: 0 } },
  });
  const geometries = [];
  const add = (geometry, material, y = 0) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = material !== shellMaterial;
    group.add(mesh);
    return mesh;
  };
  add(crystalGeometry(0.11, length, 0.03, 0.009), crystal); // blade
  add(crystalGeometry(0.1, length + 0.02, 0.042, 0.016), shellMaterial); // glow shell
  add(new THREE.CylinderGeometry(0.015, 0.017, 0.2, 8), dark, 0.0); // grip
  // the guard: two crystal shards swept back from the blade's base
  for (const side of [-1, 1]) {
    const shard = add(crystalGeometry(0, 0.11, 0.012, 0.008), crystal, 0.09);
    shard.rotation.x = side * 1.9;
    shard.position.z = side * 0.01;
  }
  add(new THREE.OctahedronGeometry(0.022), crystal, -0.11); // pommel
  let time = 0;
  return {
    group,
    // will: 0..1; veil: 'stable' | 'unstable' | 'collapsed'
    setWill(will, veil) {
      const intensity = veil === 'collapsed' ? 0.08 : 0.35 + 0.65 * Math.max(0, Math.min(1, will));
      crystal.emissiveIntensity = intensity * 1.1;
      shellMaterial.uniforms.uIntensity.value = intensity;
      shellMaterial.uniforms.uFlicker.value = veil === 'unstable' ? 1 : 0;
    },
    update(dt) { time += dt; shellMaterial.uniforms.uTime.value = time; },
    dispose() { geometries.forEach((g) => g.dispose()); crystal.dispose(); dark.dispose(); shellMaterial.dispose(); },
  };
}

// Attach to the hand bone at the solved combat grip ({ position, quaternion, scale } in the bone's space).
export function attachToHand(weapon, handBone, grip) {
  if (!handBone || !grip) return false;
  weapon.group.position.fromArray(grip.position);
  weapon.group.quaternion.fromArray(grip.quaternion);
  weapon.group.scale.setScalar(grip.scale ?? 1);
  handBone.add(weapon.group);
  return true;
}
