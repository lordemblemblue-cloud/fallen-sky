// Game 3D-only, budgeted shader/texture preparation. No terrain or AI mutation.
// Newly attached world/enemy meshes enter the queue automatically on later scans.
const TEXTURES = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap','lightMap'];
const SCAN_BUDGET = 320;
const QUEUE_LIMIT = 32;

// These are caps on speculative GPU uploads, not caps on visible gameplay
// textures. WebGL must upload a texture normally if a visible mesh needs it.
// The browser does not disclose actual dedicated VRAM capacity or usage.
const SPECULATIVE_TEXTURE_PIXELS = Object.freeze({
  performance: 1024 * 1024,
  balanced: 2048 * 2048,
  auto: 4096 * 4096,
});

export function shouldPrewarmGame3DTexture(texture, profile = 'auto') {
  if (!texture?.isTexture) return false;
  if (texture.isCompressedTexture || profile === 'quality' || profile === 'off') return true;
  const image = texture.image || texture.source?.data;
  if (!image) return false;
  const width = Number(image.videoWidth || image.naturalWidth || image.width);
  const height = Number(image.videoHeight || image.naturalHeight || image.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return true; // Unknown dimensions: preserve the original warmup behavior.
  }
  return width * height <= (SPECULATIVE_TEXTURE_PIXELS[profile] ?? SPECULATIVE_TEXTURE_PIXELS.auto);
}

// Never add optional GPU work to a sustained frame-time spike. A stale sample,
// one isolated hitch, or an inactive governor cannot suppress preparation.
export function shouldDeferGame3DWarmup(sample, now) {
  return Number.isFinite(now) && Number.isFinite(sample?.sampledAt) &&
    sample.frames >= 20 && now >= sample.sampledAt && now - sample.sampledAt <= 6500 &&
    (sample.p95Ms >= 32 || sample.p99Ms >= 140);
}

export function createGame3DSceneWarmup({
  scene, camera, renderer, host = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document,
  onProgress = () => {},
} = {}) {
  if (!scene || !camera || !renderer || !host) return { dispose() {}, prioritize() {} };
  let disposed = false;
  let handle = null;
  let handleType = '';
  let stack = [scene];
  let nextScanAt = 0;
  let nextCombatAt = 0;
  let prepared = 0;
  let failed = 0;
  const seenMeshes = new WeakSet();
  const seenTextures = new WeakSet();
  const meshQueue = [];
  const textureQueue = [];

  function queueMesh(mesh, urgent = false) {
    if (!mesh || !(mesh.isMesh || mesh.isSkinnedMesh || mesh.isPoints || mesh.isLine || mesh.isSprite) ||
        !mesh.material || seenMeshes.has(mesh)) return;
    if (meshQueue.length >= QUEUE_LIMIT) {
      if (!urgent) return;
      // Combat always gets a slot; displaced scenery can be rediscovered.
      const displaced = meshQueue.pop();
      if (displaced) seenMeshes.delete(displaced);
    }
    seenMeshes.add(mesh);
    if (urgent) meshQueue.unshift(mesh); else meshQueue.push(mesh);
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      for (const slot of TEXTURES) {
        const tex = mat?.[slot];
        if (tex?.isTexture && !seenTextures.has(tex) && textureQueue.length < QUEUE_LIMIT) {
          seenTextures.add(tex);
          textureQueue.push(tex);
        }
      }
    }
  }

  function prioritize(root) {
    if (disposed || !root?.traverse) return;
    const pending = [root];
    let visited = 0;
    while (pending.length && visited++ < 150) {
      const child = pending.pop();
      queueMesh(child, true);
      for (let i = (child.children?.length || 0) - 1; i >= 0; i--) {
        pending.push(child.children[i]);
      }
    }
  }

  function prioritizeNearbyCombat() {
    const now = Date.now();
    if (now < nextCombatAt) return;
    nextCombatAt = now + 2200;
    const pos = host.__localPlayerPos;
    const enemies = host.__gw3dEnemies;
    if (!pos || !Array.isArray(enemies)) return;
    let count = 0;
    for (const enemy of enemies) {
      const group = enemy?.group;
      const epos = group?.position;
      if (!epos) continue;
      const dx = epos.x - pos.x, dz = epos.z - pos.z;
      if (dx * dx + dz * dz <= 65 * 65) {
        prioritize(group);
        if (++count === 8) break;
      }
    }
  }

  function scanSlice() {
    if (!stack.length) {
      if (Date.now() < nextScanAt) return;
      stack = [scene];
    }
    let steps = 0;
    while (stack.length && steps++ < SCAN_BUDGET && meshQueue.length < QUEUE_LIMIT) {
      const node = stack.pop();
      if (!node) continue;
      queueMesh(node);
      if (node.children?.length) {
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      }
    }
    if (!stack.length) nextScanAt = Date.now() + 2600;
  }

  function schedule() {
    if (disposed) return;
    if (typeof host.requestIdleCallback === 'function') {
      handleType = 'idle';
      handle = host.requestIdleCallback(step, { timeout: 1800 });
    } else {
      handleType = 'timeout';
      handle = host.setTimeout(step, 260);
    }
  }

  async function step() {
    handle = null;
    if (disposed) return;
    // Invisible tabs and a lost context are not useful shader warmup targets.
    if (documentRef?.hidden || renderer.getContext?.()?.isContextLost?.()) {
      schedule();
      return;
    }
    let gpuSample = null;
    try { gpuSample = host.__axe3dCloneGovernor?.getSnapshot?.() || null; }
    catch { /* Optional diagnostics may be unavailable. */ }
    const now = host.performance?.now?.() ??
      (typeof performance === 'undefined' ? 0 : performance.now());
    if (shouldDeferGame3DWarmup(gpuSample, now)) {
      schedule(); // Still retry; no speculative upload while the game is struggling.
      return;
    }
    try {
      prioritizeNearbyCombat();
      scanSlice();
      const texture = textureQueue.shift();
      if (texture && typeof renderer.initTexture === 'function') {
        if (texture.image || texture.source?.data) {
          // Avoid allocating very large unseen scenery textures into GPU
          // memory just for warmup. They still load on normal render.
          if (shouldPrewarmGame3DTexture(texture, gpuSample?.profile)) renderer.initTexture(texture);
        } else {
          textureQueue.push(texture); // asynchronous asset has not decoded yet
        }
      }
      const mesh = meshQueue.shift();
      // compileAsync uses parallel shader compilation where the GPU/browser supports it.
      // Do not fall back to synchronous compile during play: that itself causes frame spikes.
      if (mesh?.parent && typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(mesh, camera, scene);
        if (!disposed) prepared++;
      }
    } catch {
      if (!disposed) failed++; // best-effort: gameplay never waits for warmup
    }
    if (!disposed) {
      onProgress({ prepared, failed, queued: meshQueue.length });
      schedule();
    }
  }

  // Event for game systems adding a boss/portal/effect: they can prioritize
  // without a manifest, but even without the event the next scene scan finds it.
  const onPrime = (event) => prioritize(event?.detail?.root);
  const onAvatar = () => { stack = [scene]; nextScanAt = 0; };
  host.addEventListener?.('game3dPerformancePrime', onPrime);
  host.addEventListener?.('game3dWorldAvatarReady', onAvatar);
  schedule();
  return {
    prioritize,
    dispose() {
      disposed = true;
      if (handle !== null) {
        if (handleType === 'idle') host.cancelIdleCallback?.(handle);
        else host.clearTimeout?.(handle);
      }
      host.removeEventListener?.('game3dPerformancePrime', onPrime);
      host.removeEventListener?.('game3dWorldAvatarReady', onAvatar);
      meshQueue.length = 0;
      textureQueue.length = 0;
      stack.length = 0;
    },
  };
}
