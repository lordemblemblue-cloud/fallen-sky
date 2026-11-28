// Administrator-only shortcuts to a story's locations. The list is empty: every entry pointed
// at a place of the War of Three Roads, which was retired on 2026-11-27. The admin routing that
// reads this list is unchanged; a story adds { id, name, detail, x, z, area, preview } entries.
export const QUEST_TEST_DESTINATIONS = Object.freeze([]);

const BY_ID = new Map(QUEST_TEST_DESTINATIONS.map(entry => [entry.id, entry]));
export const questTestDestination = id => BY_ID.get(id) || null;
