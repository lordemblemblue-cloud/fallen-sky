// A head-and-shoulders picture of a fighter for the HUD's portrait frame, taken from the live scene: the fighter
// alone (on a layer of its own), lit by the arena's lights, drawn into a corner of the canvas and copied out
// before the frame's own picture is drawn over it. Returns a data URL, or null where it cannot be taken.
/* global document */
import * as THREE from 'three';

const LAYER = 7;
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
camera.layers.set(LAYER);
const head = new THREE.Vector3();
const viewport = new THREE.Vector4();
const scissor = new THREE.Vector4();
const clearColor = new THREE.Color();

export function takePortrait(renderer, scene, actor, { size = 192 } = {}) {
  const bone = actor?.model?.getObjectByName('mixamorigHead');
  if (!bone || typeof document === 'undefined') return null;
  actor.group.updateMatrixWorld(true);
  bone.getWorldPosition(head);
  actor.group.traverse((o) => o.layers.enable(LAYER));
  scene.traverse((o) => { if (o.isLight) o.layers.enable(LAYER); });
  // from the front, a little to one side, at the height of the face
  const yaw = actor.group.rotation.y + 0.35;
  camera.position.set(head.x + Math.sin(yaw) * 1.15, head.y + 0.08, head.z + Math.cos(yaw) * 1.15);
  camera.lookAt(head.x, head.y + 0.05, head.z);
  camera.updateMatrixWorld();
  const canvas = renderer.domElement;
  const ratio = renderer.getPixelRatio();
  const px = Math.min(size, canvas.width, canvas.height);
  if (px < 32) return null;
  renderer.getViewport(viewport);
  renderer.getScissor(scissor);
  const scissorTest = renderer.getScissorTest();
  const alpha = renderer.getClearAlpha();
  renderer.getClearColor(clearColor);
  const background = scene.background;
  let url = null;
  try {
    scene.background = null;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, px / ratio, px / ratio);
    renderer.setScissor(0, 0, px / ratio, px / ratio);
    renderer.setScissorTest(true);
    renderer.setClearColor(0x101826, 1);
    renderer.clear();
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = px;
    out.height = px;
    const pen = out.getContext('2d');
    pen.filter = 'brightness(1.7) contrast(1.05) saturate(1.1)'; // the arena is dark: a portrait wants a lit face
    pen.drawImage(canvas, 0, canvas.height - px, px, px, 0, 0, px, px); // the viewport's corner is the canvas's bottom left
    url = out.toDataURL('image/jpeg', 0.88);
  } catch {
    url = null;
  } finally {
    scene.background = background;
    renderer.setClearColor(clearColor, alpha);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
  }
  return url;
}
