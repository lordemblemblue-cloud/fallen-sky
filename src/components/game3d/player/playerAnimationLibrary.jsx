import {retargetAvatarClip} from '@/components/onboarding/retargetAvatarClip';
import { base44 } from '@/api/base44Client';
import {createPlayerMovementFallbackClips} from './playerMovementFallbackClips';
import {nativePlayerAnimationClips} from './playerNativeAnimationClips';
import { withUprightStanding } from './uprightStandingClip.js';
import {resolvePlayerAnimationKey, uploadedPlayerAction} from './playerAnimationActions.mjs';
import {loadUploadedAnimationMontage} from './uploadedAnimationMontage.mjs';

const norm = (value = '') => value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const initialFallbackClips = new WeakMap();

const REQUESTED_ANIMATION_KEYS = [
  { key: 'idle', names: ['unarmed idle 01', 'unarmed idle zero one'] },
  { key: 'run', names: ['run forward', 'running forward', 'standing running'] },
  { key: 'runStop', names: ['standing run stop', 'standing run'] },
  { key: 'runBack', names: ['running backward', 'running backwards', 'standing run back'] },
  { key: 'drawArrow', names: ['standing draw arrow'] },
  // Optional admin-uploaded melee clip; ranged/legacy avatars remain compatible.
  { key: 'meleeAttack', names: ['standing melee attack', 'standing unarmed punch', 'standing punch', 'standing kick', 'unarmed attack', 'standing sword slash'] },
  // Optional stage-specific combat clips in the existing admin AnimationFBX folder.
  { key: 'meleeCombo2', names: ['standing melee combo 2', 'standing sword slash 2', 'standing melee attack 2'] },
  { key: 'meleeCombo3', names: ['standing melee combo 3', 'standing sword slash 3', 'standing melee attack 3'] },
  { key: 'heavyAttack', names: ['standing heavy attack', 'standing sword heavy strike', 'standing overhead strike'] },
  { key: 'hitReact', names: ['standing hit reaction', 'standing hit react', 'standing stagger', 'standing damage reaction'] },
  { key: 'dodgeRight', names: ['standing dodge right'] },
  { key: 'dodgeLeft', names: ['standing dodge left'] },
  { key: 'dodgeForward', names: ['standing dodge forward'] },
  { key: 'dodgeBackward', names: ['standing dodge backward'] },
  // Optional artist-made FBX overrides for each of the eight authored
  // rig-local procedural moves. All eight animate even without uploads.
  { key: 'dodgeRollForward', names: ['dodge roll forward','standing dodge roll forward'] },
  { key: 'dodgeRollForwardLeft', names: ['dodge roll forward left','standing dodge roll forward left'] },
  { key: 'dodgeRollForwardRight', names: ['dodge roll forward right','standing dodge roll forward right'] },
  { key: 'dodgeStepLeft', names: ['dodge side step left','dodge step left'] },
  { key: 'dodgeStepRight', names: ['dodge side step right','dodge step right'] },
  { key: 'dodgeRollBackwardLeft', names: ['dodge roll backward left','standing dodge roll backward left'] },
  { key: 'dodgeRollBackward', names: ['dodge roll backward','standing dodge roll backward'] },
  { key: 'dodgeRollBackwardRight', names: ['dodge roll backward right','standing dodge roll backward right'] },
  { key: 'dodgeRollLeft', names: ['dodge roll left','standing dodge roll left'] },
  { key: 'dodgeRollRight', names: ['dodge roll right','standing dodge roll right'] },
  { key: 'diveForward', names: ['standing dive forward'] },
  { key: 'roll', names: ['front roll','forward roll','standing forward roll','standing roll forward','rolling forward','front roll animation'] },
  { key: 'jumpStart', names: ['jump start','standing jump start','standing jump','jump takeoff','jump take off'] },
  { key: 'jumpLoop', names: ['jump loop','standing jump loop','jump midair','jump airborne'] },
  { key: 'jumpLand', names: ['jump land','jump landing','standing jump land','landing from jump'] },
  { key: 'aimWalkRight', names: ['standing aim walk right'] },
  { key: 'aimWalkLeft', names: ['standing aim walk left'] },
  { key: 'aimWalkForward', names: ['standing aim walk forward'] },
  { key: 'aimWalkBackward', names: ['standing aim backwards', 'standing aim walk backward'] },
];

const pickRequestedKey = (name = '') => {
  const uploadedKey = resolvePlayerAnimationKey(name);
  if(uploadedPlayerAction(uploadedKey))return uploadedKey;
  const normalizedName = norm(name);
  const match = REQUESTED_ANIMATION_KEYS.find(({ names }) => names.some((candidate) => normalizedName === norm(candidate)));
  return match?.key || null;
};

const makeRunClipInPlace = (key, clip) => {
  // Dodge travel is swept by GameWorld3D, NEVER by FBX root translation.
  // Newly uploaded dodge mocap is made in-place like run clips to avoid
  // teleporting through terrain, bridges or cave walls.
  if (!['run','runBack'].includes(key) && !/^dodge(?:Roll|Step)/.test(key)) return clip;

  const inPlaceClip = clip.clone();
  inPlaceClip.tracks = inPlaceClip.tracks.filter((track) => {
    const trackName = track.name.toLowerCase();
    const isRootPosition = trackName.endsWith('.position') && /(hips|pelvis|root|armature)/i.test(track.name);
    return !isRootPosition;
  });
  inPlaceClip.resetDuration();
  return inPlaceClip;
};

// The loaded GLB is sufficient to animate immediately. Optional account FBXs
// can arrive later without leaving the character frozen during network calls.
export function initialPlayerAnimationClips(target) {
  // Fallbacks are authored relative to the imported rig pose. Reuse that first
  // capture when uploads finish after locomotion or a seated rider pose has
  // already changed the bones; never bake the current pose into new clips.
  let fallback = target && initialFallbackClips.get(target);
  if (!fallback) {
    fallback = createPlayerMovementFallbackClips(target);
    if (target) initialFallbackClips.set(target, fallback);
  }
  const clipsByKey = { ...fallback, ...withUprightStanding(target, nativePlayerAnimationClips(target)) };
  clipsByKey.diveForward ||= clipsByKey.roll;
  clipsByKey.run ||= clipsByKey.walk;
  return clipsByKey;
}

export async function loadPlayerAnimationClips(loader, target, { onMontageReady } = {}) {
  const initial = initialPlayerAnimationClips(target);
  const montagePromise = loadUploadedAnimationMontage(target).then(clips => {
    if(Object.keys(clips).length && typeof onMontageReady==='function')onMontageReady({ ...initial, ...clips });
    return clips;
  }).catch(error => {
    console.warn('Uploaded player animation montage could not be loaded:', error);
    return {};
  });
  const rows = await base44.entities.AnimationFBX.filter({ folder: 'player character' }, '-created_date', 100).catch(()=>[]);
  const clipsByKey = {}, sourceClips = {};

  // Select one record per action before concurrent loading. The old map wrote
  // whichever FBX finished first, which made multiple uploads nondeterministic.
  const chosen=new Map();
  for(const row of rows){
    const key=pickRequestedKey(row.name);
    if(key && row.file_url && !chosen.has(key))chosen.set(key,row);
  }
  const loadOne = (key,row) => new Promise((resolve) => {

    loader.load(
      row.file_url,
      (fbx) => {
        const clip = fbx.animations?.[0];
        try { if (clip) {
          sourceClips[key]=clip;
          // Fused bodies share Mixamo bone names with these FBXs but not their scale or rest pose.
          // Every Game 3D selection is a custom GLB skeleton. Retarget each
          // uploaded FBX to the actual actor; raw source tracks on a different
          // skeleton silently produced zero visible animation on v5 bodies.
          const retargeted=target?retargetAvatarClip(fbx,target,clip):clip;
          const finalClip=makeRunClipInPlace(key,retargeted);
          finalClip.name = key;
          clipsByKey[key] = finalClip;
        } } catch (error) {
          console.warn('Optional player animation could not be retargeted:', key, error);
        } finally { resolve(clip || null); }
      },
      undefined,
      () => resolve(null),
    );
  });

  await Promise.all([...chosen.entries()].map(([key,row])=>loadOne(key,row)));
  // Prefer the actor's native, correctly bound clips over generic FBX uploads
  // for its authored Idle/Walk/Run/dodges. The same rule applies to all four
  // bodies, not only fused v2. Extra motion clips may ship in future GLBs.
  Object.assign(clipsByKey,withUprightStanding(target, nativePlayerAnimationClips(target)));
  // These are the motions the owner explicitly supplied for this montage.
  // Native clips still start immediately; validated montage clips take over
  // only for characters enabled by the pack loader (Eve first).
  Object.assign(clipsByKey,await montagePromise);
  // Even without uploaded roll/jump FBX, every skinned character has a visible
  // reaction. These restrained rig-local placeholders can later be replaced by
  // approved mocap or Blender animations without changing the input system.
  const fallback=initialPlayerAnimationClips(target);
  for(const [key,clip] of Object.entries(fallback)){
    // Resolve the dive alias against the FINAL chosen roll, including uploads.
    if(key!=='diveForward')clipsByKey[key] ||=clip;
  }
  clipsByKey.diveForward ||=clipsByKey.roll;
  clipsByKey.run ||= clipsByKey.walk;
  return {clipsByKey,sourceClips};
}
