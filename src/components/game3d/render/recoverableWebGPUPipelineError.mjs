/**
 * Three r171 can throw synchronously while reading an invalidated WebGPU
 * pipeline's resource reference counter during a scene remount. Surface only
 * this exact internal cache error to the existing GameWorld3D renderer
 * recovery path. Never treat arbitrary scene/model errors as renderer failures.
 *
 * This does not repair the underlying Three cache lifecycle and it is not
 * evidence that the engine's native WebGPU path is fully verified.
 */
export function isRecoverableWebGPUPipelineError(error, renderer) {
  return renderer?.isWebGPURenderer === true &&
    error instanceof TypeError &&
    /\busedTimes\b/.test(error.message || '');
}
