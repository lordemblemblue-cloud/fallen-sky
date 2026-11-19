import * as THREE from 'three';

// A post-animation pose, shared by the local and remote player renderers.
// Targets are in world space; bone axes come from each skin's inverse bind
// matrices rather than assuming that an imported thigh rotates about X.
const key = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
const EPS = 1e-6;
// Calibrated against the actual owner-uploaded mounts. Tiger Spine_1 is at
// the forward saddle lip; its seated center lies 28cm behind that bone. The
// bear's Spine_1 is under its own modelled saddle: the rider sits there, legs
// spread over its broad back (straddleLeg) and lifted onto it (measureSeatLift).
const SEAT_FORWARD_OFFSETS = Object.freeze({ faction_tiger: -.28 });
const FLANK_STEP = .05; // metres between the flank profile's samples
const WING_BONE = /wing/i; // a vertex mostly skinned to these is wing, not body
const LEG_CLEARANCE = .075; // metres between a leg bone and the body surface (the thigh's own thickness)
const SEAT_COMPRESSION = .015; // metres the rider may press into the back (fur, padding)
const MAX_SEAT_LIFT = .15;

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

// Only real body vertices contribute: the companion's decorative ground ring
// and the winged mounts' wings (raised above the back at rest) must not make
// the saddle wider or higher. Read the skinned positions once,
// then retain the seat relative to an animated spine bone for subsequent frames.
function measureMount(mount, definition) {
  mount.updateWorldMatrix(true, true);
  const inverse = mount.matrixWorld.clone().invert();
  const points = [], bounds = new THREE.Box3();
  mount.traverse(node => {
    const attribute = node.geometry?.attributes?.position;
    if (!attribute || !node.isMesh || node.visible===false ||
        node.userData?.factionThreeSecondaryHelper ||
        (!node.isSkinnedMesh && node.geometry.type === 'RingGeometry')) return;
    node.skeleton?.update();
    const skinIndex = node.geometry.attributes.skinIndex, skinWeight = node.geometry.attributes.skinWeight;
    const wingBones = new Set((node.isSkinnedMesh && skinIndex && skinWeight ? node.skeleton?.bones || [] : [])
      .map((bone, index) => (WING_BONE.test(bone.name) ? index : -1)).filter(index => index >= 0));
    const stride = Math.max(1, Math.ceil(attribute.count / 24000));
    for (let i = 0; i < attribute.count; i += stride) {
      if (wingBones.size) {
        let wing = 0;
        for (let k = 0; k < 4; k++) if (wingBones.has(skinIndex.getComponent(i, k))) wing += skinWeight.getComponent(i, k);
        if (wing > .5) continue;
      }
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
  // The flank under the saddle: for each depth below the seat (metres), the body's half-width (metres) in
  // the band where a rider's legs hang (a little behind the seat to well in front of it). The legs go
  // around this profile instead of hanging straight down through a wide body.
  const sx = Math.abs(scale.x), sy = Math.abs(scale.y), sz = Math.abs(scale.z);
  const flank = [];
  for (let below = 0; below <= 1.3 + EPS; below += FLANK_STEP) {
    const y = seatY - below / Math.max(EPS, sy);
    let half = 0;
    for (const point of points) {
      const dz = (point.z - seatZ) * sz;
      if (Math.abs(point.y - y) * sy < FLANK_STEP && dz > -.18 && dz < .5) half = Math.max(half, Math.abs(point.x - seatX) * sx);
    }
    flank.push(half);
  }
  const bodyBasis = anchor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(mount.getWorldQuaternion(new THREE.Quaternion()));
  return {
    anchor, offset: anchor.worldToLocal(seat.clone()),
    gripOffset: anchor.worldToLocal(grip), bodyBasis,
    halfWidth: halfWidthMeters, flank, points,
  };
}

// The body's half-width at `below` metres under the seat (0 beyond the measured depth).
function flankHalfWidth(flank, below) {
  if (!flank?.length || below < 0) return flank?.[0] || 0;
  const i = below / FLANK_STEP, a = Math.floor(i);
  if (a >= flank.length - 1) return a === flank.length - 1 ? flank[a] : 0;
  return flank[a] + (flank[a + 1] - flank[a]) * (i - a);
}

// Astride: the thigh goes out and down, steepest where it still clears the flank, knee a little forward;
// the shin hangs from the knee, swung out only as far as the flank below needs. Returns false when the
// mount gave no profile (the old straight-down solve is used then).
function straddleLeg(limb, { seat, out, up, forward, flank, clearance }) {
  if (!flank?.length) return false;
  const hip = limb.thigh.getWorldPosition(new THREE.Vector3());
  const thighLength = hip.distanceTo(limb.shin.getWorldPosition(new THREE.Vector3()));
  const shinLength = limb.shin.getWorldPosition(new THREE.Vector3()).distanceTo(limb.foot.getWorldPosition(new THREE.Vector3()));
  if (thighLength < EPS || shinLength < EPS) return false;
  const clears = point => point.clone().sub(seat).dot(out) >= flankHalfWidth(flank, seat.y - point.y) + clearance;
  let knee = null;
  for (let deg = 72; deg >= 0 && !knee; deg -= 4) {
    const a = deg * Math.PI / 180;
    const direction = out.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a)).addScaledVector(forward, .3).normalize();
    const candidate = hip.clone().addScaledVector(direction, thighLength);
    if (clears(candidate)) knee = candidate;
  }
  if (!knee) knee = hip.clone().addScaledVector(out.clone().addScaledVector(forward, .3).normalize(), thighLength);
  let foot = null;
  for (let deg = 0; deg <= 64 && !foot; deg += 4) {
    const a = deg * Math.PI / 180;
    const direction = up.clone().multiplyScalar(-Math.cos(a)).addScaledVector(out, Math.sin(a)).addScaledVector(forward, -.1).normalize();
    const candidate = knee.clone().addScaledVector(direction, shinLength);
    if (clears(candidate)) foot = candidate;
  }
  if (!foot) foot = knee.clone().addScaledVector(up.clone().negate().addScaledVector(out, 1.2).normalize(), shinLength);
  aimBone(limb.thigh, limb.shin, knee);
  aimBone(limb.shin, limb.foot, foot);
  return true;
}

function moveWeapons(rightHand, leftHand) {
  const attachments = [];
  if (!rightHand || !leftHand) return attachments;
  const candidates = [];
  rightHand.traverse(node => {
    if (node === rightHand || node.isBone || node.isSkinnedMesh) return;
    // The weapon pack's roots (weapons/playerWeaponRuntime.js) stay in the hand that grips them.
    for (let parent = node; parent && parent !== rightHand; parent = parent.parent) if (/^WeaponPack_/.test(parent.name)) return;
    if (node.userData?.isWeapon || node.userData?.weapon || /weapon|sword|saber|blade|bow|rifle|staff|spear|axe/i.test(node.name)) candidates.push(node);
  });
  for (const object of candidates) {
    if (candidates.some(other => other !== object && other.getObjectById(object.id))) continue;
    attachments.push({ object, visible: object.visible, parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
    leftHand.add(object); // Preserve its authored grip-local transform.
  }
  return attachments;
}

// Riding with a drawn weapon (owner request 2026-11-18): the reins hand rests on the mount's back, and the
// other hand carries the weapon out at its side, pointing where these say (body frame: forward, up, out
// to that hand's side). With daggers the reins hand grips its own dagger too, the blade running back down
// along the forearm. Attacking lifts the weapon hand.
export const RIDING_WEAPON_AIMS = Object.freeze({
  sword: Object.freeze({ carry: [0.78, -0.22, 0.32], attack: [0.55, 0.62, 0.2] }),
  bow: Object.freeze({ carry: [0.24, 0.93, 0.12], attack: [0.3, 0.9, 0.1] }),
  dual_blades: Object.freeze({ carry: [0.7, -0.45, 0.28], attack: [0.6, 0.55, 0.2], reins: [-0.35, -0.86, 0.12] }),
});
const MAX_WRIST_TURN = 100 * Math.PI / 180;

/**
 * Keep player.position as the gameplay ground position. The hips, limbs and
 * wrist attachments form the visual riding pose; call update AFTER animation.
 * hold (optional): { family, reins: 'Right' | 'Left', weapons: [{ side: 'Right' | 'Left', root }] } for a
 * drawn weapon pack weapon; without it both hands rest on the mount.
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
  let seatLift = 0; // metres: raises the hips so the seated body rests on the back (measureSeatLift)
  const status = { supported: true, halfWidth: saddle.halfWidth, weaponAttached: attachments.length > 0, leftHand: limbs.Left.hand, rightHand: limbs.Right.hand, seat: new THREE.Vector3(), rightGrip: new THREE.Vector3() };

  // Turn the hand (at most MAX_WRIST_TURN) so the weapon held in it points along `aim` (world).
  function aimWeapon(hand, root, aim) {
    if (!root?.parent || aim.lengthSq() < EPS) return;
    const current = new THREE.Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    if (current.lengthSq() < EPS) return;
    const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), aim.clone().normalize());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
    if (angle > MAX_WRIST_TURN) turn.slerp(new THREE.Quaternion(), 1 - MAX_WRIST_TURN / angle);
    setWorldQuaternion(hand, turn.multiply(hand.getWorldQuaternion(new THREE.Quaternion())));
    hand.updateWorldMatrix(false, true);
  }

  function update({ weaponHand = false, hold = null } = {}) {
    if (restored) return false;
    for (const saved of attachments) saved.object.visible = weaponHand && saved.visible;
    applyTransforms(rest);
    player.updateWorldMatrix(true, true); mount.updateWorldMatrix(true, true);
    const seat = saddle.anchor.localToWorld(saddle.offset.clone());
    seat.y += seatLift;
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
      const straddled = straddleLeg(limb, { seat, out: left.clone().multiplyScalar(sign), up, forward,
        flank: saddle.flank, clearance: LEG_CLEARANCE });
      if (!straddled) {
        const footTarget = seat.clone().addScaledVector(left, sign * spread).addScaledVector(up, -legLength * .70).addScaledVector(forward, legLength * .12);
        const kneePole = seat.clone().addScaledVector(left, sign * (spread + .6)).addScaledVector(forward, .7);
        solveMountedLimb(limb.thigh, limb.shin, limb.foot, footTarget, kneePole);
      }
      // Feet keep their authored upright orientation instead of inheriting the
      // shin's IK twist, which otherwise points toes through the mount.
      const bind = rest.get(limb.foot)?.modelMatrix;
      if (bind) {
        const orientation = new THREE.Quaternion(); bind.decompose(new THREE.Vector3(), orientation, new THREE.Vector3());
        setWorldQuaternion(limb.foot, yaw.clone().multiply(orientation));
      }
    }
    const rightGrip = saddle.anchor.localToWorld(saddle.gripOffset.clone());
    const weaponSides = new Set((hold?.weapons || []).map(w => w.side));
    const reins = hold && weaponSides.size ? (hold.reins === 'Left' ? 'Left' : 'Right') : null;
    const free = reins ? (reins === 'Left' ? 'Right' : 'Left') : null;
    const sideOf = side => (side === 'Left' ? left.clone() : left.clone().negate());
    const targets = {};
    if (!reins) {
      // The left hand rests beside the right on the mount, and lifts clear
      // only while a weapon is being used.
      targets.Right = rightGrip;
      targets.Left = weaponHand
        ? seat.clone().addScaledVector(left, .26).addScaledVector(forward, .16).addScaledVector(up, .26)
        : rightGrip.clone().addScaledVector(left, .08);
    } else {
      // the reins held just above the withers on the reins hand's own side (the measured grip, mirrored for
      // the left hand), a little in towards the middle
      const lateral = rightGrip.clone().sub(seat).dot(left);
      const sideGrip = reins === 'Right' ? rightGrip.clone() : rightGrip.clone().addScaledVector(left, -2 * lateral);
      targets[reins] = sideGrip.addScaledVector(sideOf(reins), -.04).addScaledVector(up, .09);
      status.reinsGrip = targets[reins].clone();
      // the weapon carried out at the free hand's side, raised while attacking
      const out = sideOf(free);
      targets[free] = weaponHand
        ? seat.clone().addScaledVector(out, .3).addScaledVector(forward, .24).addScaledVector(up, .42)
        : seat.clone().addScaledVector(out, saddle.halfWidth * .5 + .32).addScaledVector(forward, .12).addScaledVector(up, .04);
    }
    for (const side of ['Right', 'Left']) {
      const target = targets[side];
      const limb = limbs[side], sign = side === 'Left' ? 1 : -1;
      const elbowPole = side === free
        ? seat.clone().addScaledVector(left, sign * .7).addScaledVector(forward, -.35).addScaledVector(up, .2)
        : seat.clone().addScaledVector(left, sign * .8).addScaledVector(up, .35);
      solveMountedLimb(limb.arm, limb.forearm, limb.hand, target, elbowPole);
      // Curl fingers from their own bind transforms; do not rotate the fused
      // mesh or overwrite face morph targets when closing the grip.
      limb.hand.traverse(bone => {
        if (!bone.isBone || !/hand(?:index|middle|ring|pinky)[123]$/.test(key(bone.name))) return;
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .65));
      });
    }
    if (reins) {
      player.updateWorldMatrix(true, true);
      const aims = RIDING_WEAPON_AIMS[hold.family] || RIDING_WEAPON_AIMS.sword;
      for (const weapon of hold.weapons) {
        const spec = weapon.side === reins ? aims.reins : weaponHand ? aims.attack : aims.carry;
        if (!spec) continue;
        const aim = forward.clone().multiplyScalar(spec[0]).addScaledVector(up, spec[1]).addScaledVector(sideOf(weapon.side), spec[2]);
        aimWeapon(limbs[weapon.side].hand, weapon.root, aim);
      }
    }
    status.reins = reins; status.free = free;
    player.updateWorldMatrix(true, true);
    status.seat.copy(seat); status.rightGrip.copy(rightGrip);
    return true;
  }

  // The hips bone sits well above the underside of a seated body: measure how deep the posed rider goes
  // under the mount's back around the seat (both in the mount's own frame) and lift the seat by that much.
  function measureSeatLift() {
    player.updateWorldMatrix(true, true); mount.updateWorldMatrix(true, true);
    const inverse = mount.matrixWorld.clone().invert();
    const scale = mount.getWorldScale(new THREE.Vector3());
    const sx = Math.abs(scale.x) || 1, sy = Math.abs(scale.y) || 1, sz = Math.abs(scale.z) || 1;
    const seatLocal = mount.worldToLocal(status.seat.clone());
    const back = (saddle.points || []).filter(p => Math.abs(p.x - seatLocal.x) * sx < .22 && Math.abs(p.z - seatLocal.z) * sz < .24);
    if (!back.length) return 0;
    let deepest = 0;
    const v = new THREE.Vector3();
    player.traverse(node => {
      const attribute = node.geometry?.attributes?.position;
      if (!node.isSkinnedMesh || !attribute || node.visible === false) return;
      node.skeleton?.update();
      const stride = Math.max(1, Math.ceil(attribute.count / 16000));
      for (let i = 0; i < attribute.count; i += stride) {
        node.getVertexPosition(i, v);
        v.applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
        if (Math.abs(v.x - seatLocal.x) * sx > .16 || Math.abs(v.z - seatLocal.z) * sz > .18) continue;
        let top = -Infinity;
        for (const p of back) if (Math.abs(p.x - v.x) * sx < .03 && Math.abs(p.z - v.z) * sz < .03 && p.y > top) top = p.y;
        if (Number.isFinite(top)) deepest = Math.max(deepest, (top - v.y) * sy);
      }
    });
    return Math.min(MAX_SEAT_LIFT, Math.max(0, deepest - SEAT_COMPRESSION));
  }
  // seat the rider once to measure, then keep that lift for this mount
  if (update({})) {
    seatLift = measureSeatLift();
    status.seatLift = seatLift;
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
  return { supported: true, update, restore, getStatus: () => ({ ...status, seat: status.seat.clone(), rightGrip: status.rightGrip.clone() }), limbs };
}