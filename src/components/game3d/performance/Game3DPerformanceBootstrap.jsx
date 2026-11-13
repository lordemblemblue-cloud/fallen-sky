import { useEffect } from 'react';
import { createGame3DSceneWarmup } from './SceneWarmup.mjs';

// A more specific /game3d/ service-worker scope cannot intercept auth,
// navigation, private Base44 endpoints, player saves or other games.
let registrationAttempted = false;
function registerPublicGameAssetCache() {
  if (registrationAttempted || typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) || !window.isSecureContext) return;
  registrationAttempted = true;
  navigator.serviceWorker.register('/game3d/game3d-asset-sw.js', { scope: '/game3d/' })
    .catch(() => {}); // Cache is optional; network-only play remains valid.
}

export default function Game3DPerformanceBootstrap({ region }) {
  useEffect(() => {
    registerPublicGameAssetCache();
    let activeScene = null;
    let warmup = null;
    let stopped = false;
    const attach = () => {
      if (stopped) return;
      const { __gw3dScene: scene, __gw3dRenderer: renderer, __gw3dCamera: camera } = window;
      if (scene === activeScene && warmup) return;
      warmup?.dispose();
      warmup = null;
      activeScene = null;
      if (!scene || !renderer || !camera) return;
      activeScene = scene;
      warmup = createGame3DSceneWarmup({ scene, camera, renderer });
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
    };
  }, [region]);
  return null;
}
