// Cultural inspirations and genre directions a character can be built around.
// Values are stored on the appearance and shown on the character card.

export const GENRE_DIRECTIONS = [
  { id: 'fantasy', label: 'Fantasy', description: 'High fantasy, myth and old magic.' },
  { id: 'dark_fantasy', label: 'Dark fantasy', description: 'Grim worlds, ruined kingdoms, costly power.' },
  { id: 'cyberpunk', label: 'Cyberpunk', description: 'Neon cities, chrome and corporate ruin.' },
  { id: 'sci_fi', label: 'Science fiction', description: 'Far futures, ships and strange physics.' },
  { id: 'modern', label: 'Modern day', description: 'Present-day streets and quiet mysteries.' },
  { id: 'historical', label: 'Historical', description: 'Real eras, real weight, no magic required.' },
];

export const CULTURAL_INSPIRATIONS = [
  { id: 'norse', label: 'Norse', description: 'Longships, runes and hard northern winters.' },
  { id: 'japanese', label: 'Japanese', description: 'Sumi-e ink, shrine gates and quiet precision.' },
  { id: 'west_african', label: 'West African', description: 'Indigo cloth, brass work and drum rhythm.' },
  { id: 'andean', label: 'Andean', description: 'High stone terraces and woven colour.' },
  { id: 'arabian', label: 'Arabian', description: 'Desert trade routes, geometry and lantern light.' },
  { id: 'polynesian', label: 'Polynesian', description: 'Ocean voyaging, tattoo and carved wood.' },
  { id: 'slavic', label: 'Slavic', description: 'Birch forest, embroidery and household spirits.' },
  { id: 'celtic', label: 'Celtic', description: 'Hill forts, knotwork and misted coastlines.' },
];

const GENRE_IDS = new Set(GENRE_DIRECTIONS.map((item) => item.id));
const INSPIRATION_IDS = new Set(CULTURAL_INSPIRATIONS.map((item) => item.id));

export function normalizeGenreDirection(value) {
  const id = String(value || '').toLowerCase();
  return GENRE_IDS.has(id) ? id : 'fantasy';
}

export function normalizeCulturalInspirations(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .map((id) => String(id || '').toLowerCase())
    .filter((id) => INSPIRATION_IDS.has(id) && !seen.has(id) && seen.add(id));
}