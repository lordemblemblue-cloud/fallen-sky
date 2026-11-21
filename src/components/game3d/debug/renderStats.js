// Developer render statistics for the Game 3D hero world (docs/game3d/RENDERING_BASELINE.md).
// Pure helpers: no three.js import, so node tests can load them directly.

export const RENDER_STATS_STORAGE_KEY = 'axe_render_stats_v1';

// Off unless a developer opts in: `?renderStats=1` turns it on (and remembers it), `?renderStats=0` turns it off.
export function isRenderStatsEnabled(search = '', storage = null) {
  let param = null;
  try { param = new URLSearchParams(search).get('renderStats'); } catch { param = null; }
  if (param === '1' || param === '0') {
    try { storage?.setItem?.(RENDER_STATS_STORAGE_KEY, param); } catch { /* storage may be blocked */ }
    return param === '1';
  }
  try { return storage?.getItem?.(RENDER_STATS_STORAGE_KEY) === '1'; } catch { return false; }
}

// Nearest-rank percentile of an ascending array.
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function summarizeFrameTimes(deltasMs) {
  const valid = deltasMs.filter((d) => Number.isFinite(d) && d > 0);
  if (!valid.length) return { frames: 0, fps: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const total = valid.reduce((sum, d) => sum + d, 0);
  return {
    frames: valid.length,
    fps: (valid.length * 1000) / total,
    avgMs: total / valid.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1],
  };
}

// renderer.info resets every render() call, so this reads the last frame drawn.
// WebGPURenderer counts draw calls in render.drawCalls (its render.calls counts render() calls) and has no
// drawingBuffer* on its context: the canvas size is the drawing buffer there.
export function readRendererInfo(renderer) {
  const info = renderer?.info;
  if (!info) return null;
  const gpu = !!renderer.isWebGPURenderer;
  let gl = null;
  try { gl = gpu ? null : renderer.getContext?.() || null; } catch { gl = null; }
  return {
    calls: (gpu ? info.render?.drawCalls : info.render?.calls) ?? 0,
    triangles: info.render?.triangles ?? 0,
    points: info.render?.points ?? 0,
    lines: info.render?.lines ?? 0,
    geometries: info.memory?.geometries ?? 0,
    textures: info.memory?.textures ?? 0,
    programs: info.programs?.length ?? 0,
    pixelRatio: renderer.getPixelRatio?.() ?? 1,
    bufferWidth: (gpu ? renderer.domElement?.width : gl?.drawingBufferWidth) ?? 0,
    bufferHeight: (gpu ? renderer.domElement?.height : gl?.drawingBufferHeight) ?? 0,
  };
}

function textureBytes(texture) {
  const mipmaps = texture.mipmaps;
  if (Array.isArray(mipmaps) && mipmaps.length && mipmaps[0]?.data?.byteLength) {
    return mipmaps.reduce((sum, level) => sum + (level?.data?.byteLength || 0), 0);
  }
  const image = texture.image;
  const width = image?.videoWidth || image?.naturalWidth || image?.width || 0;
  const height = image?.videoHeight || image?.naturalHeight || image?.height || 0;
  const depth = image?.depth || 1;
  // RGBA8 upload; a generated mip chain adds about a third.
  return width * height * depth * 4 * (texture.generateMipmaps === false ? 1 : 4 / 3);
}

// Estimated GPU upload size of what the scene graph references (the browser does not expose real GPU memory).
// Render targets (shadow maps) and the drawing buffer are not included.
export function estimateSceneMemory(scene) {
  const geometries = new Map();
  const textures = new Map();
  const materials = new Set();
  let meshes = 0;
  let skinnedMeshes = 0;
  let instancedMeshes = 0;
  let shadowCasters = 0;
  let lights = 0;
  scene?.traverse?.((obj) => {
    if (obj.isLight) lights += 1;
    if (!obj.geometry) return;
    meshes += 1;
    if (obj.isSkinnedMesh) skinnedMeshes += 1;
    if (obj.isInstancedMesh) instancedMeshes += 1;
    if (obj.castShadow) shadowCasters += 1;
    const geometry = obj.geometry;
    if (!geometries.has(geometry.uuid)) {
      let bytes = geometry.index?.array?.byteLength || 0;
      Object.values(geometry.attributes || {}).forEach((attr) => {
        bytes += attr?.array?.byteLength || attr?.data?.array?.byteLength || 0;
      });
      geometries.set(geometry.uuid, bytes);
    }
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    // Cloned textures share one image source, which three.js uploads once.
    const addTexture = (value) => {
      if (!value?.isTexture) return;
      const key = value.source?.uuid || value.uuid;
      if (!textures.has(key)) textures.set(key, textureBytes(value));
    };
    list.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      Object.values(material).forEach(addTexture);
      Object.values(material.uniforms || {}).forEach((uniform) => addTexture(uniform?.value));
    });
  });
  const sum = (map) => [...map.values()].reduce((total, bytes) => total + bytes, 0);
  return {
    meshes,
    skinnedMeshes,
    instancedMeshes,
    shadowCasters,
    lights,
    materials: materials.size,
    geometries: geometries.size,
    geometryBytes: sum(geometries),
    textures: textures.size,
    textureBytes: sum(textures),
  };
}
