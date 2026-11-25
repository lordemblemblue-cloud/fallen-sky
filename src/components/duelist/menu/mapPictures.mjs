// Checked-in WebP artwork rendered offline from the actual map geometry.
// No Three.js imports, GPU initialization, animation or network map loading.
export const MAP_PICTURES=Object.freeze(Object.fromEntries(
 ['duel','ctf','football','tdm','control','escort','ffa','practice'].map(mode=>[mode,`/duelist/maps/${mode}.webp`])
));
export const mapPicture=mode=>Object.hasOwn(MAP_PICTURES,mode)?MAP_PICTURES[mode]:null;
