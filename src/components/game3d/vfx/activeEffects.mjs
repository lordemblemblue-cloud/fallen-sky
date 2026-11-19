// GameWorld3D's transient visual effects: the skill-cast light beam (vfx/playerCastLightBeam.jsx), the companion
// abilities (HealEffect, BiteEffect, LifeDrainEffect, CompanionTeleportDashEffect) and the legacy targeted spells
// (LightningStrikeEffect, FrostTornadoEffect, ShadowTeleportEffect). Each is { update(delta), alive(), dispose?() }
// in the world's activeEffects list.
//
// The world used to drop a finished effect without calling dispose(). Every skill cast then left its beam Group
// and PointLight in the scene (the scene's light count grew by one per cast, and three.js recompiles lit
// materials when it changes) and its playerSkillCastCancel listener on window, which kept the old scene
// reachable after the world unmounted. Now an effect that is no longer alive is disposed exactly once and
// dropped. Effects that already clean up inside update() and have no dispose() are simply dropped; an effect
// that does both must keep dispose() idempotent.

/** One frame: update every effect, dispose and drop the ones no longer alive, return the live ones in order. */
export function tickActiveEffects(effects, delta) {
  const live = [];
  for (const fx of effects) {
    fx.update(delta);
    if (fx.alive()) live.push(fx);
    else disposeEffect(fx);
  }
  return live;
}

/** World teardown: the render loop has stopped, so nothing would tick these again. Returns the emptied list. */
export function disposeActiveEffects(effects) {
  for (const fx of effects) disposeEffect(fx);
  return [];
}

function disposeEffect(fx) {
  try {
    fx.dispose?.();
  } catch (error) {
    // A failing dispose must not keep a finished effect in the list (ticked and disposed again every frame)
    // or stop the rest of the world's frame.
    globalThis.console?.warn?.('[GameWorld3D] visual effect dispose failed', error);
  }
}
