// Duelist Adventure effects (first pass; phase 3 builds the full Telekinesis look on top of these):
// - the Veil: a shell around the body that ripples where a hit lands (cyan when stable, amber when unstable)
//   and shatters when it collapses; shields flash blue;
// - Telekinesis: push and pull waves of bent space, the grip's swirl and tether, the throw's shockwave;
// - Veil Breach: a violet implosion; parries: white sparks; wounds: red sparks; arrows: glowing bolts.
// Pooled and allocation-free per frame.
import * as THREE from 'three';

const COLORS = Object.freeze({ stable: 0x9ff4ff, unstable: 0xffb05a, collapsed: 0xffffff, shield: 0x4f8cff, breach: 0xb06bff,
  wound: 0xff5a4a, parry: 0xfff6d6, telekinesis: 0x9fd8ff });

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

function createParticles(scene, capacity = 1500) {
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
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  const color = new THREE.Color();
  return {
    spawn(x, y, z, vx, vy, vz, { size = 0.06, ttl = 0.5, hex = 0xffffff, damping = 2, fall = 0 } = {}) {
      const i = cursor;
      cursor = (cursor + 1) % capacity;
      positions.set([x, y, z], i * 3);
      velocity.set([vx, vy, vz], i * 3);
      color.setHex(hex);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = size; life[i] = ttl; maxLife[i] = ttl; drag[i] = damping; gravity[i] = fall; alphas[i] = 1;
    },
    update(dt) {
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) { alphas[i] = 0; continue; }
        life[i] -= dt;
        const k = Math.exp(-drag[i] * dt);
        velocity[i * 3] *= k; velocity[i * 3 + 1] = velocity[i * 3 + 1] * k - gravity[i] * dt; velocity[i * 3 + 2] *= k;
        positions[i * 3] += velocity[i * 3] * dt;
        positions[i * 3 + 1] += velocity[i * 3 + 1] * dt;
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

// ---------- shells (the Veil ripple, shield flashes, waves of bent space)
const SHELL_VERTEX = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vLocal = normalize(position);
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uAge; uniform vec3 uOrigin; uniform float uRipple; uniform float uHex;
  varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  float hexLines(vec3 p) {
    vec2 q = vec2(atan(p.z, p.x) * 3.0, p.y * 5.0);
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5; vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b; vec2 h = abs(g);
    return smoothstep(0.42, 0.5, max(dot(h, normalize(vec2(1.0, 1.7320508))), h.x));
  }
  void main() {
    float rim = pow(1.0 - abs(dot(vN, vV)), 2.0);
    float fade = 1.0 - uAge;
    float d = acos(clamp(dot(vLocal, uOrigin), -1.0, 1.0)); // angle from the impact point
    float wave = uRipple > 0.5 ? exp(-pow((d - uAge * 2.6) * 6.0, 2.0)) : 0.0;
    float spot = uRipple > 0.5 ? exp(-d * d * 10.0) * (1.0 - uAge) : 0.0;
    float hex = uHex > 0.5 ? hexLines(vLocal) * 0.8 : 0.0;
    float a = (rim * 0.55 + wave * 0.9 + spot + hex * rim) * fade;
    gl_FragColor = vec4(uColor * a * 1.5, a);
  }`;

function createShellPool(scene, size = 16) {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  const shells = [];
  for (let i = 0; i < size; i++) {
    const material = new THREE.ShaderMaterial({ vertexShader: SHELL_VERTEX, fragmentShader: SHELL_FRAGMENT, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color() }, uAge: { value: 1 }, uOrigin: { value: new THREE.Vector3(0, 0, 1) },
        uRipple: { value: 0 }, uHex: { value: 0 } } });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    shells.push({ mesh, age: 1, ttl: 0.35, follow: null, grow: 0, base: new THREE.Vector3(1, 1, 1), move: null });
  }
  let cursor = 0;
  return {
    // follow: an Object3D to stay on (the defender), or null for a fixed position
    flash({ position, follow = null, scale = [0.55, 1, 0.55], hex = COLORS.stable, ripple = true, hexPattern = false, origin = null, ttl = 0.35, grow = 0, move = null }) {
      const s = shells[cursor];
      cursor = (cursor + 1) % shells.length;
      s.age = 0; s.ttl = ttl; s.follow = follow; s.grow = grow; s.move = move;
      s.base.fromArray(scale);
      s.mesh.scale.copy(s.base);
      if (position) s.mesh.position.copy(position);
      const u = s.mesh.material.uniforms;
      u.uColor.value.setHex(hex); u.uRipple.value = ripple ? 1 : 0; u.uHex.value = hexPattern ? 1 : 0;
      u.uOrigin.value.copy(origin || new THREE.Vector3(0, 0, 1)).normalize();
      s.mesh.visible = true;
    },
    update(dt) {
      for (const s of shells) {
        if (!s.mesh.visible) continue;
        s.age += dt / s.ttl;
        if (s.age >= 1) { s.mesh.visible = false; continue; }
        if (s.follow) { s.follow.getWorldPosition(s.mesh.position); s.mesh.position.y += 1.0; }
        if (s.move) s.mesh.position.addScaledVector(s.move, dt);
        if (s.grow) s.mesh.scale.copy(s.base).multiplyScalar(1 + s.grow * s.age);
        s.mesh.material.uniforms.uAge.value = s.age;
      }
    },
    dispose() { geometry.dispose(); shells.forEach((s) => { s.mesh.material.dispose(); s.mesh.removeFromParent(); }); },
  };
}

export function createDuelVfx(scene) {
  const particles = createParticles(scene);
  const shells = createShellPool(scene);
  const bolts = new Map(); // projectile id -> mesh
  const boltGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).rotateX(Math.PI / 2);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
  const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: COLORS.telekinesis, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
  tether.visible = false;
  tether.frustumCulled = false;
  scene.add(tether);
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
  let time = 0;

  return {
    /**
     * Present one simulation effect. actors: { [id]: { root: Object3D (feet), chest: () => Vector3, hand: () => Vector3 } }
     */
    effect(e, actors) {
      const target = actors[e.defender];
      const source = actors[e.attacker || e.from || e.owner];
      if (e.type === 'impact' && target) {
        const chest = target.chest();
        const from = source ? source.chest() : chest.clone().add(new THREE.Vector3(0, 0, 1));
        const origin = tmp.copy(from).sub(chest).normalize().clone();
        if (e.shield > 0.01) shells.flash({ follow: target.root, hex: COLORS.shield, hexPattern: true, origin, ttl: 0.3 });
        if (e.will > 0.01) shells.flash({ follow: target.root, hex: e.veil === 'unstable' ? COLORS.unstable : COLORS.stable, origin, ttl: 0.4 });
        if (e.hp > 0.01) burst(chest.addScaledVector(origin, 0.25), 14, 4.5, { hex: COLORS.wound, size: 0.05, ttl: 0.4, damping: 4, fall: 6 });
        if (e.outcome === 'blocked') burst(chest.addScaledVector(origin, 0.45), 10, 3.5, { hex: COLORS.parry, size: 0.04, ttl: 0.25, damping: 5 });
      }
      if (e.type === 'parry' && target) {
        const at = target.hand();
        burst(at, 28, 6, { hex: COLORS.parry, size: 0.05, ttl: 0.35, damping: 5 });
        shells.flash({ position: at, scale: [0.25, 0.25, 0.25], hex: COLORS.parry, ripple: false, ttl: 0.2, grow: 2 });
      }
      if (e.type === 'veilCollapse' && target) {
        const chest = target.chest();
        burst(chest, 60, 5.5, { hex: COLORS.collapsed, size: 0.06, ttl: 0.8, damping: 2.5, fall: 2 });
        shells.flash({ follow: target.root, hex: COLORS.collapsed, ripple: false, ttl: 0.5, grow: 0.6 });
      }
      if (e.type === 'breach' && target) {
        shells.flash({ follow: target.root, hex: COLORS.breach, ripple: false, hexPattern: true, ttl: 0.6, grow: -0.5 });
        burst(target.chest(), 30, 2.5, { hex: COLORS.breach, size: 0.05, ttl: 0.6, damping: 1 });
      }
      if (e.type === 'held' && target) burst(target.chest(), 40, 2, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.7, damping: 1.5 });
      if (e.type === 'defeat' && target) burst(target.chest(), 50, 3, { hex: 0x8fa0b8, size: 0.06, ttl: 1.2, damping: 1.5, fall: 3 });
      if (e.type === 'projectile' && source) {
        const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
        mesh.position.set(e.x, 1.35, e.z);
        mesh.lookAt(e.x + e.dir.x, 1.35, e.z + e.dir.z);
        mesh.userData = { dir: e.dir, speed: e.move === 'sniperShot' ? 140 : 60 };
        scene.add(mesh);
        bolts.set(e.id, mesh);
      }
      if (e.type === 'projectileEnd') {
        const mesh = bolts.get(e.id);
        if (mesh) { burst(mesh.position, 12, 3, { hex: 0xbfefff, size: 0.04, ttl: 0.3 }); mesh.removeFromParent(); bolts.delete(e.id); }
      }
    },
    // A Telekinesis wave leaving the caster's hand: dir = facing (unit {x,z}); pull folds space back in.
    wave(kind, actor, dir) {
      const hand = actor.hand();
      const forward = new THREE.Vector3(dir.x, 0, dir.z);
      if (kind === 'push') {
        shells.flash({ position: hand.clone().addScaledVector(forward, 0.6), scale: [0.35, 0.35, 0.12], hex: COLORS.telekinesis, ripple: false,
          ttl: 0.45, grow: 5, move: forward.clone().multiplyScalar(14) });
        for (let i = 0; i < 26; i++) {
          const spread = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
          const v = forward.clone().multiplyScalar(10 + Math.random() * 6).add(spread.multiplyScalar(4));
          particles.spawn(hand.x, hand.y, hand.z, v.x, v.y, v.z, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.5, damping: 3 });
        }
      } else if (kind === 'pull') {
        const far = hand.clone().addScaledVector(forward, 8);
        shells.flash({ position: far, scale: [1.6, 1.6, 0.4], hex: COLORS.telekinesis, ripple: false, ttl: 0.45, grow: -0.8, move: forward.clone().multiplyScalar(-14) });
        for (let i = 0; i < 26; i++) {
          const start = far.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
          const v = hand.clone().sub(start).multiplyScalar(2.2);
          particles.spawn(start.x, start.y, start.z, v.x, v.y, v.z, { hex: COLORS.telekinesis, size: 0.05, ttl: 0.45, damping: 0.5 });
        }
      } else if (kind === 'throw') {
        shells.flash({ position: hand, scale: [0.4, 0.4, 0.4], hex: COLORS.telekinesis, ripple: false, ttl: 0.35, grow: 4 });
      }
    },
    // Called every frame with the grip pairs being held: [{ holder, held }] (actors).
    update(dt, grips = []) {
      time += dt;
      particles.update(dt);
      shells.update(dt);
      for (const mesh of bolts.values()) mesh.position.addScaledVector(new THREE.Vector3(mesh.userData.dir.x, 0, mesh.userData.dir.z), mesh.userData.speed * dt);
      tether.visible = grips.length > 0;
      if (grips.length) {
        const { holder, held } = grips[0];
        const a = holder.hand();
        const b = held.chest();
        tether.geometry.setFromPoints([a, b]);
        // the swirl of bent space around the held body
        for (let i = 0; i < 3; i++) {
          const ang = time * 9 + i * 2.1;
          const r = 0.55 + 0.1 * Math.sin(time * 5 + i);
          particles.spawn(b.x + Math.cos(ang) * r, b.y + (Math.random() - 0.4) * 1.2, b.z + Math.sin(ang) * r,
            -Math.sin(ang) * 2.5, 0.6, Math.cos(ang) * 2.5, { hex: COLORS.telekinesis, size: 0.045, ttl: 0.4, damping: 1 });
        }
      }
    },
    dispose() {
      particles.dispose(); shells.dispose();
      for (const mesh of bolts.values()) mesh.removeFromParent();
      boltGeometry.dispose(); boltMaterial.dispose();
      tether.geometry.dispose(); tether.material.dispose(); tether.removeFromParent();
    },
  };
}
