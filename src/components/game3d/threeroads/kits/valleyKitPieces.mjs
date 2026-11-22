// The valley kit: the pieces every place in the town and the Gate Fields is
// dressed from. This table is the contract between the session that models
// the kit (public/game3d/threeroads/kits/valley.glb) and the session that
// places it. Written by the lead; change it only through the lead.
//
// In the GLB each piece is two meshes named `<id>_LOD0` and `<id>_LOD1`.
// Metres, Y up, standing on y = 0, pivot at the centre of the footprint,
// front toward +Z, unless `pivot` says otherwise. `size` is [width x,
// depth z, height y] and is also the stand-in box used until the GLB exists.
//
// material  'lit'  : the kit's one shared lit material (one 2048 atlas)
//           'glow' : the kit's one shared glowing material (same atlas)
// tint      true   : near-white in the atlas; coloured per instance
// solid     null   : walk through it
//           { circle: r } or { box: [halfX, halfZ] } : pushes the player out
const piece = (id, size, extra = {}) => Object.freeze({
  id, size: Object.freeze(size), material: 'lit', tint: false, solid: null, pivot: 'base', ...extra,
});

export const VALLEY_KIT_URL = '/game3d/threeroads/kits/valley.glb';

export const VALLEY_KIT_PIECES = Object.freeze([
  // Farm buildings
  piece('barn', [12, 8, 7], { solid: { box: [6, 4] } }),
  piece('windmill_body', [6, 6, 10], { solid: { circle: 3 } }),
  piece('windmill_sails', [9, 0.4, 9], { pivot: 'hub' }), // turns about z through its own centre; mounted at y 8.5 on the body's front
  piece('farmhouse', [8, 6, 6], { solid: { box: [4, 3] } }),
  piece('hut', [4, 3.5, 3.2], { solid: { box: [2, 1.75] } }),
  piece('well', [1.8, 1.8, 2.4], { solid: { circle: 1 } }),
  // Field furniture
  piece('fence_3m', [3, 0.15, 1.1]),
  piece('hedgerow_4m', [4, 1.2, 1.6]),
  piece('haystack', [2.6, 2.6, 2.4], { solid: { circle: 1.3 } }),
  piece('sheaf', [0.6, 0.6, 1.2]),
  piece('beehive', [0.6, 0.6, 0.9]),
  piece('scarecrow', [1.6, 0.4, 2.2]),
  piece('flat_stone', [0.9, 0.7, 0.08]),
  // Wagons and goods
  piece('wagon', [4.2, 2, 1.4], { solid: { box: [2.1, 1] } }),
  piece('wagon_cover', [4, 2, 1.4], { tint: true, pivot: 'wagon' }), // same origin as the wagon it sits on; the cloth starts at y 1.2
  piece('crate_stack', [1.6, 1.6, 1.6], { solid: { box: [0.8, 0.8] } }),
  // Town and Truce
  // The Oath Tree: one old, broad tree on the plaza lawn that every newcomer ties a
  // ribbon to. The town as it is drawn today has no tree there, so the kit brings it.
  piece('oath_tree', [10, 10, 11], { solid: { circle: 0.9 } }), // the trunk is about 1.6 m across; the first branches start at 2.4 m
  piece('truce_stone', [0.9, 0.6, 1.1], { solid: { circle: 0.6 } }),
  piece('ribbon', [0.06, 0.02, 0.8], { tint: true, pivot: 'top' }),
  piece('banner_pole', [0.2, 0.2, 6]),
  piece('banner_cloth', [1.2, 0.05, 3.2], { tint: true, pivot: 'top' }), // hangs from y 5.8 on a pole
  piece('pledge_board', [1.6, 0.3, 2.2]),
  piece('lantern_wall', [6, 0.5, 2.2], { solid: { box: [3, 0.3] } }),
  piece('lantern_post', [0.3, 0.3, 2.6]),
  piece('paper_lantern', [0.35, 0.35, 0.5], { material: 'glow', pivot: 'top' }),
  piece('gate_bell', [1.8, 0.8, 3.2], { solid: { box: [0.9, 0.4] } }),
  piece('straw_post', [0.5, 0.5, 1.9], { solid: { circle: 0.3 } }),
  piece('studio_frame', [5, 4, 3.2]),
  piece('paper_screen', [1.8, 0.1, 1.9]),
  // Memory and the dead
  piece('old_standard', [0.3, 0.3, 5]),
  piece('cairn', [1.6, 1.6, 1.4], { solid: { circle: 0.8 } }),
  piece('pyre_stack', [2.4, 1.2, 1.2], { solid: { box: [1.2, 0.6] } }),
  piece('stela', [0.5, 0.2, 1]),
  piece('grave_stone', [0.5, 0.2, 0.7]),
  // The barrow, and the one sign that means "the way in is here"
  piece('barrow_mound', [18, 18, 4], { solid: { circle: 8.5 } }),
  piece('barrow_door', [2.6, 0.8, 3], { solid: { box: [1.3, 0.4] } }),
  piece('fire_basket', [0.6, 0.6, 1.4], { solid: { circle: 0.4 } }),
  piece('fire_basket_flame', [0.5, 0.5, 0.6], { material: 'glow', pivot: 'basket' }), // same origin as its basket; the flame starts at y 1.2
]);

const BY_ID = new Map(VALLEY_KIT_PIECES.map(entry => [entry.id, entry]));
export const valleyKitPiece = id => BY_ID.get(id) || null;

// Limits the modelled kit has to meet (BUILD_RULES.md, section 7).
export const VALLEY_KIT_LIMITS = Object.freeze({
  maxPieces: 40,
  maxTrianglesLod0PerPiece: 6000,
  maxTrianglesLod1PerPiece: 1500,
  maxTrianglesLod0Total: 60000,
  atlasPixels: 2048,
  maxBytes: 3 * 1024 * 1024,
});
