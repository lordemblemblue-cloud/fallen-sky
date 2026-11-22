/* global document */
import * as THREE from 'three';
import { createControlObservatory } from './controlObservatory.mjs';
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

export function createControlProps(scene, radius) {
  const group = new THREE.Group();
  const resources = [];
  group.name = 'Meridian Observatory';
  const layPaths = createControlObservatory(group, radius, resources);
  const beacon = new THREE.OctahedronGeometry(0.30);
  resources.push(beacon);
  const plate = new THREE.CylinderGeometry(CONTROL.radius, CONTROL.radius, 0.04, 12);
  const deck = new THREE.MeshStandardMaterial({ color: 0x243b50, metalness: 0.48, roughness: 0.58 });
  const dial = new THREE.RingGeometry(1.06, 1.19, 12);
  const brass = new THREE.MeshBasicMaterial({ color: 0xceb47c });
  resources.push(plate, deck, dial, brass);
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
    const base = new THREE.Mesh(plate, deck);
    base.position.y = 0.012;
    const centre = new THREE.Mesh(dial, brass);
    centre.rotation.x = -Math.PI / 2;
    centre.position.y = 0.05;
    const progress = new THREE.RingGeometry(CONTROL.radius - 0.48, CONTROL.radius - 0.26, 64);
    progress.rotateX(-Math.PI / 2);
    const fill = new THREE.MeshBasicMaterial();
    resources.push(progress, fill);
    const arc = new THREE.Mesh(progress, fill);
    arc.position.y = 0.052;
    const beaconLight = new THREE.MeshBasicMaterial({ color: COLORS.neutral });
    resources.push(beaconLight);
    const prism = new THREE.Mesh(beacon, beaconLight);
    prism.scale.y = 1.55;
    prism.position.y = 2.27;
    anchor.add(base, centre, arc, ring, prism, marker.sprite);
    group.add(anchor);
    points.set(id, { anchor, ringMaterial, progress, fill, beaconLight });
  }
  scene.add(group);
  return {
    update(state = []) {
      const byId = new Map(state?.map(point => [point.id, point]) || []);
      group.visible = byId.size > 0;
      layPaths(CONTROL.pointIds.map(id => byId.get(id)));
      for (const [id, { anchor, ringMaterial, progress, fill, beaconLight }] of points) {
        const point = byId.get(id);
        anchor.visible = !!point;
        if (!point) continue;
        anchor.position.set(point.x, 0, point.z);
        const color = point.owner === 'red' ? COLORS.red : point.owner === 'blue' ? COLORS.blue : COLORS.neutral;
        ringMaterial.color.setHex(point.contested ? 0xffc65c : color);
        beaconLight.color.copy(ringMaterial.color);
        fill.color.setHex(COLORS[point.capturing] ?? COLORS.neutral);
        progress.setDrawRange(0, 6 * Math.round(64 * Math.max(0, Math.min(1, point.progress || 0))));
        ringMaterial.opacity = point.contested ? 0.95 : point.capturing ? 0.95 : 0.65;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
