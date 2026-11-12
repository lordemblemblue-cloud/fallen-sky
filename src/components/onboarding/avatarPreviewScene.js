// Shared three.js stage for every avatar preview: the creator stage, the HUD
// portrait and the equipment preview all mount the same scene so the character
// looks identical wherever it appears.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyPlayerAppearance, disposeAvatarModel, loadAvatarModel } from './avatarAssetRuntime';

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
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
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
    if (controls) {
      controls.target.set(0, shot === 'face' ? 1.62 : 1.05, 0);
      camera.position.set(Math.sin(spin) * 1.2, shot === 'face' ? 1.66 : 1.35, shot === 'face' ? 1.15 : 3.2);
      controls.update();
      return;
    }
    camera.position.set(Math.sin(spin) * 0.9, shot === 'face' ? 1.63 : 1.25, shot === 'face' ? 1.0 : 3.05);
    camera.lookAt(0, shot === 'face' ? 1.6 : 1.0, 0);
  };
  frameCamera();

  const tick = () => {
    if (disposed) return;
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
      const loaded = await loadAvatarModel(url || config, 1.8);
      if (disposed) {
        disposeAvatarModel(loaded);
        return;
      }
      model = loaded;
      scene.add(model);
      frameCamera();
      onReady?.(model);
    } catch (error) {
      onError?.(error);
    }
  })();

  return {
    setAppearance(next) {
      if (model && next) applyPlayerAppearance(model, next);
    },
    setShot(next) {
      if (next) shot = next;
      frameCamera();
    },
    setExpression(morphs) {
      if (model) applyMorphs(model, morphs);
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