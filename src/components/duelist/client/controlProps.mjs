// Simple test markers for Three-Point Control. These are NOT an authored map:
// positions come from the server match rules and can later be supplied by the
// finished maps without changing the scoring or capture code.
/* global document */
import * as THREE from 'three';
import { CONTROL } from '../sim/control.mjs';

const COLORS = Object.freeze({ neutral: 0xb6cad6, red: 0xff746c, blue: 0x69b9ff });

function makeLabel(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 83px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#071726';
  ctx.strokeText(letter, 64, 66);
  ctx.fillStyle = '#f2f5f5';
  ctx.fillText(letter, 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.45, 1.45, 1);
  return { sprite, texture, material };
}

export function createControlProps(scene) {
  const group = new THREE.Group();
  const resources = [];
  const points = new Map();
  for (const id of CONTROL.pointIds) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.neutral, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
    });
    const ringGeometry = new THREE.RingGeometry(CONTROL.radius - 0.13, CONTROL.radius, 64);
    resources.push(ringMaterial, ringGeometry);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    const marker = makeLabel(id);
    resources.push(marker.texture, marker.material);
    marker.sprite.position.y = 3.1;
    const anchor = new THREE.Group();
    anchor.add(ring, marker.sprite);
    group.add(anchor);
    points.set(id, { anchor, ringMaterial });
  }
  scene.add(group);
  return {
    update(state = []) {
      const byId = new Map(state?.map(point => [point.id, point]) || []);
      for (const [id, { anchor, ringMaterial }] of points) {
        const point = byId.get(id);
        anchor.visible = !!point;
        if (!point) continue;
        anchor.position.set(point.x, 0, point.z);
        const color = point.owner === 'red' ? COLORS.red : point.owner === 'blue' ? COLORS.blue : COLORS.neutral;
        ringMaterial.color.setHex(color);
        ringMaterial.opacity = point.contested ? 0.35 : point.capturing ? 0.95 : 0.65;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
