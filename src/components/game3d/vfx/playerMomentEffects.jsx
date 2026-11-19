import * as THREE from 'three';

// Presentation-only effects for two gameplay moments on the local hero, run through GameWorld3D's activeEffects
// list ({ update(delta), alive(), dispose() }, like vfx/playerCastLightBeam.jsx):
//   createSkillUseBurst       a skill was cast (playerSkillCastStart from skills/skillExecutor.jsx)
//   createLevelUpCelebration  the hero gained a level (playerHUDStore.awardXP through GameWorld3D's XP paths)
// Neither reads or writes gameplay state; they follow the hero's position each frame and clean up after
// themselves. Colors follow the skill's weapon family so a bow skill and a sword skill read differently.
export const SKILL_BURST_COLORS = Object.freeze({
  sword: 0xffb347, melee: 0xffb347, daggers: 0xff8f6b, dagger: 0xff8f6b,
  bow: 0x7fe7ff, ranged: 0x7fe7ff, staff: 0xc78bff, default: 0xc78bff,
});
export const LEVEL_UP_COLOR = 0xffd77a;

export function skillBurstColor(weaponType) {
  const k = String(weaponType || '').toLowerCase();
  return SKILL_BURST_COLORS[k] ?? SKILL_BURST_COLORS.default;
}

let glowTexture = null;
function radialGlow() {
  if (glowTexture) return glowTexture;
  if (typeof document === 'undefined') return null;
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

function makeSparks(count, color, size) {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, map: radialGlow() || undefined });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, positions, geometry, material };
}

const ringMaterial = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
  depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

export function createSkillUseBurst({ scene, playerRef, getGroundY, color = SKILL_BURST_COLORS.default, duration = 0.65 } = {}) {
  const group = new THREE.Group();
  group.name = 'PlayerSkillUseBurst';
  const ringGeo = new THREE.RingGeometry(0.42, 0.6, 64);
  const ringMat = ringMaterial(color, 0.85);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow() || undefined, color, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.y = 1.15;
  flash.scale.setScalar(0.4);
  group.add(flash);
  const light = new THREE.PointLight(color, 0, 7);
  light.position.y = 1.2;
  group.add(light);
  const count = 36;
  const sparks = makeSparks(count, color, 0.16);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 1.6;
    velocities[i * 3] = Math.cos(a) * r;
    velocities[i * 3 + 1] = 1.4 + Math.random() * 2.2;
    velocities[i * 3 + 2] = Math.sin(a) * r;
    sparks.positions[i * 3] = Math.cos(a) * 0.15;
    sparks.positions[i * 3 + 1] = 1.05 + Math.random() * 0.3;
    sparks.positions[i * 3 + 2] = Math.sin(a) * 0.15;
  }
  group.add(sparks.points);
  if (scene) scene.add(group);
  let t = 0, disposed = false;
  // GameWorld3D's activeEffects filter drops a finished effect without calling dispose(), so the effect removes
  // itself once its time is up (its point light too: a light left in the scene changes the light count every
  // material is compiled for). dispose() stays idempotent for a caller that does call it.
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene?.remove(group);
    ringGeo.dispose(); ringMat.dispose(); flash.material.dispose();
    sparks.geometry.dispose(); sparks.material.dispose();
  };
  return {
    update(delta) {
      if (disposed) return;
      const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
      t += dt;
      const player = playerRef?.current;
      if (player) {
        const y = getGroundY?.(player.position.x, player.position.z) ?? player.position.y;
        group.position.set(player.position.x, y, player.position.z);
      }
      const u = Math.min(1, t / duration);
      const fade = 1 - u * u;
      ring.scale.setScalar(0.6 + 3.2 * u);
      ringMat.opacity = 0.85 * fade;
      flash.scale.setScalar(0.4 + 1.6 * Math.min(1, t / 0.18));
      flash.material.opacity = 0.9 * Math.max(0, 1 - t / 0.35);
      light.intensity = 3.2 * fade;
      for (let i = 0; i < count; i++) {
        sparks.positions[i * 3] += velocities[i * 3] * dt;
        sparks.positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        sparks.positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        velocities[i * 3 + 1] -= 4.5 * dt;
      }
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = fade;
      if (t >= duration) dispose();
    },
    alive() { return !disposed && t < duration; },
    dispose,
  };
}

export function createLevelUpCelebration({ scene, playerRef, getGroundY, duration = 2.4, color = LEVEL_UP_COLOR } = {}) {
  const group = new THREE.Group();
  group.name = 'PlayerLevelUpCelebration';
  const pillarGeo = new THREE.CylinderGeometry(0.38, 0.62, 4.2, 40, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 2.1;
  group.add(pillar);
  const rings = [0, 0.22, 0.44].map((delay) => {
    const geo = new THREE.RingGeometry(0.5, 0.68, 72);
    const mat = ringMaterial(color, 0.9);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.04;
    group.add(mesh);
    return { mesh, geo, mat, delay };
  });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow() || undefined, color: 0xffffff,
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.y = 1.2;
  group.add(flash);
  const light = new THREE.PointLight(color, 0, 10);
  light.position.y = 1.4;
  group.add(light);
  const count = 90;
  const sparks = makeSparks(count, color, 0.14);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = Math.random() * Math.PI * 2;       // start angle
    seeds[i * 3 + 1] = 0.35 + Math.random() * 0.9;    // radius
    seeds[i * 3 + 2] = Math.random();                 // phase (0..1 of the rise)
    sparks.positions[i * 3 + 1] = -1;
  }
  group.add(sparks.points);
  if (scene) scene.add(group);
  let t = 0, disposed = false;
  // GameWorld3D's activeEffects filter drops a finished effect without calling dispose(), so the effect removes
  // itself once its time is up (its point light too: a light left in the scene changes the light count every
  // material is compiled for). dispose() stays idempotent for a caller that does call it.
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene?.remove(group);
    pillarGeo.dispose(); pillarMat.dispose(); flash.material.dispose();
    for (const ring of rings) { ring.geo.dispose(); ring.mat.dispose(); }
    sparks.geometry.dispose(); sparks.material.dispose();
  };
  return {
    update(delta) {
      if (disposed) return;
      const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
      t += dt;
      const player = playerRef?.current;
      if (player) {
        const y = getGroundY?.(player.position.x, player.position.z) ?? player.position.y;
        group.position.set(player.position.x, y, player.position.z);
      }
      const u = Math.min(1, t / duration);
      const envelope = Math.min(1, t / 0.25) * Math.max(0, 1 - Math.max(0, (t - duration + 0.6)) / 0.6);
      pillar.rotation.y += dt * 1.4;
      pillar.scale.set(1 + 0.25 * Math.sin(t * 7), 1, 1 + 0.25 * Math.cos(t * 6));
      pillarMat.opacity = 0.42 * envelope;
      for (const ring of rings) {
        const age = t - ring.delay;
        const visible = age > 0 && age < 1.1;
        ring.mesh.visible = visible;
        if (visible) {
          ring.mesh.scale.setScalar(0.6 + 6.5 * age);
          ring.mat.opacity = 0.9 * (1 - age / 1.1) ** 1.5;
        }
      }
      flash.scale.setScalar(0.5 + 2.4 * Math.min(1, t / 0.22));
      flash.material.opacity = 0.95 * Math.max(0, 1 - t / 0.5);
      light.intensity = 5.5 * envelope;
      for (let i = 0; i < count; i++) {
        const phase = (t / 1.6 + seeds[i * 3 + 2]) % 1;
        const angle = seeds[i * 3] + phase * 5.5;
        const radius = seeds[i * 3 + 1] * (1 - phase * 0.55);
        sparks.positions[i * 3] = Math.cos(angle) * radius;
        sparks.positions[i * 3 + 1] = 0.1 + phase * 3.4;
        sparks.positions[i * 3 + 2] = Math.sin(angle) * radius;
      }
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = envelope;
      void u;
      if (t >= duration) dispose();
    },
    alive() { return !disposed && t < duration; },
    dispose,
  };
}
