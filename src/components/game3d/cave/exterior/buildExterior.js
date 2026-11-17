// Meshes for the Ashen Cliff approach: the walkable ribbon, the rock mouth,
// and the dressing planned beside the path. Decorative meshes are not part
// of the foot raycast. Only the ribbon is.
import * as THREE from 'three';
import { WolfveilTriangles } from '../../wolfveil/WolfveilGeometry.js';
import { wolfveilHeight } from '../../wolfveil/WolfveilLayout.js';
import { createCaveExteriorMaterials } from './materials.js';
import { approachHalfWidth, getAshenCliffApproach } from './approachPlan.js';
import { ensureCaveExteriorGrade } from './terrainGrade.js';

const hash = (a, b, c = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function pathTint(x, z, along, edge) {
  const n = hash(x, z, along);
  if (along < -2.4) {
    const cave = 0.34 + n * 0.08;
    return [cave * 0.95, cave * 0.9, cave * 0.82];
  }
  if (edge) return [0.42 + n * 0.05, 0.36, 0.26];
  if (n > 0.84) return [0.4, 0.5, 0.32];
  if (Math.sin(along * 0.13 + n * 4) > 0.45) return [0.72, 0.66, 0.56];
  return [0.62 + n * 0.08, 0.48 + n * 0.05, 0.32];
}

function layRibbon(tris, points) {
  const toMouth = new Array(points.length).fill(0);
  const threshold = Math.max(0, points.findIndex(point => point.kind === 'threshold'));
  for (let i = threshold - 1; i >= 0; i--) {
    toMouth[i] = toMouth[i + 1] + Math.hypot(
      points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  for (let i = threshold + 1; i < points.length; i++) {
    toMouth[i] = toMouth[i - 1] - Math.hypot(
      points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  const lift = 0.14;
  const edgeAt = (point, distance, kind) => {
    const half = approachHalfWidth(distance, kind);
    return { half, y: point.y + lift };
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) continue;
    const tx = dx / distance, tz = dz / distance;
    const lx = -tz, lz = tx;
    const steps = Math.max(1, Math.ceil(distance / 1.15));
    let prev = null;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const point = {
        x: a.x + dx * t, z: a.z + dz * t, y: a.y + (b.y - a.y) * t,
      };
      const distanceToMouth = toMouth[i - 1] + (toMouth[i] - toMouth[i - 1]) * t;
      const spec = edgeAt(point, distanceToMouth, t > 0.5 ? b.kind : a.kind);
      const left = [point.x + lx * spec.half, spec.y, point.z + lz * spec.half];
      const right = [point.x - lx * spec.half, spec.y, point.z - lz * spec.half];
      const lip = 0.32;
      const sample = {
        left, right,
        leftLip: [left[0] + lx * lip, spec.y + 0.02, left[2] + lz * lip],
        rightLip: [right[0] - lx * lip, spec.y + 0.02, right[2] - lz * lip],
        along: distanceToMouth,
      };
      if (prev) {
        const mid = pathTint(point.x, point.z, distanceToMouth, false);
        const edge = pathTint(point.x, point.z, distanceToMouth, true);
        // Order is counterclockwise from above so the tread faces the sky.
        tris.quad(prev.left, sample.left, sample.right, prev.right, mid, [
          [0, prev.along * 0.15], [0, sample.along * 0.15],
          [1, sample.along * 0.15], [1, prev.along * 0.15],
        ]);
        tris.quad(prev.leftLip, sample.leftLip, sample.left, prev.left, edge);
        tris.quad(prev.right, sample.right, sample.rightLip, prev.rightLip, edge);
      }
      prev = sample;
    }
  }
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const prev = points[i - 1], next = points[i + 1];
    const ax = point.x - prev.x, az = point.z - prev.z;
    const bx = next.x - point.x, bz = next.z - point.z;
    const al = Math.hypot(ax, az) || 1, bl = Math.hypot(bx, bz) || 1;
    const dot = (ax / al) * (bx / bl) + (az / al) * (bz / bl);
    if (dot > 0.9) continue;
    const half = approachHalfWidth(toMouth[i], point.kind) * 0.98;
    const center = [point.x, point.y + lift, point.z];
    const slices = 10;
    for (let k = 0; k < slices; k++) {
      const a0 = (Math.PI * 2 * k) / slices;
      const a1 = (Math.PI * 2 * (k + 1)) / slices;
      const ring = (angle) => [
        point.x + Math.cos(angle) * half,
        point.y + lift,
        point.z + Math.sin(angle) * half,
      ];
      tris.tri(center, ring(a0), ring(a1), pathTint(point.x, point.z, toMouth[i], false));
    }
  }
}

function archPoint(entrance, lateral, up, along) {
  const { x, y, z } = entrance.position;
  const ix = entrance.inward.x, iz = entrance.inward.z;
  const sx = -iz, sz = ix;
  return [x + sx * lateral + ix * along, y + up, z + sz * lateral + iz * along];
}

function buildArch(tris, entrance) {
  const half = entrance.opening.width / 2;
  const crown = entrance.opening.height;
  const spring = crown * 0.46;
  const samples = 28;
  const profile = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    let lx, ly;
    if (t < 0.2) {
      lx = -half;
      ly = spring * (t / 0.2);
    } else if (t > 0.8) {
      lx = half;
      ly = spring * (1 - (t - 0.8) / 0.2);
    } else {
      const u = (t - 0.2) / 0.6;
      const ang = Math.PI * (1 - u);
      lx = Math.cos(ang) * half;
      ly = spring + Math.sin(ang) * (crown - spring);
    }
    const jag = (hash(i, lx, ly) - 0.5) * 0.42;
    profile.push({
      lx: lx + jag * 0.25,
      ly: Math.max(0.05, ly + (ly > 1 ? jag : 0)),
      spring,
    });
  }
  const outward = (p) => {
    if (p.ly <= p.spring + 0.05) return { x: Math.sign(p.lx || -1), y: 0.08 };
    const dx = p.lx, dy = p.ly - p.spring;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  const rings = [
    { extra: 0.2, along: -0.55 },
    { extra: 1.6, along: -2.1 },
    { extra: 3.4, along: -0.15 },
    { extra: 6.2, along: 3.1 },
  ];
  const at = (p, ring, salt) => {
    const n = outward(p);
    const jag = (hash(p.lx, p.ly, salt) - 0.5) * 0.55;
    const lateral = p.lx + n.x * (ring.extra + jag);
    const up = p.ly + n.y * ring.extra + Math.max(0, jag) * 0.35;
    return archPoint(entrance, lateral, up, ring.along + jag * 0.2);
  };
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let i = 0; i < profile.length - 1; i++) {
      const shade = 0.42 + 0.22 * (1 - ring / rings.length) + hash(i, ring) * 0.07;
      const moss = i > profile.length * 0.55 ? 0.06 : 0;
      tris.quad(
        at(profile[i], rings[ring], ring),
        at(profile[i + 1], rings[ring], ring + 1),
        at(profile[i + 1], rings[ring + 1], ring + 2),
        at(profile[i], rings[ring + 1], ring + 3),
        [shade, shade + moss, shade * 1.02],
      );
    }
  }
}

function makeSignTexture() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#3c2b1c';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#e6d2a8';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = '#f4e6c8';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('ASHEN CLIFF', 128, 58);
  ctx.font = '18px Georgia, serif';
  ctx.fillStyle = '#d9c7a4';
  ctx.fillText('cave mouth  →', 128, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addMesh(group, geometry, material, x, y, z, scale, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (Array.isArray(scale)) mesh.scale.set(scale[0], scale[1], scale[2]);
  else mesh.scale.setScalar(scale);
  if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}

/**
 * Builds the exterior group. Call after ensureCaveExteriorGrade so prop
 * bases sit on the benched hillside.
 */
export function buildCaveExterior() {
  ensureCaveExteriorGrade();
  const approach = getAshenCliffApproach();
  const materials = createCaveExteriorMaterials();
  const pathMaterial = materials.path.clone();
  pathMaterial.polygonOffset = true;
  pathMaterial.polygonOffsetFactor = -3;
  pathMaterial.polygonOffsetUnits = -3;
  pathMaterial.name = 'AshenCliff_WalkSurface';

  const group = new THREE.Group();
  group.name = 'AshenCliff_Exterior';

  const ribbon = new WolfveilTriangles();
  layRibbon(ribbon, approach.points);
  const shell = new WolfveilTriangles();
  buildArch(shell, approach.entrance);

  const walk = new THREE.Mesh(ribbon.geometry(), pathMaterial);
  walk.name = 'AshenCliff_Walk';
  walk.receiveShadow = true;
  walk.userData = { walkable: true, ashenCliffPath: true, clientGroundRaycast: true };
  group.add(walk);

  const cliff = new THREE.Mesh(shell.geometry(), materials.cliff);
  cliff.name = 'AshenCliff_Mouth';
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  cliff.raycast = () => {};
  group.add(cliff);

  const entrance = approach.entrance;
  const axis = new THREE.Vector3(entrance.inward.x, 0, entrance.inward.z).normalize();
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(3.05, 3.2, 7.2, 18, 1, true),
    materials.throat,
  );
  throat.name = 'AshenCliff_Throat';
  throat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  throat.position.set(
    entrance.position.x + axis.x * 3.7,
    entrance.position.y + 3.15,
    entrance.position.z + axis.z * 3.7,
  );
  throat.raycast = () => {};
  group.add(throat);
  // Temporary dark veil at the handoff. Interior rooms continue past
  // entrance.interiorStart; hide this mesh once those rooms are in place
  // so the player is not looking through the hill at the sky.
  const veil = new THREE.Mesh(new THREE.CircleGeometry(3.15, 20), materials.throat);
  veil.name = 'AshenCliff_InteriorVeil';
  veil.position.set(
    entrance.position.x + axis.x * 6.5,
    entrance.position.y + 3.15,
    entrance.position.z + axis.z * 6.5,
  );
  veil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().negate());
  veil.raycast = () => {};
  group.add(veil);

  const propCliff = materials.cliff.clone();
  propCliff.vertexColors = false;
  propCliff.name = 'AshenCliff_Boulder';
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const fern = new THREE.ConeGeometry(0.55, 1.15, 5);
  const post = new THREE.CylinderGeometry(0.07, 0.09, 1, 6);
  const flameGeo = new THREE.ConeGeometry(0.16, 0.42, 6);
  const bowl = new THREE.CylinderGeometry(0.28, 0.2, 0.22, 8);
  const logGeo = new THREE.CylinderGeometry(0.2, 0.24, 1, 6);
  const stoneGeo = new THREE.BoxGeometry(1, 1, 1);
  const ringGeo = new THREE.TorusGeometry(0.72, 0.09, 8, 18);
  const flames = [];
  const signTexture = makeSignTexture();
  const signMaterial = signTexture
    ? new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.72 })
    : materials.sign;

  const ground = (x, z) => wolfveilHeight(x, z);

  for (const prop of approach.props) {
    const y = ground(prop.x, prop.z);
    if (prop.kind === 'boulder') {
      const s = prop.scale;
      addMesh(group, rock, propCliff, prop.x, y + s * 0.22, prop.z,
        [s * (0.85 + hash(prop.x, 1) * 0.4), s * (0.55 + hash(prop.z, 2) * 0.5), s * 0.9],
        [prop.pitch || 0, prop.yaw, hash(prop.x, prop.z) * 0.4]);
    } else if (prop.kind === 'cairn') {
      for (let i = 0; i < 3; i++) {
        const s = prop.scale * (0.7 - i * 0.16);
        addMesh(group, rock, propCliff, prop.x + i * 0.05, y + 0.22 + i * 0.38, prop.z,
          [s, s * 0.55, s * 0.8], [0, prop.yaw + i, 0]);
      }
    } else if (prop.kind === 'fern') {
      addMesh(group, fern, materials.moss, prop.x, y + prop.scale * 0.5, prop.z,
        [prop.scale, prop.scale * (0.9 + hash(prop.x, prop.z) * 0.4), prop.scale],
        [0.12, prop.yaw, 0.08]);
    } else if (prop.kind === 'log') {
      addMesh(group, logGeo, materials.timber, prop.x, y + 0.22, prop.z,
        [1, prop.scale, 1], [0, prop.yaw, Math.PI / 2]);
    } else if (prop.kind === 'standing-stone') {
      addMesh(group, stoneGeo, propCliff, prop.x, y + prop.scale * 0.5, prop.z,
        [prop.width, prop.scale, prop.width * 0.55],
        [(hash(prop.x, prop.z) - 0.5) * 0.12, prop.yaw, 0.04]);
    } else if (prop.kind === 'fallen-stone') {
      addMesh(group, stoneGeo, propCliff, prop.x, y + 0.22, prop.z,
        [prop.scale, prop.width, prop.width * 0.7], [0.1, prop.yaw, Math.PI / 2]);
    } else if (prop.kind === 'spire') {
      for (let i = 0; i < 2; i++) {
        const s = 1.05 - i * 0.3;
        addMesh(group, rock, propCliff, prop.x, y + 0.45 + i * 0.85, prop.z,
          [s * 1.1, 0.9, s], [0.15, prop.yaw + i, 0.1]);
      }
    } else if (prop.kind === 'torch' || prop.kind === 'ember') {
      const warm = prop.kind === 'torch';
      addMesh(group, post, materials.timber, prop.x, y + 0.7, prop.z, [1, 1.4, 1]);
      if (!warm) addMesh(group, bowl, materials.bronze, prop.x, y + 0.2, prop.z, 1);
      const flame = addMesh(group, flameGeo, warm ? materials.torch : materials.ember,
        prop.x, y + 1.55, prop.z, prop.scale);
      flames.push({ mesh: flame, base: y + 1.55, phase: prop.x * 0.2 + prop.z });
    } else if (prop.kind === 'sign') {
      addMesh(group, post, materials.timber, prop.x, y + 0.85, prop.z, [1.2, 1.7, 1.2]);
      addMesh(group, stoneGeo, signMaterial, prop.x, y + 1.62, prop.z,
        [1.2, 0.5, 0.08], [0, prop.yaw, 0]);
    } else if (prop.kind === 'ring') {
      addMesh(group, ringGeo, materials.bronze,
        prop.x, entrance.position.y + (prop.lift || 6), prop.z,
        1, [0, Math.PI / 2, 0.08]);
    } else if (prop.kind === 'tooth') {
      addMesh(group, flameGeo, propCliff, prop.x, entrance.position.y + (prop.lift || 4), prop.z,
        [0.7, prop.scale * 2.2, 0.7], [Math.PI, prop.yaw, 0]);
    }
  }

  const lights = [
    { x: entrance.position.x - 2.4, y: entrance.position.y + 1.8, z: entrance.position.z + 3.55, color: 0xff8a3c, intensity: 6, distance: 14 },
    { x: entrance.position.x - 2.2, y: entrance.position.y + 0.8, z: entrance.position.z - 3.5, color: 0x7ec8ea, intensity: 3.5, distance: 10 },
    { x: entrance.interiorStart.x, y: entrance.interiorStart.y + 2.4, z: entrance.interiorStart.z, color: 0xffb070, intensity: 4, distance: 16 },
  ];
  for (const spec of lights) {
    const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, 2);
    light.position.set(spec.x, spec.y, spec.z);
    group.add(light);
  }

  const owned = [pathMaterial, propCliff, signMaterial, ...Object.values(materials).filter(item => item?.isMaterial)];
  const textures = [...(materials.ownedTextures || [])];
  if (signTexture) textures.push(signTexture);

  return {
    group,
    walkable: walk,
    approach,
    entrance,
    ownedMaterials: owned,
    update(dt) {
      const time = (this._t = (this._t || 0) + Math.min(0.1, Math.max(0, dt || 0)));
      for (const flame of flames) {
        const lick = 0.82 + 0.18 * Math.sin(time * 9 + flame.phase);
        flame.mesh.scale.y = lick;
        flame.mesh.position.y = flame.base + Math.sin(time * 7 + flame.phase) * 0.03;
      }
    },
    dispose() {
      walk.geometry.dispose();
      cliff.geometry.dispose();
      throat.geometry.dispose();
      veil.geometry.dispose();
      for (const material of owned) material.dispose?.();
      for (const texture of textures) texture.dispose?.();
      rock.dispose();
      fern.dispose();
      post.dispose();
      flameGeo.dispose();
      bowl.dispose();
      logGeo.dispose();
      stoneGeo.dispose();
      ringGeo.dispose();
    },
  };
}

/** Local-space cameras for previews. The live game adds the village Z offset. */
export function exteriorCameraViews(approach = getAshenCliffApproach()) {
  const mid = approach.points[Math.floor(approach.points.length * 0.58)];
  const mouth = approach.entrance.position;
  return Object.freeze({
    path: Object.freeze({
      position: [mid.x - 7, mid.y + 3.4, mid.z + 9],
      target: [mouth.x - 1, mouth.y + 2.6, mouth.z],
    }),
    mouth: Object.freeze({
      position: [mouth.x - 14, mouth.y + 3.5, mouth.z + 1.6],
      target: [mouth.x + 3, mouth.y + 3.3, mouth.z],
    }),
  });
}
