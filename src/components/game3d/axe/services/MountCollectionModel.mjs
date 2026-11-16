// Pure projection for the owner-facing Mounts collection.
// The inventory contains only genuinely owned mounts; no shop/catalog defaults
// and no fusion/gear transaction state is mutated by reading this view.
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());

export function buildOwnedMountRoster(snapshot) {
  const mounts = Array.isArray(snapshot?.mounts) ? snapshot.mounts : [];
  return mounts.filter(mount => mount && mount.instanceId).map(mount => {
    const definition = mount.definition || {};
    const bonuses = {};
    for (const [key, value] of Object.entries(mount.bonuses || {})) {
      if (Number.isFinite(Number(value))) bonuses[key] = number(value);
    }
    return {
      instanceId: mount.instanceId,
      name: definition.name || label(mount.definitionId) || 'Owned Mount',
      definitionId: mount.definitionId,
      rarity: label(definition.rarity || 'unranked'),
      specialty: label(definition.specialty || 'balanced'),
      active: snapshot.activeMountId === mount.instanceId,
      registered: snapshot.registeredMountId === mount.instanceId,
      riding: snapshot.ridingMountId === mount.instanceId,
      growthPercent: Math.max(0, Math.min(100, number(mount.growthPercent))),
      totalXp: Math.max(0, number(mount.totalXp)),
      speedMultiplier: number(mount.speedMultiplier) || number(definition.baseSpeedMultiplier) || 1,
      bonuses,
      sourceStats: {
        ridingXp: number(mount.sourceStats?.ridingXp),
        pveXp: number(mount.sourceStats?.pveXp),
        pvpXp: number(mount.sourceStats?.pvpXp),
      },
      spiritualRank: number(mount.spiritualProfile?.rank),
      spiritualMaxRank: number(mount.spiritualProfile?.maxRank),
      legendary: !!mount.legendary?.isLegendary,
      abilities: (mount.legendary?.abilities || []).filter(ability => ability?.label)
        .map(ability => ({ label: ability.label, value: ability.value, unit: ability.unit })),
    };
  });
}
