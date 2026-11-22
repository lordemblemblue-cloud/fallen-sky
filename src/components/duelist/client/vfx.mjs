// Duelist Adventure effects. Telekinesis is space being moved, not lightning:
// - push: the hand gathers light, then a cone of bent air leaves it, rippling, while the picture warps in a
//   running ring (warp.mjs), the floor's hex lines light along the wave (arena.arc) and dust skids away;
// - pull: the same folded inward, the air streaming back into the hand;
// - grip: a twin ribbon of light from the hand to the held body, a swirling lens of warped space around it,
//   debris and motes circling it; the throw bursts out of the hand and the body trails light as it flies;
// - Veil Breach: a violet tear in space at the struck body; Resist: a burst that rings out across the floor.
// Hits: the Veil ripples where a blow lands (cyan stable, amber unstable) and sheds crystal shards, shields
// flash their hexes, wounds spark red, blocks and parries spark white; a collapsing Veil shatters.
// Pooled; nothing is allocated per frame except short-lived vectors.
import * as THREE from 'three';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { particlesTwin, vfxShellTwin, coneTwin, ribbonTwin } from './duelistNodes.mjs';
import { moveById } from '../core/moves.mjs';
import { CLASSES, SPECIAL_BALANCE } from '../core/classes.mjs';

// the colour of each lasting effect (core/abilities.mjs)
export const EFFECT_COLORS = Object.freeze({ quick: 0xfff0a8, rage: 0xff5238, cloak: 0xb779ff, empower: 0xd09bff, dominated: 0xb779ff,mend: 0x6dffb0, levitate: 0xcfe9ff });

export const COLORS = Object.freeze({ stable: 0x9ff4ff, unstable: 0xffb05a, collapsed: 0xffffff, shield: 0x4f8cff, breach: 0xb06bff,
  wound: 0xff4a3a, parry: 0xfff6d6, telekinesis: 0x9fd8ff, core: 0xe9fbff, dust: 0x6f8aa8, round: 0xff9a70 });

// ---------- particles
const P_VERTEX = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / max(0.1, -mv.z));
    vAlpha = aAlpha; vColor = aColor;
    gl_Position = projectionMatrix * mv;
  }`;
const P_FRAGMENT = /* glsl */`
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float a = vAlpha * (1.0 - r * 4.0);
    gl_FragColor = vec4(vColor * a * 1.8, a);
  }`;

function createParticles(scene, capacity = 2600) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const velocity = new Float32Array(capacity * 3);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({ vertexShader: P_VERTEX, fragmentShader: P_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  setNodeTwin(material, particlesTwin);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  const color = new THREE.Color();
  return {
    spawn(x, y, z, vx, vy, vz, { size = 0.06, ttl = 0.5, hex = 0xffffff, damping = 2, fall = 0 } = {}) {
      const i = cursor;
      cursor = (cursor + 1) % capacity;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      velocity[i * 3] = vx; velocity[i * 3 + 1] = vy; velocity[i * 3 + 2] = vz;
      color.setHex(hex);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      sizes[i] = size; life[i] = ttl; maxLife[i] = ttl; drag[i] = damping; gravity[i] = fall; alphas[i] = 1;
    },
    update(dt) {
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) { alphas[i] = 0; continue; }
        life[i] -= dt;
        const k = Math.exp(-drag[i] * dt);
        velocity[i * 3] *= k; velocity[i * 3 + 1] = velocity[i * 3 + 1] * k - gravity[i] * dt; velocity[i * 3 + 2] *= k;
        positions[i * 3] += velocity[i * 3] * dt;
        positions[i * 3 + 1] = Math.max(0.02, positions[i * 3 + 1] + velocity[i * 3 + 1] * dt);
        positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
        alphas[i] = Math.max(0, life[i] / maxLife[i]);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); points.removeFromParent(); },
  };
}

// ---------- shells (the Veil ripple, shield hexes, glows that follow a hand)
const SHELL_VERTEX = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vLocal = normalize(position);
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uAge; uniform vec3 uOrigin; uniform float uRipple; uniform float uHex; uniform float uCore;
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  float hexLines(vec3 p) {
    vec2 q = vec2(atan(p.z, p.x) * 3.0, p.y * 5.0);
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5; vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b; vec2 h = abs(g);
    return smoothstep(0.42, 0.5, max(dot(h, normalize(vec2(1.0, 1.7320508))), h.x));
  }
  void main() {
    float facing = abs(dot(vN, vV));
    float rim = pow(1.0 - facing, 2.0);
    float fade = 1.0 - uAge;
    float d = acos(clamp(dot(vLocal, uOrigin), -1.0, 1.0)); // angle from the impact point
    float wave = uRipple > 0.5 ? exp(-pow((d - uAge * 2.6) * 6.0, 2.0)) : 0.0;
    float spot = uRipple > 0.5 ? exp(-d * d * 10.0) * (1.0 - uAge) : 0.0;
    float hex = uHex > 0.5 ? hexLines(vLocal) * 0.8 : 0.0;
    float core = uCore * pow(facing, 3.0);
    float a = (rim * 0.55 + wave * 0.9 + spot + hex * rim + core) * fade;
    gl_FragColor = vec4(uColor * a * 1.5, a);
  }`;

function createShellPool(scene, size = 20) {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  const shells = [];
  for (let i = 0; i < size; i++) {
    const material = new THREE.ShaderMaterial({ vertexShader: SHELL_VERTEX, fragmentShader: SHELL_FRAGMENT, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color() }, uAge: { value: 1 }, uOrigin: { value: new THREE.Vector3(0, 0, 1) },
        uRipple: { value: 0 }, uHex: { value: 0 }, uCore: { value: 0 } } });
    setNodeTwin(material, vfxShellTwin);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    shells.push({ mesh, age: 1, ttl: 0.35, follow: null, track: null, grow: 0, base: new THREE.Vector3(1, 1, 1), move: null });
  }
  let cursor = 0;
  return {
    // follow: an Object3D to stay on (1 m above it), track: a function giving the position each frame
    flash({ position, follow = null, track = null, scale = [0.55, 1, 0.55], hex = COLORS.stable, ripple = true, hexPattern = false, core = 0,
      origin = null, ttl = 0.35, grow = 0, move = null }) {
      const s = shells[cursor];
      cursor = (cursor + 1) % shells.length;
      s.age = 0; s.ttl = ttl; s.follow = follow; s.track = track; s.grow = grow; s.move = move;
      s.base.fromArray(scale);
      s.mesh.scale.copy(s.base);
      if (position) s.mesh.position.copy(position);
      if (track) s.mesh.position.copy(track());
      const u = s.mesh.material.uniforms;
      u.uColor.value.setHex(hex); u.uRipple.value = ripple ? 1 : 0; u.uHex.value = hexPattern ? 1 : 0; u.uCore.value = core;
      u.uOrigin.value.copy(origin || new THREE.Vector3(0, 0, 1)).normalize();
      s.mesh.visible = true;
    },
    update(dt) {
      for (const s of shells) {
        if (!s.mesh.visible) continue;
        s.age += dt / s.ttl;
        if (s.age >= 1) { s.mesh.visible = false; continue; }
        if (s.follow) { s.follow.getWorldPosition(s.mesh.position); s.mesh.position.y += 1.0; }
        if (s.track) s.mesh.position.copy(s.track());
        if (s.move) s.mesh.position.addScaledVector(s.move, dt);
        if (s.grow) s.mesh.scale.copy(s.base).multiplyScalar(Math.max(0.02, 1 + s.grow * s.age));
        s.mesh.material.uniforms.uAge.value = s.age;
      }
    },
    dispose() { geometry.dispose(); shells.forEach((s) => { s.mesh.material.dispose(); s.mesh.removeFromParent(); }); },
  };
}

// ---------- cones of bent air (push out, pull in)
const CONE_VERTEX = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const CONE_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uAge; uniform float uPull; uniform float uSeed;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float along = 1.0 - vUv.y; // 0 at the hand, 1 at the far rim
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.3);
    float frontAt = uPull > 0.5 ? 1.0 - uAge : 0.82 + 0.18 * uAge;
    float front = exp(-pow((along - frontAt) * 8.0, 2.0));
    float dir = uPull > 0.5 ? 1.0 : -1.0;
    float ripple = pow(0.5 + 0.5 * sin(along * 28.0 + dir * uAge * 42.0), 10.0);
    float streak = pow(hash(floor(vUv.x * 56.0) + uSeed), 7.0) * smoothstep(0.08, 0.7, along);
    float fade = (1.0 - uAge) * smoothstep(0.0, 0.12, along);
    float a = (rim * 0.2 + front * 0.7 + ripple * 0.16 + streak * 0.45) * fade;
    gl_FragColor = vec4(uColor * a * 1.15, a * 0.7);
  }`;

function createConePool(scene, size = 4) {
  const geometry = new THREE.ConeGeometry(1, 1, 40, 8, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2); // apex at 0, rim at +Z
  const cones = [];
  for (let i = 0; i < size; i++) {
    const material = new THREE.ShaderMaterial({ vertexShader: CONE_VERTEX, fragmentShader: CONE_FRAGMENT, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(COLORS.telekinesis) }, uAge: { value: 1 }, uPull: { value: 0 }, uSeed: { value: 0 } } });
    setNodeTwin(material, coneTwin);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    cones.push({ mesh, age: 1, ttl: 0.4, pull: false, length: 9, spread: 0.6 });
  }
  let cursor = 0;
  const target = new THREE.Vector3();
  return {
    // from: the hand; dir: unit vector; spread: tan of the half angle
    launch({ from, dir, pull = false, length = 9, spread = 0.62, ttl = 0.4, hex = COLORS.telekinesis }) {
      const c = cones[cursor];
      cursor = (cursor + 1) % cones.length;
      Object.assign(c, { age: 0, ttl, pull, length, spread });
      c.mesh.position.copy(from);
      c.mesh.lookAt(target.copy(from).add(dir));
      const u = c.mesh.material.uniforms;
      u.uPull.value = pull ? 1 : 0;
      u.uSeed.value = Math.random() * 100;
      u.uColor.value.setHex(hex);
      c.mesh.visible = true;
    },
    update(dt) {
      for (const c of cones) {
        if (!c.mesh.visible) continue;
        c.age += dt / c.ttl;
        if (c.age >= 1) { c.mesh.visible = false; continue; }
        const grow = c.pull ? 1 : 1 - Math.pow(1 - Math.min(1, c.age * 1.6), 3);
        const length = Math.max(0.05, c.length * grow);
        c.mesh.scale.set(length * c.spread, length * c.spread, length);
        c.mesh.material.uniforms.uAge.value = c.age;
      }
    },
    dispose() { geometry.dispose(); cones.forEach((c) => { c.mesh.material.dispose(); c.mesh.removeFromParent(); }); },
  };
}

// ---------- the grip's tether: two twisting ribbons of light from the hand to the held body
const RIBBON_VERTEX = /* glsl */`
  attribute float aV; attribute float aSide;
  varying float vV; varying float vSide;
  void main() { vV = aV; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
  varying float vV; varying float vSide;
  void main() {
    float across = 1.0 - abs(vSide);                         // bright in the middle of the ribbon
    float pulse = pow(0.5 + 0.5 * sin(vV * 34.0 - uTime * 16.0), 5.0);
    float ends = smoothstep(0.0, 0.08, vV) * smoothstep(1.0, 0.85, vV);
    float a = (pow(across, 2.0) * 0.55 + pulse * across * 0.9) * ends * uAlpha;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), pulse * 0.5) * a * 1.6, a);
  }`;

function createTether(scene) {
  const N = 32;
  const ribbons = [0, 1].map((k) => {
    const positions = new Float32Array(N * 2 * 3);
    const v = new Float32Array(N * 2);
    const side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { v[i * 2] = v[i * 2 + 1] = i / (N - 1); side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const index = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aV', new THREE.BufferAttribute(v, 1));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERTEX, fragmentShader: RIBBON_FRAGMENT, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(COLORS.telekinesis) }, uTime: { value: 0 }, uAlpha: { value: 1 } } });
    setNodeTwin(material, ribbonTwin);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, positions, geometry, material, phase: k * Math.PI };
  });
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const sideV = new THREE.Vector3();
  const view = new THREE.Vector3();
  const control = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const bezier = (a, c, b, t, out) => out.set(0, 0, 0).addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t);
  return {
    // a: hand, b: held chest, camera: for facing the ribbons, time: seconds
    show(a, b, camera, time) {
      control.copy(a).lerp(b, 0.5);
      control.y += 0.35 + 0.08 * Math.sin(time * 3);
      for (const r of ribbons) {
        r.mesh.visible = true;
        r.material.uniforms.uTime.value = time;
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          bezier(a, control, b, t, p);
          bezier(a, control, b, Math.min(1, t + 0.01), tangent).sub(p).normalize();
          view.copy(camera.position).sub(p).normalize();
          sideV.crossVectors(tangent, view).normalize();
          normal.crossVectors(sideV, tangent).normalize();
          // the two ribbons twist around the line
          const twist = Math.sin(t * Math.PI) * 0.09;
          const ang = t * 9 - time * 7 + r.phase;
          p.addScaledVector(sideV, Math.cos(ang) * twist).addScaledVector(normal, Math.sin(ang) * twist);
          const width = 0.05 + 0.03 * Math.sin(t * Math.PI);
          r.positions.set([p.x - sideV.x * width, p.y - sideV.y * width, p.z - sideV.z * width], i * 6);
          r.positions.set([p.x + sideV.x * width, p.y + sideV.y * width, p.z + sideV.z * width], i * 6 + 3);
        }
        r.geometry.attributes.position.needsUpdate = true;
      }
    },
    hide() { for (const r of ribbons) r.mesh.visible = false; },
    dispose() { for (const r of ribbons) { r.geometry.dispose(); r.material.dispose(); r.mesh.removeFromParent(); } },
  };
}

// ---------- crystal shards (instanced): Veil pieces, debris lifted by Telekinesis
function createShards(scene, capacity = 220) {
  const geometry = new THREE.OctahedronGeometry(0.05, 0).scale(0.7, 2.2, 0.7);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.Color();
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color.setHex(0xffffff));
  scene.add(mesh);
  const state = Array.from({ length: capacity }, () => ({ life: 0, ttl: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0),
    spin: 0, angle: 0, size: 1, fall: 0, drag: 1, orbit: null }));
  let cursor = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    spawn(p, v, { hex = 0xffffff, ttl = 0.8, size = 1, fall = 6, drag = 1.2, orbit = null } = {}) {
      const i = cursor;
      cursor = (cursor + 1) % capacity;
      const st = state[i];
      st.life = ttl; st.ttl = ttl; st.p.copy(p); st.v.copy(v); st.size = size; st.fall = fall; st.drag = drag; st.orbit = orbit;
      st.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      st.spin = 6 + Math.random() * 14;
      st.angle = Math.random() * 6.28;
      mesh.setColorAt(i, color.setHex(hex));
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < capacity; i++) {
        const st = state[i];
        if (st.life <= 0) { mesh.setMatrixAt(i, zero); continue; }
        st.life -= dt;
        if (st.orbit) {
          // circling a held body: { centre: () => Vector3, radius, speed, height }
          st.angle += st.orbit.speed * dt;
          const c = st.orbit.centre();
          st.p.set(c.x + Math.cos(st.angle) * st.orbit.radius, c.y + st.orbit.height + Math.sin(st.angle * 2.3) * 0.15, c.z + Math.sin(st.angle) * st.orbit.radius);
        } else {
          const k = Math.exp(-st.drag * dt);
          st.v.multiplyScalar(k);
          st.v.y -= st.fall * dt;
          st.p.addScaledVector(st.v, dt);
          if (st.p.y < 0.03) { st.p.y = 0.03; st.v.y = Math.abs(st.v.y) * 0.3; st.v.x *= 0.6; st.v.z *= 0.6; }
          st.angle += st.spin * dt;
        }
        const fade = Math.min(1, st.life / (st.ttl * 0.35));
        q.setFromAxisAngle(st.axis, st.angle);
        s.setScalar(st.size * fade);
        m.compose(st.p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); mesh.removeFromParent(); },
  };
}

// ---------- a tear in space (Veil Breach): jagged violet cracks that open and close
function createTears(scene, size = 3) {
  const tears = [];
  for (let i = 0; i < size; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    const material = new THREE.LineBasicMaterial({ color: COLORS.breach, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.visible = false;
    scene.add(lines);
    tears.push({ lines, geometry, material, age: 1, ttl: 0.6 });
  }
  let cursor = 0;
  return {
    // at: centre; facing: unit vector the tear faces (towards the attacker)
    open(at, facing) {
      const t = tears[cursor];
      cursor = (cursor + 1) % tears.length;
      const right = new THREE.Vector3().crossVectors(facing, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, facing).normalize();
      const arr = t.geometry.attributes.position.array;
      let n = 0;
      for (let branch = 0; branch < 7; branch++) {
        const ang = (branch / 7) * Math.PI * 2 + Math.random() * 0.5;
        let x = 0;
        let y = 0;
        const steps = 4 + Math.floor(Math.random() * 4);
        for (let k = 0; k < steps && n < 64; k++) {
          const len = 0.06 + Math.random() * 0.08;
          const a = ang + (Math.random() - 0.5) * 1.1;
          const nx = x + Math.cos(a) * len;
          const ny = y + Math.sin(a) * len;
          const p0 = at.clone().addScaledVector(right, x).addScaledVector(up, y);
          const p1 = at.clone().addScaledVector(right, nx).addScaledVector(up, ny);
          arr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], n * 6);
          n += 1;
          x = nx;
          y = ny;
        }
      }
      t.geometry.setDrawRange(0, n * 2);
      t.geometry.attributes.position.needsUpdate = true;
      t.age = 0;
      t.lines.visible = true;
    },
    update(dt) {
      for (const t of tears) {
        if (!t.lines.visible) continue;
        t.age += dt / t.ttl;
        if (t.age >= 1) { t.lines.visible = false; continue; }
        t.material.opacity = t.age < 0.15 ? t.age / 0.15 : Math.pow(1 - (t.age - 0.15) / 0.85, 1.5);
      }
    },
    dispose() { for (const t of tears) { t.geometry.dispose(); t.material.dispose(); t.lines.removeFromParent(); } },
  };
}

// ---------- flashes of light (two pooled point lights)
function createFlashes(scene) {
  const lights = [0, 1].map(() => {
    const light = new THREE.PointLight(COLORS.telekinesis, 0, 9, 2);
    scene.add(light);
    return { light, age: 1, ttl: 0.2, peak: 0 };
  });
  let cursor = 0;
  return {
    flash(at, hex, peak = 8, ttl = 0.22) {
      const f = lights[cursor];
      cursor = (cursor + 1) % lights.length;
      f.light.position.copy(at);
      f.light.color.setHex(hex);
      Object.assign(f, { age: 0, ttl, peak });
    },
    update(dt) {
      for (const f of lights) {
        f.age = Math.min(1, f.age + dt / f.ttl);
        f.light.intensity = f.peak * Math.pow(1 - f.age, 2);
      }
    },
    dispose() { for (const f of lights) f.light.removeFromParent(); },
  };
}

const rand = (a = 1) => (Math.random() * 2 - 1) * a;

/**
 * The effects director's tools. warp (warp.mjs) and arena (arena.mjs) are optional: without them the
 * picture does not bend and the floor does not light.
 * Actors: { root: Object3D (feet), chest: () => Vector3, hand: () => Vector3 (the free hand) }.
 */
export function createDuelVfx(scene, { warp = null, arena = null, camera = null } = {}) {
  const particles = createParticles(scene);
  const shells = createShellPool(scene);
  const cones = createConePool(scene);
  const tether = createTether(scene);
  const shards = createShards(scene);
  const tears = createTears(scene);
  const flashes = createFlashes(scene);
  const bolts = new Map(); // projectile id -> mesh
  const boltGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).rotateX(Math.PI / 2);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
  const roundMaterial = new THREE.MeshBasicMaterial({ color: COLORS.round, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }); // a sidearm's
  const tmp = new THREE.Vector3();
  const burst = (at, count, speed, opts) => {
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.5 + Math.random() * 0.5);
      particles.spawn(at.x, at.y, at.z, r * Math.cos(a) * v, u * v, r * Math.sin(a) * v, opts);
    }
  };
  const shardBurst = (at, count, speed, hex, opts = {}) => {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rand(), Math.random() * 0.9 + 0.1, rand()).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      shards.spawn(at, v, { hex, ttl: 0.6 + Math.random() * 0.5, size: 0.6 + Math.random() * 0.8, ...opts });
    }
  };
  const floorDust = (x, z, count, speed, { dir = null, spread = Math.PI * 2 } = {}) => {
    const base = dir ? Math.atan2(dir.x, dir.z) : 0;
    for (let i = 0; i < count; i++) {
      const a = base + (dir ? rand(spread / 2) : Math.random() * Math.PI * 2);
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.spawn(x + rand(0.3), 0.06 + Math.random() * 0.12, z + rand(0.3), Math.sin(a) * v, 0.4 + Math.random() * 0.8, Math.cos(a) * v,
        { hex: COLORS.dust, size: 0.12 + Math.random() * 0.1, ttl: 0.7 + Math.random() * 0.4, damping: 3, fall: 1.2 });
    }
  };
  let time = 0;
  const thrown = new Map(); // actor -> seconds of trail left
  // A defeated body comes apart: light lifts off it, more and more of it, and the body flickers out as it falls. It
  // stays unseen until the fighter stands again (revive()).
  const DISSOLVE = Object.freeze({ from: 0.45, to: 1.6, hex: 0xbfe6ff });
  const DISSOLVE_BONES = ['Hips', 'Spine2', 'Head', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const dissolving = new Map(); // actor -> { t, bones }
  const dissolveAt = new THREE.Vector3();
  const stepDissolves = (dt) => {
    for (const [actor, d] of dissolving) {
      d.t += dt;
      if (d.t < DISSOLVE.from || !actor.model) continue;
      const k = Math.min(1, (d.t - DISSOLVE.from) / (DISSOLVE.to - DISSOLVE.from));
      if (k >= 1) { actor.model.visible = false; continue; }
      for (let i = Math.ceil(dt * 70 * (1 + 3 * k)); i > 0 && d.bones.length; i--) {
        d.bones[(Math.random() * d.bones.length) | 0].getWorldPosition(dissolveAt);
        particles.spawn(dissolveAt.x + rand(0.1), dissolveAt.y + rand(0.1), dissolveAt.z + rand(0.1), rand(0.35), 0.5 + Math.random() * 1.3, rand(0.35),
          { hex: Math.random() < 0.25 ? 0xffffff : DISSOLVE.hex, size: 0.045 + Math.random() * 0.04, ttl: 0.6 + Math.random() * 0.6, damping: 1.2, fall: -1.4 });
      }
      actor.model.visible = Math.random() > k * k * 1.1; // seen less and less
    }
  };
  // Sanctuary domes: zone id -> { group, left, ttl, materials }
  const zones = new Map();
  const bladeGeometry = new THREE.BoxGeometry(0.07, 0.02, 1.0);
  const addZone = (e) => {
    if (zones.has(e.id)) return;
    const hex = CLASSES.healer.color;
    const dome = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const rim = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(e.radius, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), dome));
    const ring = new THREE.Mesh(new THREE.RingGeometry(e.radius - 0.09, e.radius, 72), rim);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    group.position.set(e.x, 0, e.z);
    scene.add(group);
    const ttl = SPECIAL_BALANCE.sanctuaryDurationSeconds;
    zones.set(e.id, { group, left: ttl, ttl, dome, rim });
    warp?.ring({ at: new THREE.Vector3(e.x, 0.6, e.z), kind: 'out', r0: 0.3, r1: e.radius, strength: 0.04, ttl: 0.5 });
    arena?.arc({ x: e.x, z: e.z, arc: 360, from: 0.4, to: e.radius, width: 0.7, strength: 1.1, ttl: 0.6 });
  };
  const dropZone = (id) => {
    const z = zones.get(id);
    if (!z) return;
    z.group.removeFromParent();
    z.group.traverse((o) => o.geometry?.dispose());
    z.dome.dispose(); z.rim.dispose();
    zones.delete(id);
  };

  return {
    /** A fighter stands again: its body is whole and seen. */
    revive(actor) {
      dissolving.delete(actor);
      actor.gone = false;
      if (actor.model) actor.model.visible = true;
    },
    /** A power's wind-up: the free hand gathers light. kind: push | pull | grip | breach */
    charge(kind, actor, seconds = 0.15) {
      const hex = kind === 'breach' ? COLORS.breach : COLORS.telekinesis;
      shells.flash({ track: actor.hand, scale: [0.09, 0.09, 0.09], hex, ripple: false, core: 1.2, ttl: Math.max(0.12, seconds + 0.05), grow: 1.4 });
      const hand = actor.hand();
      for (let i = 0; i < 18; i++) {
        const from = new THREE.Vector3(rand(0.7), rand(0.7), rand(0.7)).add(hand);
        const v = hand.clone().sub(from).multiplyScalar(1 / Math.max(0.08, seconds));
        particles.spawn(from.x, from.y, from.z, v.x, v.y, v.z, { hex, size: 0.035, ttl: Math.max(0.1, seconds), damping: 0 });
      }
    },
    /** The power goes off. dir: the caster's facing ({x, z}, unit). target: the held body for a throw. */
    release(kind, actor, dir, { target = null } = {}) {
      const hand = actor.hand();
      const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const feet = actor.root.position;
      const yaw = Math.atan2(dir.x, dir.z);
      if (kind === 'push') {
        cones.launch({ from: hand, dir: forward, length: 8, spread: 0.55, ttl: 0.42 });
        warp?.ring({ at: hand.clone().addScaledVector(forward, 0.4), kind: 'out', r0: 0.2, r1: 6.5, strength: 0.045, thickness: 0.3, ttl: 0.5 });
        arena?.arc({ x: feet.x, z: feet.z, yaw, arc: 80, from: 0.6, to: 10, width: 0.9, strength: 1.0, ttl: 0.55 });
        flashes.flash(hand, COLORS.telekinesis, 10, 0.25);
        for (let i = 0; i < 46; i++) {
          const v = forward.clone().multiplyScalar(11 + Math.random() * 8).add(new THREE.Vector3(rand(3.5), rand(2), rand(3.5)));
          particles.spawn(hand.x, hand.y, hand.z, v.x, v.y, v.z, { hex: i % 3 ? COLORS.telekinesis : COLORS.core, size: 0.045, ttl: 0.45, damping: 3.2 });
        }
        floorDust(feet.x + forward.x * 1.2, feet.z + forward.z * 1.2, 26, 8, { dir: forward, spread: 1.3 });
      } else if (kind === 'pull') {
        const far = hand.clone().addScaledVector(forward, 7);
        cones.launch({ from: hand, dir: forward, pull: true, length: 9, spread: 0.5, ttl: 0.42 });
        warp?.ring({ at: far, kind: 'in', r0: 0.3, r1: 4.5, strength: 0.04, thickness: 0.32, ttl: 0.45 });
        arena?.arc({ x: feet.x, z: feet.z, yaw, arc: 60, from: 10, to: 0.6, width: 0.8, strength: 1.2, ttl: 0.5 });
        flashes.flash(hand, COLORS.telekinesis, 6, 0.3);
        for (let i = 0; i < 40; i++) {
          const start = far.clone().add(new THREE.Vector3(rand(1.6), rand(1.2), rand(1.6)));
          const v = hand.clone().sub(start).multiplyScalar(2.4);
          particles.spawn(start.x, start.y, start.z, v.x, v.y, v.z, { hex: i % 3 ? COLORS.telekinesis : COLORS.core, size: 0.045, ttl: 0.42, damping: 0.3 });
        }
      } else if (kind === 'grip') {
        flashes.flash(hand, COLORS.telekinesis, 5, 0.3);
      } else if (kind === 'throw') {
        const at = target ? target.chest() : hand.clone().addScaledVector(forward, 2.3);
        cones.launch({ from: hand, dir: forward, length: 6, spread: 0.45, ttl: 0.35 });
        warp?.ring({ at, kind: 'out', r0: 0.3, r1: 5, strength: 0.05, thickness: 0.3, ttl: 0.45 });
        flashes.flash(at, COLORS.telekinesis, 10, 0.3);
        burst(at, 40, 7, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.45, damping: 3 });
        if (target) thrown.set(target, 0.6);
      } else if (kind === 'resist') {
        const chest = actor.chest();
        shells.flash({ position: chest, scale: [0.6, 0.9, 0.6], hex: COLORS.core, ripple: false, ttl: 0.4, grow: 3 });
        warp?.ring({ at: chest, kind: 'out', r0: 0.3, r1: 4, strength: 0.035, ttl: 0.4 });
        arena?.arc({ x: feet.x, z: feet.z, arc: 360, from: 0.4, to: 6, width: 0.6, strength: 1.2, ttl: 0.45 });
        burst(chest, 40, 6, { hex: COLORS.core, size: 0.045, ttl: 0.4, damping: 3 });
      } else if (kind === 'dash') {
        warp?.ring({ at: actor.chest(), kind: 'out', r0: 0.2, r1: 2.5, strength: 0.03, ttl: 0.3 });
        for (let i = 0; i < 30; i++) {
          const p = actor.chest().addScaledVector(forward, -Math.random() * 1.5).add(new THREE.Vector3(rand(0.3), rand(0.6), rand(0.3)));
          particles.spawn(p.x, p.y, p.z, -forward.x * 3, rand(0.5), -forward.z * 3, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.35, damping: 2 });
        }
      } else if (kind === 'roll') {
        floorDust(feet.x, feet.z, 14, 2.4);
      }
    },
    /** A knocked-down body hits the floor. */
    slam(actor) {
      const feet = actor.root.position;
      floorDust(feet.x, feet.z, 34, 4.5);
      arena?.arc({ x: feet.x, z: feet.z, arc: 360, from: 0.3, to: 4, width: 0.5, strength: 0.9, ttl: 0.4 });
      warp?.ring({ at: new THREE.Vector3(feet.x, 0.3, feet.z), kind: 'out', r0: 0.2, r1: 2.6, strength: 0.025, ttl: 0.35 });
      shardBurst(new THREE.Vector3(feet.x, 0.2, feet.z), 8, 3, COLORS.dust, { fall: 9 });
    },
    /**
     * Present one simulation effect. Returns what it should feel like: { shake (0..1), stop (s) } for the
     * camera and the hit-stop.
     */
    effect(e, actors) {
      const target = actors[e.defender];
      const source = actors[e.attacker || e.from || e.by || e.owner];
      const feel = { shake: 0, stop: 0 };
      if (e.type === 'impact' && target) {
        const chest = target.chest();
        const from = source ? source.chest() : chest.clone().add(new THREE.Vector3(0, 0, 1));
        const move = moveById(e.move);
        const edge = move?.damageKind === 'melee' ? source?.bladeNear?.(chest) : null;
        const origin = tmp.copy(edge || from).sub(chest).normalize().clone();
        const contact = edge && edge.distanceTo(chest) <= 0.4
          ? edge : chest.clone().addScaledVector(origin, 0.32);
        const heavy = e.move === 'swordHeavy' || e.move === 'swordLight3' || e.move === 'gripThrow' || move?.cut?.mode === 'heavy';
        if (e.shield > 0.01) {
          shells.flash({ follow: target.root, hex: COLORS.shield, hexPattern: true, origin, ttl: 0.32 });
          burst(contact, 10, 4, { hex: COLORS.shield, size: 0.04, ttl: 0.3, damping: 4 });
        }
        if (e.will > 0.01) {
          const hex = e.veil === 'unstable' ? COLORS.unstable : COLORS.stable;
          shells.flash({ follow: target.root, hex, origin, ttl: 0.42 });
          shardBurst(contact, heavy ? 10 : 5, heavy ? 5 : 3.5, hex, { fall: 7 });
          warp?.ring({ at: contact, kind: 'out', r0: 0.05, r1: heavy ? 1.6 : 0.9, strength: heavy ? 0.03 : 0.018, ttl: 0.25 });
        }
        if (e.hp > 0.01) burst(contact, heavy ? 22 : 14, 4.5, { hex: COLORS.wound, size: 0.05, ttl: 0.45, damping: 4, fall: 7 });
        if (e.outcome === 'blocked' || e.outcome === 'guardBreak') {
          burst(contact.addScaledVector(origin, 0.15), e.outcome === 'guardBreak' ? 30 : 14, 5, { hex: COLORS.parry, size: 0.04, ttl: 0.28, damping: 5 });
          flashes.flash(contact, COLORS.parry, e.outcome === 'guardBreak' ? 8 : 4, 0.15);
        }
        if (e.outcome === 'hit' || e.outcome === 'guardBreak') { feel.shake = heavy ? 0.55 : 0.25; feel.stop = heavy ? 0.075 : 0.035; }
        else if (e.outcome === 'blocked') feel.shake = 0.15;
      }
      if (e.type === 'parry' && target) {
        const at = target.bladeNear?.(source?.bladeNear?.(target.chest()) || target.chest()) || target.hand();
        burst(at, 36, 7, { hex: COLORS.parry, size: 0.05, ttl: 0.38, damping: 5 });
        shells.flash({ position: at, scale: [0.25, 0.25, 0.25], hex: COLORS.parry, ripple: false, core: 1, ttl: 0.22, grow: 2.5 });
        warp?.ring({ at, kind: 'out', r0: 0.1, r1: 1.8, strength: 0.03, ttl: 0.3 });
        flashes.flash(at, COLORS.parry, 12, 0.2);
        feel.shake = 0.45; feel.stop = 0.09;
      }
      if (e.type === 'veilCollapse' && target) {
        const chest = target.chest();
        shardBurst(chest, 34, 6, COLORS.collapsed, { fall: 8 });
        burst(chest, 70, 5.5, { hex: COLORS.collapsed, size: 0.06, ttl: 0.8, damping: 2.5, fall: 2 });
        shells.flash({ follow: target.root, hex: COLORS.collapsed, ripple: false, ttl: 0.5, grow: 0.7 });
        warp?.ring({ at: chest, kind: 'out', r0: 0.2, r1: 3.2, strength: 0.04, ttl: 0.45 });
        flashes.flash(chest, COLORS.collapsed, 12, 0.35);
        feel.shake = 0.5; feel.stop = 0.06;
      }
      if (e.type === 'breach' && target) {
        const chest = target.chest();
        const facing = source ? source.chest().sub(chest).normalize() : new THREE.Vector3(0, 0, 1);
        tears.open(chest.clone().addScaledVector(facing, 0.3), facing);
        shells.flash({ follow: target.root, hex: COLORS.breach, ripple: false, hexPattern: true, ttl: 0.7, grow: -0.4 });
        warp?.ring({ at: chest, kind: 'in', r0: 0.1, r1: 2.2, strength: 0.035, ttl: 0.4 });
        burst(chest, 34, 2.5, { hex: COLORS.breach, size: 0.05, ttl: 0.6, damping: 1 });
        flashes.flash(chest, COLORS.breach, 8, 0.3);
        feel.shake = 0.2;
      }
      if (e.type === 'held' && target) {
        const chest = target.chest();
        burst(chest, 40, 2, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.7, damping: 1.5 });
        warp?.ring({ at: chest, kind: 'in', r0: 0.2, r1: 2.2, strength: 0.03, ttl: 0.35 });
        for (let i = 0; i < 6; i++) {
          shards.spawn(chest, new THREE.Vector3(), { hex: COLORS.telekinesis, ttl: 1.6, size: 0.7, orbit: { centre: target.chest, radius: 0.7 + Math.random() * 0.3, speed: 2.5 + Math.random() * 2, height: rand(0.6) } });
        }
      }
      if (e.type === 'knockdown' && target) feel.shake = Math.max(feel.shake, 0.35);
      if (e.type === 'defeat' && target) {
        burst(target.chest(), 60, 3, { hex: 0x8fa0b8, size: 0.06, ttl: 1.3, damping: 1.5, fall: 3 });
        feel.shake = 0.4; feel.stop = 0.12;
        // and the body comes apart as it falls
        dissolving.set(target, { t: 0, bones: DISSOLVE_BONES.map((n) => target.model?.getObjectByName(`mixamorig${n}`)).filter(Boolean) });
        target.gone = true;
      }
      // ---- the classes' abilities
      if (e.type === 'effect') {
        const who = actors[e.target];
        const hex = EFFECT_COLORS[e.effect];
        if (who && hex) {
          const chest = who.chest();
          const rage = e.effect === 'rage';
          shells.flash({ follow: who.root, hex, ripple: false, ttl: rage ? 0.7 : 0.5, grow: rage ? 1.2 : 0.6 });
          burst(chest, rage ? 70 : 30, rage ? 6 : 3, { hex, size: 0.05, ttl: 0.6, damping: 2 });
          flashes.flash(chest, hex, rage ? 12 : 6, 0.3);
          if (rage) { warp?.ring({ at: chest, kind: 'out', r0: 0.3, r1: 5, strength: 0.05, ttl: 0.5 }); feel.shake = 0.4; }
        }
      }
      if (e.type === 'heal' && actors[e.target]) burst(actors[e.target].chest(), 34, 1.6, { hex: EFFECT_COLORS.mend, size: 0.05, ttl: 0.9, damping: 1.2, fall: -1.6 });
      if (e.type === 'zone') addZone(e);
      if (e.type === 'uncloak' && actors[e.fighter]) burst(actors[e.fighter].chest(), 24, 2.5, { hex: EFFECT_COLORS.cloak, size: 0.05, ttl: 0.5, damping: 2 });
      if (e.type === 'counter' && target) {
        const at = target.hand();
        burst(at, 30, 6, { hex: COLORS.parry, size: 0.05, ttl: 0.35, damping: 5 });
        flashes.flash(at, COLORS.parry, 10, 0.2);
        feel.shake = 0.35; feel.stop = 0.06;
      }
      if (e.type === 'execution' && target) {
        const chest = target.chest();
        const hex = CLASSES[source?.classId]?.color ?? COLORS.core;
        shardBurst(chest, 26, 6, hex, { fall: 8 });
        burst(chest, 60, 6, { hex, size: 0.06, ttl: 0.7, damping: 2.5 });
        warp?.ring({ at: chest, kind: 'out', r0: 0.2, r1: 3.5, strength: 0.05, ttl: 0.45 });
        flashes.flash(chest, hex, 14, 0.35);
        feel.shake = 0.7; feel.stop = 0.12;
      }
      if (e.type === 'projectile' && source) {
        const sidearm = String(e.move).startsWith('sidearm');
        const blade = e.move === 'bladeThrow';
        const hex = sidearm ? COLORS.round : blade ? CLASSES[source.classId]?.color ?? 0xbfefff : 0xbfefff;
        const mesh = blade
          ? new THREE.Mesh(bladeGeometry, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }))
          : new THREE.Mesh(boltGeometry, sidearm ? roundMaterial : boltMaterial);
        mesh.position.set(e.x, 1.35, e.z);
        mesh.lookAt(e.x + e.dir.x, 1.35, e.z + e.dir.z);
        mesh.userData = { dir: e.dir, speed: e.speed || (e.move === 'sniperShot' ? 140 : 60), hex, spin: blade ? 22 : 0, own: blade };
        scene.add(mesh);
        bolts.set(e.id, mesh);
        // the muzzle
        flashes.flash(mesh.position, hex, 7, 0.1);
        for (let i = 0; i < 8; i++) {
          const v = 6 + Math.random() * 6;
          particles.spawn(e.x, 1.35, e.z, e.dir.x * v + rand(1.5), rand(1.5), e.dir.z * v + rand(1.5), { hex, size: 0.035, ttl: 0.18, damping: 4 });
        }
      }
      if (e.type === 'projectileEnd') {
        const mesh = bolts.get(e.id);
        if (mesh) {
          burst(mesh.position, 12, 3, { hex: mesh.userData.hex, size: 0.04, ttl: 0.3 });
          mesh.removeFromParent();
          if (mesh.userData.own) mesh.material.dispose();
          bolts.delete(e.id);
        }
      }
      return feel;
    },
    /** Every frame. grips: [{ holder, held }] (actors) being held right now. */
    update(dt, { grips = [] } = {}) {
      time += dt;
      stepDissolves(dt);
      particles.update(dt);
      shells.update(dt);
      cones.update(dt);
      shards.update(dt);
      tears.update(dt);
      flashes.update(dt);
      for (const mesh of bolts.values()) {
        mesh.position.addScaledVector(new THREE.Vector3(mesh.userData.dir.x, 0, mesh.userData.dir.z), mesh.userData.speed * dt);
        if (mesh.userData.spin) mesh.rotateY(mesh.userData.spin * dt); // a thrown blade turns end over end
      }
      // a Sanctuary breathes while it stands and thins out as it ends
      for (const [id, z] of zones) {
        z.left -= dt;
        if (z.left <= 0) { dropZone(id); continue; }
        const k = Math.min(1, z.left / 0.6) * Math.min(1, (z.ttl - z.left) / 0.3);
        z.dome.opacity = (0.08 + 0.03 * Math.sin(time * 3)) * k;
        z.rim.opacity = 0.7 * k;
      }
      // the grip: ribbons, the warped lens around the held body, motes swirling round it
      const lenses = [];
      if (grips.length && camera) {
        const { holder, held } = grips[0];
        const a = holder.hand();
        const b = held.chest();
        tether.show(a, b, camera, time);
        lenses.push({ at: b, radius: 1.05, strength: 0.16 + 0.04 * Math.sin(time * 6), spin: 0.9 * Math.sin(time * 1.7) + 0.4 });
        for (let i = 0; i < 3; i++) {
          const ang = time * 9 + i * 2.1;
          const r = 0.6 + 0.12 * Math.sin(time * 5 + i);
          particles.spawn(b.x + Math.cos(ang) * r, b.y + (Math.random() - 0.4) * 1.3, b.z + Math.sin(ang) * r,
            -Math.sin(ang) * 2.5, 0.7, Math.cos(ang) * 2.5, { hex: COLORS.telekinesis, size: 0.045, ttl: 0.4, damping: 1 });
        }
        if (Math.random() < dt * 14) {
          const p = a.clone().lerp(b, Math.random());
          particles.spawn(p.x, p.y, p.z, rand(0.4), rand(0.4), rand(0.4), { hex: COLORS.core, size: 0.04, ttl: 0.3, damping: 2 });
        }
      } else tether.hide();
      warp?.hold(lenses);
      // a thrown body trails light while it flies
      for (const [actor, left] of thrown) {
        if (left <= 0) { thrown.delete(actor); continue; }
        thrown.set(actor, left - dt);
        const c = actor.chest();
        for (let i = 0; i < 3; i++) particles.spawn(c.x + rand(0.25), c.y + rand(0.4), c.z + rand(0.25), 0, 0.2, 0, { hex: i ? COLORS.telekinesis : COLORS.core, size: 0.06, ttl: 0.35, damping: 1 });
      }
    },
    /** While an effect lasts, motes in its colour rise round the body. kinds: the fighter's effects right now. */
    aura(actor, kinds, dt) {
      for (const kind of kinds) {
        const hex = EFFECT_COLORS[kind];
        if (!hex || Math.random() > dt * (kind === 'rage' ? 40 : 16)) continue;
        const c = actor.chest();
        particles.spawn(c.x + rand(0.35), c.y + rand(0.6) - 0.2, c.z + rand(0.35), rand(0.3), 0.6 + Math.random() * 0.8, rand(0.3),
          { hex, size: kind === 'rage' ? 0.06 : 0.04, ttl: 0.6, damping: 1.2 });
      }
    },
    dispose() {
      particles.dispose(); shells.dispose(); cones.dispose(); tether.dispose(); shards.dispose(); tears.dispose(); flashes.dispose();
      for (const mesh of bolts.values()) { mesh.removeFromParent(); if (mesh.userData.own) mesh.material.dispose(); }
      for (const id of [...zones.keys()]) dropZone(id);
      bladeGeometry.dispose();
      boltGeometry.dispose(); boltMaterial.dispose(); roundMaterial.dispose();
    },
  };
}
