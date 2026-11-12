import * as THREE from 'three';
import { ECHO_GESTURE_IDS, GESTURE_CUE_LABELS } from './echoGestureEvents.js';

// Runtime rendering only. Gesture authority comes from the server's accepted
// transcript; it is not a client-claimed combat action or a gameplay animation.
// Bone offsets are temporary and restored BEFORE regular animation mixers run,
// so ordinary locomotion, attacks and dodge animations remain in control.
const IDS = new Set(ECHO_GESTURE_IDS);
const DURATION_MS = 2100;

const findBone = (root, predicate) => {
  let found = null;
  root.traverse((node) => {
    if (!node.isBone || found) return;
    const name = String(node.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (predicate(name)) found = node;
  });
  return found;
};
const isRightArm = (n) => /right(upper)?arm/.test(n) && !/forearm|lowerarm|hand/.test(n) ||
  /upperarmr$|armr$/.test(n);
const isRightForearm = (n) => /right(forearm|lowerarm)/.test(n) || /forearmr$|lowerarmr$/.test(n);
const identifyRig = (root) => ({
  head: findBone(root, (n) => /head$/.test(n)),
  spine: findBone(root, (n) => /spine2$|spine1$|chest$|upperchest$/.test(n)) ||
    findBone(root, (n) => /spine/.test(n)),
  rightArm: findBone(root, isRightArm),
  rightForearm: findBone(root, isRightForearm),
});

function makeCue(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgba(6, 18, 30, 0.87)';
  ctx.fillRect(4, 5, 376, 80);
  ctx.strokeStyle = 'rgba(136, 200, 233, 0.82)';
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 6, 374, 78);
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8f7ff';
  ctx.fillText(text, 192, 45, 320);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 0.42, 1);
  sprite.renderOrder = 99;
  return sprite;
}

export function createEchoGestureRuntime({ scene, getLocalModel, getRemoteModel }) {
  const active = new Map();
  const priorBoneRotations = new Map();
  const worldPosition = new THREE.Vector3();

  const remove = (speakerId) => {
    const state = active.get(speakerId);
    if (!state) return;
    if (state.cue) {
      scene.remove(state.cue);
      state.cue.material.map?.dispose?.();
      state.cue.material.dispose();
    }
    active.delete(speakerId);
  };
  const getActor = (state) => state.isLocal
    ? getLocalModel?.()
    : getRemoteModel?.(state.speakerId);

  // Called at the beginning of a frame, before mixers apply locomotion.
  const preUpdate = () => {
    for (const [bone, q] of priorBoneRotations) {
      bone.quaternion.copy(q);
    }
    priorBoneRotations.clear();
  };

  const play = ({ speakerId, isLocal, gestureId, at } = {}) => {
    if (!speakerId || !IDS.has(gestureId)) return false;
    const time = Date.parse(at || '');
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 7000) return false;
    remove(speakerId);
    const cue = makeCue(GESTURE_CUE_LABELS[gestureId]);
    if (cue) scene.add(cue);
    active.set(speakerId, {
      speakerId, isLocal: !!isLocal, gestureId,
      at: Date.now(), duration: DURATION_MS, cue, rig: null, lastActor: null,
    });
    return true;
  };

  const update = () => {
    const now = Date.now();
    for (const [speakerId, state] of active) {
      const age = now - state.at;
      if (age >= state.duration) { remove(speakerId); continue; }
      const actor = getActor(state);
      // A not-yet-loaded remote may appear while this short reaction is active.
      if (!actor || !actor.visible) {
        if (state.cue) state.cue.visible = false;
        continue;
      }
      if (state.cue) {
        actor.getWorldPosition(worldPosition);
        state.cue.visible = true;
        state.cue.position.set(worldPosition.x, worldPosition.y + 2.35, worldPosition.z);
        state.cue.material.opacity = Math.max(0, Math.min(1, (state.duration - age) / 320));
      }
      if (state.lastActor !== actor) {
        state.rig = identifyRig(actor);
        state.lastActor = actor;
      }
      const blend = Math.min(1, age / 250, (state.duration - age) / 330);
      const beat = Math.sin(age / 190);
      const pose = (bone, axis, amount) => {
        if (!bone) return;
        if (!priorBoneRotations.has(bone)) priorBoneRotations.set(bone, bone.quaternion.clone());
        bone.rotation[axis] += amount * Math.max(0, blend);
      };
      const { head, spine, rightArm, rightForearm } = state.rig;
      switch (state.gestureId) {
        case 'nod':
          pose(head, 'x', 0.18 + 0.08 * beat); break;
        case 'bow':
          pose(spine, 'x', 0.25);
          pose(head, 'x', 0.12); break;
        case 'thanks':
          pose(head, 'x', 0.10);
          pose(rightArm, 'x', -0.28);
          pose(rightArm, 'z', -0.36); break;
        case 'wave':
        case 'farewell':
          pose(rightArm, 'z', -0.75);
          pose(rightArm, 'x', 0.26);
          pose(rightForearm, 'x', -0.35 + 0.2 * beat);
          break;
        default: break;
      }
    }
  };

  const dispose = () => {
    preUpdate();
    for (const id of [...active.keys()]) remove(id);
  };

  return { play, preUpdate, update, dispose };
}
