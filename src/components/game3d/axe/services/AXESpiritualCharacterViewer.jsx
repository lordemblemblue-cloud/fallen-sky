import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createAvatarScene } from '@/components/onboarding/avatarPreviewScene';
import { useGameAvatar } from '../../useGameAvatar';

// A single shared Three.js avatar stage. The spiritual ornaments are actual
// 3D meshes parented to the loaded, equipment-aware avatar, not CSS pictures.
// They represent current level/wing path; no test values enter saved progress.
function clearAdornment(model) {
  const previous = model?.getObjectByName('axe-spiritual-preview-adornment');
  if (!previous) return;
  previous.parent?.remove(previous);
  previous.traverse(node => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material?.dispose());
  });
}

function adornAvatar(model, halo, wings, selectedWing) {
  if (!model) return;
  clearAdornment(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Number.isFinite(size.y) && size.y > .1 ? size.y : 1.8;
  // loadAvatarModel normalizes the avatar to 1.8m by scaling its root.
  // Ornament meshes are CHILDREN of that root; compensate for its scale
  // so crowns and wings fit Eve/Adam and custom GLB bodies alike.
  const rootScale = model.getWorldScale(new THREE.Vector3());
  const localHeight = height / Math.max(.001, Math.abs(rootScale.y));
  const scale = localHeight / 1.8;
  const group = new THREE.Group();
  group.name = 'axe-spiritual-preview-adornment';
  // The model is already fitted to the selected real character. Use its world
  // bounds for head/back anchors, then convert to local coordinates.
  const base = new THREE.Vector3(center.x, bounds.min.y + height * .69, center.z);
  group.position.copy(model.worldToLocal(base));
  const haloLevel = Math.max(0, Number(halo?.level) || 0);
  if (haloLevel > 0) {
    const tier = haloLevel >= 100 ? 4 : haloLevel >= 70 ? 3 : haloLevel >= 40 ? 2 : 1;
    const haloGroup = new THREE.Group();
    haloGroup.position.y = localHeight * .31;
    haloGroup.rotation.z = -.09;
    const ring = (radius, tube, y, opacity) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius * scale, tube * scale, 10, 72),
        new THREE.MeshStandardMaterial({
          color: 0xffe5a8, metalness: .56, roughness: .2,
          emissive: 0xf4dba4, emissiveIntensity: .45 + tier * .15,
          transparent: true, opacity, side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = Math.PI / 2.3;
      mesh.position.y = y * scale;
      haloGroup.add(mesh);
    };
    ring(.30, .025, 0, .94);
    if (tier >= 2) ring(.25, .012, .035, .70);
    if (tier >= 3) ring(.355, .008, -.012, .56);
    if (tier >= 4) ring(.39, .009, .03, .68);
    group.add(haloGroup);
  }
  const wing = selectedWing || wings?.equippedWing;
  if (wing) {
    const wingLevel = Math.max(0, Number(wing.level) || 0);
    const tier = wingLevel >= 130 ? 5 : wingLevel >= 100 ? 4
      : wingLevel >= 70 ? 3 : wingLevel >= 40 ? 2 : 1;
    const color = new THREE.Color(wing.color || '#b0dcff');
    const wingRoot = new THREE.Group();
    wingRoot.position.set(0, localHeight * .03, -.11 * scale);
    for (const side of [-1, 1]) {
      const count = 5 + tier * 2;
      for (let index = 0; index < count; index++) {
        const proportion = index / Math.max(1, count - 1);
        const length = (.36 + tier * .07 + (1 - proportion) * .16) * scale;
        const feather = new THREE.Mesh(
          new THREE.ConeGeometry((.062 + tier * .003) * scale, length, 5),
          new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: .17 + tier * .05,
            metalness: .12, roughness: .45, transparent: true,
            opacity: wingLevel > 0 ? .72 : .26,
            side: THREE.DoubleSide, depthWrite: false,
          }),
        );
        feather.position.set(
          side * (.12 + proportion * (.48 + tier * .06)) * scale,
          (-.13 + proportion * .36) * scale, -.07 * scale,
        );
        feather.rotation.z = -side * (.64 + proportion * .68);
        feather.rotation.y = side * .12;
        wingRoot.add(feather);
      }
    }
    group.add(wingRoot);
  }
  model.add(group);
}

export default function AXESpiritualCharacterViewer({ halo, wings, selectedWing }) {
  const config = useGameAvatar();
  const mount = useRef(null);
  const stage = useRef(null);
  const currentModel = useRef(null);
  const latest = useRef({ halo, wings, selectedWing });
  const [error, setError] = useState('');
  latest.current = { halo, wings, selectedWing };
  useEffect(() => {
    if (!mount.current) return undefined;
    let alive = true;
    currentModel.current = null;
    setError('');
    const viewer = createAvatarScene(mount.current, {
      config, url: config.model_url, orbit: true,
      onReady: model => {
        if (!alive) return;
        currentModel.current = model;
        adornAvatar(model, latest.current.halo, latest.current.wings, latest.current.selectedWing);
      },
      onError: () => { if (alive) setError('Character model unavailable in this preview.'); },
    });
    stage.current = viewer;
    return () => {
      alive = false;
      currentModel.current = null;
      stage.current = null;
      viewer.dispose();
    };
    // The shared stage updates equipment/appearance without remounting its
    // WebGL context; remount only when the actual character model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.model_url, config.creator_body]);
  useEffect(() => { stage.current?.setAppearance(config); }, [config]);
  useEffect(() => {
    adornAvatar(currentModel.current, halo, wings, selectedWing);
  }, [halo, wings, selectedWing]);
  return <div ref={mount} className="axe-spiritual-player-model"
    role="img" aria-label="Rotatable three-dimensional character and spiritual progression preview">
    {error && <p className="axe-spiritual-model-error" role="status">{error}</p>}
  </div>;
}
