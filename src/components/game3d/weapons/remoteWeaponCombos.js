// Other players' 3-hit weapon combos, as their avatars show them. Presentation only.
//
// The movement packets' `anim` field already names the swing: GameWorld3D's multiplayerLocalUpdate sends
// the player controller's state, swordCombo1..3 / bowCombo1..3 while a combo plays. This module bakes the
// same combo clips on the remote avatar's own skeleton (RemotePlayersManager plays them) and puts a
// stand-in weapon of that family in the avatar's hand while it swings.
// The packets carry no item id, so the stand-in is the family's pack model: a sword for every swordCombo
// (the odachi and the daggers included) and a bow for every bowCombo.
// No damage, hit, cooldown, network or combat state lives here.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPON_COMBO_STATES, captureRestPose } from './weaponComboClips.js';
import { createWeaponComboBinder } from './weaponComboBinder.js';
import { createPlayerWeaponRuntime } from './playerWeaponRuntime.js';

export const REMOTE_COMBO_STAND_INS = Object.freeze({ swordCombo: 'fantasy_sword', bowCombo: 'fantasy_bow' });
// The stand-in stays this long after the last swing, so a chain (hit, short pause, next hit) keeps it.
export const REMOTE_COMBO_WEAPON_HOLD_SECONDS = 1.2;

const KIND_OF_STATE = new Map(Object.entries(WEAPON_COMBO_STATES).flatMap(([kind, states]) => states.map((s) => [s, kind])));
// 'swordCombo2' -> 'swordCombo'; anything that is not a combo state -> null
export const remoteComboKind = (anim) => KIND_OF_STATE.get(anim) || null;

const bakedByModel = new WeakMap();

/**
 * Both combos (swordCombo1..3 and bowCombo1..3) baked on a loaded avatar model with the default grips, the
 * same bake the local player's binder makes at load. Call it right after the model loads, before any mixer
 * has posed it: its rest pose is captured then (captureRestPose) and the clips are solved from it, never from
 * the inverse bind matrices (on the fused bodies those face -X). The clips bind by bone name, so every
 * SkeletonUtils clone of the model plays them; the result is kept per model. {} for a rig without the bones.
 */
export function bakeRemoteComboClips(model, { rest = null, bodyHeight = 1.7 } = {}) {
  if (!model) return {};
  if (!bakedByModel.has(model)) {
    const clips = {};
    try {
      createWeaponComboBinder({ model, rest: rest || captureRestPose(model), bodyHeight,
        controller: { setWeaponComboClips: (baked) => { Object.assign(clips, baked); return true; } } });
    } catch (err) {
      console.warn('[remote combos] bake failed', err);
    }
    bakedByModel.set(model, Object.freeze(clips));
  }
  return bakedByModel.get(model);
}

// Every remote's runtime clones the scene it is handed, so one parse per weapon file serves them all.
const weaponFiles = new Map();
export const remoteWeaponLoader = {
  loadAsync(url) {
    if (!weaponFiles.has(url)) {
      weaponFiles.set(url, new GLTFLoader().loadAsync(url).catch((err) => { weaponFiles.delete(url); throw err; }));
    }
    return weaponFiles.get(url);
  },
};

/**
 * The stand-in weapon of one remote avatar. swing(state, action) when a combo state starts on the avatar's
 * mixer, settle() when it leaves the combo states, update(delta) every frame after the mixer has posed it.
 * The weapon runtime is made at the first swing; a bow nocks while it draws and looses an arrow straight
 * ahead at the release (the packets do not say at what).
 */
export function createRemoteComboWeapon({ model, scene = null, manifest = null, loader = remoteWeaponLoader,
  createRuntime = createPlayerWeaponRuntime, holdSeconds = REMOTE_COMBO_WEAPON_HOLD_SECONDS } = {}) {
  let runtime = null;
  let shown = null; // the combo kind whose stand-in is in the hand (or loading)
  let swing = null; // { state, kind, action, hit, fired }
  let since = 0; // seconds since the last swing ended
  return {
    swing(state, action) {
      const clipKind = remoteComboKind(state);
      // the player's own shots (bowRelease / bowQuick) show the same stand-in bow as the bow combo
      const kind = clipKind?.startsWith('sword') ? 'swordCombo' : clipKind?.startsWith('bow') ? 'bowCombo' : clipKind;
      if (!kind || !action) { swing = null; return; }
      swing = { state, kind, action, hit: action.getClip().userData?.hit ?? null, fired: false };
      since = 0;
      if (shown === kind) return;
      shown = kind;
      runtime ||= createRuntime({ model, scene, manifest, loader, onError: () => {} });
      // formed straight into the combat grip; it relaxes to the carry grip after the swing
      runtime.equip(REMOTE_COMBO_STAND_INS[kind])
        .then((ok) => { if (ok && shown === kind && swing) runtime?.setStanceWeight(1); }, () => {});
    },
    settle() { swing = null; },
    update(delta) {
      if (!runtime) return;
      let drawing = null;
      if (swing?.kind === 'bowCombo' && swing.hit !== null) drawing = swing.action.time > 0.04 && swing.action.time < swing.hit;
      if (!swing && shown && (since += delta) >= holdSeconds) {
        runtime.unequip();
        shown = null;
      }
      runtime.update(delta, { state: swing?.state ?? null, drawing });
      if (swing?.kind === 'bowCombo' && swing.hit !== null && !swing.fired && swing.action.time >= swing.hit) {
        swing.fired = true;
        if (model?.visible !== false) runtime.fireArrow(); // a hidden avatar (legacy remotes switched off) looses none
      }
    },
    getWeapon: () => runtime?.getCurrent() || null,
    dispose() {
      runtime?.dispose();
      runtime = null;
      shown = null;
      swing = null;
    },
  };
}
