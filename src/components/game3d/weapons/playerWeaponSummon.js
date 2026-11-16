// Summon / dismiss flow for the weapon in hand (owner design 2026-11): weapons are never sheathed.
// Drawing a weapon (HUD role slot, quick switch, inventory) plays the summon: the arm comes out with the
// hand shaped around an empty grip and the weapon pours together in it out of liquid oil-metal. Space,
// or WEAPON_AUTO_DISMISS_SECONDS of moving around out of combat, melts it back into the hand.
// The equipment store stays authoritative: nothing here changes items, stats or combat.
import { createWeaponConstructFx, WEAPON_CONSTRUCT_SECONDS } from './weaponConstructFx.js';
import { createWeaponSummonGesture } from './weaponSummonGesture.js';
import { WEAPON_COMBO_STATE_NAMES } from './weaponComboClips.js';

const COMBO_STATES = new Set(WEAPON_COMBO_STATE_NAMES);

export const WEAPON_AUTO_DISMISS_SECONDS = 6;
// Items without their own model show the pack model of their family.
export const FAMILY_DEFAULT_WEAPON_MODELS = Object.freeze({ sword: 'fantasy_sword', bow: 'fantasy_bow' });

// What to show in hand for an equipped weapon item. family = the item's mastery family
// (AXEWeaponIdentity.inferAXEMasteryWeaponId).
export function weaponVisualForItem(item, family = item?.masteryWeaponId) {
  if (!item || item.equipped === false) return null;
  const packId = item.appearance?.weaponModelId || item.weaponModelId;
  if (packId) return { type: 'pack', id: packId, kind: family === 'bow' ? 'bow' : 'blade' };
  // test-gear GLBs (e.g. the Training Bow) are drawn by their own presenter
  if (typeof item.modelUrl === 'string' && item.modelUrl) return { type: 'external', id: item.modelUrl, kind: family === 'bow' ? 'bow' : 'blade' };
  if (family === 'dual_blades') return { type: 'daggers', id: 'daggers', kind: 'dagger' };
  if (FAMILY_DEFAULT_WEAPON_MODELS[family]) return { type: 'pack', id: FAMILY_DEFAULT_WEAPON_MODELS[family], kind: family === 'bow' ? 'bow' : 'blade' };
  return null;
}

// Space: while a weapon is out (and the player is on foot), it dismisses the weapon instead of jumping.
export function resolveSpaceAction({ weaponOut = false, mounted = false } = {}) {
  return weaponOut && !mounted ? 'dismiss' : 'jump';
}

// Counts uninterrupted out-of-combat movement while a weapon is out.
export function createWeaponAutoDismiss({ seconds = WEAPON_AUTO_DISMISS_SECONDS } = {}) {
  let elapsed = 0;
  return {
    update(delta, { out = false, moving = false, inCombat = false } = {}) {
      if (!out || !moving || inCombat) { elapsed = 0; return false; }
      elapsed += Math.max(0, Number(delta) || 0);
      if (elapsed < seconds) return false;
      elapsed = 0;
      return true;
    },
    reset() { elapsed = 0; },
    elapsed: () => elapsed,
  };
}

export function createPlayerWeaponSummon({ model, scene, runtime, renderer = null, getPixelScale, autoDismissSeconds = WEAPON_AUTO_DISMISS_SECONDS }) {
  const fx = createWeaponConstructFx({ scene, renderer, getPixelScale });
  const gesture = createWeaponSummonGesture({ model });
  const autoDismiss = createWeaponAutoDismiss({ seconds: autoDismissSeconds });
  let visual = null; // what the equipped item shows when out
  let itemKey;       // undefined until the first sync
  let out = false;
  let suspended = false; // riding: the mount's own weapon presenter draws the weapon
  let token = 0;
  let externalPending = null;

  const kindOf = (v) => (v?.kind === 'bow' ? 'bow' : 'blade');

  async function materialize({ animate = true } = {}) {
    if (!visual) return false;
    const my = ++token;
    out = true;
    if (visual.type === 'external') {
      runtime.unequip();
      if (animate) externalPending = { since: 0 };
      return true;
    }
    const ok = visual.type === 'daggers' ? await runtime.equipDaggers() : await runtime.equip(visual.id);
    if (!ok || my !== token || suspended) return ok;
    if (!animate) { runtime.setHandClosed(true); return true; }
    runtime.setStanceWeight(1); // form in the combat grip, then settle into the carry
    gesture.play({
      hands: runtime.getHands().map((h) => ({ side: h.side, gripQuaternion: h.gripQuaternion })),
      kind: visual.type === 'daggers' ? 'dagger' : kindOf(visual),
      hold: WEAPON_CONSTRUCT_SECONDS.build * 0.85,
    });
    for (const part of runtime.getHands()) {
      const root = runtime.getRoots().find((r) => r.parent === part.handBone);
      fx.play(root, { kind: kindOf(visual), mode: 'build' }); // the liquid pools at the grip, inside the closed hand
    }
    return true;
  }

  function dismiss({ animate = true } = {}) {
    if (!out) return false;
    out = false;
    autoDismiss.reset();
    const my = ++token;
    gesture.cancel();
    externalPending = null;
    const roots = runtime.getRoots();
    if (!animate || !roots.length) { runtime.unequip(); return true; }
    runtime.releaseHand();
    let left = roots.length;
    for (const root of roots) {
      fx.play(root, { kind: kindOf(visual), mode: 'melt', onDone: () => { if (--left === 0 && my === token && !out) runtime.unequip(); } });
    }
    return true;
  }

  // Call every frame with the active equipped weapon item; a change of item is a draw.
  function sync(item, family) {
    const next = weaponVisualForItem(item, family);
    const key = next ? `${next.type}:${next.id}:${item?.instanceId || item?.id || ''}` : null;
    if (key === itemKey) return;
    const first = itemKey === undefined;
    itemKey = key;
    if (!next) { dismiss({ animate: !first }); visual = null; return; }
    if (out && !suspended) {
      // switching: the old weapon melts back into the hand while the new one starts forming
      const oldKind = kindOf(visual);
      gesture.cancel();
      for (const root of runtime.orphan()) fx.play(root, { kind: oldKind, mode: 'melt', onDone: () => root.removeFromParent() });
      out = false;
    }
    visual = next;
    if (suspended) { out = true; return; }
    // world entry shows the equipped weapon without the summon; later draws animate
    materialize({ animate: !first });
  }

  function setSuspended(next) {
    if (suspended === !!next) return;
    suspended = !!next;
    gesture.cancel();
    if (suspended) runtime.unequip();
    else if (out) materialize({ animate: false });
  }

  return {
    sync,
    summon: () => (visual && !out ? materialize({ animate: true }) : false),
    // attacking or aiming with nothing out summons the equipped weapon first
    ensureOut: () => (visual && !out && !suspended ? (materialize({ animate: true }), true) : false),
    dismiss: () => dismiss({ animate: true }),
    isOut: () => out,
    getVisual: () => visual,
    setSuspended,
    // Before the animation mixer.
    preUpdate: () => gesture.preUpdate(),
    // After the mixer (and before anything that reads the hands, like trails).
    // drawing: a bow combo's draw (true) / release (false), passed on to the runtime; null otherwise.
    update(delta, { state = null, aiming = false, moving = false, inCombat = false, externalRoot = null, drawing = null } = {}) {
      if (COMBO_STATES.has(state)) gesture.cancel(); // a combo swing owns the arm: the weapon just forms in it
      gesture.update(delta);
      if (gesture.isActive()) runtime.holdCombat(0.35); // the weapon keeps its show pose until the arm returns
      runtime.update(delta, { state, aiming, drawing });
      if (externalPending && externalRoot) {
        fx.play(externalRoot, { kind: kindOf(visual), mode: 'build', hand: externalRoot.parent });
        externalPending = null;
      } else if (externalPending && (externalPending.since += delta) > 3) externalPending = null;
      fx.update(delta);
      if (!suspended && autoDismiss.update(delta, { out, moving, inCombat: inCombat || aiming })) dismiss({ animate: true });
    },
    // Riding: play the forming effect on the mount presenter's weapon when it appears.
    constructOn: (root, kind = 'blade') => fx.play(root, { kind, mode: 'build', hand: root?.parent || null }),
    isAnimating: () => gesture.isActive() || fx.activeCount() > 0,
    dispose() { token++; gesture.cancel(); fx.dispose(); },
  };
}
