// The three army kits of band 2: the pieces each empire's camp is dressed from.
// Like valleyKitPieces.mjs, this table is the contract between the session that
// models a kit (public/game3d/threeroads/kits/<empire>.glb) and the session that
// places it. Written by the lead; change it only through the lead.
//
// Each camp is drawn from its own people's way of making camp, not from the
// reference game: Akitsu's from a Meiji-era field camp (canvas, camp curtains,
// tall banners, rice-bale breastworks, a timber watchtower), Tameri's from a New
// Kingdom river army (a shield palisade, flagstaffs, a lever hoist, reed boats),
// Remoria's from a marching camp (bank and stakes, gate towers, tent rows, the
// standard where the two streets cross).
//
// In the GLB each piece is two meshes named `<id>_LOD0` and `<id>_LOD1`.
// Metres, Y up, standing on y = 0, pivot at the centre of the footprint, front
// toward +Z, unless `pivot` says otherwise. `size` is [width x, depth z,
// height y] above y = 0, and is also the stand-in box used until the GLB exists.
//
// material  'lit'  : the kit's one shared lit material (one 2048 atlas)
//           'glow' : the kit's one shared glowing material (same atlas)
// tint      true   : near-white in the atlas; coloured per instance
// solid     null   : walk through it
//           { circle: r } or { box: [halfX, halfZ] } : pushes the player out
// skirt     metres the piece carries on BELOW y = 0 (posts, a plinth, a bank's
//           foot), so it can stand on sloping ground without a gap under its
//           downhill side. The camps stand on slopes of 4 to 16 degrees, and
//           nothing here needs the ground itself to be reshaped.
const piece = (id, size, extra = {}) => Object.freeze({
  id, size: Object.freeze(size), material: 'lit', tint: false, solid: null, pivot: 'base', skirt: 0, ...extra,
});

export const AKITSU_KIT_PIECES = Object.freeze([
  // Canvas
  piece('tent_bell', [4, 4, 3.2], { solid: { circle: 1.9 }, skirt: 1.2 }), // white bell tent on a plank deck
  piece('tent_officer', [6, 4, 3], { solid: { box: [3, 2] }, skirt: 1.2 }), // wall tent with a blue band, on a deck
  piece('curtain_run', [4, 0.2, 2.1], { tint: true, solid: { box: [2, 0.15] }, skirt: 0.6 }), // camp curtain on poles with the bear crest; rings the command post
  piece('banner_tall_pole', [0.2, 0.2, 6.5], { skirt: 0.8 }),
  piece('banner_tall_cloth', [0.9, 0.05, 5], { tint: true, pivot: 'top' }), // narrow upright banner; hangs from y 6.3 on its pole
  // Works
  piece('watchtower', [4, 4, 10], { solid: { box: [2, 2] }, skirt: 1.8 }), // timber tower, roofed platform at 7.5 m, a signal drum; the camp's tall mark
  piece('bale_wall', [4, 1.1, 1.3], { solid: { box: [2, 0.55] }, skirt: 0.8 }), // rice-bale breastwork, three bales high
  piece('gate_bar', [5.6, 0.5, 2.6], { skirt: 0.8 }), // two posts and a lifted bar over a 4 m road
  piece('telegraph_pole', [1.8, 0.3, 7.5], { solid: { circle: 0.2 }, skirt: 1 }), // crossarm, insulators, a snapped wire
  // Yard
  piece('rifle_rack', [2.4, 1, 1.5], { solid: { box: [1.2, 0.5] }, skirt: 0.5 }), // stacked rifles under an oilcloth: powder is dead under this sky
  piece('spear_rack', [2.4, 0.8, 2.4], { solid: { box: [1.2, 0.4] }, skirt: 0.5 }), // spears and wooden practice swords
  piece('rice_kettle', [1.6, 1.6, 1.4], { solid: { circle: 0.8 }, skirt: 0.4 }), // iron kettle on a tripod over a stone ring
  piece('kettle_coals', [0.9, 0.9, 0.3], { material: 'glow', pivot: 'kettle' }), // same origin as its kettle
  piece('supply_stack', [2.2, 1.6, 1.5], { solid: { box: [1.1, 0.8] }, skirt: 0.5 }), // crates, rice bales, a folded handcart
  piece('map_table', [2, 1.2, 0.9], { solid: { box: [1, 0.6] }, skirt: 0.4 }), // the colonel's table and two stools
  piece('signal_lantern', [0.4, 0.4, 0.6], { material: 'glow', pivot: 'top' }), // square wire-and-paper lantern; hangs
]);

export const TAMERI_KIT_PIECES = Object.freeze([
  // The enclosure
  piece('shield_wall', [4, 0.4, 1.7], { solid: { box: [2, 0.2] }, skirt: 0.8 }), // tall hide shields set edge to edge on a rail
  piece('flagstaff', [0.5, 0.5, 13], { solid: { circle: 0.3 }, skirt: 1.5 }), // tapered mast, bronze-capped; two of them are the camp's tall mark
  piece('pennant', [0.5, 0.05, 4], { tint: true, pivot: 'top' }), // long cloth streamer; hangs from y 12.6 on a flagstaff
  // Tents
  piece('pavilion_life', [8, 6, 4.2], { solid: { box: [4, 3] }, skirt: 2.4 }), // the House of Life: a linen pavilion on its own mud-brick platform
  piece('awning', [4, 3, 2.6], { skirt: 0.6 }), // reed mat on four poles; walk under it
  piece('tally_board', [1.4, 0.3, 1.9], { solid: { box: [0.7, 0.2] }, skirt: 0.4 }), // the count of days of grain, in strokes
  // Grain
  piece('grain_stack', [3, 3, 2.6], { solid: { circle: 1.5 }, skirt: 0.8 }), // sacks and baskets under a net
  piece('jar_rack', [3, 0.9, 1.3], { solid: { box: [1.5, 0.45] }, skirt: 0.5 }), // five storage jars in a wooden rack
  piece('grain_jar', [0.5, 0.5, 0.8]), // one jar: what the player carries
  // The gorge
  piece('hoist', [3, 4, 7.5], { solid: { box: [1, 1] }, skirt: 1.5, pivot: 'frame' }), // a great lever on a frame with a counterweight; size is the frame, and the arm reaches 6 m beyond it toward +Z, over the drop, a net of jars on the rope
  piece('landing_stage', [5, 4, 1.2], { skirt: 7 }), // plank stage on tall posts; stands on the lip of the gorge and reaches out over it toward +Z
  piece('barge', [16, 4.5, 3], { pivot: 'waterline' }), // cargo barge with a deck hut and a steering oar; y = 0 is the water
  piece('reed_boat', [9, 2.2, 2], { pivot: 'waterline' }), // papyrus-bundle boat with upturned ends
  piece('reed_clump', [1.6, 1.6, 2.2]), // tall reeds, for the water's edge and the rim
  // Yard
  piece('brazier_bowl', [0.8, 0.8, 1.3], { solid: { circle: 0.45 }, skirt: 0.4 }),
  piece('brazier_flame', [0.5, 0.5, 0.6], { material: 'glow', pivot: 'bowl' }), // same origin as its bowl; the flame starts at y 1.1
  piece('chariot', [3.6, 1.8, 1.8], { solid: { box: [1.8, 0.9] }, skirt: 0.5 }), // parked, the pole on a prop: the archer Tiaa's
]);

export const REMORIA_KIT_PIECES = Object.freeze([
  // The wall
  piece('palisade_run', [4, 2.6, 3.2], { solid: { box: [2, 1.3] }, skirt: 1.6 }), // earth bank, a fence of stakes on it and a walk behind
  // The rounded corner of a marching camp: a quarter turn of the same bank, 2 m radius on its
  // centreline, joining a run that ends 2 m short of the corner on each wall. Front (+Z) is the
  // outward diagonal. The origin is the centre of the piece's own footprint, like every other
  // piece: the point where the two walls' centrelines would cross lies 0.93 m in front of it
  // (x 0, z +0.93), and the bank's centreline runs from (-1.41, -0.48) through (0, +0.10) to
  // (+1.41, -0.48). The camp plan places the origin, not the crossing point.
  piece('palisade_corner', [4.7, 2.8, 3.2], { solid: { box: [2.35, 1.4] }, skirt: 1.6 }),
  piece('gate_tower', [3.2, 3.2, 9], { solid: { box: [1.6, 1.6] }, skirt: 1.8 }), // timber tower with a roofed platform; a pair at each gate is the fort's tall mark
  piece('gate_span', [5.8, 1.6, 1.4], { pivot: 'centre' }), // the walk between two gate towers, whose inner faces stand 5.8 m apart, with the fort's name board; centred on all three axes and mounted at y 4.2
  piece('stake_hedge', [4, 1.4, 1.3], { solid: { box: [2, 0.7] }, skirt: 0.6 }), // crossed sharpened stakes
  // Tents
  piece('tent_legion', [3, 3.6, 2], { solid: { box: [1.5, 1.8] }, skirt: 1 }), // leather ridge tent for eight
  piece('tent_command', [8, 6, 3.6], { solid: { box: [4, 3] }, skirt: 1.8 }), // the legate's tent: red drapes and an awning
  // The crossing of the two streets
  piece('standard_wolf', [1.4, 1.4, 5.2], { solid: { circle: 0.7 }, skirt: 1 }), // stone plinth, pole, the wolf, a red cloth
  piece('tribunal', [4, 3, 1.1], { solid: { box: [2, 1.5] }, skirt: 1.4 }), // turf-and-timber platform with steps
  piece('brazier_iron', [0.7, 0.7, 1.3], { solid: { circle: 0.4 }, skirt: 0.4 }),
  piece('brazier_fire', [0.5, 0.5, 0.6], { material: 'glow', pivot: 'brazier' }), // same origin as its brazier; the fire starts at y 1.1
  piece('rack_arms', [2.4, 0.9, 1.9], { solid: { box: [1.2, 0.45] }, skirt: 0.5 }), // javelins in a rack, shields leaning
  // The colony
  piece('boundary_stone', [0.5, 0.4, 1.2], { solid: { circle: 0.35 }, skirt: 0.5 }), // the stone that ends a furrow
  piece('plough', [2.6, 0.9, 1.1], { solid: { box: [1.3, 0.45] }, skirt: 0.3 }), // bronze-shod plough and its yoke
  piece('milestone', [0.6, 0.6, 1.6], { solid: { circle: 0.35 }, skirt: 0.5 }), // round road marker with numerals
  piece('road_arch', [6.4, 1.4, 6], { skirt: 1.2 }), // a plain timber arch over a 4 m road: where the High Road leaves the valley
]);

export const EMPIRE_KITS = Object.freeze({
  akitsu: Object.freeze({ id: 'akitsu', area: 'west', url: '/game3d/threeroads/kits/akitsu.glb', pieces: AKITSU_KIT_PIECES }),
  tameri: Object.freeze({ id: 'tameri', area: 'east', url: '/game3d/threeroads/kits/tameri.glb', pieces: TAMERI_KIT_PIECES }),
  remoria: Object.freeze({ id: 'remoria', area: 'north', url: '/game3d/threeroads/kits/remoria.glb', pieces: REMORIA_KIT_PIECES }),
});

const BY_KIT = new Map(Object.values(EMPIRE_KITS).map(kit => [kit.id, new Map(kit.pieces.map(entry => [entry.id, entry]))]));
export const empireKitPiece = (kit, id) => BY_KIT.get(kit)?.get(id) || null;

// Limits each modelled kit has to meet (BUILD_RULES.md, section 7). Smaller than
// the valley kit: a camp is one place, and the west is already over its triangles.
export const EMPIRE_KIT_LIMITS = Object.freeze({
  maxPieces: 18,
  maxTrianglesLod0PerPiece: 3000,
  maxTrianglesLod1PerPiece: 800,
  maxTrianglesLod0Total: 30000,
  atlasPixels: 2048,
  maxBytes: 2.5 * 1024 * 1024,
});
