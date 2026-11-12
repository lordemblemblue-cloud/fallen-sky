import * as THREE from 'three';
import { enemyFlinchScale } from '../combat/CombatFeedback';

// Render-only hit sparks and a brief silhouette-scale flinch. No health, AI,
// physics, cooldown or animation clip changes. Shared geometries are disposed.
export function createCombatImpactFeedback({ scene, maxBursts = 18 } = {}) {
  const ringGeometry = new THREE.RingGeometry(0.22, 0.37, 32);
  const slashGeometry = new THREE.PlaneGeometry(0.82, 0.045);
  const bursts = [];
  const reactions = new Map();
  const recoilQuaternion = new THREE.Quaternion();
  const recoilEuler = new THREE.Euler();

  // Prefer a torso bone over scaling the whole enemy: this keeps the body
  // origin, visible footprint and combat range completely unchanged.
  const findTorsoBone = (root) => {
    let torso = null;
    root?.traverse?.(node => {
      if (!torso && node.isBone && /spine|chest|upperbody|torso/i.test(node.name || '')) torso = node;
    });
    return torso;
  };
  const restoreBonePose = (reaction) => {
    if (reaction?.poseApplied && reaction.bone && reaction.originalBoneQuaternion) {
      reaction.bone.quaternion.copy(reaction.originalBoneQuaternion);
      reaction.poseApplied = false;
    }
  };
  // Called BEFORE enemy AnimationMixer updates every frame so recoil does not
  // feed back into the animation controller and accumulate across hits.
  const preUpdate = () => {
    for (const reaction of reactions.values()) restoreBonePose(reaction);
  };

  const release = (burst) => {
    scene.remove(burst.group);
    burst.materials.forEach(material => material.dispose());
  };

  const hit = (enemy, { critical = false, lethal = false } = {}) => {
    if (!enemy?.group?.position || enemy.dying || enemy.defeated) return false;

    // Store the ORIGINAL nonuniform scale; follow-up hits restart the flinch,
    // they never accumulate scaling and never move the enemy hitbox.
    if (!enemy.isBoss && enemy.group.scale) {
      const prev = reactions.get(enemy);
      if (prev) {
        prev.elapsed = 0;
        prev.critical ||= critical || lethal;
      } else {
        reactions.set(enemy, { original: enemy.group.scale.clone(),
          bone: findTorsoBone(enemy.group), poseApplied: false, originalBoneQuaternion: null,
          elapsed: 0, critical: critical || lethal });
      }
    }

    // Hidden NPCs are a systems test feature; avoid flashes with no visible body.
    if (enemy.group.visible === false) return true;

    while (bursts.length >= maxBursts) release(bursts.shift());
    const color = lethal ? 0xffe7a5 : critical ? 0xffd88b : 0xb8eaff;
    const makeMaterial = (opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const group = new THREE.Group();
    group.name = 'AXECombatImpact';
    const ringMat = makeMaterial(0.9);
    const ring = new THREE.Mesh(ringGeometry, ringMat);
    group.add(ring);
    const slashMat = makeMaterial(0.95);
    const slash = new THREE.Mesh(slashGeometry, slashMat);
    slash.rotation.z = -0.6;
    group.add(slash);
    if (critical || lethal) {
      const crossMat = makeMaterial(0.8);
      const cross = new THREE.Mesh(slashGeometry, crossMat);
      cross.rotation.z = 0.8;
      group.add(cross);
    }
    scene.add(group);
    bursts.push({
      group, ring, enemy, materials: group.children.map(mesh => mesh.material),
      elapsed: 0, lifetime: lethal ? 0.40 : critical ? 0.32 : 0.22,
      strength: critical || lethal ? 1.6 : 1,
    });
    return true;
  };

  const update = (delta, camera) => {
    const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.elapsed += dt;
      const t = Math.min(1, b.elapsed / b.lifetime);
      if (t >= 1 || !b.enemy?.group?.parent) {
        release(b);
        bursts.splice(i, 1);
        continue;
      }
      const p = b.enemy.group.position;
      b.group.position.set(p.x, p.y + (b.enemy.isBoss ? 2.8 : 1.15), p.z);
      if (camera) b.group.quaternion.copy(camera.quaternion);
      b.group.scale.setScalar(b.strength * (0.65 + t * 1.25));
      for (const material of b.materials) material.opacity = Math.max(0, (1 - t) ** 1.8);
    }

    for (const [enemy, reaction] of reactions) {
      reaction.elapsed += dt;
      if (!enemy?.group || enemy.dying || enemy.defeated || reaction.elapsed >= 0.18) {
        restoreBonePose(reaction);
        enemy?.group?.scale?.copy(reaction.original);
        reactions.delete(enemy);
        continue;
      }
      const pulse = 1 - enemyFlinchScale(reaction.elapsed, 0.18, reaction.critical);
      if (reaction.bone) {
        restoreBonePose(reaction);
        reaction.originalBoneQuaternion = reaction.bone.quaternion.clone();
        // Small chest recoil; cosmetic only. No root movement or gameplay stun.
        recoilEuler.set(-pulse * 3.2, 0, pulse * 0.85);
        recoilQuaternion.setFromEuler(recoilEuler);
        reaction.bone.quaternion.multiply(recoilQuaternion);
        reaction.poseApplied = true;
      } else {
        // Skeletons without identifiable spine bones use the 2.1 fallback.
        enemy.group.scale.copy(reaction.original).multiplyScalar(1 - pulse);
      }
    }
  };

  const dispose = () => {
    bursts.splice(0).forEach(release);
    for (const [enemy, reaction] of reactions) {
      restoreBonePose(reaction);
      enemy?.group?.scale?.copy(reaction.original);
    }
    reactions.clear();
    ringGeometry.dispose();
    slashGeometry.dispose();
  };

  return { hit, preUpdate, update, dispose };
}
