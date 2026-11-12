export class CoreAnimationController {
  constructor({ legacyController }) {
    this.legacy = legacyController;
    this.currentBase = null;
    this.currentMontage = null;
    this.queueList = [];
    this.locked = false;
  }

  play(name, options = {}) {
    if (!name || this.currentBase === name) return true;
    const played = this.legacy?.ChangeState?.(name, { fade: options.fade ?? 0.12, force: options.force });
    if (played) this.currentBase = name;
    return !!played;
  }

  transitionTo(name, options = {}) {
    return this.play(name, options);
  }

  queue(name, options = {}) {
    this.queueList.push({ name, options });
  }

  lock() { this.locked = true; }
  unlock() { this.locked = false; }

  playMontage(name, options = {}) {
    if (this.locked && !options.force) return false;
    const played = this.legacy?.PlayAnimation?.(name, { fade: options.fade ?? 0.05, force: true, timeScale: options.timeScale ?? 1 });
    if (played) this.currentMontage = name;
    return !!played;
  }

  blendUpperBody(name, options = {}) {
    return this.playMontage(name, options);
  }

  update(stateSnapshot, movementIntent) {
    if (!this.legacy) return;
    if (typeof stateSnapshot.grounded === 'boolean') {
      this.legacy.setAirborneState?.({ grounded: stateSnapshot.grounded, justLanded: !!stateSnapshot.justLanded });
    }
    const combat = stateSnapshot.combat;
    if (combat === 'attack' || combat === 'combo' || combat === 'casting' || combat === 'hit_react' || combat === 'dodge') return;
    // Guard/aim release is explicit input. A legacy combat snapshot may still
    // say "block" after release; it must not hold the cosmetic pose forever.
    const hasAimIntent = 'aimHeld' in movementIntent || 'blockHeld' in movementIntent;

    this.legacy.HandleMovement?.({
      moving: movementIntent.moveAmount > 0,
      running: stateSnapshot.locomotion === 'run' || stateSnapshot.locomotion === 'sprint' || stateSnapshot.locomotion === 'mounted_run',
      sprinting: stateSnapshot.locomotion === 'sprint',
      direction: movementIntent.direction,
      aiming: hasAimIntent ? !!movementIntent.aimHeld : combat === 'aim',
      blocking: hasAimIntent ? !!movementIntent.blockHeld : combat === 'block',
    });
  }

  updateMixer(mixer, delta) {
    mixer?.update(delta);
  }
}
