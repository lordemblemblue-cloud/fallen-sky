// Stand-ins for the cast and the enemies subsystems, for trying the pledge
// world before theirs are merged. Not part of the game: nothing imports this
// file. In the dev server, from the browser console:
//   const fakes = (await import('/src/components/game3d/threeroads/pledgeworld/dev/pledgeWorldFakes.mjs'))
//     .installPledgeWorldFakes(window.__gw3dThreeRoads, { getPlayer: () => window.__localPlayerPos });
// They speak only the bus events of BUILD_RULES (plus cast:locate, see
// pledgeWorldSubsystem.mjs) and report a death the way the real enemies do.
// People are not drawn unless `mark(id, x, z)` is handed in; it should return
// { move(x, z), remove() }.

export function installPledgeWorldFakes(threeRoads, {
  getPlayer = () => ({ x: 0, z: 0 }),
  mark = null,
  win = globalThis.window,
  cast = true,
  enemies = true,
} = {}) {
  const bus = threeRoads?.bus;
  if (!bus) throw new Error('installPledgeWorldFakes needs the Three Roads world (window.__gw3dThreeRoads)');
  const people = new Map();   // id -> { x, z, follow, marker }
  const groups = new Map();   // groupId -> { count, kind, tier, placeId, x, z }
  const said = [];
  const offs = [];
  const on = (type, fn) => offs.push(bus.on(type, fn));

  const place = (id, x, z) => {
    let entry = people.get(id);
    if (!entry) { entry = { x, z, follow: null, marker: mark ? mark(id, x, z) : null }; people.set(id, entry); }
    entry.x = x; entry.z = z;
    entry.marker?.move?.(x, z);
    return entry;
  };

  if (cast) {
    on('cast:spawn', detail => {
      place(detail.id, detail.x, detail.z);
      bus.emit('cast:ready', { id: detail.id });
    });
    on('cast:despawn', detail => {
      people.get(detail.id)?.marker?.remove?.();
      people.delete(detail.id);
    });
    // No walking: they are there at once.
    on('cast:moveTo', detail => {
      if (!people.has(detail.id)) return;
      place(detail.id, detail.x, detail.z).follow = null;
      bus.emit('cast:arrived', { id: detail.id, x: detail.x, z: detail.z });
    });
    on('cast:follow', detail => {
      const entry = people.get(detail.id);
      if (entry) entry.follow = detail.target === 'player' ? Number(detail.distance) || 3 : null;
    });
    on('cast:say', detail => { said.push({ id: detail.id, lineId: detail.lineId, text: detail.text, seconds: detail.seconds }); });
    on('cast:locate', query => {
      const entry = people.get(query.id);
      if (!entry) return;
      if (entry.follow !== null) {
        const player = getPlayer() || { x: 0, z: 0 };
        place(query.id, player.x + entry.follow, player.z);
      }
      query.x = entry.x; query.z = entry.z; query.found = true;
    });
  }

  if (enemies) {
    on('enemies:spawnGroup', detail => {
      if (groups.has(detail.groupId)) return;
      groups.set(detail.groupId, { ...detail });
    });
    on('enemies:despawnGroup', detail => { groups.delete(detail?.groupId); });
  }

  return {
    people, groups, said,
    // Stand a person in the scene who lives there (the cast would do this from the cast table).
    stand(id, x, z) { place(id, x, z); bus.emit('cast:ready', { id }); },
    // One of a group's monsters dies.
    kill(groupId, times = 1) {
      let killed = 0;
      for (let i = 0; i < times; i++) {
        const group = groups.get(groupId);
        if (!group || group.count <= 0) break;
        group.count--;
        killed++;
        const detail = { type: 'enemy_killed', targetId: groupId, kind: group.kind, tier: group.tier, count: 1 };
        if (group.placeId) detail.placeId = group.placeId;
        win.dispatchEvent(new win.CustomEvent('axePledgeEvent', { detail }));
        bus.emit('enemies:defeated', { groupId, kind: group.kind, id: groupId + ':' + group.count, tier: group.tier });
        if (!group.count) { groups.delete(groupId); bus.emit('enemies:groupCleared', { groupId, kind: group.kind }); }
      }
      return killed;
    },
    remove() {
      for (const off of offs.splice(0)) off();
      for (const entry of people.values()) entry.marker?.remove?.();
      people.clear();
      groups.clear();
    },
  };
}
