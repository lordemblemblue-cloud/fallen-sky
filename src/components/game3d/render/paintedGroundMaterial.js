import * as THREE from 'three';

// A small, deterministic pigment tile for the existing flat sandbox ground. Broad jade/moss washes and
// directional brush grain are anchored in its UVs, so they stay still as the camera moves. No geometry changes.
export function createPaintedGroundMaterial() {
  const size = 256, data = new Uint8Array(size * size * 4);
  const jade = [58, 114, 72], moss = [111, 151, 65], straw = [165, 163, 91];
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * tau, v = y / size * tau;
    // Periodic fields keep the repeating tile seamless. Brush modulation is restrained, not a checkerboard.
    const wash = 0.5 + 0.22 * Math.sin(u + 0.8 * Math.sin(v)) + 0.18 * Math.cos(2 * v - Math.sin(u));
    const dry = Math.max(0, Math.sin(3 * u + Math.sin(2 * v)) * Math.cos(4 * v)) * 0.22;
    const grain = 1 + 0.035 * Math.sin(19 * v + 2 * Math.sin(3 * u)) + 0.018 * Math.cos(43 * v + Math.sin(7 * u));
    const offset = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) {
      const pigment = jade[c] + (moss[c] - jade[c]) * wash;
      data[offset + c] = Math.round((pigment + (straw[c] - pigment) * dry) * grain);
    }
    data[offset + 3] = 255;
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.name = 'Ground jade and moss pigment'; map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(16, 16);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  material.name = 'Painted grass wash';
  material.addEventListener('dispose', () => map.dispose());
  return material;
}
