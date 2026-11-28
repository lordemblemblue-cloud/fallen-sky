// Isolated WP-FS-S2 entry boundary. Not mounted, not authentication or reward authority.
import { createOpeningQuestAdapter } from './openingQuestAdapter.mjs';

const ids = Object.freeze([
  ...Array.from({length:20},(_,i)=>'M'+String(i+1).padStart(2,'0')),
  ...Array.from({length:55},(_,i)=>'S'+String(i+1).padStart(2,'0')),
  ...Array.from({length:50},(_,i)=>'D'+String(i+1).padStart(2,'0')),
]);
const openingIds = new Set([...ids.slice(0,6),...ids.slice(20,28)]);
const canonical = new Set(ids);
const plain = value => value !== null && typeof value === 'object' &&
  Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every(key=>Object.hasOwn(value,key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const token = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const scopeKeys = ['ownerId','characterId','campaignId'];
const scopeOK = scope => exact(scope,scopeKeys) &&
  scopeKeys.every(key=>token(scope[key])) &&
  !['__anon__','__default__','__dev_test__'].includes(scope.characterId);
const bad = reason => ({ok:false,reason});
const copy = value => JSON.parse(JSON.stringify(value));

// This classifier is advisory only. Never fall through to legacy acceptance
// after a rejected story request. A future integration must choose its lane explicitly.
export function classifyStoryQuestId(id) {
  if (!canonical.has(id)) return 'UNKNOWN';
  return openingIds.has(id) ? 'OPENING_SUPPORTED' : 'NOT_YET_SUPPORTED';
}

// Construct once in trusted fixture setup, never with request-provided definitions.
// Default catalog is empty: canonical IDs alone are NOT activation authorization.
export function createStoryQuestGate(config={}) {
  if(!plain(config)||!Reflect.ownKeys(config).every(k=>['definitions','contentRevision'].includes(k))||
      !Reflect.ownKeys(config).every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(config,k),'value'))) {
    throw Error('INVALID_GATE_CONFIG');
  }
  const {definitions=[],contentRevision='draft_v1'}=config;
  // Validate before copying, then keep only a private allowlist. Upstream also
  // copies and validates definitions and enforces main dependencies/reality.
  const adapter=createOpeningQuestAdapter({definitions,contentRevision});
  const enabled=new Set(definitions.filter(d=>d.enabled).map(d=>d.id));
  const newSnapshot=scope=>{
    if(!scopeOK(scope))throw Error('INVALID_SCOPE');
    return adapter.newSnapshot(copy(scope));
  };
  const read=(snapshot,scope)=>scopeOK(scope)?adapter.read(snapshot,scope):bad('INVALID_SCOPE');
  const encode=(snapshot,scope)=>scopeOK(scope)?adapter.encode(snapshot,scope):bad('INVALID_SCOPE');
  const decode=(data,scope)=>scopeOK(scope)?adapter.decode(data,scope):bad('INVALID_SCOPE');
  const submit=(snapshot,request)=>{
    if(!exact(request,['scope','expectedRevision','event']) ||
       !scopeOK(request.scope) || !Number.isSafeInteger(request.expectedRevision) ||
       request.expectedRevision<0) return bad('INVALID_STORY_REQUEST');
    const e=request.event;
    if(!exact(e,['eventId','questId','kind','reality','objectiveId']))return bad('INVALID_STORY_EVENT');
    if(classifyStoryQuestId(e.questId)!=='OPENING_SUPPORTED'||!enabled.has(e.questId))
      return bad('UNKNOWN_OR_DISABLED_QUEST');
    // No caller definition, grant, legacy fallback, or side effect.
    return adapter.append(snapshot,{scope:request.scope,expectedRevision:request.expectedRevision,event:e});
  };
  return Object.freeze({newSnapshot,read,encode,decode,submit});
}
