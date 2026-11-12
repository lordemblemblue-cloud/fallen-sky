import * as THREE from 'three';

// Short, weapon-relative trails displayed at the existing resolved swing time.
// No projectile hits, combat collision, movement, damage or camera effects.
const ARC_POINTS = 18;
const MAX_TRAILS = 12;
const HAND_PATTERN = /(righthand|right_hand|right hand|hand_r|mixamorigrighthand|hand\.r)/i;

function pickHand(actor) {
  let hand = null;
  actor?.traverse?.(node => {
    if (!hand && node.isBone && HAND_PATTERN.test(node.name || '')) hand = node;
  });
  return hand;
}

function makeLine(points, color, opacity) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Line(geometry, material);
}

export function createCombatWeaponTrails({ scene, maxTrails = MAX_TRAILS } = {}) {
  const trails = [];
  const hands = new WeakMap();
  const tmpPosition = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();
  const tmpOffset = new THREE.Vector3();

  const release = (trail) => {
    scene.remove(trail.group);
    trail.group.children.forEach(line => {
      line.geometry.dispose();
      line.material.dispose();
    });
  };

  const emit = ({ actor, weaponPath = 'melee', critical = false, hitIndex = 0 } = {}) => {
    if (!actor?.position || !scene) return false;
    while (trails.length >= Math.max(1, maxTrails)) release(trails.shift());
    const ranged = weaponPath === 'ranged';
    const color = critical ? 0xffd6a1 : 0xa8dfff;
    const radius = critical ? 0.55 : 0.44;
    const phase = (hitIndex % 2 === 0) ? 1 : -1;
    const points = [];
    const glow = [];
    for (let i = 0; i <= ARC_POINTS; i++) {
      const t = i / ARC_POINTS;
      if (ranged) {
        points.push(new THREE.Vector3(0.045 * Math.sin(t * Math.PI), 0.04 * Math.cos(t * Math.PI), t * 1.12));
        glow.push(new THREE.Vector3(0.045 * Math.sin(t * Math.PI), 0.04 * Math.cos(t * Math.PI) + 0.027, t * 0.95));
      } else {
        const a = -1.13 + t * 2.26;
        points.push(new THREE.Vector3(phase * radius * Math.sin(a), radius * Math.cos(a), -0.04 + t * 0.1));
        glow.push(new THREE.Vector3(phase * (radius - 0.045) * Math.sin(a),
          (radius - 0.045) * Math.cos(a), -0.04 + t * 0.1));
      }
    }

    const group = new THREE.Group();
    group.name = ranged ? 'AXERangedRelease' : 'AXEWeaponSweep';
    group.add(makeLine(points, color, 0.84), makeLine(glow, 0xffffff, 0.42));
    scene.add(group);
    if (!hands.has(actor)) hands.set(actor, pickHand(actor));
    trails.push({
      actor, hand: hands.get(actor), group, elapsed: 0,
      lifetime: ranged ? 0.13 : 0.22,
    });
    return true;
  };

  const update = (delta) => {
    const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
    for (let i = trails.length - 1; i >= 0; i--) {
      const item = trails[i];
      item.elapsed += dt;
      const t = Math.min(1, item.elapsed / item.lifetime);
      if (t >= 1 || !item.actor?.parent) {
        release(item);
        trails.splice(i, 1);
        continue;
      }
      item.actor.updateWorldMatrix(true, true);
      item.actor.getWorldQuaternion(tmpQuaternion);
      item.group.quaternion.copy(tmpQuaternion);
      if (item.hand) {
        item.hand.getWorldPosition(tmpPosition);
        item.group.position.copy(tmpPosition);
      } else {
        tmpOffset.set(0, 1.25, 0.5).applyQuaternion(tmpQuaternion);
        item.group.position.copy(item.actor.position).add(tmpOffset);
      }
      item.group.scale.setScalar(0.78 + 0.4 * t);
      for (const line of item.group.children) {
        line.material.opacity = (line === item.group.children[0] ? 0.84 : 0.42)
          * Math.max(0, (1 - t) ** 1.7);
      }
    }
  };

  const dispose = () => {
    trails.splice(0).forEach(release);
  };
  return { emit, update, dispose };
}
