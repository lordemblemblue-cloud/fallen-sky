// Shared three.js stage for every avatar preview: the creator stage, the HUD
// portrait and the equipment preview all mount the same scene so the character
// looks identical wherever it appears.
import * as THREE from 'three';
import { createSceneRenderer } from '../../lib/webgpuSceneRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyPlayerAppearance, disposeAvatarModel, loadAvatarModel } from './avatarAssetRuntime';
import { creatorBody } from './avatarCustomization';

export function applyMorphs(model, morphs = {}) {
  if (!model || !morphs) return;
  model.traverse((node) => {
    if (!node.isMesh || !node.morphTargetDictionary) return;
    Object.entries(morphs).forEach(([name, value]) => {
      const index = node.morphTargetDictionary[name];
      if (index !== undefined && Number.isFinite(Number(value))) node.morphTargetInfluences[index] = Number(value);
    });
  });
}

export function createAvatarScene(mount, options = {}) {
  const { url, config = {}, portrait = false, orbit = true, onReady, onError } = options;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(portrait ? 26 : 38, 1, 0.05, 60);
  const renderer = createSceneRenderer('fallen-sky', { antialias: true, alpha: true }).renderer;
  // Compact Game 3D viewers may coexist on phones. Keep the draw buffer
  // smaller than the full world and avoid multiple 2x offscreen canvases.
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdaf0ff, 0x2a1b12, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.6, 4.2, 3.2);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb9ff, 1.2);
  rim.position.set(-3.2, 2.4, -2.6);
  scene.add(rim);

  const controls = orbit && !portrait ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) {
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 6;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.9;
  }

  let model = null;
  let latestAppearance = config;
  let latestExpression = {};
  let mixer = null;
  const clock = new THREE.Clock();
  let disposed = false;
  let frame = 0;
  let shot = portrait ? 'face' : 'body';
  let spin = 0;

  const resize = () => {
    const box = mount.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  const frameCamera = () => {
    const targets={face:[1.62,1.66,1.15],upper:[1.35,1.4,1.7],hips:[.83,.9,1.8],body:[1.05,1.35,3.2],back:[1.05,1.35,3.2]};
    const [targetY,eyeY,distance]=targets[shot]||targets.body;
    if (controls) {
      controls.target.set(0, targetY, 0);
      camera.position.set(Math.sin(spin) * 1.2, eyeY, distance);
      controls.update();
      return;
    }
    camera.position.set(Math.sin(spin) * 0.9, eyeY, distance);
    camera.lookAt(0, targetY, 0);
  };
  frameCamera();

  const tick = () => {
    if (disposed) return;
    mixer?.update(Math.min(clock.getDelta(), .1));
    if (model) {
      model.traverse(node => { if (node.morphTargetDictionary) for (const [name,index] of Object.entries(node.morphTargetDictionary)) if (name.startsWith('FX_')) node.morphTargetInfluences[index] = latestExpression[name] || 0; });
    }
    controls?.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  (async () => {
    if (!url && !config) {
      onError?.(new Error('No avatar model available.'));
      return;
    }
    try {
      const activeAppearance = latestAppearance || config;
      const fused = creatorBody(activeAppearance);
      // Loading by URL string alone loses the female/Adam rig identity and
      // leaves fitted armor detached. Pass the WHOLE appearance and approved
      // world GLB URL when rendering a saved fused Game 3D character.
      const isFused = Boolean(fused && url && url === activeAppearance.model_url);
      const loaded = await loadAvatarModel(
        isFused ? activeAppearance : (url || activeAppearance),
        1.8, isFused ? url : null,
      );
      if (disposed) {
        disposeAvatarModel(loaded);
        return;
      }
      model = loaded;
      scene.add(model);
      // Honor equipment changes made while the body was still loading.
      applyPlayerAppearance(model, latestAppearance);
      const idle = model.animations?.find(clip => /^(stand|idle)$/i.test(clip.name));
      if (idle) { mixer = new THREE.AnimationMixer(model); mixer.clipAction(idle).play(); }
      frameCamera();
      onReady?.(model);
    } catch (error) {
      if (!disposed) onError?.(error);
    }
  })();

  return {
    setAppearance(next) {
      latestAppearance = next || {};
      if (model) applyPlayerAppearance(model, latestAppearance);
    },
    setShot(next) {
      if (next) shot = ['head','face'].includes(next) ? 'face' : next;
      if (model) model.rotation.y = next === 'back' ? Math.PI : 0;
      frameCamera();
    },
    setExpression(morphs) {
      latestExpression = morphs || {};
      if (model) applyMorphs(model, latestExpression);
    },
    rotate(amount) {
      spin += Number(amount) || 0;
      frameCamera();
    },
    resetView() {
      spin = 0;
      controls?.reset?.();
      frameCamera();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls?.dispose();
      mixer?.stopAllAction();
      if (model) {
        scene.remove(model);
        disposeAvatarModel(model);
        model = null;
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export default createAvatarScene;