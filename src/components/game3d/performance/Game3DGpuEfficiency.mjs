// Browser GPU efficiency. A page cannot reserve a VRAM amount or read the
// video-memory total. It can ask the browser for the high-performance GPU,
// so textures and the framebuffer are allocated on that GPU, and it can
// spend less of that GPU when the performance profile or a weak device asks.

export function readGame3DGpuHints(host) {
  const nav = host?.navigator;
  const memory = Number(nav?.deviceMemory);
  const cores = Number(nav?.hardwareConcurrency);
  return Object.freeze({
    deviceMemoryGb: Number.isFinite(memory) && memory > 0 ? memory : null,
    cpuCores: Number.isFinite(cores) && cores > 0 ? cores : null,
  });
}

export function classifyGame3DGpu(name = '') {
  const text = String(name || '').toLowerCase();
  if (!text) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|microsoft basic render|software adapter/.test(text)) return 'software';
  if (/intel|uhd graphics|iris|hd graphics/.test(text)) return 'integrated';
  if (/nvidia|geforce|quadro|rtx|radeon|amd|apple gpu|apple m\d|adreno|mali|powervr|immortalis/.test(text)) return 'discrete';
  return 'unknown';
}

export function game3dEfficiencyTighten({
  profile = 'auto', gpuClass = 'unknown', deviceMemoryGb = null,
} = {}) {
  if (profile === 'quality' || profile === 'off') return 'none';
  if (profile === 'performance' || gpuClass === 'software') return 'performance';
  if (profile === 'balanced') return 'balanced';
  const lowMemory = Number(deviceMemoryGb) > 0 && deviceMemoryGb <= 4;
  if (profile === 'auto' && (lowMemory || gpuClass === 'integrated')) return 'balanced';
  return 'none';
}

export function game3dGpuContextAttributes({ profile = 'auto', hints = {}, gpuClass = 'unknown' } = {}) {
  const tighten = game3dEfficiencyTighten({
    profile, gpuClass, deviceMemoryGb: hints.deviceMemoryGb,
  });
  const lowMemory = Number(hints.deviceMemoryGb) > 0 && hints.deviceMemoryGb <= 4;
  return Object.freeze({
    // high-performance selects the discrete GPU on dual-GPU machines.
    // WebGL then allocates textures and the drawing buffer in that GPU's memory.
    powerPreference: 'high-performance',
    antialias: !(profile === 'performance' || tighten === 'performance' || lowMemory),
    alpha: false,
    stencil: false,
    depth: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
    desynchronized: true,
  });
}

export function createGame3DWebGLContext(canvas, attributes) {
  const names = ['webgl2', 'webgl'];
  const attempt = attrs => {
    for (const name of names) {
      try {
        const gl = canvas?.getContext?.(name, attrs);
        if (gl) return gl;
      } catch { /* Some browsers reject desynchronized. */ }
    }
    return null;
  };
  return attempt(attributes) || attempt({ ...attributes, desynchronized: false });
}

// The same description for WebGPURenderer, from its adapter (src/lib/webgpuSceneRenderer.js describeAdapter).
// `api` is 'WebGPU' or 'WebGL2' (WebGPURenderer's fallback backend).
export function describeGame3DGpuAdapter(adapter, hints = {}, api = 'WebGPU') {
  const renderer = String(adapter?.name || '');
  return Object.freeze({
    renderer: renderer || 'GPU not reported by this browser',
    gpuClass: classifyGame3DGpu(renderer),
    deviceMemoryGb: hints.deviceMemoryGb ?? null,
    cpuCores: hints.cpuCores ?? null,
    powerPreference: 'high-performance',
    vramBytes: null,
    api,
  });
}

export function describeGame3DGpu(gl, hints = {}) {
  let renderer = '';
  try {
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch { renderer = ''; }
  return Object.freeze({
    renderer: renderer || 'GPU not reported by this browser',
    gpuClass: classifyGame3DGpu(renderer),
    deviceMemoryGb: hints.deviceMemoryGb ?? null,
    cpuCores: hints.cpuCores ?? null,
    powerPreference: 'high-performance',
    vramBytes: null,
  });
}
