// The valley kit as Three.js geometry: until public/game3d/threeroads/kits/
// valley.glb exists every piece is a box of its table size (so nothing waits
// for the modelling session); when the GLB loads, its `<id>_LOD0` and
// `<id>_LOD1` meshes take over and the box geometry is dropped.
//
// The parsed GLB is kept for the page's life (it is small and every area
// change remounts the world); its GPU copies are released on dispose and
// uploaded again by Three.js when the next scene draws them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VALLEY_KIT_PIECES, VALLEY_KIT_URL } from '../kits/valleyKitPieces.mjs';

// Stand-in colours while the pieces are boxes, so a box yard still reads:
// wood, straw, stone, hedge. Tinted pieces are white and take their tint.
const STAND_IN = Object.freeze({
  barn: 0x8a5f3c, windmill_body: 0xcfc4ae, windmill_sails: 0x9b8a6c, farmhouse: 0xb59a74,
  hut: 0x7c6247, well: 0x8d8a82, fence_3m: 0x7a5d40, hedgerow_4m: 0x3f5a33,
  haystack: 0xc9ad62, sheaf: 0xd2b86a, beehive: 0xc79a4a, scarecrow: 0x8a7350,
  flat_stone: 0x9b978e, wagon: 0x6e5038, crate_stack: 0x8f6c45, truce_stone: 0xbdb7a8,
  banner_pole: 0x5a4632, pledge_board: 0x7d6142, lantern_wall: 0x5e4a36, lantern_post: 0x4a3a2a,
  paper_lantern: 0xffd9a0, gate_bell: 0x6f6a52, straw_post: 0xc8ad66, studio_frame: 0x6d5640,
  paper_screen: 0xece3cc, old_standard: 0x5c4f45, cairn: 0x8a877e, pyre_stack: 0x6b4c33,
  stela: 0xb3ac9c, grave_stone: 0x9a968c, barrow_mound: 0x5d7445, barrow_door: 0x6e6a62,
  fire_basket: 0x3a3632, fire_basket_flame: 0xffa040,
});

// A few pieces whose box would misread their outline get a plain shape of
// the same size instead: a dome for the mound and the haystack, a cross for
// the sails. Still stand-ins; the kit replaces them.
function shapedStandIn(piece) {
  const [w, d, h] = piece.size;
  if (piece.id === 'barrow_mound' || piece.id === 'haystack') {
    const geometry = new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geometry.scale(w, h * 2, d);
    return geometry;
  }
  if (piece.id === 'windmill_sails') {
    const a = new THREE.BoxGeometry(w, w * 0.12, d);
    const b = new THREE.BoxGeometry(w * 0.12, w, d);
    const geometry = mergeGeometries([a, b]);
    a.dispose(); b.dispose();
    return geometry; // pivot 'hub': centred
  }
  return null;
}

// Where the box sits on the piece's origin, by pivot (valleyKitPieces.mjs).
function boxFor(piece) {
  const shaped = shapedStandIn(piece);
  if (shaped) { shaped.name = 'TR_Kit_' + piece.id + '_standin'; return shaped; }
  const [w, d, h] = piece.size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const lift = {
    base: h / 2, top: -h / 2, hub: 0,
    wagon: 1.2 + h / 2, // the cloth starts at y 1.2 on its wagon
    basket: 1.2 + h / 2, // the flame starts at y 1.2 in its basket
  }[piece.pivot] ?? h / 2;
  geometry.translate(0, lift, 0);
  geometry.name = 'TR_Kit_' + piece.id + '_box';
  return geometry;
}

let glbPromise = null; // one fetch and parse per page
function loadKitGlb(gltfLoader) {
  if (!glbPromise) {
    glbPromise = (async () => {
      // A missing file comes back from the dev server as the app's HTML page,
      // so check what it is before handing it to the loader.
      const response = await globalThis.fetch(VALLEY_KIT_URL, { method: 'HEAD' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || /text\/html/i.test(type)) return null;
      const gltf = await gltfLoader.loadAsync(VALLEY_KIT_URL);
      return gltf?.scene || null;
    })().catch(error => {
      globalThis.console?.info('Three Roads valley kit not loaded; boxes stay', error?.message || error);
      return null;
    });
  }
  return glbPromise;
}

// Geometry for `<id>_LOD0` / `<id>_LOD1` with the node's own transform baked in.
function kitGeometries(root) {
  const found = new Map();
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (!node.isMesh) return;
    const match = /^(.+)_LOD([01])$/.exec(node.name || '');
    if (!match) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    geometry.name = 'TR_Kit_' + node.name;
    if (!found.has(match[1])) found.set(match[1], {});
    found.get(match[1])['lod' + match[2]] = { geometry, material: node.material };
  });
  return found;
}

export function createValleyKit({ gltfLoader = null, onSwap = null } = {}) {
  const materials = {
    lit: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0xffe2b0, emissive: 0xffa850, emissiveIntensity: 1.4, roughness: 0.7, metalness: 0,
    }),
  };
  materials.lit.name = 'TR_Kit_Lit';
  materials.glow.name = 'TR_Kit_Glow';
  const pieces = new Map();
  for (const piece of VALLEY_KIT_PIECES) {
    const box = boxFor(piece);
    pieces.set(piece.id, {
      id: piece.id, table: piece, lod0: box, lod1: box, fromGlb: false,
      material: piece.material === 'glow' ? 'glow' : 'lit',
      standIn: piece.tint ? 0xffffff : (STAND_IN[piece.id] ?? 0xb0a898),
    });
  }
  let disposed = false;
  let glbMaterials = null;
  const kit = {
    pieces, materials, source: 'boxes',
    get(id) { return pieces.get(id) || null; },
    colourFor(id, tint) {
      if (tint !== null && tint !== undefined) return tint;
      const entry = pieces.get(id);
      return entry && !entry.fromGlb ? entry.standIn : 0xffffff;
    },
    ready: gltfLoader && typeof globalThis.fetch === 'function'
      ? loadKitGlb(gltfLoader).then(root => {
        if (!root || disposed) return false;
        const found = kitGeometries(root);
        let swapped = 0;
        for (const [id, entry] of pieces) {
          const glb = found.get(id);
          if (!glb?.lod0) continue;
          entry.lod0.dispose();
          entry.lod0 = glb.lod0.geometry;
          entry.lod1 = glb.lod1?.geometry || glb.lod0.geometry;
          entry.fromGlb = true;
          swapped++;
          // The kit has one lit and one glowing material: adopt them.
          glbMaterials = glbMaterials || {};
          glbMaterials[entry.material] = glbMaterials[entry.material] || glb.lod0.material;
        }
        if (!swapped) return false;
        for (const key of ['lit', 'glow']) {
          if (!glbMaterials?.[key]) continue;
          materials[key].dispose();
          materials[key] = glbMaterials[key];
        }
        kit.source = 'glb';
        onSwap?.(kit);
        return true;
      })
      : Promise.resolve(false),
    trianglesOf(geometry) {
      if (!geometry) return 0;
      return geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count || 0) / 3;
    },
    dispose() {
      disposed = true;
      const seen = new Set();
      for (const entry of pieces.values()) for (const g of [entry.lod0, entry.lod1]) {
        if (g && !seen.has(g)) { seen.add(g); g.dispose(); }
      }
      // GLB materials and textures live with the cached GLB; release their GPU copies only.
      for (const material of Object.values(materials)) {
        material.map?.dispose?.();
        material.dispose();
      }
    },
  };
  return kit;
}
