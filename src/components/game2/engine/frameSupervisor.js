// Game 2's requestAnimationFrame callback must never die silently.
// The core loop is allowed one transient failure (for example a temporary GPU
// resource/context disruption); a repeated failure presents the actual error.
// Optional 3D character/dragon renderers are isolated so they cannot stop
// input, physics, online transport or the native WebGL scene.
export class Game2FrameSupervisor {
  constructor({ onFatal, onTransient, onOptionalFailure, maxCoreFailures = 2 } = {}) {
    this.onFatal = onFatal;
    this.onTransient = onTransient;
    this.onOptionalFailure = onOptionalFailure;
    this.maxCoreFailures = Math.max(1, maxCoreFailures | 0);
    this.consecutiveCoreFailures = 0;
    this.disabledOptional = new Set();
    this.stopped = false;
    this.lastFault = null;
  }
  tick(core, optional = []) {
    if (this.stopped) return false;
    try {
      core();
      this.consecutiveCoreFailures = 0;
    } catch (error) {
      this.lastFault = error;
      this.consecutiveCoreFailures++;
      if (this.consecutiveCoreFailures >= this.maxCoreFailures) {
        this.stopped = true;
        this.onFatal?.(error);
        return false;
      }
      this.onTransient?.(error);
      return true;
    }
    for (const part of optional) {
      if (!part || this.disabledOptional.has(part.id) || !part.render) continue;
      try {
        part.render();
      } catch (error) {
        // Degrade the affected overlay once and let the native game run.
        this.disabledOptional.add(part.id);
        try { part.onFailure?.(error); }
        catch (cleanupError) { console.error('Game 2 overlay cleanup failed',cleanupError); }
        this.onOptionalFailure?.(part.id, error);
      }
    }
    return true;
  }
}
