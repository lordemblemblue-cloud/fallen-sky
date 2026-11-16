import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { reconcileNetworkPosition } from '../network/remote/positionCorrection';
import { bakeRemoteComboClips, createRemoteComboWeapon, remoteComboKind } from './weapons/remoteWeaponCombos.js';

/**
 * RemotePlayersManager — renders other players in the shared game world.
 *
 * Listens to `multiplayerPlayersUpdate` (broadcast by MultiplayerSystem) and
 * `webrtcMovementUpdate` (real-time positions), and renders a simple
 * archer-model avatar for each remote player in the scene.
 *
 * Exposes refs via the `register` prop so GameWorld3D's raycaster can detect
 * clicks on remote-player meshes for the interaction menu.
 *
 * Weapon combos: when a player's `anim` is a combo state (swordCombo1..3 /
 * bowCombo1..3), their avatar plays that swing, baked on the avatar's own
 * skeleton, with a stand-in weapon of that family in hand
 * (weapons/remoteWeaponCombos.js). Presentation only.
 */

const REMOTE_ARCHER_URL =
  'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/3f915913a_ErikaArcher.fbx';
const IDLE_URL =
  'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/9922e6dd0_Idle.fbx';
const RUN_URL =
  'https://base44.app/api/apps/6876751a602125f45f1861b9/files/public/6876751a602125f45f1861b9/4edd51169_Running.fbx';

// Cache shared assets across all remote-player instances
let cachedArcherFBX = null;
let cachedIdleClip = null;
let cachedRunClip = null;
const loader = new FBXLoader();

const loadOnce = (url, isAnim = false) =>
  new Promise((resolve, reject) => {
    loader.load(url, (fbx) => resolve(isAnim ? fbx.animations?.[0] : fbx), undefined, reject);
  });

const loadArcherAssets = () => Promise.all([
  cachedArcherFBX ? Promise.resolve(cachedArcherFBX) : loadOnce(REMOTE_ARCHER_URL).then((f) => (cachedArcherFBX = f)),
  cachedIdleClip ? Promise.resolve(cachedIdleClip) : loadOnce(IDLE_URL, true).then((c) => (cachedIdleClip = c)),
  cachedRunClip ? Promise.resolve(cachedRunClip) : loadOnce(RUN_URL, true).then((c) => (cachedRunClip = c)),
]).then(([model, idleClip, runClip]) => ({ model, idleClip, runClip }));

const BASE_FADE_SECONDS = 0.2; // idle <-> run, and back from a swing
const COMBO_FADE_SECONDS = 0.06; // into a swing: the local player controller's own combo fade
// Live packets travel on an unordered data channel; one older than the newest applied is dropped. A gap
// this large is not reordering (a sender's clock was set back): accept it rather than freeze the avatar.
const LIVE_REORDER_WINDOW_MS = 2000;

/**
 * options.loadAssets: () => Promise<{ model, idleClip, runClip }> (default: the archer FBX and its clips).
 * The model must not have been posed by a mixer: the combo clips are baked from its rest pose.
 * options.comboWeapons: false for no stand-in weapon, or options for createRemoteComboWeapon.
 */
// Clone's original optimized weapon GLBs are not in its repository yet.
 // Disable missing stand-in downloads by default, while keeping the remote
 // skeleton's actual combo clips active. Passing explicit comboWeapons opts in.
export function createRemotePlayersManager(scene, { loadAssets = loadArcherAssets, comboWeapons = false } = {}) {
  const remotes = new Map(); // playerId -> { group, mixer, idleAction, runAction, current, comboClips, comboAction, comboWeapon, liveStamp, targetPos, targetYaw, lastUpdate, name }
  // Network presentation can be temporarily reverted per browser without touching combat.
  const smoothingEnabled = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('g3netsmooth') !== '0';
  const yawAxis = new THREE.Vector3(0, 1, 0);
  const yawQuat = new THREE.Quaternion();

  let assets = null;
  let assetsReady = false;
  let disposed = false;
  const pending = [];

  Promise.resolve()
    .then(() => loadAssets())
    .then((loaded) => {
      if (disposed) return;
      // Right after the avatar loads, before any mixer poses it: both combos from its rest pose.
      assets = { ...loaded, comboClips: bakeRemoteComboClips(loaded.model) };
      assetsReady = true;
      pending.forEach((fn) => fn());
      pending.length = 0;
    })
    .catch((e) => console.error('Remote-player asset load error:', e));

  const spawnRemote = (player) => {
    if (!assetsReady) {
      pending.push(() => spawnRemote(player));
      return;
    }
    if (remotes.has(player.player_id)) return;

    // Deep-clone the cached FBX using SkeletonUtils — required for SkinnedMesh
    // models so the skeleton/bones are also cloned (plain .clone(true) leaves
    // skinned meshes invisible because they still reference the original bones).
    const fbx = SkeletonUtils.clone(assets.model);
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.7 / maxDim;
    fbx.scale.setScalar(scale);
    fbx.position.set(player.x || 0, player.y || 0.3, player.z || 0);
    fbx.rotation.y = player.yaw || 0;

    // Render remote players in their natural colors; only the ring below
    // their feet identifies them as remote players.
    fbx.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = !node.isSkinnedMesh;
        node.receiveShadow = true;
        node.userData.remotePlayerId = player.player_id;
        node.userData.remotePlayerName = player.display_name || 'Player';
      }
    });

    // Friendly blue ring under remote players
    const ringGeo = new THREE.RingGeometry(0.7 / scale, 0.9 / scale, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02 / scale;
    fbx.add(ring);

    scene.add(fbx);

    const mixer = new THREE.AnimationMixer(fbx);
    const idleAction = mixer.clipAction(assets.idleClip);
    const runAction = mixer.clipAction(assets.runClip);
    idleAction.play();

    const comboClips = assets.comboClips || {};
    remotes.set(player.player_id, {
      group: fbx,
      mixer,
      idleAction,
      runAction,
      current: 'idle', // 'idle' | 'run' | the combo state playing
      comboClips,
      comboAction: null,
      comboWeapon: comboWeapons && Object.keys(comboClips).length
        ? createRemoteComboWeapon({ ...comboWeapons, model: fbx, scene }) : null,
      liveStamp: -Infinity,
      targetPos: new THREE.Vector3(player.x || 0, player.y || 0.3, player.z || 0),
      targetYaw: player.yaw || 0,
      lastUpdate: Date.now(),
      name: player.display_name || 'Player',
    });
  };

  const removeRemote = (playerId) => {
    const r = remotes.get(playerId);
    if (!r) return;
    scene.remove(r.group);
    r.mixer.stopAllAction();
    r.comboWeapon?.dispose();
    remotes.delete(playerId);
  };

  const actionOf = (r, state) => (state === 'run' ? r.runAction : state === 'idle' ? r.idleAction : r.comboAction);
  // false once it has finished (held on its last frame) or was stopped (a rider pose stops every action)
  const swingPlaying = (r) => !!r.comboAction?.isRunning();

  // idle / run from `anim` as before; a combo state plays that swing once and holds its last (ready) pose
  // until the next state arrives. live: from the real-time packet. An `anim` older than the newest live
  // packet (a late packet, or a presence row written before it) is ignored. The presence list also brings
  // rows from before a player's live packets start, so it never starts a swing nor cuts one still playing.
  const setAnim = (r, anim, live, stamp) => {
    if (Number.isFinite(stamp)) {
      if (stamp < r.liveStamp && r.liveStamp - stamp < LIVE_REORDER_WINDOW_MS) return;
      if (live) r.liveStamp = stamp;
    }
    const comboClip = remoteComboKind(anim) ? r.comboClips[anim] || null : null;
    const target = comboClip ? anim : anim === 'run' || anim === 'walk' ? 'run' : 'idle';
    if (r.current === target) return;
    if (!live && (comboClip || swingPlaying(r))) return;
    const prev = actionOf(r, r.current);
    let next = target === 'run' ? r.runAction : r.idleAction;
    if (comboClip) {
      next = r.mixer.clipAction(comboClip);
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    const fade = comboClip ? COMBO_FADE_SECONDS : BASE_FADE_SECONDS;
    next.reset().fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    r.current = target;
    r.comboAction = comboClip ? next : null;
    if (comboClip) r.comboWeapon?.swing(target, next);
    else r.comboWeapon?.settle();
  };

  const updateRemote = (player, live = false) => {
    const r = remotes.get(player.player_id);
    if (!r) {
      spawnRemote(player);
      return;
    }
    if (typeof player.x === 'number') r.targetPos.x = player.x;
    if (typeof player.y === 'number') r.targetPos.y = player.y;
    if (typeof player.z === 'number') r.targetPos.z = player.z;
    if (typeof player.yaw === 'number') r.targetYaw = player.yaw;
    r.lastUpdate = Date.now();
    if (player.display_name) r.name = player.display_name;

    // Switch idle / run / weapon combo based on the `anim` field
    setAnim(r, player.anim, live, Number(player.last_update));
  };

  // Render-only smoothing: network targets, local movement and combat are unchanged.
  // With g3netsmooth=0, restore the legacy frame-rate-dependent lerp instantly.
  const update = (delta) => {
    remotes.forEach((r) => {
      r.mixer.update(delta);
      if (smoothingEnabled) {
        const source = [r.group.position.x, r.group.position.y, r.group.position.z];
        const target = [r.targetPos.x, r.targetPos.y, r.targetPos.z];
        const correction = reconcileNetworkPosition(source, target, delta);
        r.group.position.set(...correction.pos);
      } else {
        r.group.position.lerp(r.targetPos, 0.5);
      }
      yawQuat.setFromAxisAngle(yawAxis, r.targetYaw);
      r.group.quaternion.slerp(yawQuat, smoothingEnabled
        ? 1 - Math.exp(-20 * Math.max(0, Math.min(Number(delta) || 0, 0.1)))
        : 0.4);
      // after the pose and the placement: the stand-in's grip, the closed hand, a bow's string and arrows
      r.comboWeapon?.update(delta);
    });
  };

  // Returns all meshes that belong to remote players (for raycasting)
  const getMeshes = () => {
    const out = [];
    remotes.forEach((r) => r.group.traverse((n) => { if (n.isMesh) out.push(n); }));
    return out;
  };

  const getRemotes = () => remotes;

  // Event listeners
  const onPlayersUpdate = (e) => {
    const players = e.detail?.players || [];
    const seen = new Set();
    players.forEach((p) => {
      seen.add(p.player_id);
      updateRemote(p);
    });
    // Despawn anyone not in the latest update
    remotes.forEach((_, id) => { if (!seen.has(id)) removeRemote(id); });
  };
  const onMovement = (e) => { if (e.detail) updateRemote(e.detail, true); };

  window.addEventListener('multiplayerPlayersUpdate', onPlayersUpdate);
  window.addEventListener('webrtcMovementUpdate', onMovement);

  const dispose = () => {
    disposed = true;
    pending.length = 0;
    window.removeEventListener('multiplayerPlayersUpdate', onPlayersUpdate);
    window.removeEventListener('webrtcMovementUpdate', onMovement);
    remotes.forEach((_, id) => removeRemote(id));
  };

  return { update, getMeshes, getRemotes, dispose };
}