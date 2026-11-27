// Phase 44: pure offline JSON validation. No game/runtime imports or writes.
// Validation is not permission to activate content or grant rewards.
export function validateNpcDraftRegistry(input) {
  const errors = [];
  const fail = (path, reason) => errors.push(`${path}: ${reason}`);
  const plain = value => value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const ids = (prefix, count, width = 2) => Array.from({ length: count },
    (_, i) => prefix + String(i + 1).padStart(width, '0'));
  const main = ids('M', 20), side = ids('S', 55), discoveries = ids('D', 50);
  const npcs = ids('FS_NPC_', 30, 3);
  const nonblank = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
  const shape = (value, keys, path) => {
    if (!plain(value)) { fail(path, 'expected a plain JSON object'); return false; }
    for (const key of keys) if (!Object.hasOwn(value, key)) fail(path + '.' + key, 'missing field');
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(path + '.' + key, 'unsupported field');
    return true;
  };
  const refs = (value, allowed, path, exact = false) => {
    const seen = new Set();
    if (!Array.isArray(value)) { fail(path, 'expected array'); return seen; }
    for (const entry of value) {
      if (typeof entry !== 'string' || !allowed.includes(entry)) {
        fail(path, 'unknown identifier'); continue;
      }
      if (seen.has(entry)) fail(path, 'duplicate identifier ' + entry);
      seen.add(entry);
    }
    if (exact) for (const id of allowed) if (!seen.has(id)) fail(path, 'missing identifier ' + id);
    return seen;
  };
  const textList = (value, path) => {
    if (!Array.isArray(value) || value.length === 0 || !Array.from(value).every(nonblank)) {
      fail(path, 'expected nonempty text array');
    } else if (new Set(value).size !== value.length) fail(path, 'duplicate text entry');
  };
  if (!shape(input, ['schemaVersion', 'status', 'sourceAuthority', 'canonicalIds', 'notes', 'actors'], 'registry')) {
    return { ok: false, errors, coverage: null };
  }
  if (input.schemaVersion !== 1) fail('schemaVersion', 'unsupported schema');
  if (input.status !== 'DESIGN_DRAFT_NOT_RUNTIME') fail('status', 'must remain a design draft');
  textList(input.sourceAuthority, 'sourceAuthority');
  textList(input.notes, 'notes');
  if (shape(input.canonicalIds, ['main', 'side', 'discoveries'], 'canonicalIds')) {
    refs(input.canonicalIds.main, main, 'canonicalIds.main', true);
    refs(input.canonicalIds.side, side, 'canonicalIds.side', true);
    refs(input.canonicalIds.discoveries, discoveries, 'canonicalIds.discoveries', true);
  }
  const seenNpcs = new Set(), names = new Set(), prefixes = new Set(), coordinators = new Map(), mainLinks = new Set();
  if (!Array.isArray(input.actors)) {
    fail('actors', 'expected array');
    return { ok: false, errors, coverage: null };
  }
  if (input.actors.length !== npcs.length) fail('actors', 'expected exactly 30 actors');
  for (const [index, actor] of input.actors.entries()) {
    const path = 'actors[' + index + ']';
    if (!shape(actor, ['proposedNpcId', 'name', 'role', 'reality', 'proposedLocation',
      'sideQuestCoordination', 'mainStoryAssociations', 'proposedReward', 'proposedPersonalPrefix',
      'contentStatus', 'enabled'], path)) continue;
    const id = actor.proposedNpcId;
    if (!npcs.includes(id)) fail(path + '.proposedNpcId', 'unknown NPC identifier');
    else {
      if (seenNpcs.has(id)) fail(path + '.proposedNpcId', 'duplicate NPC identifier');
      seenNpcs.add(id);
    }
    for (const key of ['name', 'role', 'proposedLocation', 'proposedReward']) {
      if (!nonblank(actor[key])) fail(path + '.' + key, 'expected nonempty text');
    }
    if (nonblank(actor.name)) {
      const name = actor.name.trim().toLowerCase();
      if (names.has(name)) fail(path + '.name', 'duplicate name');
      names.add(name);
    }
    const expectedReality = ['FS_NPC_004', 'FS_NPC_030'].includes(id) ? 'AUTHORIZED_DIVINE' :
      ['FS_NPC_020', 'FS_NPC_028'].includes(id) ? 'ORIGINAL' : 'PRESERVED';
    if (actor.reality !== expectedReality) fail(path + '.reality', 'does not match proposed reality scope');
    if (actor.contentStatus !== 'DRAFT' || actor.enabled !== false) fail(path, 'only disabled DRAFT actors permitted');
    const prefix = actor.proposedPersonalPrefix;
    if (id === 'FS_NPC_001') {
      if (prefix !== null) fail(path + '.proposedPersonalPrefix', 'Aldren prefix unresolved');
    } else if (typeof prefix !== 'string' || !/^[A-Z]{3}$/.test(prefix)) {
      fail(path + '.proposedPersonalPrefix', 'expected three-letter draft prefix');
    } else {
      if (prefixes.has(prefix)) fail(path + '.proposedPersonalPrefix', 'duplicate prefix');
      prefixes.add(prefix);
    }
    const sideLinks = refs(actor.sideQuestCoordination, side, path + '.sideQuestCoordination');
    if (sideLinks.size === 0) fail(path + '.sideQuestCoordination', 'at least one coordination link required');
    for (const quest of sideLinks) {
      if (coordinators.has(quest)) fail(path + '.sideQuestCoordination', 'multiple coordinators for ' + quest);
      coordinators.set(quest, id);
    }
    const links = refs(actor.mainStoryAssociations, main, path + '.mainStoryAssociations');
    if (links.size === 0) fail(path + '.mainStoryAssociations', 'at least one thematic link required');
    for (const link of links) mainLinks.add(link);
  }
  for (const id of npcs) if (!seenNpcs.has(id)) fail('actors', 'missing NPC ' + id);
  for (const id of side) if (!coordinators.has(id)) fail('actors', 'missing side coordination ' + id);
  for (const id of main) if (!mainLinks.has(id)) fail('actors', 'missing main association ' + id);
  // Strict shape forbids added giver/verifier/activation/physical-presence fields.
  // These special links are thematic only; this validator grants no authority.
  if (coordinators.get('S38') !== 'FS_NPC_025') fail('S38', 'expected Hesper thematic subject link');
  if (coordinators.get('S51') !== 'FS_NPC_030') fail('S51', 'expected antagonist thematic link');
  return { ok: errors.length === 0, errors, coverage: {
    actors: seenNpcs.size, mainAssociations: mainLinks.size, sideCoordination: coordinators.size,
    requiredCanonicalIds: main.length + side.length + discoveries.length,
    enabledActors: input.actors.filter(actor => plain(actor) && actor.enabled === true).length
  } };
}
