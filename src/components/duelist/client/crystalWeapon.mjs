// The crystal sword: one Will-forged crystal, faceted, glowing from inside. Its light follows the wielder's
// Will (bright when the Veil is stable, flickering when unstable, dark when it has collapsed).
// Weapon frame: the grip at the origin, the blade along +Y, the edge along +Z, metres.
import * as THREE from 'three';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { crystalShellTwin } from './duelistNodes.mjs';

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
  setNodeTwin(shellMaterial, crystalShellTwin);
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

// ---- the classes' own forms (owner, 2026-11-22: "can we make the weapon look a little bit more creative?")
// A blade along +Y from y0 to y1: a six-sided section whose half-widths follow width(t) (along the edge, z) and
// thick(t) (across the flat, x), bent along the edge by bend(t) (a sabre's curve); width(1) = 0 closes it to a point.
export function bladeGeometry({ y0 = 0.11, y1 = 1, segments = 14, width = () => 0.03, thick = () => 0.009, bend = () => 0 } = {}) {
  const section = (t) => {
    const y = y0 + (y1 - y0) * t;
    const e = Math.max(0, width(t));
    const f = Math.max(0, thick(t));
    const b = bend(t);
    return [[0, e], [f, e * 0.35], [f, -e * 0.35], [0, -e], [-f, -e * 0.35], [-f, e * 0.35]].map(([x, z]) => [x, y, z + b]);
  };
  const rings = Array.from({ length: segments + 1 }, (_, i) => section(i / segments));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < 6; k++) {
      const a = rings[i][k]; const b = rings[i][(k + 1) % 6]; const c = rings[i + 1][(k + 1) % 6]; const d = rings[i + 1][k];
      tri(a, b, c); tri(a, c, d);
    }
  }
  const base = rings[0];
  const centre = [0, y0 - 0.02, bend(0)];
  for (let k = 0; k < 6; k++) tri(base[(k + 1) % 6], base[k], centre);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
const taper = (t, from) => (t < from ? 1 : Math.max(0, (1 - t) / (1 - from)));

// the forms: each a blade (and a molten or white core), a guard and a hilt of its own
const FORMS = Object.freeze({
  // the Warrior's Emberbrand: broad and heavy, notched, a molten core showing along its middle
  ember: { width: (t) => (0.058 - 0.014 * t) * taper(t, 0.84) * (t > 0.16 && t < 0.72 ? 1 + 0.14 * Math.max(0, Math.sin(t * Math.PI * 9)) : 1),
    thick: (t) => 0.013 * taper(t, 0.9), core: { hex: 0xffb36a, width: 0.42, thick: 1.35, glow: 2.2 } },
  // the Healer's Lumen: slender, a white core, a halo for a guard
  lumen: { width: (t) => 0.026 * (1 - 0.3 * t) * taper(t, 0.88), thick: (t) => 0.0075 * taper(t, 0.92), core: { hex: 0xffffff, width: 0.34, thick: 1.4, glow: 1.6 } },
  // the Duelist's fangs: curved, a pale edge
  fang: { width: (t) => 0.034 * (1 - 0.35 * t) * taper(t, 0.8), thick: (t) => 0.0085 * taper(t, 0.88), bend: (t) => 0.11 * t * t,
    core: { hex: 0xfff4d0, width: 0.38, thick: 1.35, glow: 1.5 } },
  // the Assassin's staff blades: a long blade with a hook swept back from its base
  hooked: { width: (t) => 0.03 * (1 - 0.3 * t) * taper(t, 0.82), thick: (t) => 0.0085 * taper(t, 0.88), bend: (t) => 0.03 * t * t,
    core: { hex: 0xe6d2ff, width: 0.36, thick: 1.35, glow: 1.4 }, hook: true },
});

/**
 * A class's crystal (core/classes.mjs colour): form 'ember' | 'lumen' | 'fang' | 'hooked'. Same shape as
 * createCrystalSword ({ group, setWill, update, dispose }); `hilt: false` leaves the grip off (the staff's blades).
 */
export function createClassBlade(form, { color = 0x9fe8ff, length = 0.98, hilt = true } = {}) {
  const spec = FORMS[form] || FORMS.lumen;
  const group = new THREE.Group();
  group.name = `CrystalBlade:${form}`;
  const tint = new THREE.Color(color);
  const crystal = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.5), emissive: tint, emissiveIntensity: 0.9,
    metalness: 0.15, roughness: 0.1, transparent: true, opacity: 0.86, flatShading: true });
  const core = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.core.hex).multiplyScalar(0.6), emissive: new THREE.Color(spec.core.hex),
    emissiveIntensity: spec.core.glow, metalness: 0, roughness: 0.3, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: form === 'lumen' ? 0xc9d3e0 : 0x1b2230, metalness: 0.75, roughness: form === 'lumen' ? 0.25 : 0.35 });
  const shellMaterial = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERTEX, fragmentShader: SHELL_FRAGMENT, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { uColor: { value: tint.clone() }, uIntensity: { value: 1 }, uTime: { value: 0 }, uFlicker: { value: 0 } },
  });
  setNodeTwin(shellMaterial, crystalShellTwin);
  const geometries = [];
  const add = (geometry, material, parent = group) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material !== shellMaterial;
    parent.add(mesh);
    return mesh;
  };
  const shape = { y0: 0.11, y1: length, width: spec.width, thick: spec.thick, bend: spec.bend || (() => 0) };
  add(bladeGeometry(shape), crystal);
  // the core shows through the flats along the middle
  add(bladeGeometry({ ...shape, y0: 0.13, y1: length - 0.05, width: (t) => spec.width(t) * spec.core.width, thick: (t) => spec.thick(t) * spec.core.thick }), core);
  // the glow shell, a little larger
  add(bladeGeometry({ ...shape, y0: 0.1, y1: length + 0.02, width: (t) => spec.width(t) + 0.012, thick: (t) => spec.thick(t) + 0.007 }), shellMaterial);
  if (spec.hook) {
    // a hook swept back from the blade's base, curving away from the edge
    const hook = new THREE.Group();
    hook.position.set(0, 0.16, 0.02);
    hook.rotation.x = -0.62;
    group.add(hook);
    const hookShape = { y0: 0, y1: 0.3, width: (t) => 0.022 * taper(t, 0.6), thick: (t) => 0.007 * taper(t, 0.7), bend: (t) => -0.09 * t * t };
    add(bladeGeometry(hookShape), crystal, hook);
    add(bladeGeometry({ ...hookShape, width: (t) => hookShape.width(t) + 0.01, thick: (t) => hookShape.thick(t) + 0.006 }), shellMaterial, hook);
  }
  let halo = null;
  if (hilt) {
    const grip = add(new THREE.CylinderGeometry(0.015, 0.017, form === 'ember' ? 0.27 : 0.2, 8), metal);
    grip.position.y = form === 'ember' ? -0.03 : 0;
    // wraps round the grip
    for (let i = 0; i < (form === 'ember' ? 4 : 3); i++) {
      const wrap = add(new THREE.TorusGeometry(0.018, 0.004, 6, 12), form === 'lumen' ? crystal : metal);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = -0.07 + i * 0.05;
    }
    if (form === 'ember') {
      // a heavy crossguard with crystal inlays and a spiked pommel
      const bar = add(new THREE.BoxGeometry(0.05, 0.035, 0.27), metal);
      bar.position.y = 0.095;
      for (const side of [-1, 1]) {
        const inlay = add(new THREE.OctahedronGeometry(0.022), crystal);
        inlay.position.set(0, 0.095, side * 0.1);
        inlay.scale.set(0.6, 1, 1.4);
      }
      const spike = add(new THREE.ConeGeometry(0.02, 0.07, 6), crystal);
      spike.position.y = -0.2;
      spike.rotation.x = Math.PI;
    } else if (form === 'lumen') {
      // a ring of light floating round the blade's base, turning, three motes on it
      halo = new THREE.Group();
      halo.position.y = 0.13;
      group.add(halo);
      const ring = add(new THREE.TorusGeometry(0.07, 0.0045, 6, 40), crystal, halo);
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const mote = add(new THREE.OctahedronGeometry(0.012), core, halo);
        const a = (i / 3) * Math.PI * 2;
        mote.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      }
      const pommel = add(new THREE.OctahedronGeometry(0.02), crystal);
      pommel.position.y = -0.13;
    } else if (form === 'fang') {
      // a knuckle bow from the guard to the pommel, on the edge side
      const bow = add(new THREE.TorusGeometry(0.075, 0.0055, 6, 18, Math.PI), metal);
      bow.rotation.y = Math.PI / 2;
      bow.position.set(0, 0.0, 0.02);
      const pommel = add(new THREE.OctahedronGeometry(0.018), crystal);
      pommel.position.y = -0.11;
    }
  }
  let time = 0;
  return {
    group,
    setWill(will, veil) {
      const intensity = veil === 'collapsed' ? 0.08 : 0.35 + 0.65 * Math.max(0, Math.min(1, will));
      crystal.emissiveIntensity = intensity * 1.1;
      core.emissiveIntensity = spec.core.glow * (0.3 + 0.7 * intensity);
      shellMaterial.uniforms.uIntensity.value = intensity;
      shellMaterial.uniforms.uFlicker.value = veil === 'unstable' ? 1 : 0;
    },
    update(dt) {
      time += dt;
      shellMaterial.uniforms.uTime.value = time;
      if (halo) halo.rotation.y += dt * 1.6;
      // the Emberbrand's core smoulders
      if (form === 'ember') core.emissiveIntensity *= 0.92 + 0.08 * (0.5 + 0.5 * Math.sin(time * 9 + Math.sin(time * 3.7) * 2));
    },
    dispose() { geometries.forEach((g) => g.dispose()); crystal.dispose(); core.dispose(); metal.dispose(); shellMaterial.dispose(); },
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
