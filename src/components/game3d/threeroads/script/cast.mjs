// The cast of whatever story is registered with the story tools: its people, the things that
// speak without a body, and its roles. The cast subsystem reads it.
//
// No story is registered: the War of Three Roads was retired on 2026-11-27. Its people are the
// tests' sample cast (tests/fixtures/three-roads-sample/castTable.mjs). A story registers its
// cast with setStoryCast before its world is created.
//
// `home` is where a person normally stands: { area | region, x, z, facing }
// in LOCAL Wolfveil metres for the five areas (x east, z north; facing in
// radians, 0 = looking north, +z). `homeAfter: { flag, home }` moves them (or
// takes them away: home null) once that story flag is set. `alsoAt` lists
// further places the same person is found in other areas: each area is its
// own scene, so a player only ever meets one of them at a time. A person with
// no home at all only appears when a pledge brings them in.
//
// `giver: true` people can be spoken to for pledges and must be pushed into
// the game's quest-giver list under this `id`. `existing` people are already
// placed by the game itself and are listed here only so the script can name
// them: the cast subsystem does not spawn them.
//
// `look` is a hint for the model until each person has their own:
// body (m | f | child | elder_m | elder_f), build, colours, and what they carry.
export const THREE_ROADS_EMPIRES = Object.freeze({
  akitsu: Object.freeze({ id: 'akitsu', factionId: 'AXE_Faction_1', name: 'Akitsu', title: 'The Resolute', colour: 0x2f4a7a, trim: 0xdcb58a }),
  remoria: Object.freeze({ id: 'remoria', factionId: 'AXE_Faction_2', name: 'Remoria', title: 'The Vigilant', colour: 0x8c2f2f, trim: 0xa5cbe9 }),
  tameri: Object.freeze({ id: 'tameri', factionId: 'AXE_Faction_3', name: 'Tameri', title: 'The Radiant', colour: 0xc9962e, trim: 0xedc18a }),
  valley: Object.freeze({ id: 'valley', factionId: null, name: 'Wolfveil', title: 'The Valley', colour: 0x4a6b4f, trim: 0xe8e2d0 }),
});

// Which empire a player's faction is: 'akitsu', 'remoria', 'tameri' or 'none'.
export function threeRoadsEmpireOfFaction(factionId) {
  for (const empire of Object.values(THREE_ROADS_EMPIRES))
    if (empire.factionId && empire.factionId === factionId) return empire.id;
  return 'none';
}

// A person of a cast. `hail` names one line (in a band's lines) the person says, unasked, to a
// traveller who comes near. `standsFor` makes the entry a role: a name a pledge can use wherever
// it would name a person, standing for a different person depending on the player's side.
export const storyPerson = data => Object.freeze({ giver: false, existing: false, home: null, hail: null, ...data });

export let THREE_ROADS_CAST = Object.freeze([]);
// Things that speak a line but have no body: what is written, read aloud.
export let THREE_ROADS_VOICES = Object.freeze([]);
export let THREE_ROADS_ROLES = Object.freeze([]);
// The areas whose places have been built. People whose home lies in an area that is not built
// are not brought in: they would stand in open country.
export let THREE_ROADS_BUILT_AREAS = Object.freeze([]);
let BY_ID = new Map();

export function setStoryCast({ cast = [], voices = [], roles = [], builtAreas = [] } = {}) {
  THREE_ROADS_CAST = Object.freeze([...cast]);
  THREE_ROADS_VOICES = Object.freeze([...voices]);
  THREE_ROADS_ROLES = Object.freeze([...roles]);
  THREE_ROADS_BUILT_AREAS = Object.freeze([...builtAreas]);
  BY_ID = new Map([...THREE_ROADS_CAST, ...THREE_ROADS_VOICES, ...THREE_ROADS_ROLES].map(entry => [entry.id, entry]));
}

// A person, a voice or a role by id.
export const threeRoadsPerson = id => BY_ID.get(id) || null;

// The id of the real person an id means for a player of this side ('akitsu', 'tameri',
// 'remoria' or 'none'): a role's stand-in, or the id itself.
export function threeRoadsStandIn(id, empire = 'none') {
  const entry = BY_ID.get(id);
  if (!entry?.standsFor) return id;
  return entry.standsFor[empire] || entry.standsFor.none;
}

// Where a person's main home is given the story so far. `flags` are the quest store's story
// flags; a person with `homeAfter` moves (or leaves: home null) once that flag is set.
export function threeRoadsHomeOf(entry, flags = {}) {
  if (!entry) return null;
  if (entry.homeAfter && flags && flags[entry.homeAfter.flag]) return entry.homeAfter.home || null;
  return entry.home || null;
}

// Who stands in this scene without being brought in by a pledge. Each result is the person
// with `home` already resolved for these flags and this scene (their main home, or the
// `alsoAt` entry that lies in it). People in areas not built yet are left out unless
// `includeUnbuilt` is set.
export function threeRoadsCastAtHome({ area = null, region = null, flags = {}, includeUnbuilt = false } = {}) {
  if (area && !includeUnbuilt && !THREE_ROADS_BUILT_AREAS.includes(area)) return [];
  const here = home => !!home && ((area && home.area === area) || (region && home.region === region));
  const result = [];
  for (const entry of THREE_ROADS_CAST) {
    if (entry.existing) continue;
    const home = [threeRoadsHomeOf(entry, flags), ...(entry.alsoAt || [])].find(here);
    if (!home) continue;
    result.push(home === entry.home ? entry : Object.freeze({ ...entry, home }));
  }
  return result;
}
