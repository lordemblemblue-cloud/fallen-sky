/**
 * Backend-neutral renderer sizing. Call from a browser resize observer only.
 * Zero-sized hidden canvases should not allocate render targets.
 */
export function getSafeRendererSize(width, height, pixelRatio = 1, maxPixelRatio = 2) {
  if (![width, height, pixelRatio, maxPixelRatio].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || pixelRatio <= 0 || maxPixelRatio <= 0) return null;
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w < 1 || h < 1) return null;
  return { width: w, height: h, pixelRatio: Math.min(pixelRatio, maxPixelRatio) };
}

/**
 * Apply validated CSS dimensions to WebGLRenderer or WebGPURenderer.
 * Caller remains responsible for camera projection and composer sizing.
 */
export function applySafeRendererSize(renderer, width, height, pixelRatio = 1, maxPixelRatio = 2) {
  const size = getSafeRendererSize(width, height, pixelRatio, maxPixelRatio);
  if (!size || typeof renderer?.setSize !== 'function' || typeof renderer?.setPixelRatio !== 'function') return false;
  renderer.setPixelRatio(size.pixelRatio);
  renderer.setSize(size.width, size.height, false);
  return true;
}
