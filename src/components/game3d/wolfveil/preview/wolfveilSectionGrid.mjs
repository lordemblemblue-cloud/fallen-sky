/**
 * Visual-only 100m production planning squares over the 1100m Wolfveil WIP preview.
 * Coordinates are GAME 3D world X/Z metres: the source preview has +70m Z offset.
 * Does not modify playable terrain, collisions, NPCs, routes or map authority.
 */
export const WOLFVEIL_SECTION_GRID = Object.freeze({
  id: 'wolfveil-preview-section-plan-v1',
  minX: -550, maxX: 550, minZ: -480, maxZ: 620,
  size: 100, columns: 11, rows: 11, sourceOffsetZ: 70,
});
export const SECTION_STATES = Object.freeze([
  'not-started', 'in-progress', 'needs-review', 'complete',
]);
export const SECTION_STORAGE_KEY = 'atomxe-wolfveil-section-plan-v1';
const validStatus = status => SECTION_STATES.includes(status);

export function sectionAtWorld(x, z, grid = WOLFVEIL_SECTION_GRID) {
  if (!Number.isFinite(x) || !Number.isFinite(z) ||
      x < grid.minX || x >= grid.maxX || z < grid.minZ || z >= grid.maxZ) return null;
  const column = Math.floor((x - grid.minX) / grid.size);
  const row = Math.ceil((grid.maxZ - z) / grid.size) - 1;
  return sectionAtRowColumn(Math.max(0, row), column, grid);
}
export function sectionAtRowColumn(row, column, grid = WOLFVEIL_SECTION_GRID) {
  if (!Number.isInteger(row) || !Number.isInteger(column) ||
      row < 0 || row >= grid.rows || column < 0 || column >= grid.columns) return null;
  const minX = grid.minX + column * grid.size;
  const maxZ = grid.maxZ - row * grid.size;
  const maxX = Math.min(grid.maxX, minX + grid.size);
  const minZ = Math.max(grid.minZ, maxZ - grid.size);
  return {
    id: 'WV-R' + String(row + 1).padStart(2, '0') + '-C' + String(column + 1).padStart(2, '0'),
    row, column, minX, maxX, minZ, maxZ,
    centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2,
  };
}
export function sectionFromId(id, grid = WOLFVEIL_SECTION_GRID) {
  const match = /^WV-R(\d{2})-C(\d{2})$/.exec(id || '');
  return match ? sectionAtRowColumn(Number(match[1]) - 1, Number(match[2]) - 1, grid) : null;
}
export function allWolfveilSections(grid = WOLFVEIL_SECTION_GRID) {
  return Array.from({ length: grid.rows * grid.columns }, (_, i) =>
    sectionAtRowColumn(Math.floor(i / grid.columns), i % grid.columns, grid));
}
export function normalizeSectionPlan(value, grid = WOLFVEIL_SECTION_GRID) {
  const input = value && typeof value === 'object' ? value : {};
  const states = {};
  const notes = {};
  for (const [id, state] of Object.entries(input.states || {})) {
    if (sectionFromId(id, grid) && validStatus(state) && state !== 'not-started')
      states[id] = state;
  }
  for (const [id, note] of Object.entries(input.notes || {})) {
    if (sectionFromId(id, grid) && typeof note === 'string' && note.trim())
      notes[id] = note.slice(0, 1200);
  }
  const selectedId = sectionFromId(input.selectedId, grid)?.id || null;
  return { selectedId, states, notes };
}
export function exportWolfveilSectionPlan(value, sites = [], grid = WOLFVEIL_SECTION_GRID) {
  const plan = normalizeSectionPlan(value, grid);
  return {
    schema: 'atomxe.wolfveil-section-plan.v1',
    map: 'Wolfveil editing-preview WIP (NOT live Play)',
    coordinates: 'X/Z world metres, Y is preview-only illustrative height; source +70m Z',
    grid, generatedAt: new Date().toISOString(),
    selectedId: plan.selectedId,
    sections: allWolfveilSections(grid).map(section => ({
      ...section, status: plan.states[section.id] || 'not-started',
      notes: plan.notes[section.id] || '',
      referenceSites: sites.filter(site =>
        sectionAtWorld(site.x, site.z + grid.sourceOffsetZ, grid)?.id === section.id)
        .map(site => ({ id: site.id, name: site.name })),
    })),
  };
}
