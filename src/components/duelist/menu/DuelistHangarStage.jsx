import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createSceneRenderer } from '../../../lib/webgpuSceneRenderer.js';
import { loadFighterBody, releaseFighterBody } from '../client/assets.mjs';
import { prepareIdlePreview } from './idlePreview.mjs';

/**
 * Small, optional WebGL stage for the menu only.
 * Gameplay renderer and WebGPU migration paths are deliberately untouched.
 * The CSS hangar remains visible if WebGL or a character asset fails to load.
 */
export default function DuelistHangarStage({ fighter = 'maskedWarrior', classId = 'duelist' }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === 'undefined') return undefined;
    let renderer;
    try {
      renderer = createSceneRenderer('duelist-adventure', { alpha: true, antialias: true, powerPreference: 'low-power' }).renderer;
    } catch {
      return undefined;
    }

    let active = true;
    let frameId = null;
    let idlePose = null;
    let model = null;
    let observer = null;
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x071426, 0.026);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
    camera.position.set(0, 1.65, 5.8);
    camera.lookAt(-0.6, 1.18, 0);

    renderer.setClearColor(0x020711, 0);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = 'duelist-hangar-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);
    const steel = new THREE.MeshStandardMaterial({ color: 0x17283a, metalness: 0.78, roughness: 0.35 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x091323, metalness: 0.7, roughness: 0.48 });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x29b5ef });
    const gold = new THREE.MeshBasicMaterial({ color: 0xe8a853 });
    const materials = [steel, darker, cyan, gold];

    const addBox = (w, h, d, x, y, z, material = steel) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      world.add(mesh);
      return mesh;
    };

    // Keep the stage geometry lightweight: no shadow maps, external textures or GLBs beyond the avatar.
    addBox(28, 0.18, 19, 0, -0.15, -3, darker);
    addBox(28, 0.06, 0.12, 0, -0.02, -2, cyan);
    for (const x of [-10, -7, -4.2, 4.5, 7.5, 10]) {
      addBox(0.28, 5.5, 0.55, x, 2.35, -6.8, steel);
      addBox(0.08, 4.8, 0.1, x + 0.18, 2.3, -6.45, cyan);
    }
    for (const z of [-1.4, -3.6, -6.2]) {
      addBox(0.035, 0.017, 16, -4, -0.039, z, cyan);
      addBox(0.035, 0.017, 16, 4, -0.039, z, cyan);
    }
    addBox(28, 0.28, 1, 0, 5.12, -6.8, steel);

    const portal = new THREE.Group();
    portal.position.set(-1.48, 1.52, -2.15);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.023, 6, 80), cyan);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.53, 0.013, 5, 80), gold);
    portal.add(outer, inner);
    const ticks = new THREE.Group();
    for (let i = 0; i < 36; i++) {
      const angle = (Math.PI * 2 * i) / 36;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.025, i % 3 === 0 ? 0.22 : 0.1, 0.018), cyan);
      tick.position.set(Math.sin(angle) * 1.7, Math.cos(angle) * 1.7, 0.02);
      tick.rotation.z = -angle;
      ticks.add(tick);
    }
    portal.add(ticks);
    world.add(portal);

    // The glowing platform remains under the avatar when the model loads.
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.83, 0.12, 48), steel);
    platform.position.set(-1.48, -0.02, 0);
    world.add(platform);
    const platformRing = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.035, 5, 72), cyan);
    platformRing.rotation.x = Math.PI / 2;
    platformRing.position.set(-1.48, 0.057, 0);
    world.add(platformRing);

    scene.add(new THREE.HemisphereLight(0xb2dfff, 0x22334b, 2.2));
    const key = new THREE.DirectionalLight(0xf5e4d4, 3.1);
    key.position.set(1, 5, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x24a9ff, 22, 10);
    rim.position.set(-3.3, 2.5, -0.5);
    scene.add(rim);

    loadFighterBody(fighter).then(async ({ model: next, clips, rigKey }) => {
      if (!active) { releaseFighterBody(next); return; }
      let prepared;
      try { prepared = await prepareIdlePreview({ model: next, bodyId: rigKey, classId, embeddedIdle: clips?.idle }); }
      catch (error) { releaseFighterBody(next); throw error; }
      if (!active) { prepared.dispose(); releaseFighterBody(next); return; }
      model = next;
      model.position.x -= 1.48;
      model.rotation.y = 0; // Assets are authored facing +Z, toward the camera.
      idlePose = prepared;
      scene.add(model); // reveal only after an authored idle or relaxed fallback was applied
    }).catch(() => {
      // A missing or damaged character GLB must not take the home menu down.
    });

    const resize = () => {
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
    } else {
      window.addEventListener('resize', resize);
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      if (!active) return;
      const dt = Math.min(0.05, clock.getDelta());
      if (!document.hidden) {
        idlePose?.update(dt);
        if (!reducedMotion) {
          portal.rotation.z += dt * 0.08;
          ticks.rotation.z -= dt * 0.18;
          platformRing.rotation.z += dt * 0.1;
        }
        renderer.render(scene, camera);
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      active = false;
      if (frameId != null) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      idlePose?.dispose();
      if (model) { scene.remove(model); releaseFighterBody(model); }
      // GLB geometry/materials are shared by the character loader's cache:
      // do not dispose them here. Only dispose geometry owned by this stage.
      world.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [fighter, classId]);

  return <div ref={mountRef} className="duelist-hangar-stage" aria-hidden="true" />;
}
