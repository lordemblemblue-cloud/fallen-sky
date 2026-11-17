import * as THREE from 'three';
import { buildCaveExterior, exteriorCameraViews } from '../../src/components/game3d/cave/exterior/buildExterior.js';
import { ensureCaveExteriorGrade } from '../../src/components/game3d/cave/exterior/terrainGrade.js';
import { wolfveilHeight } from '../../src/components/game3d/wolfveil/WolfveilLayout.js';

ensureCaveExteriorGrade();
const built = buildCaveExterior();
const views = exteriorCameraViews(built.approach);
const viewName = new URLSearchParams(location.search).get('view') === 'mouth' ? 'mouth' : 'path';
const view = views[viewName];

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7c6cc);
scene.fog = new THREE.Fog(0xb7c6cc, 40, 210);
scene.add(built.group);

const hemi = new THREE.HemisphereLight(0xd5e4ea, 0x3e4a32, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 1.55);
sun.position.set(-80, 70, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

const bounds = built.approach.bounds;
const step = 2.4;
const cols = Math.ceil((bounds.maxX - bounds.minX) / step);
const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step);
const positions = [];
const colors = [];
const indices = [];
const heightAt = (ix, iz) => wolfveilHeight(
  bounds.minX + Math.max(0, Math.min(cols, ix)) * step,
  bounds.minZ + Math.max(0, Math.min(rows, iz)) * step,
);
for (let iz = 0; iz <= rows; iz++) {
  for (let ix = 0; ix <= cols; ix++) {
    const x = bounds.minX + ix * step;
    const z = bounds.minZ + iz * step;
    const y = heightAt(ix, iz);
    positions.push(x, y, z);
    const slope = Math.abs(heightAt(ix + 1, iz) - heightAt(ix - 1, iz))
      + Math.abs(heightAt(ix, iz + 1) - heightAt(ix, iz - 1));
    const n = 0.85 + 0.3 * Math.abs(Math.sin(x * 0.17 + z * 0.11));
    const rock = Math.min(1, slope / 5.5);
    const grass = 1 - rock;
    colors.push(
      (0.32 * grass + 0.46 * rock) * n,
      (0.48 * grass + 0.44 * rock) * n,
      (0.26 * grass + 0.38 * rock) * n,
    );
  }
}
const stride = cols + 1;
for (let iz = 0; iz < rows; iz++) {
  for (let ix = 0; ix < cols; ix++) {
    const a = iz * stride + ix;
    indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
  }
}
const groundGeo = new THREE.BufferGeometry();
groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
groundGeo.setIndex(indices);
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.95, metalness: 0,
}));
ground.receiveShadow = true;
ground.name = 'AshenCliff_PreviewGround';
scene.add(ground);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(...view.position);
camera.lookAt(...view.target);
sun.target.position.set(built.entrance.position.x, built.entrance.position.y, built.entrance.position.z);
scene.add(sun.target);
sun.shadow.camera.position?.copy?.(sun.position);

let frames = 0;
function frame() {
  built.update(0.016);
  renderer.render(scene, camera);
  frames += 1;
  if (frames < 6) requestAnimationFrame(frame);
  else window.__ashenCliffReady = true;
}
frame();
