// Pledges: multi-step quests for Game 3D. Pure data and validation, no React,
// no Three.js, no storage, no network.
//
// A pledge is defined with definePledge() and comes back as a frozen object the
// existing quest code can treat as a quest (id, npcId, title, objectives, ...)
// plus `sequential: true` and a `pledge` block holding the steps as written.
// Each step becomes exactly one objective that one world event can advance.
//
// Nothing here grants anything: a pledge's `reward` is always empty. Rewards
// and standings are decided by the server from a completion claim
// (pledgeClaim.mjs). See docs/game3d/three-empires/PLEDGE_ENGINE.md.

// kind: the word used in pledge data.
// objectiveType: what the step becomes in `objectives[]` (the 14 types of
//   AXEQuestFramework where one fits, a new type where none does).
// eventType: the one event that advances it.
// idField: which field of the event names the thing ('targetId' or 'itemId').
// idFrom: where the step takes that id from, in order of preference.
// matchPlace: the event must also carry the step's placeId.
// seconds: the step may say how long the deed has to be kept up.
const KIND_ROWS = [
  { kind: 'talk', objectiveType: 'talk', eventType: 'npc_talked',
    idField: 'targetId', idFrom: ['target'], idRequired: true },
  { kind: 'go_to', objectiveType: 'discover_location', eventType: 'location_discovered',
    idField: 'targetId', idFrom: ['target', 'placeId'], idRequired: true },
  { kind: 'defeat', objectiveType: 'kill', eventType: 'enemy_killed',
    idField: 'targetId', idFrom: ['target'], idRequired: false, matchPlace: true,
    needsTargetOrPlace: true },
  { kind: 'defeat_boss', objectiveType: 'defeat_boss', eventType: 'boss_killed',
    idField: 'targetId', idFrom: ['target'], idRequired: true },
  { kind: 'pick_up', objectiveType: 'collect_item', eventType: 'item_collected',
    idField: 'itemId', idFrom: ['target'], idRequired: true },
  { kind: 'carry', objectiveType: 'carry', eventType: 'carry_completed', newType: true,
    idField: 'targetId', idFrom: ['target'], idRequired: true },
  { kind: 'deliver', objectiveType: 'deliver', eventType: 'item_delivered', newType: true,
    idField: 'targetId', idFrom: ['target'], idRequired: true },
  { kind: 'use', objectiveType: 'interact', eventType: 'world_interact',
    idField: 'targetId', idFrom: ['target'], idRequired: true, seconds: true },
  { kind: 'escort', objectiveType: 'escort', eventType: 'escort_completed',
    idField: 'targetId', idFrom: ['target'], idRequired: true },
  { kind: 'defend', objectiveType: 'defend', eventType: 'defend_completed',
    idField: 'targetId', idFrom: ['target', 'placeId'], idRequired: true, seconds: true },
  { kind: 'hold_zone', objectiveType: 'capture', eventType: 'capture_completed',
    idField: 'targetId', idFrom: ['target', 'placeId'], idRequired: true, seconds: true },
  { kind: 'choose', objectiveType: 'choose', eventType: 'choice_made', newType: true,
    idField: 'targetId', idFrom: ['id'], idRequired: true, choice: true },
  { kind: 'spare', objectiveType: 'spare', eventType: 'enemy_spared', newType: true,
    idField: 'targetId', idFrom: ['target'], idRequired: true },
];

export const PLEDGE_STEP_KINDS = Object.freeze(Object.fromEntries(
  KIND_ROWS.map((row) => [row.kind, Object.freeze({
    matchPlace: false, needsTargetOrPlace: false, newType: false, seconds: false, choice: false,
    ...row, idFrom: Object.freeze([...row.idFrom]),
  })]),
));
export const PLEDGE_STEP_KIND_IDS = Object.freeze(KIND_ROWS.map((row) => row.kind));

// Objective types and event names this module adds to the game's 14.
export const PLEDGE_NEW_OBJECTIVE_TYPES = Object.freeze(
  KIND_ROWS.filter((row) => row.newType).map((row) => row.objectiveType),
);
export const PLEDGE_NEW_EVENT_TYPES = Object.freeze(
  KIND_ROWS.filter((row) => row.newType).map((row) => row.eventType),
);
// Events a step may name in `failsOn`. A hook may send others; these are the
// ones the engine documents.
export const PLEDGE_FAIL_EVENT_TYPES = Object.freeze([
  'carry_dropped', 'escort_failed', 'defend_failed', 'zone_lost', 'use_interrupted',
  'enemy_killed', 'player_died',
]);

export const PLEDGE_OUTCOMES = Object.freeze(['kept', 'bent', 'broken']);
export const PLEDGE_STANDING_KEYS = Object.freeze(['renown', 'trust', 'regard']);
export const PLEDGE_CATEGORIES = Object.freeze(['chapter', 'side', 'story', 'world', 'event']);
export const PLEDGE_MAX_STEPS = 24;
export const PLEDGE_MAX_STEP_COUNT = 1000;

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const TOP_KEYS = new Set([
  'id', 'npcId', 'title', 'description', 'unlockLevel', 'recommendedLevel', 'factionId',
  'requires', 'requiresAll', 'storyFlagsRequired', 'storyFlagsOnComplete', 'repeatable',
  'priority', 'category', 'sequential', 'reward', 'pledge',
]);
const PLEDGE_KEYS = new Set([
  'line', 'chapter', 'swornTo', 'cause', 'cost', 'steps', 'choices', 'standings',
  'rewardPreview',
]);
const STEP_KEYS = new Set([
  'id', 'kind', 'text', 'placeId', 'target', 'count', 'seconds', 'optional', 'failsOn',
]);
const CHOICE_KEYS = new Set(['prompt', 'options']);
const OPTION_KEYS = new Set(['id', 'text', 'flags', 'outcome']);
const STANDING_BLOCK_KEYS = new Set(['kept', 'bent', 'broken', 'optional']);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isId = (value) => typeof value === 'string' && ID_PATTERN.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export class PledgeDefinitionError extends Error {
  constructor(pledgeId, problems) {
    super(`Pledge "${pledgeId}" is not valid:\n- ${problems.join('\n- ')}`);
    this.name = 'PledgeDefinitionError';
    this.pledgeId = pledgeId;
    this.problems = problems;
  }
}

// The key a recorded choice is stored under in the quest store's `choices`.
export function pledgeChoiceKey(pledgeId, stepId) {
  return `${pledgeId}:${stepId}`;
}

// The story flag that says how a pledge last ended.
export function pledgeOutcomeFlag(pledgeId, outcome) {
  return `pledge:${pledgeId}:${outcome}`;
}

export function isPledge(quest) {
  return quest?.sequential === true && Array.isArray(quest?.pledge?.steps) &&
    Array.isArray(quest?.objectives) && quest.objectives.length === quest.pledge.steps.length;
}

const emptyStanding = () => ({ renown: 0, trust: 0, regard: 0 });

function readStanding(raw, where, problems) {
  const result = emptyStanding();
  if (raw === undefined) return result;
  if (!isObject(raw)) { problems.push(`${where} must be an object like { renown, trust, regard }`); return result; }
  for (const key of Object.keys(raw)) {
    if (!PLEDGE_STANDING_KEYS.includes(key)) { problems.push(`${where} has unknown standing "${key}"`); continue; }
    if (!Number.isFinite(raw[key])) { problems.push(`${where}.${key} must be a number`); continue; }
    result[key] = raw[key];
  }
  return result;
}

function readFlagList(raw, where, problems) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((flag) => !isText(flag))) {
    problems.push(`${where} must be a list of flag names`);
    return [];
  }
  return [...new Set(raw)];
}

function readFailsOn(raw, where, problems) {
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (!list.length || list.some((name) => !isText(name))) {
    problems.push(`${where} failsOn must be an event name or a list of event names`);
    return [];
  }
  return [...new Set(list)];
}

function readStep(raw, index, seenIds, problems) {
  const label = isObject(raw) && isId(raw.id) ? `step "${raw.id}"` : `step #${index + 1}`;
  if (!isObject(raw)) { problems.push(`${label} must be an object`); return null; }
  for (const key of Object.keys(raw)) {
    if (!STEP_KEYS.has(key)) problems.push(`${label} has unknown field "${key}"`);
  }
  if (!isId(raw.id)) problems.push(`${label} needs an id (letters, digits, _ . -)`);
  else if (seenIds.has(raw.id)) problems.push(`${label} uses an id another step already has`);
  else seenIds.add(raw.id);

  const row = typeof raw.kind === 'string' && own(PLEDGE_STEP_KINDS, raw.kind)
    ? PLEDGE_STEP_KINDS[raw.kind] : null;
  if (!row) {
    problems.push(`${label} has unknown kind "${raw.kind}" (kinds: ${PLEDGE_STEP_KIND_IDS.join(', ')})`);
    return null;
  }
  if (!isText(raw.text)) problems.push(`${label} needs text`);
  if (raw.placeId !== undefined && !isId(raw.placeId)) problems.push(`${label} placeId must be an id`);
  if (raw.target !== undefined && !isId(raw.target)) problems.push(`${label} target must be an id`);
  if (raw.optional !== undefined && typeof raw.optional !== 'boolean') problems.push(`${label} optional must be true or false`);

  let count = 1;
  if (raw.count !== undefined) {
    if (!Number.isSafeInteger(raw.count) || raw.count < 1 || raw.count > PLEDGE_MAX_STEP_COUNT) {
      problems.push(`${label} count must be a whole number from 1 to ${PLEDGE_MAX_STEP_COUNT}`);
    } else count = raw.count;
  }
  if (raw.seconds !== undefined) {
    if (!row.seconds) problems.push(`${label} of kind "${row.kind}" cannot have seconds (only use, defend, hold_zone)`);
    else if (!Number.isFinite(raw.seconds) || raw.seconds <= 0) problems.push(`${label} seconds must be a number above 0`);
  }

  const failsOn = readFailsOn(raw.failsOn, label, problems);
  if (row.choice) {
    if (count !== 1) problems.push(`${label} of kind "choose" cannot have a count`);
    if (failsOn.length) problems.push(`${label} of kind "choose" cannot have failsOn`);
    if (raw.target !== undefined) problems.push(`${label} of kind "choose" takes no target (its id is the target)`);
  }
  if (failsOn.includes(row.eventType)) problems.push(`${label} failsOn names the event that completes it ("${row.eventType}")`);

  if (row.needsTargetOrPlace && raw.target === undefined && raw.placeId === undefined) {
    problems.push(`${label} of kind "${row.kind}" needs a target, a placeId, or both`);
  }
  const eventId = row.idFrom.map((field) => raw[field]).find((value) => value !== undefined);
  if (row.idRequired && eventId === undefined) {
    problems.push(`${label} of kind "${row.kind}" needs ${row.idFrom.filter((f) => f !== 'id').join(' or ')}`);
  }

  const step = { id: raw.id, kind: row.kind, text: raw.text };
  if (raw.placeId !== undefined) step.placeId = raw.placeId;
  if (raw.target !== undefined) step.target = raw.target;
  step.count = count;
  if (raw.seconds !== undefined) step.seconds = raw.seconds;
  step.optional = raw.optional === true;
  step.failsOn = failsOn;

  const objective = {
    id: raw.id, type: row.objectiveType, count, optional: step.optional,
    label: raw.text, description: raw.text, stepKind: row.kind, failsOn,
  };
  if (eventId !== undefined) objective[row.idField] = eventId;
  if (raw.placeId !== undefined) objective.placeId = raw.placeId;
  if (raw.seconds !== undefined) objective.seconds = raw.seconds;
  return { step, objective };
}

function readChoices(raw, steps, problems) {
  const chooseIds = steps.filter((step) => step.kind === 'choose').map((step) => step.id);
  const result = {};
  if (raw !== undefined && !isObject(raw)) {
    problems.push('pledge.choices must be an object keyed by the id of a "choose" step');
    return result;
  }
  const source = raw || {};
  for (const key of Object.keys(source)) {
    if (!chooseIds.includes(key)) problems.push(`choices has an entry "${key}" that is not a "choose" step`);
  }
  for (const stepId of chooseIds) {
    const label = `step "${stepId}"`;
    const entry = source[stepId];
    if (!isObject(entry)) { problems.push(`${label} of kind "choose" needs an entry in pledge.choices`); continue; }
    for (const key of Object.keys(entry)) {
      if (!CHOICE_KEYS.has(key)) problems.push(`${label} choices entry has unknown field "${key}"`);
    }
    if (entry.prompt !== undefined && !isText(entry.prompt)) problems.push(`${label} choice prompt must be text`);
    if (!Array.isArray(entry.options) || entry.options.length < 2) {
      problems.push(`${label} needs at least two options to choose between`);
      continue;
    }
    const seen = new Set();
    const options = [];
    entry.options.forEach((option, index) => {
      const where = `${label} option ${isObject(option) && isId(option.id) ? `"${option.id}"` : `#${index + 1}`}`;
      if (!isObject(option)) { problems.push(`${where} must be an object`); return; }
      for (const key of Object.keys(option)) {
        if (!OPTION_KEYS.has(key)) problems.push(`${where} has unknown field "${key}"`);
      }
      if (!isId(option.id)) problems.push(`${where} needs an id`);
      else if (seen.has(option.id)) problems.push(`${where} repeats an option id`);
      else seen.add(option.id);
      if (!isText(option.text)) problems.push(`${where} needs text`);
      const outcome = option.outcome === undefined ? 'kept' : option.outcome;
      if (outcome !== 'kept' && outcome !== 'bent') problems.push(`${where} outcome must be "kept" or "bent"`);
      options.push({
        id: option.id, text: option.text, outcome,
        flags: readFlagList(option.flags, `${where} flags`, problems),
      });
    });
    result[stepId] = { prompt: isText(entry.prompt) ? entry.prompt : null, options };
  }
  return result;
}

function readStandings(raw, steps, problems) {
  const result = { kept: emptyStanding(), bent: emptyStanding(), broken: emptyStanding(), optional: {} };
  if (raw === undefined) return result;
  if (!isObject(raw)) { problems.push('pledge.standings must be an object with kept, bent, broken'); return result; }
  for (const key of Object.keys(raw)) {
    if (!STANDING_BLOCK_KEYS.has(key)) problems.push(`standings has unknown entry "${key}"`);
  }
  for (const outcome of PLEDGE_OUTCOMES) result[outcome] = readStanding(raw[outcome], `standings.${outcome}`, problems);
  if (raw.optional !== undefined) {
    if (!isObject(raw.optional)) problems.push('standings.optional must be an object keyed by optional step id');
    else {
      for (const stepId of Object.keys(raw.optional)) {
        const step = steps.find((entry) => entry.id === stepId);
        if (!step) problems.push(`standings.optional names "${stepId}", which is not a step`);
        else if (!step.optional) problems.push(`step "${stepId}" is in standings.optional but is not optional`);
        result.optional[stepId] = readStanding(raw.optional[stepId], `standings.optional.${stepId}`, problems);
      }
    }
  }
  return result;
}

// Every problem with a pledge definition, as plain sentences. Empty = valid.
export function validatePledge(data) {
  return buildPledge(data).problems;
}

// Validate and return the frozen quest-shaped pledge. Throws
// PledgeDefinitionError naming the pledge id and each step at fault.
export function definePledge(data) {
  const { pledge, problems, id } = buildPledge(data);
  if (problems.length) throw new PledgeDefinitionError(id, problems);
  return pledge;
}

function buildPledge(data) {
  const problems = [];
  const id = isObject(data) && isId(data.id) ? data.id : '(no id)';
  if (!isObject(data)) return { pledge: null, problems: ['a pledge must be an object'], id };

  for (const key of Object.keys(data)) {
    if (!TOP_KEYS.has(key)) problems.push(`unknown field "${key}"`);
  }
  if (!isId(data.id)) problems.push('needs an id (letters, digits, _ . -)');
  if (!isText(data.title)) problems.push('needs a title');
  if (!isText(data.description)) problems.push('needs a description');
  if (data.npcId !== undefined && data.npcId !== null && !isId(data.npcId)) problems.push('npcId must be an id, or null for a pledge with no giver');
  if (data.sequential !== undefined && data.sequential !== true) problems.push('a pledge is always sequential');
  if (data.reward !== undefined && (!isObject(data.reward) || Object.keys(data.reward).length)) {
    problems.push('must not carry a reward: the browser grants whatever a quest\'s reward says, and pledge rewards are decided by the server (describe them in pledge.rewardPreview)');
  }
  const level = (value, name, fallback) => {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 1) { problems.push(`${name} must be a whole number of 1 or more`); return fallback; }
    return value;
  };
  const unlockLevel = level(data.unlockLevel, 'unlockLevel', 1);
  const recommendedLevel = level(data.recommendedLevel, 'recommendedLevel', unlockLevel);
  if (data.factionId !== undefined && data.factionId !== null && !isText(data.factionId)) problems.push('factionId must be a faction id or null');
  if (data.requires !== undefined && data.requires !== null && !isId(data.requires)) problems.push('requires must be one quest or pledge id');
  let requiresAll = [];
  if (data.requiresAll !== undefined) {
    if (!Array.isArray(data.requiresAll) || data.requiresAll.some((entry) => !isId(entry))) problems.push('requiresAll must be a list of quest or pledge ids');
    else requiresAll = [...new Set(data.requiresAll)];
  }
  if (isId(data.id) && (data.requires === data.id || requiresAll.includes(data.id))) problems.push('cannot require itself');
  if (data.repeatable !== undefined && typeof data.repeatable !== 'boolean') problems.push('repeatable must be true or false');
  if (data.priority !== undefined && !Number.isFinite(data.priority)) problems.push('priority must be a number');
  if (data.category !== undefined && !PLEDGE_CATEGORIES.includes(data.category)) problems.push(`category must be one of ${PLEDGE_CATEGORIES.join(', ')}`);
  const storyFlagsRequired = readFlagList(data.storyFlagsRequired, 'storyFlagsRequired', problems);
  const storyFlagsOnComplete = readFlagList(data.storyFlagsOnComplete, 'storyFlagsOnComplete', problems);

  const block = data.pledge;
  if (!isObject(block)) {
    problems.push('needs a pledge block: { line, chapter, swornTo, cause, cost, steps }');
    return { pledge: null, problems, id };
  }
  for (const key of Object.keys(block)) {
    if (!PLEDGE_KEYS.has(key)) problems.push(`pledge block has unknown field "${key}"`);
  }
  if (!isId(block.line)) problems.push('pledge.line must be an id naming the story line it belongs to');
  let chapter = 0;
  if (block.chapter !== undefined) {
    if (!Number.isSafeInteger(block.chapter) || block.chapter < 0) problems.push('pledge.chapter must be a whole number, 0 or more');
    else chapter = block.chapter;
  }
  // Who it is sworn to, why it is asked, and what keeping it costs: every
  // pledge has to say all three.
  if (!isText(block.swornTo)) problems.push('pledge.swornTo must say who the pledge is sworn to');
  if (!isText(block.cause)) problems.push('pledge.cause must say why it is asked');
  if (!isText(block.cost)) problems.push('pledge.cost must say what keeping it costs');

  const steps = [];
  const objectives = [];
  if (!Array.isArray(block.steps) || !block.steps.length) problems.push('pledge.steps must list at least one step');
  else if (block.steps.length > PLEDGE_MAX_STEPS) problems.push(`pledge.steps has more than ${PLEDGE_MAX_STEPS} steps`);
  else {
    const seenIds = new Set();
    block.steps.forEach((raw, index) => {
      const read = readStep(raw, index, seenIds, problems);
      if (read) { steps.push(read.step); objectives.push(read.objective); }
    });
    // The store mirrors the first objective's progress in progress[id], and an
    // optional step belongs to the required step listed before it.
    if (isObject(block.steps[0]) && block.steps[0].optional === true) {
      const first = isId(block.steps[0].id) ? `step "${block.steps[0].id}"` : 'step #1';
      problems.push(`${first} is the first step and cannot be optional`);
    }
  }
  const choices = readChoices(block.choices, steps, problems);
  const standings = readStandings(block.standings, steps, problems);
  if (block.rewardPreview !== undefined && !isObject(block.rewardPreview)) problems.push('pledge.rewardPreview must be an object (shown to the player, grants nothing)');

  if (problems.length) return { pledge: null, problems, id };

  const category = data.category || (chapter > 0 ? 'chapter' : 'side');
  const pledge = deepFreeze({
    id: data.id,
    type: 'pledge',
    category,
    npcId: data.npcId ?? null,
    title: data.title,
    description: data.description,
    unlockLevel,
    recommendedLevel,
    recommendedPower: 0,
    factionId: data.factionId ?? null,
    requires: data.requires ?? null,
    requiresAll,
    storyFlagsRequired,
    storyFlagsOnComplete,
    repeatable: data.repeatable === true,
    priority: data.priority ?? 0,
    objectives,
    objective: objectives[0],
    optionalObjectives: [],
    // Always empty: see the header.
    reward: {},
    sequential: true,
    pledge: {
      line: block.line,
      chapter,
      swornTo: block.swornTo,
      cause: block.cause,
      cost: block.cost,
      steps,
      choices,
      standings,
      rewardPreview: block.rewardPreview ? JSON.parse(JSON.stringify(block.rewardPreview)) : null,
    },
  });
  return { pledge, problems, id };
}

// Does this event advance this objective? Used only for pledges; the 32
// existing quests keep objectiveMatchesAXEQuestEvent.
export function pledgeObjectiveMatchesEvent(objective, event = {}) {
  if (!objective || typeof event?.type !== 'string') return false;
  const row = own(PLEDGE_STEP_KINDS, objective.stepKind) ? PLEDGE_STEP_KINDS[objective.stepKind] : null;
  if (!row || row.eventType !== event.type) return false;
  const wanted = objective[row.idField];
  if (wanted !== undefined && wanted !== event[row.idField]) return false;
  if (row.matchPlace && objective.placeId !== undefined && objective.placeId !== event.placeId) return false;
  return true;
}

// May this pledge be sworn? Mirrors the checks getAvailableQuestForNPC and
// acceptQuest make for quests, and adds requiresAll.
export function pledgePrerequisitesMet(pledge, state = {}, { level = null, factionId = null } = {}) {
  const completed = Array.isArray(state?.completedIds) ? state.completedIds : [];
  const accepted = Array.isArray(state?.acceptedIds) ? state.acceptedIds : [];
  const flags = state?.storyFlags || {};
  if (!pledge) return { ok: false, reason: 'UNKNOWN_PLEDGE' };
  if (accepted.includes(pledge.id)) return { ok: false, reason: 'ALREADY_ACCEPTED' };
  if (completed.includes(pledge.id) && !pledge.repeatable) return { ok: false, reason: 'ALREADY_COMPLETED' };
  if (level !== null && Number(level) < pledge.unlockLevel) return { ok: false, reason: 'LEVEL_REQUIRED' };
  if (pledge.requires && !completed.includes(pledge.requires)) return { ok: false, reason: 'PREREQUISITE_REQUIRED' };
  if ((pledge.requiresAll || []).some((id) => !completed.includes(id))) return { ok: false, reason: 'PREREQUISITE_REQUIRED' };
  if ((pledge.storyFlagsRequired || []).some((flag) => !flags[flag])) return { ok: false, reason: 'STORY_FLAG_REQUIRED' };
  const open = (value) => !value || value === 'AXE_Faction_Unassigned';
  if (!open(pledge.factionId) && !open(factionId) && pledge.factionId !== factionId) return { ok: false, reason: 'FACTION_REQUIRED' };
  return { ok: true, reason: null };
}
