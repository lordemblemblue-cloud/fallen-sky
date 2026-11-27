import { useEffect } from 'react';
import { createCloneAdaptiveGraphics } from './AdaptiveGraphics.mjs';
import CloneHardwarePanel from './CloneHardwarePanel.jsx';
import { createGame3DSceneWarmup } from './SceneWarmup.mjs';
import { installRafPump } from './Game3DRafPump.mjs';
import { installGame3DModelCache } from './Game3DModelCache.mjs';

// Draw-cost probe, dev server only: ?perfPump=1 must replace requestAnimationFrame before the world's loop first asks
// for a frame, i.e. when this module is evaluated (Game3DRafPump.mjs). A production build drops this.
if (import.meta.env?.DEV && typeof window !== 'undefined' && /[?&]perfPump=1(&|$)/.test(window.location.search))
  installRafPump(window);

// Model files stay in memory once downloaded (Game3DModelCache.mjs): a gate hop remounts the world as the next
// area's scene and loads the same models again; they come from memory instead of the network. Bytes only, capped.
if (typeof window !== 'undefined') window.__game3dModelCache = installGame3DModelCache();

// GameView is outside /game3d/, so its browser client requires a root
// service-worker scope to cache its /game3d/ requests. Never replace another
// app's existing root service worker; the worker itself only handles PUBLIC
// /game3d/ static files and ignores every other request.
let registrationAttempted = false;
async function registerPublicGameAssetCache() {
  if (registrationAttempted || typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) || !window.isSecureContext) return;
  registrationAttempted = true;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    const script = existing?.active?.scriptURL || existing?.installing?.scriptURL || '';
    if (existing && !script.endsWith('/game3d-asset-sw.js')) return;
    await navigator.serviceWorker.register('/game3d-asset-sw.js', { scope: '/' });
  } catch { /* Optional cache: network-only play remains valid. */ }
}

export default function Game3DPerformanceBootstrap({ region, showPanel = false }) {
  useEffect(() => {
    registerPublicGameAssetCache();
    // Draw-cost probe (docs/game3d/three-empires/research/PERF_BASELINE_WEBGPU.md): dev server + ?perfProbe=1 only;
    // a production build drops this branch and the probe module with it.
    if (import.meta.env?.DEV && /[?&]perfProbe=1(&|$)/.test(window.location.search))
      import('./Game3DPerfProbe.mjs').then((m) => m.installGame3DPerfProbe(window), (e) => console.warn('perfProbe unavailable', e));
    let activeScene = null;
    let activeRenderer = null;
    let warmup = null;
    let adaptive = null;
    let stopped = false;
    const attach = () => {
      if (stopped) return;
      const { __gw3dScene: scene, __gw3dRenderer: renderer, __gw3dCamera: camera } = window;
      if (scene === activeScene && renderer === activeRenderer && warmup && adaptive) return;
      warmup?.dispose();
      adaptive?.dispose();
      if (window.__axe3dCloneGovernor === adaptive) window.__axe3dCloneGovernor = null;
      warmup = null;
      adaptive = null;
      activeScene = null;
      activeRenderer = null;
      if (!scene || !renderer || !camera) return;
      activeScene = scene;
      activeRenderer = renderer;
      warmup = createGame3DSceneWarmup({ scene, camera, renderer });
      adaptive = createCloneAdaptiveGraphics({ renderer });
      window.__axe3dCloneGovernor = adaptive;
    };
    const interval = window.setInterval(attach, 900);
    window.addEventListener('gw3dSceneReady', attach);
    window.addEventListener('gw3dSceneTeardown', attach);
    attach();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('gw3dSceneReady', attach);
      window.removeEventListener('gw3dSceneTeardown', attach);
      warmup?.dispose();
      adaptive?.dispose();
      if (window.__axe3dCloneGovernor === adaptive) window.__axe3dCloneGovernor = null;
    };
  }, [region]);
  return <CloneHardwarePanel visible={showPanel} />;
}
