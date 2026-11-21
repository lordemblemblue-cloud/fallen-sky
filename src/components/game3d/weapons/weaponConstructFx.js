// Oil-metal weapon construction: the weapon pours together inside the gripping hand out of a dark,
// glossy, iridescent liquid (thin-film oil sheen, hot molten edge), then solidifies into its real mesh.
// "melt" plays it in reverse: the weapon runs back into the hand and drips away.
//
// Works on any weapon root (weapon-pack GLB, test-gear GLB, mounted or procedural weapons): the reveal
// runs along the root's own axis from the grip outward (blades: hilt to tip; bows: both limbs from the
// grip, the string last). Presentation only: no combat, input or network state.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator as NodePMREMGenerator } from 'three/webgpu';
import { attachNodes, addMapStageColor } from '../../../lib/webgpuNodeKit.js';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { constructNodes, createDropletTwin } from './weaponConstructFxNodes.mjs';

export const WEAPON_CONSTRUCT_SECONDS = Object.freeze({ build: 1.05, melt: 0.8, settle: 0.45 });
const MAX_DROPLETS = 220;
const TENDRILS = 9;
const TENDRIL_SAMPLES = 18;
const TENDRIL_SIDES = 6;
const BAND = 0.075; // width of the liquid front, as a fraction of the weapon's reach

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rand = (a, b) => a + Math.random() * (b - a);

const NOISE = /* glsl */`
float cf_hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cf_noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cf_hash(i), cf_hash(i + vec3(1,0,0)), f.x), mix(cf_hash(i + vec3(0,1,0)), cf_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cf_hash(i + vec3(0,0,1)), cf_hash(i + vec3(1,0,1)), f.x), mix(cf_hash(i + vec3(0,1,1)), cf_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

const UNIFORM_DECL = /* glsl */`
uniform float uCF_front; uniform float uCF_band; uniform float uCF_time; uniform float uCF_flash; uniform float uCF_kind;
uniform float uCF_reachPos; uniform float uCF_reachNeg; uniform vec3 uCF_axis; uniform vec3 uCF_grip; uniform mat4 uCF_meshToRoot;
varying vec3 vCF_pos; varying float vCF_d;`;

// Patches a MeshStandard/Physical material clone with the construction front.
function patchMaterial(material, shared, meshToRoot) {
  const m = material.clone();
  m.userData.cfOriginal = material;
  const uniforms = { ...shared, uCF_meshToRoot: { value: meshToRoot } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${UNIFORM_DECL}`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vec3 cfRoot = (uCF_meshToRoot * vec4(transformed, 1.0)).xyz;
        float cfT = dot(cfRoot - uCF_grip, uCF_axis);
        vCF_d = uCF_kind > 0.5 ? abs(cfT) / max(uCF_reachPos, uCF_reachNeg)
          : (cfT < 0.0 ? 0.14 * (-cfT / max(1e-4, uCF_reachNeg)) : cfT / max(1e-4, uCF_reachPos));
        vCF_pos = cfRoot;
        // the liquid front swells and ripples as it advances
        float cfSwell = smoothstep(uCF_front - 0.16, uCF_front, vCF_d) * (1.0 - smoothstep(uCF_front, uCF_front + 0.03, vCF_d));
        transformed += objectNormal * cfSwell * 0.0035 * (1.2 + sin(uCF_time * 21.0 + vCF_d * 70.0));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${UNIFORM_DECL}\n${NOISE}`)
      .replace('#include <clipping_planes_fragment>', /* glsl */`#include <clipping_planes_fragment>
        float cfN = cf_noise(vCF_pos * 26.0 + vec3(0.0, -uCF_time * 1.9, uCF_time * 0.7));
        float cfN2 = cf_noise(vCF_pos * 71.0 + uCF_time * 2.6);
        float cfEdge = uCF_front + (cfN - 0.5) * 0.11 + (cfN2 - 0.5) * 0.035;
        if (vCF_d > cfEdge) discard;
        float cfBand = smoothstep(cfEdge - uCF_band, cfEdge, vCF_d);
        float cfCool = smoothstep(cfEdge - uCF_band * 3.2, cfEdge - uCF_band, vCF_d);
        float cfOil = clamp(max(cfBand, cfCool * 0.75), 0.0, 1.0);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.008, 0.011), cfOil);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.06, cfOil);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 1.0, cfOil);`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        {
          float cfNdv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
          float cfFres = pow(1.0 - cfNdv, 2.2);
          // thin-film interference: the hue wanders with view angle and the flowing surface
          vec3 cfFilm = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + (1.0 - cfNdv) * 1.7 + cfN * 0.9));
          float cfHot = smoothstep(0.62, 1.0, cfBand);
          vec3 cfMolten = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.9, 0.62), cfHot * cfHot);
          totalEmissiveRadiance += cfFilm * (0.16 + cfFres * 1.05) * cfOil;
          totalEmissiveRadiance += cfMolten * cfHot * (2.1 + 1.2 * cfN2);
          totalEmissiveRadiance += vec3(1.0, 0.66, 0.36) * uCF_flash * (0.06 + cfFres * 0.65);
        }`);
  };
  m.customProgramCacheKey = () => 'weapon-construct-fx-v1';
  // WebGPURenderer: the same front in TSL (values from mesh.userData.cfUniforms, set by play())
  const { nodes, mapStage } = constructNodes();
  attachNodes(m, nodes);
  addMapStageColor(m, mapStage);
  return m;
}

// ---------- droplets: glossy oil beads drawn as sphere impostors ----------
function createDroplets(scene) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(MAX_DROPLETS * 3);
  const size = new Float32Array(MAX_DROPLETS);
  const alpha = new Float32Array(MAX_DROPLETS);
  const heat = new Float32Array(MAX_DROPLETS);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 900 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute float aHeat; uniform float uScale;
      varying float vAlpha; varying float vHeat;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.05, -mv.z);
        gl_Position = projectionMatrix * mv; vAlpha = aAlpha; vHeat = aHeat; }`,
    fragmentShader: /* glsl */`
      varying float vAlpha; varying float vHeat;
      void main(){
        vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0 || vAlpha <= 0.0) discard;
        vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
        float fres = pow(1.0 - n.z, 2.0);
        vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fres * 1.5 + c.x * 0.4));
        float spec = pow(max(dot(reflect(normalize(vec3(-0.4, -0.75, -0.5)), n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
        vec3 col = vec3(0.01) + film * fres * 0.85 + vec3(spec) * 1.4 + vec3(1.0, 0.45, 0.12) * vHeat * (1.0 - r2) * 2.2;
        gl_FragColor = vec4(col, vAlpha * (0.75 + 0.25 * n.z));
      }`,
  });
  setNodeTwin(material, createDropletTwin); // WebGPURenderer: instanced sprite quads
  const points = new THREE.Points(geometry, material);
  points.name = 'WeaponConstructDroplets';
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene?.add(points);
  const live = [];
  const spawn = (p, v, { s = 0.012, life = 0.8, gravity = 0, heat: h = 0, drag = 1.5, target = null } = {}) => {
    if (live.length >= MAX_DROPLETS) live.shift();
    live.push({ p: p.clone(), v: v.clone(), s, life, age: 0, gravity, heat: h, drag, target });
  };
  const update = (dt, pixelScale) => {
    material.uniforms.uScale.value = pixelScale;
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i];
      d.age += dt;
      if (d.age >= d.life) { live.splice(i, 1); continue; }
      if (d.target) { // stream into the hand: steer towards the target
        const to = d.target.clone().sub(d.p);
        const dist = to.length();
        if (dist < 0.02) { live.splice(i, 1); continue; }
        d.v.lerp(to.multiplyScalar(Math.min(14, 3 / Math.max(0.05, dist))), Math.min(1, dt * 6));
      }
      d.v.y -= d.gravity * dt;
      d.v.multiplyScalar(Math.max(0, 1 - d.drag * dt));
      d.p.addScaledVector(d.v, dt);
    }
    for (let i = 0; i < MAX_DROPLETS; i++) {
      const d = live[i];
      if (!d) { alpha[i] = 0; size[i] = 0; continue; }
      const k = d.age / d.life;
      position[i * 3] = d.p.x; position[i * 3 + 1] = d.p.y; position[i * 3 + 2] = d.p.z;
      size[i] = d.s * (k < 0.15 ? k / 0.15 : 1) * (1 - 0.4 * k);
      alpha[i] = 1 - k ** 3;
      heat[i] = d.heat * (1 - k);
    }
    for (const name of ['position', 'aSize', 'aAlpha', 'aHeat']) geometry.attributes[name].needsUpdate = true;
  };
  const dispose = () => { points.removeFromParent(); geometry.dispose(); material.dispose(); };
  return { spawn, update, dispose, count: () => live.length };
}

// ---------- tendrils: liquid strands that pour into the forming weapon ----------
function createTendril(material) {
  const verts = TENDRIL_SAMPLES * TENDRIL_SIDES;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const index = [];
  for (let i = 0; i < TENDRIL_SAMPLES - 1; i++) {
    for (let j = 0; j < TENDRIL_SIDES; j++) {
      const a = i * TENDRIL_SIDES + j;
      const b = i * TENDRIL_SIDES + ((j + 1) % TENDRIL_SIDES);
      index.push(a, a + TENDRIL_SIDES, b, b, a + TENDRIL_SIDES, b + TENDRIL_SIDES);
    }
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'WeaponConstructTendril';
  return mesh;
}

const _t = new THREE.Vector3(); const _n = new THREE.Vector3(); const _b = new THREE.Vector3(); const _up = new THREE.Vector3();
function writeTendril(mesh, curve, tail, head, radius) {
  const pos = mesh.geometry.attributes.position;
  const nor = mesh.geometry.attributes.normal;
  for (let i = 0; i < TENDRIL_SAMPLES; i++) {
    const u = tail + (head - tail) * (i / (TENDRIL_SAMPLES - 1));
    const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
    curve.getTangentAt(Math.min(1, Math.max(0, u)), _t);
    _up.set(0, 1, 0);
    if (Math.abs(_t.dot(_up)) > 0.95) _up.set(1, 0, 0);
    _n.crossVectors(_t, _up).normalize();
    _b.crossVectors(_t, _n).normalize();
    // thin where it leaves the pool, swelling into a bead where it meets the weapon
    const k = i / (TENDRIL_SAMPLES - 1);
    const r = radius * (0.25 + 0.75 * k) * (1 + 0.35 * Math.sin(k * 19 + u * 7));
    for (let j = 0; j < TENDRIL_SIDES; j++) {
      const a = (j / TENDRIL_SIDES) * Math.PI * 2;
      const cx = Math.cos(a); const sy = Math.sin(a);
      const nx = _n.x * cx + _b.x * sy; const ny = _n.y * cx + _b.y * sy; const nz = _n.z * cx + _b.z * sy;
      const v = i * TENDRIL_SIDES + j;
      pos.setXYZ(v, p.x + nx * r, p.y + ny * r, p.z + nz * r);
      nor.setXYZ(v, nx, ny, nz);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
}

export function createWeaponConstructFx({ scene, renderer = null, getPixelScale = () => 900 } = {}) {
  const droplets = createDroplets(scene);
  const oilMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x040406, metalness: 0.92, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 1, iridescenceIOR: 1.75, iridescenceThicknessRange: [160, 860],
    emissive: new THREE.Color(0xff7a24), emissiveIntensity: 0, envMapIntensity: 1.6,
  });
  // Liquid metal is all reflection: give it a small studio environment of its own (built once, lazily).
  let envTexture = null;
  const ensureEnvironment = () => {
    if (envTexture || !renderer) return;
    try {
      const pmrem = renderer.isWebGPURenderer ? new NodePMREMGenerator(renderer) : new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envTexture = pmrem.fromScene(room, 0.04).texture;
      room.dispose?.();
      pmrem.dispose();
      oilMaterial.envMap = envTexture;
      oilMaterial.needsUpdate = true;
    } catch { /* a lost context: the oil still renders with lights only */ }
  };
  const effects = new Set();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // Weapon frame from the root's meshes: the longest bounding-box axis, measured from the grip.
  function measure(root, kind, gripLocal) {
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    const meshes = [];
    root.traverse((n) => {
      if (!n.isMesh || n.isSkinnedMesh || !n.geometry || n.name === 'WeaponBowString') return;
      if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
      const meshToRoot = new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld);
      box.union(n.geometry.boundingBox.clone().applyMatrix4(meshToRoot));
      meshes.push({ mesh: n, meshToRoot });
    });
    const size = box.getSize(new THREE.Vector3());
    const axis = size.y >= size.x && size.y >= size.z ? new THREE.Vector3(0, 1, 0)
      : size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const grip = gripLocal ? gripLocal.clone() : new THREE.Vector3();
    const lo = box.min.dot(axis); const hi = box.max.dot(axis); const g = grip.dot(axis);
    let reachPos = Math.max(1e-3, hi - g); let reachNeg = Math.max(1e-3, g - lo);
    // A blade grows towards its longer side (the tip); flip the axis if the GLB points the other way.
    if (kind !== 'bow' && reachNeg > reachPos) { axis.negate(); [reachPos, reachNeg] = [reachNeg, reachPos]; }
    return { meshes, axis, grip, reachPos, reachNeg, length: reachPos + reachNeg, box };
  }

  function worldPointAt(fx, d) {
    // a point on the weapon's axis at normalized distance d from the grip (tip side)
    const along = fx.kind === 'bow' ? d * Math.max(fx.frame.reachPos, fx.frame.reachNeg) : d * fx.frame.reachPos;
    return fx.root.localToWorld(tmp.copy(fx.frame.grip).addScaledVector(fx.frame.axis, along));
  }

  function restore(fx) {
    for (const entry of fx.patched) {
      entry.mesh.material = entry.original;
      entry.mesh.castShadow = entry.castShadow;
      entry.material.dispose();
    }
    fx.patched = [];
    fx.tendrils.forEach((t) => { t.mesh.removeFromParent(); t.mesh.geometry.dispose(); });
    fx.tendrils = [];
    fx.blob?.removeFromParent();
    fx.blob?.geometry.dispose();
    fx.light?.removeFromParent();
    fx.light?.dispose?.();
    if (fx.string) fx.string.forEach((s) => { s.mesh.visible = s.visible; s.mesh.scale.y = s.scaleY; });
  }

  /**
   * Start a build ("pour together") or melt on a weapon root.
   * kind: 'blade' (swords, daggers) or 'bow'. grip: grip point in root space (default: the origin).
   * hand: optional Object3D the liquid pools in (default: the grip). Returns a handle with cancel().
   */
  function play(root, { kind = 'blade', mode = 'build', duration, grip = null, hand = null, onDone = null } = {}) {
    if (!root) return null;
    ensureEnvironment();
    for (const fx of effects) if (fx.root === root) { restore(fx); effects.delete(fx); }
    const frame = measure(root, kind, grip);
    const shared = {
      uCF_front: { value: mode === 'build' ? -0.12 : 1.2 }, uCF_band: { value: BAND }, uCF_time: { value: 0 },
      uCF_flash: { value: 0 }, uCF_kind: { value: kind === 'bow' ? 1 : 0 },
      uCF_reachPos: { value: frame.reachPos }, uCF_reachNeg: { value: frame.reachNeg },
      uCF_axis: { value: frame.axis }, uCF_grip: { value: frame.grip },
    };
    const patched = [];
    for (const { mesh, meshToRoot } of frame.meshes) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!list.every((mat) => mat?.isMeshStandardMaterial)) continue;
      const original = mesh.material;
      const material = Array.isArray(original) ? original.map((mat) => patchMaterial(mat, shared, meshToRoot)) : patchMaterial(original, shared, meshToRoot);
      patched.push({ mesh, original, material: Array.isArray(material) ? { dispose: () => material.forEach((x) => x.dispose()) } : material, castShadow: mesh.castShadow });
      mesh.material = material;
      mesh.userData.cfUniforms = { ...shared, uCF_meshToRoot: { value: meshToRoot } }; // read by the TSL front
      mesh.castShadow = false; // the shadow pass has no reveal front
    }
    const string = [];
    root.traverse((n) => { if (n.name === 'WeaponBowString') string.push({ mesh: n, visible: n.visible, scaleY: n.scale.y }); });
    const fx = {
      root, kind, mode, frame, shared, patched, string, hand, onDone,
      duration: duration ?? (mode === 'build' ? WEAPON_CONSTRUCT_SECONDS.build : WEAPON_CONSTRUCT_SECONDS.melt),
      t: 0, done: false, settle: 0, tendrils: [], blob: null, light: null, dripClock: 0,
    };
    // glow that lights the hand and nearby body while the metal is molten
    fx.light = new THREE.PointLight(0xff9a3c, 0, 1.3, 2);
    scene?.add(fx.light);
    if (mode === 'build') {
      fx.blob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), oilMaterial);
      fx.blob.name = 'WeaponConstructPool';
      fx.blob.scale.setScalar(1e-4);
      scene?.add(fx.blob);
      for (let i = 0; i < TENDRILS; i++) {
        const mesh = createTendril(oilMaterial);
        scene?.add(mesh);
        fx.tendrils.push({ mesh, delay: rand(0, 0.3), speed: rand(2.1, 3.0), seed: Math.random() * 10, curve: null, flow: 0, target: rand(0, 0.85) });
      }
    }
    for (const s of string) s.mesh.visible = mode !== 'build';
    effects.add(fx);
    applyFront(fx, 0);
    return { cancel: () => { restore(fx); effects.delete(fx); }, get progress() { return Math.min(1, fx.t / fx.duration); } };
  }

  function sourcePoint(fx) {
    if (fx.hand) return fx.hand.getWorldPosition(new THREE.Vector3());
    return fx.root.localToWorld(fx.frame.grip.clone());
  }

  function applyFront(fx, k) {
    const front = fx.mode === 'build' ? -0.12 + 1.34 * easeInOut(k) : 1.2 - 1.34 * easeInOut(k);
    fx.shared.uCF_front.value = front;
    fx.front = front;
  }

  // A strand that spirals in around the grip, tightening as it goes, and lands on the forming weapon.
  function buildTendrilCurve(fx, tendril, end) {
    const centre = sourcePoint(fx);
    const a0 = tendril.seed * 6.283;
    const spin = (tendril.seed * 7) % 2 > 1 ? 1 : -1;
    const turn = rand(2.4, 3.6) * spin;
    const r0 = rand(0.15, 0.34);
    const h0 = rand(-0.14, 0.2);
    const points = [];
    for (let i = 0; i < 5; i++) {
      const k = i / 5;
      const a = a0 + k * turn;
      const r = r0 * (1 - 0.82 * k);
      points.push(new THREE.Vector3(Math.cos(a) * r, h0 * (1 - k) + Math.sin(k * 5 + a0) * 0.025, Math.sin(a) * r).add(centre));
    }
    points.push(end.clone());
    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }

  function update(delta) {
    const dt = Math.max(0, Math.min(0.05, Number(delta) || 0));
    droplets.update(dt, getPixelScale());
    for (const fx of [...effects]) {
      fx.t += dt;
      fx.shared.uCF_time.value += dt;
      const k = Math.min(1, fx.t / fx.duration);
      applyFront(fx, k);
      const frontD = Math.max(0, Math.min(1, fx.front));
      const frontWorld = worldPointAt(fx, frontD).clone();
      const pool = sourcePoint(fx);
      // light: swells while molten, flashes as the weapon sets, then fades
      const flash = fx.mode === 'build' ? Math.max(0, 1 - Math.abs(k - 0.97) / 0.05) : 0;
      fx.shared.uCF_flash.value = fx.mode === 'build' ? Math.max(flash, fx.done ? Math.max(0, 1 - fx.settle / WEAPON_CONSTRUCT_SECONDS.settle) : 0) : 0;
      fx.light.position.copy(frontWorld).lerp(pool, 0.65);
      fx.light.intensity = fx.done ? 0.55 * Math.max(0, 1 - fx.settle / WEAPON_CONSTRUCT_SECONDS.settle) : 0.2 + 0.45 * Math.sin(Math.PI * k) + 0.55 * flash;
      if (fx.mode === 'build') {
        // the pool gathers in the palm first, then is drawn out into the weapon
        const gather = easeOut(Math.min(1, fx.t / 0.22));
        const drain = Math.max(0, (k - 0.35) / 0.4);
        const radius = 0.022 * gather * (1 - Math.min(1, drain)) * (1 + 0.12 * Math.sin(fx.t * 31));
        fx.blob.visible = radius > 0.002 && !fx.done;
        fx.blob.position.copy(pool);
        fx.blob.scale.set(radius * 1.1, radius * 0.85, radius);
        oilMaterial.emissiveIntensity = 0.6 + 1.2 * flash;
        for (const tendril of fx.tendrils) {
          const local = fx.t - tendril.delay;
          if (local < 0 || k > 0.92) { tendril.mesh.visible = false; continue; }
          // each strand lands on the advancing front, a little behind it
          const landing = worldPointAt(fx, Math.max(0, frontD - 0.05 - tendril.target * 0.2));
          if (!tendril.curve || tendril.flow >= 1.6) {
            tendril.curve = buildTendrilCurve(fx, tendril, landing);
            tendril.flow = 0;
            tendril.seed += 0.37;
          } else {
            tendril.curve.points[3].lerp(landing, Math.min(1, dt * 10)); // follow the front
          }
          tendril.flow += dt * tendril.speed;
          const head = Math.min(1, tendril.flow);
          const tail = Math.max(0, tendril.flow - 0.5);
          tendril.mesh.visible = head > tail + 0.02;
          if (tendril.mesh.visible) writeTendril(tendril.mesh, tendril.curve, tail, head, 0.0105 * (1 - 0.35 * k));
          // beads shed from the stream
          if (Math.random() < dt * 22) {
            const p = tendril.curve.getPointAt(Math.min(1, tail + (head - tail) * Math.random()));
            droplets.spawn(p, new THREE.Vector3(rand(-0.3, 0.3), rand(-0.1, 0.4), rand(-0.3, 0.3)), { s: rand(0.006, 0.013), life: rand(0.35, 0.7), target: landing.clone(), drag: 2 });
          }
        }
        // spatter at the front while it is molten
        if (k < 1 && Math.random() < dt * 40) {
          droplets.spawn(frontWorld, new THREE.Vector3(rand(-0.6, 0.6), rand(-0.1, 0.9), rand(-0.6, 0.6)), { s: rand(0.004, 0.01), life: rand(0.25, 0.5), gravity: 6, heat: 1, drag: 1.2 });
        }
      } else {
        // melting: the edge runs and drips off as it retreats into the hand
        if (Math.random() < dt * 55) {
          droplets.spawn(frontWorld.clone().add(new THREE.Vector3(rand(-0.02, 0.02), 0, rand(-0.02, 0.02))),
            new THREE.Vector3(rand(-0.15, 0.15), rand(-0.4, 0.1), rand(-0.15, 0.15)), { s: rand(0.007, 0.016), life: rand(0.5, 0.9), gravity: 7, heat: 0.8, drag: 0.6 });
        }
      }
      // the string forms last, from both limb tips towards the nock
      if (fx.string.length) {
        const s = fx.mode === 'build' ? Math.max(0, (k - 0.86) / 0.14) : Math.max(0, 1 - k / 0.2);
        for (const entry of fx.string) {
          entry.mesh.visible = s > 0.02;
          entry.mesh.scale.y = entry.scaleY * Math.max(0.02, easeOut(s));
        }
      }
      if (k >= 1 && !fx.done) {
        fx.done = true;
        if (fx.mode === 'build') {
          fx.tendrils.forEach((t) => { t.mesh.visible = false; });
          // settling drips run down off the fresh metal
          for (let i = 0; i < 7; i++) {
            const p = worldPointAt(fx, rand(0.15, 0.95)).clone();
            droplets.spawn(p, new THREE.Vector3(rand(-0.05, 0.05), -0.05, rand(-0.05, 0.05)), { s: rand(0.008, 0.014), life: rand(0.6, 1.1), gravity: 4.5, heat: 0.4, drag: 0.4 });
          }
        }
      }
      if (fx.done) {
        fx.settle += dt;
        if (fx.mode === 'melt' || fx.settle >= WEAPON_CONSTRUCT_SECONDS.settle) {
          restore(fx);
          effects.delete(fx);
          fx.onDone?.();
        }
      }
    }
  }

  return {
    play,
    update,
    isPlaying: (root) => [...effects].some((fx) => fx.root === root),
    activeCount: () => effects.size,
    dropletCount: () => droplets.count(),
    dispose() {
      for (const fx of effects) restore(fx);
      effects.clear();
      droplets.dispose();
      oilMaterial.dispose();
      envTexture?.dispose();
    },
  };
}
