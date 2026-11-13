import * as THREE from 'three';

// A post-animation pose, shared by the local and remote player renderers.
// Targets are in world space; bone axes come from each skin's inverse bind
// matrices rather than assuming that an imported thigh rotates about X.
const key = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
const EPS = 1e-6;
// Calibrated against the actual owner-uploaded mounts. Tiger Spine_1 is at
// the forward saddle lip; its seated center lies 28cm behind that bone.
const SEAT_FORWARD_OFFSETS = Object.freeze({ faction_tiger: -.28 });

function findBone(root, names) {
  const wanted = new Set(names.map(key));
  let found = null;
  root?.traverse(node => { if (!found && node.isBone && wanted.has(key(node.name))) found = node; });
  return found;
}

function bindPose(player) {
  const world = new Map();
  player.traverse(node => {
    node.skeleton?.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (inverse && !world.has(bone)) world.set(bone, inverse.clone().invert());
    });
  });
  const modelInverse = player.matrixWorld.clone().invert();
  const result = new Map();
  player.traverse(bone => {
    if (!bone.isBone) return;
    const matrix = world.get(bone);
    let local;
    if (matrix) {
      const parentBind = world.get(bone.parent) || (bone.parent
        ? modelInverse.clone().multiply(bone.parent.matrixWorld) : new THREE.Matrix4());
      local = parentBind.clone().invert().multiply(matrix);
    }
    const position = bone.position.clone(), quaternion = bone.quaternion.clone(), scale = bone.scale.clone();
    if (local) local.decompose(position, quaternion, scale);
    result.set(bone, { position, quaternion, scale, modelMatrix: matrix });
  });
  return result;
}

function applyTransforms(transforms) {
  for (const [bone, value] of transforms) {
    bone.position.copy(value.position);
    bone.quaternion.copy(value.quaternion);
    bone.scale.copy(value.scale);
  }
}

function setWorldQuaternion(bone, worldQuaternion) {
  const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(worldQuaternion));
  bone.updateWorldMatrix(false, true);
}

function aimBone(bone, child, target) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const current = child.getWorldPosition(new THREE.Vector3()).sub(origin);
  const desired = target.clone().sub(origin);
  if (current.lengthSq() < EPS || desired.lengthSq() < EPS) return;
  const rotation = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
  setWorldQuaternion(bone, rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}

/** Analytic two-bone IK with a pole that keeps knees/elbows outside the body. */
export function solveMountedLimb(upper, lower, end, target, pole) {
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = end.getWorldPosition(new THREE.Vector3());
  const first = a.distanceTo(b), second = b.distanceTo(c);
  if (first < EPS || second < EPS) return false;
  const direction = target.clone().sub(a);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(first - second) + EPS, first + second - EPS);
  if (direction.lengthSq() < EPS) return false;
  direction.normalize();
  const bend = pole.clone().sub(a);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < EPS) bend.set(0, 0, 1).cross(direction);
  if (bend.lengthSq() < EPS) bend.set(1, 0, 0).cross(direction);
  bend.normalize();
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, first * first - along * along));
  const knee = a.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  aimBone(upper, lower, knee);
  aimBone(lower, end, a.addScaledVector(direction, distance));
  return true;
}

// Only real mesh vertices contribute: the companion's decorative ground ring
// must not make the saddle wider or higher. Read the skinned positions once,
// then retain the seat relative to an animated spine bone for subsequent frames.
function measureMount(mount, definition) {
  mount.updateWorldMatrix(true, true);
  const inverse = mount.matrixWorld.clone().invert();
  const points = [], bounds = new THREE.Box3();
  mount.traverse(node => {
    const attribute = node.geometry?.attributes?.position;
    if (!attribute || !node.isMesh || (!node.isSkinnedMesh && node.geometry.type === 'RingGeometry')) return;
    node.skeleton?.update();
    const stride = Math.max(1, Math.ceil(attribute.count / 24000));
    for (let i = 0; i < attribute.count; i += stride) {
      const vertex = new THREE.Vector3();
      node.getVertexPosition(i, vertex);
      vertex.applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) continue;
      points.push(vertex); bounds.expandByPoint(vertex);
    }
  });
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = mount.getWorldScale(new THREE.Vector3());
  const anchorNames = definition?.riderSeatBone
    ? [definition.riderSeatBone] : ['tripo::Spine_1', 'Spine1', 'Spine', 'spine_02', 'spine_01'];
  const anchor = findBone(mount, anchorNames) || mount;
  const anchorPoint = mount.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
  const seatZ = (anchor === mount ? center.z : anchorPoint.z)
    + (SEAT_FORWARD_OFFSETS[definition?.id || definition?.companionId] || 0) / Math.max(EPS, Math.abs(scale.z));
  const seatX = anchor === mount ? center.x : anchorPoint.x;
  let seatY = -Infinity;
  for (const point of points) {
    if (Math.abs(point.z - seatZ) < size.z * .075 && Math.abs(point.x - seatX) < size.x * .18) seatY = Math.max(seatY, point.y);
  }
  if (!Number.isFinite(seatY)) seatY = bounds.min.y + size.y * .7;
  let halfWidth = size.x * .25;
  for (const point of points) {
    if (Math.abs(point.z - seatZ) < size.z * .075 && point.y > seatY - size.y * .32) halfWidth = Math.max(halfWidth, Math.abs(point.x - seatX));
  }
  const seat = mount.localToWorld(new THREE.Vector3(seatX, seatY + .025 / Math.max(EPS, Math.abs(scale.y)), seatZ));
  const halfWidthMeters = halfWidth * Math.abs(scale.x);
  const gripX = seatX - Math.max(.14, Math.min(.24, halfWidthMeters * .7)) / Math.max(EPS, Math.abs(scale.x));
  const gripZ = seatZ + .13 / Math.max(EPS, Math.abs(scale.z));
  let gripY = -Infinity;
  for (const point of points) {
    if (Math.abs(point.x - gripX) * Math.abs(scale.x) < .055 && Math.abs(point.z - gripZ) * Math.abs(scale.z) < .065) gripY = Math.max(gripY, point.y);
  }
  // Sparse low-poly surfaces may have no vertex in the grip's small X/Z
  // column. Use the nearest surface sample, never a guessed air target.
  if (!Number.isFinite(gripY)) {
    let best = Infinity;
    for (const point of points) {
      const distance = ((point.x - gripX) * scale.x) ** 2 + ((point.z - gripZ) * scale.z) ** 2;
      if (distance < best - EPS) { best = distance; gripY = point.y; }
      else if (Math.abs(distance - best) < EPS) gripY = Math.max(gripY, point.y);
    }
  }
  const grip = mount.localToWorld(new THREE.Vector3(gripX, gripY + .015 / Math.max(EPS, Math.abs(scale.y)), gripZ));
  const bodyBasis = anchor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(mount.getWorldQuaternion(new THREE.Quaternion()));
  return {
    anchor, offset: anchor.worldToLocal(seat.clone()),
    gripOffset: anchor.worldToLocal(grip), bodyBasis,
    halfWidth: halfWidthMeters,
  };
}

function moveWeapons(rightHand, leftHand) {
  const attachments = [];
  if (!rightHand || !leftHand) return attachments;
  const candidates = [];
  rightHand.traverse(node => {
    if (node === rightHand || node.isBone || node.isSkinnedMesh) return;
    if (node.userData?.isWeapon || node.userData?.weapon || /weapon|sword|saber|blade|bow|rifle|staff|spear|axe/i.test(node.name)) candidates.push(node);
  });
  for (const object of candidates) {
    if (candidates.some(other => other !== object && other.getObjectById(object.id))) continue;
    attachments.push({ object, visible: object.visible, parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
    leftHand.add(object); // Preserve its authored grip-local transform.
  }
  return attachments;
}

/**
 * Keep player.position as the gameplay ground position. The hips, limbs and
 * wrist attachments form the visual riding pose; call update AFTER animation.
 */
export function createMountedRiderPose({ player, mount, definition = {} } = {}) {
  const empty = reason => ({ supported: false, update: () => false, restore() {}, getStatus: () => ({ supported: false, reason }) });
  if (!player || !mount) return empty('missing-player-or-mount');
  player.updateWorldMatrix(true, true);
  const hips = findBone(player, ['Hips', 'pelvis', 'Bip01_Pelvis']);
  const limbs = {};
  for (const side of ['Left', 'Right']) {
    limbs[side] = {
      thigh: findBone(player, [`${side}UpLeg`, `thigh_${side[0]}`, `Bip01_${side[0]}_Thigh`]),
      shin: findBone(player, [`${side}Leg`, `calf_${side[0]}`, `Bip01_${side[0]}_Calf`]),
      foot: findBone(player, [`${side}Foot`, `foot_${side[0]}`, `Bip01_${side[0]}_Foot`]),
      arm: findBone(player, [`${side}Arm`, `upperarm_${side[0]}`, `Bip01_${side[0]}_UpperArm`]),
      forearm: findBone(player, [`${side}ForeArm`, `lowerarm_${side[0]}`, `Bip01_${side[0]}_Forearm`]),
      hand: findBone(player, [`${side}Hand`, `hand_${side[0]}`, `Bip01_${side[0]}_Hand`]),
    };
  }
  if (!hips || Object.values(limbs).some(limb => Object.values(limb).some(value => !value))) return empty('incomplete-rider-skeleton');
  const saddle = measureMount(mount, definition);
  if (!saddle) return empty('mount-has-no-body-geometry');
  const rest = bindPose(player), entry = new Map();
  for (const bone of rest.keys()) entry.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() });
  const attachments = moveWeapons(limbs.Right.hand, limbs.Left.hand);
  let restored = false;
  const status = { supported: true, halfWidth: saddle.halfWidth, weaponAttached: attachments.length > 0, leftHand: limbs.Left.hand, rightHand: limbs.Right.hand, seat: new THREE.Vector3(), rightGrip: new THREE.Vector3() };

  function update({ weaponHand = false } = {}) {
    if (restored) return false;
    for (const saved of attachments) saved.object.visible = weaponHand && saved.visible;
    applyTransforms(rest);
    player.updateWorldMatrix(true, true); mount.updateWorldMatrix(true, true);
    const seat = saddle.anchor.localToWorld(saddle.offset.clone());
    hips.position.copy(hips.parent.worldToLocal(seat.clone()));
    player.updateWorldMatrix(true, true);
    const yaw = player.getWorldQuaternion(new THREE.Quaternion());
    const bodyOrientation = saddle.anchor.getWorldQuaternion(new THREE.Quaternion()).multiply(saddle.bodyBasis);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyOrientation).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyOrientation).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    // Bind geometry establishes which side is left even for differently named
    // and differently oriented imported rigs.
    const leftHip = limbs.Left.thigh.getWorldPosition(new THREE.Vector3());
    if (leftHip.clone().sub(seat).dot(left) < 0) left.negate();
    // A small forward pelvic tilt brings the shoulder within reach of the
    // near side of the withers. Raising a floating hand target would leave
    // the rider visibly gripping empty air above the mount.
    setWorldQuaternion(hips, new THREE.Quaternion().setFromAxisAngle(left, .30).multiply(hips.getWorldQuaternion(new THREE.Quaternion())));
    for (const [side, limb] of Object.entries(limbs)) {
      const sign = side === 'Left' ? 1 : -1;
      const legLength = limb.thigh.getWorldPosition(new THREE.Vector3()).distanceTo(limb.shin.getWorldPosition(new THREE.Vector3()))
        + limb.shin.getWorldPosition(new THREE.Vector3()).distanceTo(limb.foot.getWorldPosition(new THREE.Vector3()));
      const spread = saddle.halfWidth + .075;
      const footTarget = seat.clone().addScaledVector(left, sign * spread).addScaledVector(up, -legLength * .70).addScaledVector(forward, legLength * .12);
      const kneePole = seat.clone().addScaledVector(left, sign * (spread + .6)).addScaledVector(forward, .7);
      solveMountedLimb(limb.thigh, limb.shin, limb.foot, footTarget, kneePole);
      // Feet keep their authored upright orientation instead of inheriting the
      // shin's IK twist, which otherwise points toes through the mount.
      const bind = rest.get(limb.foot)?.modelMatrix;
      if (bind) {
        const orientation = new THREE.Quaternion(); bind.decompose(new THREE.Vector3(), orientation, new THREE.Vector3());
        setWorldQuaternion(limb.foot, yaw.clone().multiply(orientation));
      }
    }
    const rightGrip = saddle.anchor.localToWorld(saddle.gripOffset.clone());
    // The left hand rests beside the right on the mount, and lifts clear
    // only while a weapon is being used.
    const leftGrip = weaponHand
      ? seat.clone().addScaledVector(left, .26).addScaledVector(forward, .16).addScaledVector(up, .26)
      : rightGrip.clone().addScaledVector(left, .08);
    for (const [side, target] of [['Right', rightGrip], ['Left', leftGrip]]) {
      const limb = limbs[side], sign = side === 'Left' ? 1 : -1;
      const elbowPole = seat.clone().addScaledVector(left, sign * .8).addScaledVector(up, .35);
      solveMountedLimb(limb.arm, limb.forearm, limb.hand, target, elbowPole);
      // Curl fingers from their own bind transforms; do not rotate the fused
      // mesh or overwrite face morph targets when closing the grip.
      limb.hand.traverse(bone => {
        if (!bone.isBone || !/hand(?:index|middle|ring|pinky)[123]$/.test(key(bone.name))) return;
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .65));
      });
    }
    player.updateWorldMatrix(true, true);
    status.seat.copy(seat); status.rightGrip.copy(rightGrip);
    return true;
  }

  function restore() {
    if (restored) return;
    applyTransforms(entry);
    for (const saved of attachments) {
      saved.parent.add(saved.object); saved.object.visible = saved.visible;
      saved.object.position.copy(saved.position); saved.object.quaternion.copy(saved.quaternion); saved.object.scale.copy(saved.scale);
    }
    player.updateWorldMatrix(true, true); restored = true;
  }
  return { supported: true, update, restore, getStatus: () => ({ ...status, seat: status.seat.clone(), rightGrip: status.rightGrip.clone() }) };
}