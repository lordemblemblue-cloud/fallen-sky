import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createSceneRenderer, destroySceneRenderer, isSceneRendererReady, sceneRendererApi, onSceneDeviceLost } from '../../../lib/webgpuSceneRenderer.js';
import { loadFighterBody } from '../client/assets.mjs';
import { prepareIdlePreview } from './idlePreview.mjs';

/**
 * Small, optional WebGL stage for the menu only.
 * Gameplay renderer and WebGPU migration paths are deliberately untouched.
 * The CSS hangar remains visible if WebGL or a character asset fails to load.
 */
export default function DuelistHangarStage({ fighter = 'maskedWarrior', classId = 'duelist', headquarters = false, onHqStatus }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === 'undefined') return undefined;
    let renderer, ready;
    try {
      ({ renderer, ready } = createSceneRenderer('duelist-adventure', { alpha: true, antialias: true, powerPreference: 'low-power' }));
    } catch (error) {
      if (headquarters) onHqStatus?.({ state: 'fallback', message: String(error?.message || error).slice(0, 200) });
      return undefined;
    }

    let active = true;
    let frameId = null;
    let idlePose = null;
    let model = null;
    let observer = null;
    let hq = null;
    let reportElapsed = 0;
    let hqFailed = false;
    let gpuFailed = false;
    let hqFramed = headquarters;
    let modelOrigin = null;
    let modelRotation = null;
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x071426, 0.026);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
    camera.position.set(0, 1.65, 5.8);
    camera.lookAt(-0.6, 1.18, 0);
    if (headquarters) frameHQCamera();
    // The fighter and HQ use the same metre-scale scene and depth buffer.
    const fighterAnchor = new THREE.Group();
    fighterAnchor.name = 'HQ_SelectedFighterAnchor';
    scene.add(fighterAnchor);

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
    world.visible = !headquarters;
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

    loadFighterBody(fighter).then(async ({ model: next, clips }) => {
      if (!active) return;
      const prepared = await prepareIdlePreview({ model: next, bodyId: fighter, classId, embeddedIdle: clips?.idle });
      if (!active) { prepared.dispose(); return; }
      model = next;
      modelOrigin = model.position.clone();
      modelRotation = model.rotation.clone();
      placeFighter();
      idlePose = prepared;
      fighterAnchor.add(model); // actual 3D scene, not a foreground viewer or HTML overlay
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
    const originalCamera = new THREE.Vector3(0, 1.65, 5.8);
    function frameHQCamera() {
      // A standing eye-level camera, inside the actual hall, looking slightly
      // left so the selected fighter is clear of the menu copy on the left.
      camera.position.set(0, 1.7, 8.4);
      camera.fov = 50;
      camera.lookAt(-0.75, 1.0, 4);
      camera.updateProjectionMatrix();
    }
    function placeFighter() {
      if (!model || !modelOrigin) return;
      model.position.copy(modelOrigin);
      model.rotation.copy(modelRotation);
      fighterAnchor.position.set(hqFramed ? 0 : -1.48, hqFramed ? 0.014 : 0, hqFramed ? 4 : 0);
      fighterAnchor.rotation.y = Math.atan2(camera.position.x - fighterAnchor.position.x, camera.position.z - fighterAnchor.position.z);
    }
    function showOriginal() {
      hqFramed = headquarters;
      scene.background = null;
      world.visible = !headquarters;
      portal.visible = true;
      if (headquarters) {
        frameHQCamera();
      } else {
        camera.position.copy(originalCamera);
        camera.fov = 42;
        camera.lookAt(-0.6, 1.18, 0);
      }
      camera.updateProjectionMatrix();
      placeFighter();
    }
    function failHQ(error) {
      hqFailed = true;
      hq?.disposeGuildHeadquarters();
      hq = null;
      showOriginal();
      onHqStatus?.({ state: 'fallback', message: String(error?.message || error).slice(0, 200) });
    }
    function failGPU(error) {
      if (!active || gpuFailed) return;
      gpuFailed = true;
      failHQ(error);
      renderer.domElement.style.visibility = 'hidden';
      if (frameId != null) window.cancelAnimationFrame(frameId);
    }
    const removeLossListener = onSceneDeviceLost(renderer, failGPU);
    ready?.catch(failGPU);
    // Load the default Home environment only in the browser, only on HOME. The existing
    // character, scene, renderer, and single RAF remain the owners of rendering.
    if (headquarters) {
      onHqStatus?.({ state: 'loading' });
      import('./experimentalGuildHQ.js').then(({ createGuildHeadquarters }) => {
        if (!active || gpuFailed) return;
        hq = createGuildHeadquarters(THREE, scene, {
          quality: window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'performance',
          onFallback: (still) => { if (still && active) { showOriginal(); onHqStatus?.({ state: 'fallback', message: 'Sustained slow frames: stationary HQ retained behind fighter.' }); } },
        });
        // Keep the 36m headquarters at its actual authored scale. The fighter
        // stands on its real floor and shares the camera, lights and depth.
        world.visible = false;
        hqFramed = true;
        scene.background = new THREE.Color(0xb5d5eb);
        frameHQCamera();
        placeFighter();
        if (reducedMotion) hq.setAmbientSystemsEnabled(false);
      }).catch(error => { if (active) failHQ(error); });
    }
    const tick = () => {
      if (!active || gpuFailed) return;
      const elapsed = clock.getDelta();
      const dt = Math.min(0.05, elapsed);
      if (!document.hidden) {
        idlePose?.update(dt);
        if (!reducedMotion && world.visible) {
          portal.rotation.z += dt * 0.08;
          ticks.rotation.z -= dt * 0.18;
          platformRing.rotation.z += dt * 0.1;
        }
        if (isSceneRendererReady(renderer)) {
          try {
            if (hq && !hqFailed) {
              hq.updateGuildHeadquarters(dt);
              if (elapsed < 0.5) hq.reportHostFrameTime(elapsed * 1000, elapsed);
            }
            renderer.render(scene, camera);
            if (hq && !hqFailed) {
              reportElapsed += elapsed;
              if (reportElapsed >= 1) {
                reportElapsed = 0;
                const stats = hq.getHeadquartersPerformanceStats();
                onHqStatus?.({ ...stats, state: stats.stationary ? 'fallback' : 'active', backend: sceneRendererApi(renderer), frameMs: elapsed * 1000 });
              }
            }
          } catch (error) {
            if (hq) failHQ(error);
            else if (headquarters && !hqFailed) failHQ(error);
            else { failGPU(error); return; }
          }
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      active = false;
      if (frameId != null) window.cancelAnimationFrame(frameId);
      removeLossListener();
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      hq?.disposeGuildHeadquarters();
      idlePose?.dispose();
      if (model) fighterAnchor.remove(model);
      scene.remove(fighterAnchor);
      // GLB geometry/materials are shared by the character loader's cache:
      // do not dispose them here. Only dispose geometry owned by this stage.
      world.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
      materials.forEach((material) => material.dispose());
      destroySceneRenderer(renderer);
      renderer.domElement.remove();
    };
  }, [fighter, classId, headquarters, onHqStatus]);

  return <div ref={mountRef} className="duelist-hangar-stage" aria-hidden="true" style={headquarters ? { background: 'url(https://media.base44.com/images/public/6af625cd654fa5b8954442ce/6d80d4d1d58c183223eebfce3d778043_scene.png) center / cover no-repeat #151e2a', pointerEvents: 'none' } : undefined} />;
}
