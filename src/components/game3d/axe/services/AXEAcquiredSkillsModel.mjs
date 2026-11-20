// Display-only acquired skill roster. Inventory/learned stores are the sources
// of truth; the Skill Book never turns a collected scroll into a learned skill.
export function buildAcquiredSkillEntries({
  learnedIds = [],
  inventory = {},
  storedItems = [],
  lootDefinitions = [],
  skillDefinitions = [],
  abilities = [],
  registry = [],
} = {}) {
  const defs = new Map();
  for (const def of lootDefinitions) {
    if (def?.category === 'skill' && def.id) defs.set(def.id, def);
  }
  for (const def of skillDefinitions) {
    if (def?.id) defs.set(def.id, { ...defs.get(def.id), ...def });
  }
  for (const def of abilities) {
    if (def?.id) defs.set(def.id, { ...defs.get(def.id), ...def });
  }
  for (const def of registry) {
    if (def?.skill_id) defs.set(def.skill_id, {
      ...defs.get(def.skill_id), ...def, name: def.skill_name,
    });
  }

  const entries = new Map();
  const upsert = (id, details = {}) => {
    if (typeof id !== 'string' || !id) return;
    const definition = defs.get(id) || {};
    const previous = entries.get(id) || {
      id, name: definition.name || id.replaceAll('_', ' '),
      icon: definition.icon || '✦', learned: false, collectedCount: 0,
      collectedAt: 0,
    };
    entries.set(id, { ...previous, ...details });
  };

  const collected = [
    ...(Array.isArray(inventory?.skill) ? inventory.skill : []),
    ...(Array.isArray(storedItems) ? storedItems : []).filter(item => item?.category === 'skill'),
  ];
  for (const item of collected) {
    if (!item || item.category !== 'skill') continue;
    const previous = entries.get(item.id);
    upsert(item.id, {
      name: item.name || previous?.name || defs.get(item.id)?.name || String(item.id),
      icon: item.icon || previous?.icon || defs.get(item.id)?.icon || '✦',
      collectedCount: (previous?.collectedCount || 0) + 1,
      collectedAt: Math.max(previous?.collectedAt || 0, Number(item.collectedAt) || 0),
    });
  }

  for (const id of learnedIds || []) {
    upsert(id, { learned: true });
  }

  return [...entries.values()].sort((a, b) =>
    b.collectedAt - a.collectedAt ||
    Number(b.learned) - Number(a.learned) ||
    a.name.localeCompare(b.name));
}
