import {
  GAME3D_DISPLAY_SETTINGS_EVENT,game3DResolutionTarget,
  normalizeGame3DDisplaySettings,readGame3DDisplaySettings,
  readGame3DRendererViewport,readGame3DActualFramebuffer,
  publishGame3DActualFramebuffer,
} from './Game3DDisplaySettings.mjs';

// Clone Game 3D adaptive browser renderer. No WebAssembly, native hardware access,
// gameplay changes, or assumed precise VRAM figures. Fails open to WebGL defaults.
export const CLONE_GPU_PROFILE_KEY = 'axe3d_clone_gpu_profile_v1';
export const CLONE_GPU_PROFILES = Object.freeze(['auto', 'performance', 'balanced', 'quality', 'off']);
const QUALITY_CAPS = Object.freeze({ low: 0.75, medium: 1, high: 1.5, ultra: 1.5 });

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function normalizeCloneGPUProfile(value) {
  return CLONE_GPU_PROFILES.includes(value) ? value : 'auto';
}

export function rendererPixelRatioLimit({
  profile = 'auto', quality = 'high', devicePixelRatio = 1,
} = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, 1.5) : 1;
  if (profile === 'performance') return Math.min(dpr, 0.75);
  if (profile === 'balanced') return Math.min(dpr, 1);
  if (profile === 'quality' || profile === 'off') return dpr;
  return Math.min(dpr, QUALITY_CAPS[quality] ?? QUALITY_CAPS.high);
}

export function summarizeCloneFrames(deltasMs = []) {
  const values = deltasMs.filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return { fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, frames: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = percent => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percent) - 1))];
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    fps: (values.length * 1000) / total,
    p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99),
    maxMs: sorted[sorted.length - 1], frames: values.length,
  };
}

// Hysteresis: only persistent slow windows scale down. A single GC or shader
// spike never forces a persistent quality downgrade. Caps prevent upscaling.
export function nextClonePixelRatio({
  profile = 'auto', current = 1, ceiling = 1.5, floor = 0.7,
  p95Ms = 0, p99Ms = 0, slowWindows = 0, fastWindows = 0,
} = {}) {
  if (profile === 'off') return current;
  if (profile !== 'auto') return ceiling;
  const minimum = Math.min(floor, ceiling);
  if (slowWindows >= 2 && p95Ms > 25) {
    return clamp(Math.round((current - 0.125) * 1000) / 1000, minimum, ceiling);
  }
  if (fastWindows >= 3 && p95Ms < 19 && p99Ms < 24) {
    return clamp(Math.round((current + 0.125) * 1000) / 1000, minimum, ceiling);
  }
  return clamp(current, minimum, ceiling);
}

export function normalizedCloneFrameCost({p95Ms=0,p99Ms=0,fpsCap=60}={}) {
  // A deliberate 30 FPS cap yields ~33 ms between real rendered frames, but
  // isn't by itself GPU pressure. Preserve the additional genuine delay.
  const period=Math.max(1000/144,1000/([30,60,120,144].includes(fpsCap)?fpsCap:60));
  const intentionalDelay=Math.max(0,period-1000/60);
  return {p95Ms:Math.max(0,p95Ms-intentionalDelay),
    p99Ms:Math.max(0,p99Ms-intentionalDelay)};
}
function readFpsCap(host) {
  try {
    const saved=JSON.parse(host?.localStorage?.getItem('game_graphics_settings')||'null');
    return [30,60,120,144].includes(saved?.fpsCap)?saved.fpsCap:60;
  } catch {return 60;}
}

function readQuality(host) {
  try {
    const saved = JSON.parse(host?.localStorage?.getItem('game_graphics_settings') || 'null');
    return saved?.quality || 'high';
  } catch { return 'high'; }
}

export function readCloneGPUProfile(host) {
  try {
    const url = new URLSearchParams(host?.location?.search || '');
    if (url.get('adaptiveGpu') === '0') return 'off';
    return normalizeCloneGPUProfile(host?.localStorage?.getItem(CLONE_GPU_PROFILE_KEY));
  } catch { return 'auto'; }
}

// Nothing here changes AI, physics, terrain, target selection, animations,
// shadow shaders or player data. The GPU is accessed only via the game's
// existing Three.js/WebGL renderer. No telemetry leaves this browser.
export function createCloneAdaptiveGraphics({
  renderer,
  host = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document,
  onSample = () => {},
  initialProfile,
} = {}) {
  const empty = { fps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, frames: 0 };
  if (!renderer || !host?.requestAnimationFrame) {
    return { setProfile() {}, getSnapshot: () => ({ ...empty, profile: 'off', ratio: 1 }), dispose() {} };
  }
  let disposed = false;
  let profile = normalizeCloneGPUProfile(initialProfile ?? readCloneGPUProfile(host));
  // Auto + GPU Off should restore the original DPR quality cap, not a
  // 720p/1080p choice that might already have been applied during startup.
  const originalRatio = rendererPixelRatioLimit({
    profile:'off', quality:readQuality(host),
    devicePixelRatio:Number(host.devicePixelRatio)||1,
  });
  let ratio = originalRatio;
  let quality = readQuality(host);
  let display = readGame3DDisplaySettings(host);
  // Explicit framebuffer resolutions supersede auto GPU profiles; camera
  // aspect and logical CSS viewport remain independent of this ratio.
  const getTarget = () => {
    const viewport = readGame3DRendererViewport(renderer, host);
    const autoCap = rendererPixelRatioLimit({
      profile, quality, devicePixelRatio: Number(host.devicePixelRatio) || 1,
    });
    return game3DResolutionTarget({
      resolution: display.resolution,
      viewportWidth: viewport.width, viewportHeight: viewport.height,
      devicePixelRatio: Number(host.devicePixelRatio) || 1,
      autoRatio: autoCap,
      maxTextureSize: renderer.capabilities?.maxTextureSize,
    });
  };
  let target = getTarget();
  let ceiling = target.ratio;
  let slowWindows = 0, fastWindows = 0;
  let lastChangeAt = -Infinity;
  let lastFrameAt = 0, lastSampleAt = 0, lastObservedRenderFrame = null, raf = null;
  let sample = { ...empty, profile, ratio };
  let batch = [];

  function applyRatio(next) {
    if (disposed || (profile === 'off' && display.resolution === 'auto') ||
        !Number.isFinite(next) || next <= 0) return;
    try {
      if (renderer.getContext?.()?.isContextLost?.()) return;
      // A direct GameWorld3D resolution event may have changed the renderer
      // before this governor listener runs. Read the renderer, not the cached
      // ratio, so we never report an unapplied resolution.
      const current=Number(renderer.getPixelRatio?.())||ratio;
      if(Math.abs(next-current)>=0.001)
        renderer.setPixelRatio(next); // Updates Three.js canvas.width/height.
      ratio=Number(renderer.getPixelRatio?.())||next;
      if(host.__gw3dRenderer===renderer)host.__gw3dInkLook?.setSize?.();
    } catch {
      // Rendering must continue if the WebGL context is temporarily lost.
    }
  }

  function refreshTarget({ resetAdaptation = false } = {}) {
    quality = readQuality(host);
    target = getTarget();
    ceiling = target.ratio;
    if (resetAdaptation) {
      slowWindows = 0; fastWindows = 0; lastChangeAt = -Infinity;
    }
    if (display.resolution !== 'auto') {
      // Fixed render resolution, only reduced if a WebGL texture/pixel limit
      // prevents it; the GPU FPS governor keeps measuring but stops resizing.
      applyRatio(ceiling);
    } else if (profile === 'off') {
      try {
        const safeOriginal = game3DResolutionTarget({
          resolution:'auto', autoRatio:originalRatio,
          viewportWidth:target.cssWidth, viewportHeight:target.cssHeight,
          maxTextureSize:renderer.capabilities?.maxTextureSize,
        }).ratio;
        if (Math.abs((Number(renderer.getPixelRatio?.())||ratio)-safeOriginal) >= .001) {
          renderer.setPixelRatio(safeOriginal);
          if (host.__gw3dRenderer === renderer) host.__gw3dInkLook?.setSize?.();
        }
        ratio=Number(renderer.getPixelRatio?.())||safeOriginal;
      } catch { /* Context may already be lost. */ }
    } else {
      applyRatio(profile === 'auto' ? Math.min(ratio, ceiling) : ceiling);
    }
    const actual=publishGame3DActualFramebuffer({
      renderer,host,resolution:display.resolution,limited:target.limited,
    });
    sample = { ...sample, ratio, profile,
      resolution:display.resolution,
      renderWidth:actual?.width??target.width,
      renderHeight:actual?.height??target.height,
      limited:target.limited,applied:Boolean(actual) };
  }

  function changeProfile(next) {
    if (disposed) return;
    profile = normalizeCloneGPUProfile(next);
    refreshTarget({ resetAdaptation:true });
  }

  function onGraphicsSettings() {
    if (!disposed) refreshTarget({ resetAdaptation:true });
  }
  function onDisplaySettings(event) {
    if (disposed) return;
    display=normalizeGame3DDisplaySettings(event?.detail ?? readGame3DDisplaySettings(host));
    refreshTarget({ resetAdaptation:true });
  }
  function onResize() {
    if (!disposed) refreshTarget({ resetAdaptation:true });
  }

  function tick(now) {
    if (disposed) return;
    raf = host.requestAnimationFrame(tick);
    if (documentRef?.hidden || renderer.getContext?.()?.isContextLost?.()) {
      lastFrameAt = 0; lastSampleAt = now; lastObservedRenderFrame = null; batch = [];
      return;
    }
    // Three.js increments render.frame on actual render submissions. If the
    // game loop stops but the browser continues rAF, do not invent game FPS.
    const renderedFrame = renderer.info?.render?.frame;
    if (Number.isFinite(renderedFrame)) {
      if (renderedFrame === lastObservedRenderFrame) return;
      lastObservedRenderFrame = renderedFrame;
    }
    if (lastFrameAt && now > lastFrameAt) {
      const delta = now - lastFrameAt;
      if (delta < 5000) batch.push(delta); // long stalls remain visible in p99/max
    }
    lastFrameAt = now;
    if (!lastSampleAt) lastSampleAt = now;
    if (now - lastSampleAt < 3000 || batch.length < 20) return;

    const frame = summarizeCloneFrames(batch);
    batch = []; lastSampleAt = now;
    const adjusted=normalizedCloneFrameCost({
      p95Ms:frame.p95Ms,p99Ms:frame.p99Ms,fpsCap:readFpsCap(host),
    });
    if (adjusted.p95Ms > 25) { slowWindows++; fastWindows = 0; }
    else if (adjusted.p95Ms < 19 && adjusted.p99Ms < 24) { fastWindows++; slowWindows = 0; }
    else { slowWindows = 0; fastWindows = 0; }

    // Fixed 720p/900p/1080p/1440p/native modes are user controlled.
    // Auto mode alone uses the existing hysteresis-based governor.
    if (display.resolution === 'auto' && now - lastChangeAt > 9000) {
      const next = nextClonePixelRatio({
        profile, current: ratio, ceiling, p95Ms: adjusted.p95Ms,
        p99Ms: adjusted.p99Ms, slowWindows, fastWindows,
      });
      if (Math.abs(next - ratio) >= 0.01) {
        applyRatio(next);
        lastChangeAt = now;
        slowWindows = 0; fastWindows = 0;
      }
    }
    const viewport=readGame3DRendererViewport(renderer,host);
    const actual=readGame3DActualFramebuffer(renderer);
    sample = { ...frame, ratio, profile, resolution:display.resolution,
      renderWidth:actual?.width??Math.floor(viewport.width*ratio),
      renderHeight:actual?.height??Math.floor(viewport.height*ratio),
      limited:target.limited,applied:Boolean(actual),sampledAt:now };
    try { onSample(sample); } catch { /* UI cannot disrupt gameplay */ }
  }

  host.addEventListener?.('graphicsSettingsChanged', onGraphicsSettings);
  host.addEventListener?.(GAME3D_DISPLAY_SETTINGS_EVENT, onDisplaySettings);
  host.addEventListener?.('resize', onResize);
  changeProfile(profile);
  raf = host.requestAnimationFrame(tick);
  const controller = {
    setProfile: changeProfile,
    syncViewport: onResize,
    getSnapshot: () => ({ ...sample, profile, ratio }),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf !== null) host.cancelAnimationFrame?.(raf);
      host.removeEventListener?.('graphicsSettingsChanged', onGraphicsSettings);
      host.removeEventListener?.(GAME3D_DISPLAY_SETTINGS_EVENT, onDisplaySettings);
      host.removeEventListener?.('resize', onResize);
      batch = [];
    },
  };
  return controller;
}
