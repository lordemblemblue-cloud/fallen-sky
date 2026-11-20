/** Returns whether the current PvE lock-on must be dropped immediately. */
export function shouldReleaseWorldTarget(target, worldTargets) {
  if (!target || target.kind === 'player') return false;
  if (target.id == null) return true;
  const actor = (worldTargets || []).find(entry =>
    entry?.id != null && String(entry.id) === String(target.id));
  if (!actor) return true;
  return actor.alive === false ||
    (typeof actor.aliveRef === 'function' && actor.aliveRef() === false) ||
    actor.dying === true || actor.defeated === true ||
    actor.group?.visible === false ||
    (Number.isFinite(actor.hp) && actor.hp <= 0);
}
