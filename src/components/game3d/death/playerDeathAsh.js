// Small GPU-friendly ash motes and reversible body opacity. No vertex shader,
// cloned skeleton or new render pass: compatible with the existing WebGL path.
import * as THREE from 'three';

const PARTICLES = 125;

export function createPlayerDeathAsh({ scene, model }) {
  const meshes = [];
  const saved = [];
  let motes = null;
  let elapsed = 0;
  let started = false;
  let finished = false;

  // Never mutate shared GLB/armor materials: each death takes temporary clones.
  const restore = () => {
    for (const { node, material, visible, castShadow } of saved) {
      const temporary = node.material;
      node.material = material;
      node.visible = visible;
      node.castShadow = castShadow;
      // The temporary opacity-capable clones are owned by this death effect.
      // Never dispose the original GLB/armor materials shared with the gear UI.
      const copies = Array.isArray(temporary) ? temporary : [temporary];
      copies.forEach(copy => copy?.dispose?.());
    }
    saved.length = 0;
    meshes.length = 0;
    if (motes) {
      motes.parent?.remove(motes);
      motes.geometry.dispose();
      motes.material.dispose();
      motes = null;
    }
    elapsed = 0;
    started = false;
    finished = false;
  };

  const begin = () => {
    if (started || !model) return;
    started = true;
    elapsed = 0;
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.isEmpty() ? 1.7 : Math.min(3, Math.max(.5, bounds.max.y - bounds.min.y));
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
      center.copy(model.position);
      center.y += height * .5;
    }
    model.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const original = node.material;
      const cloned = Array.isArray(original)
        ? original.map(m => m.clone()) : original.clone();
      saved.push({ node, material: original, visible: node.visible, castShadow: node.castShadow });
      node.material = cloned;
      node.castShadow = false;
      meshes.push({ node, materials: Array.isArray(cloned) ? cloned : [cloned] });
    });
    const positions = new Float32Array(PARTICLES * 3);
    const speeds = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      const p = i * 3, angle = (i * 2.399963229728653) % (Math.PI * 2);
      const radius = .12 + .54 * Math.sqrt((i + .5) / PARTICLES);
      positions[p] = center.x + Math.cos(angle) * radius;
      positions[p + 1] = center.y - height * .5 + (i % 31) / 30 * height;
      positions[p + 2] = center.z + Math.sin(angle) * radius;
      speeds[i] = .25 + (i % 11) * .065;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xaaa8a3, size: .035, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true,
    });
    motes = new THREE.Points(geometry, material);
    motes.frustumCulled = false;
    scene.add(motes);
    motes.userData.ashSpeeds = speeds;
  };

  const update = (delta, progress) => {
    if (!started || finished) return;
    const dt = Math.max(0, Math.min(.1, Number(delta) || 0));
    elapsed += dt;
    const t = Math.max(0, Math.min(1, Number(progress) || 0));
    // Body is solid for the fall, then disappears as the ash lifts away.
    const bodyOpacity = Math.max(0, 1 - t * t * (3 - 2 * t));
    for (const { node, materials } of meshes) {
      for (const mat of materials) {
        mat.transparent = true;
        mat.opacity = bodyOpacity;
        mat.depthWrite = bodyOpacity > .95;
      }
      if (t >= 1) node.visible = false;
    }
    if (motes) {
      const pos = motes.geometry.attributes.position;
      const speeds = motes.userData.ashSpeeds;
      for (let i = 0; i < PARTICLES; i++) {
        pos.array[i * 3 + 1] += dt * speeds[i];
        pos.array[i * 3] += dt * Math.sin(i * 1.7 + elapsed * 3) * .055;
      }
      pos.needsUpdate = true;
      motes.material.opacity = t < .8 ? Math.min(.76, t * 1.7) : Math.max(0, (.99 - t) * 3.8);
    }
    finished = t >= 1;
  };

  return { begin, update, reset: restore, dispose: restore, isStarted: () => started };
}
