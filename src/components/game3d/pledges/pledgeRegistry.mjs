// Where pledge data makes itself known to the quest store. This module
// imports no quest data, so the store can read it without an import cycle:
//   pledge data file -> registerPledges('my-file', [definePledge(...), ...])
//   useQuestStore.jsx -> listRegisteredPledges() / getRegisteredPledge(id)
//
// A source is a name for one set of pledges (one data file). Registering the
// same source again replaces its set, so a hot reload of the data file is
// safe; an id that another source already owns is an error.
import { isPledge } from './pledgeModel.mjs';

const sources = new Map(); // source name -> pledge[]
const byId = new Map(); // pledge id -> { pledge, source }
let snapshot = Object.freeze([]);

function rebuild() {
  byId.clear();
  const all = [];
  for (const [source, list] of sources) {
    for (const pledge of list) { byId.set(pledge.id, { pledge, source }); all.push(pledge); }
  }
  snapshot = Object.freeze(all);
}

export function registerPledges(source, pledges) {
  if (typeof source !== 'string' || !source) throw new Error('registerPledges needs a source name');
  const list = Array.isArray(pledges) ? pledges : [];
  const seen = new Set();
  for (const pledge of list) {
    if (!isPledge(pledge) || !Object.isFrozen(pledge)) {
      throw new Error(`registerPledges("${source}"): every entry must come from definePledge()`);
    }
    if (seen.has(pledge.id)) throw new Error(`registerPledges("${source}"): pledge "${pledge.id}" is listed twice`);
    seen.add(pledge.id);
    const owner = byId.get(pledge.id);
    if (owner && owner.source !== source) {
      throw new Error(`registerPledges("${source}"): pledge "${pledge.id}" is already registered by "${owner.source}"`);
    }
  }
  sources.set(source, [...list]);
  rebuild();
  return list.length;
}

export function unregisterPledges(source) {
  const had = sources.delete(source);
  if (had) rebuild();
  return had;
}

export function getRegisteredPledge(pledgeId) {
  return byId.get(pledgeId)?.pledge || null;
}

// Every registered pledge. The same frozen array until the registry changes.
export function listRegisteredPledges() {
  return snapshot;
}

export function clearRegisteredPledges() {
  sources.clear();
  rebuild();
}
