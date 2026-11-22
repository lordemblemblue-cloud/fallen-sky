/** Transparent avatar-only model view for Duelist Adventure's Character screen.
 * The home hangar has a floor, cyan portal and beams on purpose; this viewer does NOT.
 * The selected model renders on a transparent canvas over the user's blue-gold scene.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createSceneRenderer } from '../../../lib/webgpuSceneRenderer.js';
import { loadFighterBody } from '../client/assets.mjs';
import { prepareIdlePreview } from './idlePreview.mjs';

export default function DuelistCharacterPreview({ fighter = 'maskedWarrior', classId = 'duelist', compact = false }) {
  const mountRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === 'undefined') return undefined;
    let active = true;
    let renderer, observer, idlePose = null, model = null, frame = null;
    setUnavailable(false);
    try {
      renderer = createSceneRenderer('duelist-adventure', {
        alpha: true, antialias: true, powerPreference: 'low-power',
      }).renderer;
    } catch {
      setUnavailable(true);
      return undefined;
    }
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = null;
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 50);
    camera.position.set(0, 0.98, 3.05);
    camera.lookAt(0, 0.9, 0);
    renderer.setClearColor(0x08162d, 0); // zero alpha; never paint a black rectangular stage
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = 'dcm-avatar-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xc7dffe, 0x253a64, 2.6));
    const key = new THREE.DirectionalLight(0xffe6c6, 3.25);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x93bcf7, 2.1);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    loadFighterBody(fighter).then(async ({ model: loaded, clips }) => {
      if (!active) return;
      const prepared = await prepareIdlePreview({ model: loaded, bodyId: fighter, classId, embeddedIdle: clips?.idle });
      if (!active) { prepared.dispose(); return; }
      model = loaded;
      // loadFighterBody already centres each asset at x/z=0, feet at y=0.
      model.rotation.y = 0;
      idlePose = prepared;
      scene.add(model); // no intermediate T-pose frame
    }).catch(() => { if (active) setUnavailable(true); });

    const resize = () => {
      if (!active) return;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(mount);
    } else window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let elapsed = 0;
    const draw = () => {
      if (!active) return;
      elapsed += Math.min(.05, clock.getDelta());
      // The in-match viewer is secondary to the world: cap its GPU draws at 24 fps.
      if (!document.hidden && (!compact || elapsed >= 1 / 24)) {
        if (!reduceMotion) idlePose?.update(elapsed);
        renderer.render(scene, camera);
        elapsed = 0;
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      active = false;
      if (frame != null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      idlePose?.dispose();
      if (model) scene.remove(model);
      // GLB geometries and textures belong to the shared asset loader's cache.
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [fighter, classId, compact]);

  return <div className="dcm-avatar-stage" ref={mountRef} aria-label="Live 3D character preview">
    {unavailable && <span className="dcm-avatar-fallback" role="status">3D preview unavailable</span>}
  </div>;
}
