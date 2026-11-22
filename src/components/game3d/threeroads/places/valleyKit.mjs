// The kits as Three.js geometry: the valley kit and the three empire kits of
// band 2. Until a kit's GLB (public/game3d/threeroads/kits/<kit>.glb) exists
// every piece is a box of its table size, carried on below the ground by its
// `skirt` (so nothing waits for the modelling session); when the GLB loads, its
// `<id>_LOD0` and `<id>_LOD1` meshes take over and the boxes are dropped.
//
// The parsed GLB is kept for the page's life (it is small and every area
// change remounts the world); its GPU copies are released on dispose and
// uploaded again by Three.js when the next scene draws them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VALLEY_KIT_PIECES, VALLEY_KIT_URL } from '../kits/valleyKitPieces.mjs';
import { EMPIRE_KITS } from '../kits/empireKitPieces.mjs';

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
  fire_basket: 0x3a3632, fire_basket_flame: 0xffa040, oath_tree: 0x5d6e3e,
});
const EMPIRE_STAND_IN = Object.freeze({
  akitsu: Object.freeze({
    tent_bell: 0xe6e1d2, tent_officer: 0xd6d1c0, banner_tall_pole: 0x4a3a2a, watchtower: 0x6e5238,
    bale_wall: 0xc2a86a, gate_bar: 0x5a4632, telegraph_pole: 0x3e3328, rifle_rack: 0x4a4a3a,
    spear_rack: 0x6a5236, rice_kettle: 0x2e2e2e, supply_stack: 0x8f6c45, map_table: 0x6a5236,
  }),
  tameri: Object.freeze({
    shield_wall: 0xb08a5a, flagstaff: 0x6e5a3a, pavilion_life: 0xe8dfc8, awning: 0xb8a070,
    tally_board: 0x7d6142, grain_stack: 0xc9ad72, jar_rack: 0x9a6a44, grain_jar: 0xb87a4a,
    hoist: 0x6e5238, landing_stage: 0x7a5d40, barge: 0x6a4c30, reed_boat: 0xa89a5a,
    reed_clump: 0x6f7f45, brazier_bowl: 0x7a6a4a, chariot: 0x8a6a3a,
  }),
  remoria: Object.freeze({
    palisade_run: 0x6e5a40, palisade_corner: 0x6e5a40, gate_tower: 0x6a5238, gate_span: 0x5a4632,
    stake_hedge: 0x6a5236, tent_legion: 0x8a6a4a, tent_command: 0x8c2f2f, standard_wolf: 0x9a958a,
    tribunal: 0x6e6a52, brazier_iron: 0x3a3632, rack_arms: 0x5a4a3a, boundary_stone: 0xa8a294,
    plough: 0x6a5236, milestone: 0xb8b2a4, road_arch: 0x6a5238,
  }),
});
const merged = parts => {
  const flat = parts.map(part => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(flat);
  for (const part of new Set([...parts, ...flat])) part.dispose();
  return geometry;
};

// A few pieces whose box would misread their outline get a plain shape of
// the same size instead: a dome for the mound and the haystack, a cross for
// the sails, an open frame for the studio frame, a trunk and crown for the
// Oath Tree. Still stand-ins; the kit replaces them.
function shapedStandIn(piece) {
  const [w, d, h] = piece.size;
  if (piece.id === 'barrow_mound' || piece.id === 'haystack') {
    const geometry = new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geometry.scale(w, h * 2, d);
    return geometry;
  }
  if (piece.id === 'oath_tree') {
    // A trunk 1.6 m across and a wide crown from about 2.4 m up.
    const trunk = new THREE.CylinderGeometry(0.55, 0.8, 6, 10).translate(0, 3, 0);
    const crown = new THREE.SphereGeometry(0.5, 14, 9).scale(w, h - 4, d).translate(0, 4 + (h - 4) / 2, 0);
    const low = new THREE.SphereGeometry(0.5, 12, 7).scale(w * 0.62, 3.2, d * 0.62).translate(w * 0.12, 3.9, -d * 0.08);
    const geometry = mergeGeometries([trunk.toNonIndexed(), crown.toNonIndexed(), low.toNonIndexed()]);
    trunk.dispose(); crown.dispose(); low.dispose();
    return geometry;
  }
  if (piece.id === 'studio_frame') {
    // Four posts and a ring of beams: a frame you can see into.
    const parts = [];
    const post = 0.18;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(new THREE.BoxGeometry(post, h, post).translate(sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)));
    for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(w, post, post).translate(0, h - post / 2, sz * (d / 2 - post / 2)));
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(post, post, d).translate(sx * (w / 2 - post / 2), h - post / 2, 0));
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return geometry;
  }
  // Empire pieces whose outline is not a box.
  const skirt = piece.skirt || 0;
  if (piece.id === 'gate_bar' || piece.id === 'road_arch') {
    // Two posts and a bar or lintel over the road: the road stays open.
    const post = piece.id === 'gate_bar' ? 0.22 : 0.45;
    const bar = piece.id === 'gate_bar' ? 0.25 : 0.6;
    return merged([
      new THREE.BoxGeometry(post, h + skirt, Math.max(d, post)).translate(-(w / 2 - post / 2), (h - skirt) / 2, 0),
      new THREE.BoxGeometry(post, h + skirt, Math.max(d, post)).translate(w / 2 - post / 2, (h - skirt) / 2, 0),
      new THREE.BoxGeometry(w, bar, Math.max(d * 0.6, post)).translate(0, h - bar / 2, 0),
    ]);
  }
  if (piece.id === 'awning') {
    const parts = [new THREE.BoxGeometry(w, 0.15, d).translate(0, h - 0.075, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(new THREE.BoxGeometry(0.15, h + skirt, 0.15).translate(sx * (w / 2 - 0.1), (h - skirt) / 2, sz * (d / 2 - 0.1)));
    return merged(parts);
  }
  if (piece.id === 'tent_bell') {
    return merged([
      new THREE.ConeGeometry(w / 2, h - 0.3, 10).translate(0, 0.3 + (h - 0.3) / 2, 0),
      new THREE.BoxGeometry(w, 0.3 + skirt, d).translate(0, (0.3 - skirt) / 2, 0),
    ]);
  }
  if (piece.id === 'hoist') {
    // The frame, and the arm reaching 6 m beyond it toward +Z over the drop.
    return merged([
      new THREE.BoxGeometry(w, h * 0.75 + skirt, d).translate(0, (h * 0.75 - skirt) / 2, 0),
      new THREE.BoxGeometry(0.4, 0.4, d + 6).translate(0, h - 0.6, 3),
      new THREE.BoxGeometry(1.2, 1.2, 1.2).translate(0, h - 2.4, d / 2 + 5.5),
    ]);
  }
  if (piece.id === 'landing_stage') {
    // A plank deck on four tall posts.
    const parts = [new THREE.BoxGeometry(w, 0.3, d).translate(0, h - 0.15, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(new THREE.BoxGeometry(0.3, h + skirt, 0.3).translate(sx * (w / 2 - 0.2), (h - skirt) / 2, sz * (d / 2 - 0.2)));
    return merged(parts);
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
  const skirt = piece.pivot === 'base' || piece.pivot === 'frame' ? piece.skirt || 0 : 0;
  const geometry = new THREE.BoxGeometry(w, h + skirt, d);
  const lift = {
    base: (h - skirt) / 2, frame: (h - skirt) / 2, kettle: h / 2, top: -h / 2, hub: 0, centre: 0,
    wagon: 1.2 + h / 2, // the cloth starts at y 1.2 on its wagon
    basket: 1.2 + h / 2, // the flame starts at y 1.2 in its basket
    bowl: 1.1 + h / 2, brazier: 1.1 + h / 2, // the fire starts at y 1.1 in its bowl
    waterline: h / 2 - Math.min(0.6, h * 0.25), // a boat sits a little into the water
  }[piece.pivot] ?? (h - skirt) / 2;
  geometry.translate(0, lift, 0);
  geometry.name = 'TR_Kit_' + piece.id + '_box';
  return geometry;
}

const glbPromises = new Map(); // one fetch and parse per kit per page
function loadKitGlb(gltfLoader, url) {
  if (!glbPromises.has(url)) {
    glbPromises.set(url, (async () => {
      // A missing file comes back from the dev server as the app's HTML page,
      // so check what it is before handing it to the loader.
      const response = await globalThis.fetch(url, { method: 'HEAD' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || /text\/html/i.test(type)) return null;
      const gltf = await gltfLoader.loadAsync(url);
      return gltf?.scene || null;
    })().catch(error => {
      globalThis.console?.info('Three Roads kit ' + url + ' not loaded; boxes stay', error?.message || error);
      return null;
    }));
  }
  return glbPromises.get(url);
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

export function createValleyKit(options = {}) {
  return createPieceKit({ ...options, id: 'valley', url: VALLEY_KIT_URL, pieces: VALLEY_KIT_PIECES, standIn: STAND_IN });
}

// One of band 2's empire kits ('akitsu' | 'tameri' | 'remoria').
export function createEmpireKit(id, options = {}) {
  const table = EMPIRE_KITS[id];
  if (!table) throw new Error('No Three Roads kit called ' + id);
  return createPieceKit({ ...options, id, url: table.url, pieces: table.pieces, standIn: EMPIRE_STAND_IN[id] || {} });
}

function createPieceKit({ id: kitId, url, pieces: table, standIn, gltfLoader = null, onSwap = null }) {
  const materials = {
    lit: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0xffe2b0, emissive: 0xffa850, emissiveIntensity: 1.4, roughness: 0.7, metalness: 0,
    }),
  };
  materials.lit.name = 'TR_Kit_' + kitId + '_Lit';
  materials.glow.name = 'TR_Kit_' + kitId + '_Glow';
  const pieces = new Map();
  for (const piece of table) {
    const box = boxFor(piece);
    pieces.set(piece.id, {
      id: piece.id, table: piece, lod0: box, lod1: box, fromGlb: false,
      material: piece.material === 'glow' ? 'glow' : 'lit',
      standIn: piece.tint ? 0xffffff : (standIn[piece.id] ?? 0xb0a898),
    });
  }
  let disposed = false;
  let glbMaterials = null;
  const kit = {
    id: kitId, pieces, materials, source: 'boxes',
    get(id) { return pieces.get(id) || null; },
    colourFor(id, tint) {
      if (tint !== null && tint !== undefined) return tint;
      const entry = pieces.get(id);
      return entry && !entry.fromGlb ? entry.standIn : 0xffffff;
    },
    ready: gltfLoader && typeof globalThis.fetch === 'function'
      ? loadKitGlb(gltfLoader, url).then(root => {
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
