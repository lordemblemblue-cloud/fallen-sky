import * as THREE from 'three';
import { createSharedEffectLight } from './sharedEffectLight.mjs';

const LIGHT_BEAM_URL = 'https://base44.app/api/apps/6876751a602125f45f1861b9/files/mp/public/6876751a602125f45f1861b9/1dec4b137_appearance_effect_light_beam.glb';
let lightBeamPromise = null;

function loadBeam(loader) {
  if (!lightBeamPromise) {
    lightBeamPromise = new Promise((resolve) => {
      loader.load(LIGHT_BEAM_URL, (gltf) => resolve(gltf?.scene || null), undefined, () => resolve(null));
    });
  }
  return lightBeamPromise;
}

const BEAM_LIGHT_COLOR = new THREE.Color(0x8eeaff);
const BEAM_LIGHT_HEIGHT = 0.7; // above the beam's ring
const beamLightPosition = new THREE.Vector3();

/** The beams' one light (vfx/sharedEffectLight.mjs); GameWorld3D creates it with the world. */
export function createPlayerCastLight(scene) {
  return createSharedEffectLight(scene, { name: 'PlayerCastLight', distance: 5 });
}

export function createPlayerCastLightBeam({ scene, loader, playerRef, getGroundY, duration = 0.45, castLight = null }) {
  const group = new THREE.Group();
  group.name = 'PlayerCastLightBeam';

  const ringGeo = new THREE.RingGeometry(0.55, 1.35, 80);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const coreGeo = new THREE.CylinderGeometry(0.22, 0.55, 2.8, 32, 1, true);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xbef7ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 1.35;
  group.add(core);

  // GameWorld3D passes its shared castLight, so a cast never changes the scene's light count; without one the beam
  // brings a light of its own, added and removed with it.
  const ownLight = castLight ? null : createPlayerCastLight(scene);
  const light = castLight || ownLight;
  scene.add(group);

  let t = 0;
  let cancelled = false;
  let disposed = false;
  let asset = null;
  const onCancel = () => { cancelled = true; };
  window.addEventListener('playerSkillCastCancel', onCancel);

  loadBeam(loader).then((src) => {
    // The first cast can outlast its GLB load; never attach the asset to a cancelled or disposed beam.
    if (!src || cancelled || disposed) return;
    asset = src.clone(true);
    asset.scale.setScalar(1.05);
    asset.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((mat) => {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.blending = THREE.AdditiveBlending;
      });
    });
    group.add(asset);
  });

  return {
    update(delta) {
      t += delta;
      const player = playerRef?.current;
      if (!player || cancelled) return;
      const y = getGroundY?.(player.position.x, player.position.z) ?? player.position.y;
      group.position.set(player.position.x, y + 0.04, player.position.z);
      group.rotation.y += delta * 1.9;
      const fadeIn = Math.min(1, t / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (duration - t) / 0.16));
      const alpha = Math.min(fadeIn, fadeOut);
      const pulse = 1 + Math.sin(t * 18) * 0.045;
      ring.scale.setScalar(pulse);
      core.scale.set(1 + Math.sin(t * 11) * 0.04, 1, 1 + Math.sin(t * 11) * 0.04);
      ringMat.opacity = 0.7 * alpha;
      coreMat.opacity = 0.42 * alpha;
      light.set(group, 1.8 * alpha, BEAM_LIGHT_COLOR,
        beamLightPosition.set(group.position.x, group.position.y + BEAM_LIGHT_HEIGHT, group.position.z));
      if (asset) asset.visible = alpha > 0.03;
    },
    alive() { return !cancelled && !disposed && t < duration; },
    // GameWorld3D disposes the beam once it is no longer alive (vfx/activeEffects.mjs); safe to call again.
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('playerSkillCastCancel', onCancel);
      light.release(group);
      ownLight?.dispose();
      scene.remove(group);
      ringGeo.dispose(); ringMat.dispose();
      coreGeo.dispose(); coreMat.dispose();
    },
  };
}