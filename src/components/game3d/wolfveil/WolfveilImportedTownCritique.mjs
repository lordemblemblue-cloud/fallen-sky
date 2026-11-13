import * as THREE from 'three';

export function computeCreasedNormals(geometry, creaseAngle = Math.PI / 4) {
  if (!geometry.attributes.position) return;
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const hash = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  const vertexMap = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = hash(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!vertexMap.has(key)) vertexMap.set(key, []);
    vertexMap.get(key).push({ index: i, normal: new THREE.Vector3(norm.getX(i), norm.getY(i), norm.getZ(i)) });
  }
  const smoothedNormal = new THREE.Vector3();
  for (const verts of vertexMap.values()) {
    for (let i = 0; i < verts.length; i++) {
      smoothedNormal.copy(verts[i].normal);
      let count = 1;
      for (let j = 0; j < verts.length; j++) {
        if (i === j) continue;
        if (verts[i].normal.angleTo(verts[j].normal) <= creaseAngle) {
          smoothedNormal.add(verts[j].normal);
          count++;
        }
      }
      smoothedNormal.normalize();
      norm.setXYZ(verts[i].index, smoothedNormal.x, smoothedNormal.y, smoothedNormal.z);
    }
  }
  norm.needsUpdate = true;
}

export function generateWorldBoxUVs(mesh) {
  const g = mesh.geometry;
  if (!g.attributes.position) return;
  const pos = g.attributes.position;
  const norm = g.attributes.normal || { getX:()=>0, getY:()=>1, getZ:()=>0 };
  const uvs = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i)), nz = Math.abs(norm.getZ(i));
    if (ny > nx && ny > nz) {
      uvs[i * 2] = v.x; uvs[i * 2 + 1] = v.z;
    } else if (nx > ny && nx > nz) {
      uvs[i * 2] = v.z; uvs[i * 2 + 1] = v.y;
    } else {
      uvs[i * 2] = v.x; uvs[i * 2 + 1] = v.y;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function generateSumiETexture(type) {
  const s = 256, d = new Uint8Array(s * s * 4);
  const hash = (x, y) => { const a = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return a - Math.floor(a); };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return hash(ix, iy) * (1 - u) * (1 - v) + hash(ix + 1, iy) * u * (1 - v) +
           hash(ix, iy + 1) * (1 - u) * v + hash(ix + 1, iy + 1) * u * v;
  };
  const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2, y * 2) * 0.25 + noise(x * 4, y * 4) * 0.125;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      let val = 255;
      if (type === 'plaster') {
        const wash = fbm(u * 8, v * 8);
        const streaks = fbm(u * 16, v * 64);
        val = 220 + wash * 35 - streaks * 15;
      } else if (type === 'wood') {
        const grain = fbm(u * 4, v * 64);
        const rings = Math.sin(u * 20 + fbm(u * 8, v * 8) * 10);
        val = 180 + grain * 40 + rings * 20;
      } else if (type === 'stone') {
        const rock = fbm(u * 12, v * 12);
        const speckle = hash(x, y);
        val = 140 + rock * 80 + speckle * 20;
      } else if (type === 'roof') {
        const tiles = Math.abs(Math.sin(u * Math.PI * 16)) * Math.abs(Math.sin(v * Math.PI * 16));
        const moss = fbm(u * 16, v * 16);
        val = 120 + tiles * 40 + moss * 30;
      } else if (type === 'gold') {
        val = 200 + fbm(u * 32, v * 32) * 55;
      }
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = clamp(val, 0, 255);
      d[i + 3] = 255;
    }
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const t = new THREE.DataTexture(d, s, s, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export const TOWN_TEXTURES = {
  plaster: generateSumiETexture('plaster'),
  wood: generateSumiETexture('wood'),
  stone: generateSumiETexture('stone'),
  roof: generateSumiETexture('roof'),
  gold: generateSumiETexture('gold')
};

export function critiqueAndEnhanceWolfveilTown(root, floorY) {
  root.traverse(n => {
    if (!n.isMesh) return;
    n.castShadow = true;
    n.receiveShadow = true;
    
    // Trim ugly concrete skirts extending 5.4m underground on paving tiles
    if (/^Tile_/i.test(n.name) || /paving/i.test(n.name)) {
      const pos = n.geometry.attributes.position;
      let minH = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const wy = pos.getY(i) * root.scale.y + root.position.y;
        if (wy - floorY < -0.85) {
          pos.setY(i, (-0.85 + floorY - root.position.y) / root.scale.y);
        }
        minH = Math.min(minH, pos.getY(i));
      }
      pos.needsUpdate = true;
      n.geometry.computeBoundingBox();
      n.geometry.computeBoundingSphere();
    }

    if (!n.geometry.attributes.uv) generateWorldBoxUVs(n);
    if (!n.geometry.attributes.normal) n.geometry.computeVertexNormals();
    computeCreasedNormals(n.geometry, Math.PI / 4);

    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      if (!m) continue;
      m.flatShading = false;
      if (/wood|cedar/i.test(m.name)) {
        m.map = TOWN_TEXTURES.wood;
        m.roughness = 0.85; m.metalness = 0.05;
      } else if (/roof/i.test(m.name)) {
        m.map = TOWN_TEXTURES.roof;
        m.roughness = 0.6; m.metalness = 0.15;
      } else if (/cream|plaster/i.test(m.name)) {
        m.map = TOWN_TEXTURES.plaster;
        m.roughness = 0.95;
      } else if (/gold/i.test(m.name)) {
        m.map = TOWN_TEXTURES.gold;
        m.roughness = 0.3; m.metalness = 0.7;
      } else if (/stone|paving|Tile/i.test(m.name)) {
        m.map = TOWN_TEXTURES.stone;
        m.roughness = 0.9;
      } else if (/red/i.test(m.name)) {
        m.roughness = 0.4; m.metalness = 0.1;
      }
      m.map?.transform?.setUvTransform(0, 0, 0.15, 0.15, 0, 0, 0); // Scale UVs nicely
      m.needsUpdate = true;
    }
  });
}