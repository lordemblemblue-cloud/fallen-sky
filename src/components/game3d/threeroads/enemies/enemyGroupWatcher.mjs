// Watches the monsters of each group and says when they die. Pure: no scene,
// no timers, so node can test it with fake entries.
//
// It depends on no hook in the game's kill paths. A monster counts as
// defeated the first time it is seen dying (`dying`), switched off
// (`alive === false`), or gone from the game's enemy list, whatever did it:
// the main hit path, a legacy targeted spell, a companion, a peer's kill.
// A group taken away on purpose (closeGroup) announces nothing.
//
// For each defeat it emits `enemies:defeated` { groupId, kind, id, tier } and
// tells the pledges through `dispatchQuestEvent` ({ type: 'enemy_killed',
// targetId: groupId, placeId?, kind, tier, count: 1 }; placeId only when the
// group was given one); when the last planned
// monster of a group has died it emits `enemies:groupCleared` { groupId, kind }.
export function createEnemyGroupWatcher({ emit = () => {}, dispatchQuestEvent = () => {} } = {}) {
  const groups = new Map();

  const safe = (fn, ...args) => {
    try { fn(...args); } catch (error) { globalThis.console?.warn('Three Roads enemies: listener failed', error); }
  };

  function finishIfCleared(group) {
    if (group.cleared || group.planned <= 0) return;
    if (group.entries.length < group.planned || group.defeated < group.planned) return;
    group.cleared = true;
    safe(emit, 'enemies:groupCleared', { groupId: group.groupId, kind: group.kind });
  }

  return {
    // planned: how many monsters this group is expected to have.
    openGroup({ groupId, kind, tier = 'normal', placeId = null, level = null }, planned) {
      const group = {
        groupId: String(groupId), kind, tier, placeId, level,
        planned: Math.max(0, Math.floor(Number(planned) || 0)),
        entries: [], counted: new Set(), defeated: 0, cleared: false,
      };
      groups.set(group.groupId, group);
      return group;
    },
    addEntry(groupId, entry) {
      const group = groups.get(String(groupId));
      if (!group || !entry) return false;
      group.entries.push(entry);
      return true;
    },
    // One planned monster will never come (its model failed to load).
    dropPlanned(groupId) {
      const group = groups.get(String(groupId));
      if (!group || group.planned <= 0) return;
      group.planned -= 1;
      finishIfCleared(group);
    },
    // Take a group away without announcing anything (despawn, dispose).
    closeGroup(groupId) {
      const group = groups.get(String(groupId));
      if (!group) return null;
      groups.delete(group.groupId);
      return group;
    },
    getGroup(groupId) { return groups.get(String(groupId)) || null; },
    // A group is live from openGroup until it is cleared or closed.
    isLive(groupId) {
      const group = groups.get(String(groupId));
      return !!group && !group.cleared;
    },
    groups() { return groups; },
    // Called every frame with the game's enemy list. Allocates nothing unless
    // a monster has died.
    scan(enemies) {
      for (const group of groups.values()) {
        const entries = group.entries;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (group.counted.has(entry)) continue;
          const gone = !Array.isArray(enemies) || enemies.indexOf(entry) === -1;
          if (!entry.dying && entry.alive !== false && !gone) continue;
          group.counted.add(entry);
          group.defeated += 1;
          safe(emit, 'enemies:defeated', { groupId: group.groupId, kind: group.kind, id: entry.id, tier: group.tier });
          // placeId only when the spawn request named one (PLEDGE_ENGINE.md
          // section 3: a defeat step with a place ignores a kill with another).
          const kill = { type: 'enemy_killed', targetId: group.groupId };
          if (group.placeId !== null && group.placeId !== undefined) kill.placeId = group.placeId;
          kill.kind = group.kind;
          kill.tier = group.tier;
          kill.count = 1;
          safe(dispatchQuestEvent, kill);
        }
        finishIfCleared(group);
      }
    },
    // Monsters of open groups that have not died yet.
    aliveCount() {
      let n = 0;
      for (const group of groups.values()) n += group.entries.length - group.counted.size;
      return n;
    },
    clear() { groups.clear(); },
  };
}
