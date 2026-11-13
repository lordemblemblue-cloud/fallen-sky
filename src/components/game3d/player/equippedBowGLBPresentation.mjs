import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Only a reviewed local GLB can enter the gameplay weapon presentation. The
// equipment store and weapon identity remain authoritative; visuals grant no stats.
const LOCAL_BOW = /^\/game3d\/test-gear\/[a-z0-9-]+\.glb$/i;
const norm = name => String(name || '').toLowerCase().replace(/^mixamorig/, '').replace(/[^a-z0-9]/g, '');

function findHand(player) {
  const names = ['LeftHandSocket', 'LeftHand', 'hand_l', 'Bip01_L_Hand'].map(norm);
  const found = [];
  player?.traverse(node => { if (names.includes(norm(node.name))) found.push(node); });
  return names.map(name => found.find(node => norm(node.name) === name)).find(Boolean) || null;
}

function handAlreadyHasWeapon(hand) {
  let found = false;
  hand?.traverse(node => {
    if (found || node.isBone || node.isSkinnedMesh) return;
    for (let p = node; p && p !== hand; p = p.parent) {
      if (p.userData?.axeHeldBowGLB) return;
    }
    if (!node.userData?.isWeapon && !/weapon|sword|blade|bow|staff|rifle/i.test(node.name)) return;
    node.traverse(child => { if (child.isMesh && !child.isSkinnedMesh) found = true; });
  });
  return found;
}

function disposeRoot(root) {
  if (!root) return;
  root.removeFromParent();
  root.traverse(obj => {
    obj.geometry?.dispose?.();
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    materials.forEach(material => material.dispose?.());
  });
}

/**
 * Display the actual owned GLB training bow beside the left hand when drawn.
 * Safe for Adam/Eve rigs with or without a usable left-hand socket.
 * The GLB is not equipped by rendering it: switching and skill rules continue
 * through the canonical AXE inventory transaction and active weapon identity.
 */
export function createEquippedBowGLBPresentation({ player } = {}) {
  const hand = findHand(player);
  let root = null, activeId = null, request = 0, disposed = false;
  const clear = () => {
    request += 1;
    if (root) disposeRoot(root);
    root = null;
    activeId = null;
  };
  const update = ({ item, mounted = false } = {}) => {
    const url = item?.modelUrl;
    const eligible = !disposed && !mounted && hand && item?.equipped !== false
      && (item?.masteryWeaponId === 'bow' || /bow/i.test(item?.name || ''))
      && typeof url === 'string' && LOCAL_BOW.test(url);
    if (!eligible) {
      if (activeId || root) clear();
      return;
    }
    const id = item.instanceId || item.id;
    if (!id || handAlreadyHasWeapon(hand)) {
      if (activeId || root) clear();
      return;
    }
    if (id !== activeId) {
      clear();
      activeId = id;
      const token = ++request;
      new GLTFLoader().load(url, gltf => {
        const candidate = gltf.scene || gltf.scenes?.[0] || null;
        if (!candidate) { if (request === token) activeId = null; return; }
        if (disposed || request !== token || activeId !== id) {
          disposeRoot(candidate);
          return;
        }
        root = candidate;
        root.name = 'AXE_Equipped_Training_Bow';
        root.userData.axeHeldBowGLB = true;
        root.userData.isWeapon = true;
        root.matrixAutoUpdate = false;
        root.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
        hand.add(root);
      }, undefined, () => {
        // Keep weapon stats and skill availability unchanged if only art fails.
        if (request === token) activeId = null;
      });
    }
    if (!root) return;
    // World-aligned bow centred on the animated wrist; the inverse hand matrix
    // avoids rig-scale distortion while the character moves, turns or aims.
    player.updateWorldMatrix(true, true);
    const worldPosition = hand.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();
    const right = up.clone().cross(forward).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    );
    const matrix = new THREE.Matrix4().compose(worldPosition, rotation, new THREE.Vector3(1, 1, 1));
    if (Math.abs(hand.matrixWorld.determinant()) < 1e-12) return;
    root.matrix.copy(hand.matrixWorld).invert().multiply(matrix);
    root.matrixWorldNeedsUpdate = true;
  };
  return { supported: !!hand, update, dispose: () => { disposed = true; clear(); } };
}
