/**
 * Keep a battle exactly as it was around work that has to restart the stage. The Studio's "Record WebM" plays the bow
 * skills in practice mode, which restarts the stage; without this, a battle in progress was lost (back to round 1).
 * Pure: works on any stage-like object (FantasyBattleStage in the game, plain objects in tests). No imports.
 */

// What FantasyBattleStage.restart() resets, plus the mode, phase and log. Battle states are replaced, never mutated, by
// resolveRound, so the battle itself is kept by reference; the small plain objects are copied.
const KEPT_BY_REFERENCE = ['mode', 'phase', 'seed', 'battle', 'round', 'activeActor', 'koPending'];
const COPIED = ['display', 'pendingChoices', 'logLines'];
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function captureBattleState(stage) {
  const saved = { fighters: {} };
  for (const key of KEPT_BY_REFERENCE) saved[key] = stage[key];
  for (const key of COPIED) saved[key] = copy(stage[key]);
  saved.roundGuards = new Set(stage.roundGuards || []);
  saved.activeGuards = new Set(stage.activeGuards || []);
  for (const [id, f] of Object.entries(stage.fighters || {})) {
    const current = f.skills?.current;
    saved.fighters[id] = {
      opacity: f.view?.opacity ?? 1,
      combatTarget: f.state?.life?.combatTarget ?? 1,
      // a finished battle holds its victory and defeat poses: play them again afterwards
      heldSkill: current?.compiled?.hold ? current.id : null,
    };
  }
  return saved;
}

export function restoreBattleState(stage, saved) {
  for (const key of KEPT_BY_REFERENCE) stage[key] = saved[key];
  for (const key of COPIED) stage[key] = copy(saved[key]);
  stage.roundGuards = new Set(saved.roundGuards);
  stage.activeGuards = new Set(saved.activeGuards);
  for (const [id, f] of Object.entries(stage.fighters || {})) {
    const s = saved.fighters[id];
    if (!s) continue;
    f.skills?.stop?.();
    if (f.view) f.view.opacity = s.opacity;
    if (f.state?.life) f.state.life.combatTarget = s.combatTarget;
    if (s.heldSkill) f.playSkill?.(s.heldSkill);
  }
  stage.emitHud?.();
}

/** Run fn (sync or async) and put the battle back as it was afterwards, also when fn throws. */
export async function withBattleStatePreserved(stage, fn) {
  const saved = captureBattleState(stage);
  try {
    return await fn();
  } finally {
    restoreBattleState(stage, saved);
  }
}
