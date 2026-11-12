// Game 3D / Quest 17.2 — ephemeral verified Questbook bridge for live HUD.
// Caller injects the *authenticated* 17.0 reader and the 16.9 reconciler.
// Account/character identity here is a presentation fence, NOT authentication.
// No localStorage, quest writes, XP, inventory or rewards.
const safeArray = (x, cap) => Array.isArray(x) && x.length <= cap;
const integer = x => Number.isSafeInteger(x) && x >= 0;
const unavailable = enabled => Object.freeze({
  enabled, status: enabled ? 'loading' : 'disabled', view: null, reason: null,
  readOnly: true, rewardsIssued: false,
});

export function verifiedQuestTrackerEntries172(view, maxEntries = 3) {
  if (!view || view.readOnly !== true || view.rewardsIssued !== false ||
      !safeArray(view.entries, 9) ||
      !safeArray(view.questState?.acceptedIds, 9)) return Object.freeze([]);
  const cap = integer(maxEntries) ? Math.min(maxEntries, 9) : 3;
  const byId = new Map(view.entries.map(q => [q.id, q]));
  return Object.freeze(view.questState.acceptedIds.slice(0, cap).flatMap(id => {
    const q = byId.get(id), o = q?.objectives?.[0];
    if (!q || q.status !== 'accepted' || q.readOnly !== true ||
        q.serverVerified !== true || typeof q.title !== 'string' ||
        q.title.length > 200 || !o || !integer(o.current) ||
        !integer(o.count) || o.count < 1 || o.current > o.count ||
        !integer(q.progressPercent) || q.progressPercent > 100) return [];
    const action = o.type === 'kill_tier' ? 'Defeat ' + o.count + ' ' + (o.tier || 'elite') + ' enemies'
      : o.type === 'kill' ? 'Defeat ' + o.count + ' enemies'
      : o.type === 'discover_location' ? 'Discover the objective location'
      : o.type === 'talk' ? 'Talk to the quest giver'
      : o.type === 'defeat_boss' ? 'Defeat the boss'
      : 'Complete the quest objective';
    return [Object.freeze({
      id: q.id, title: q.title, current: o.current, total: o.count,
      percent: q.progressPercent, objective: action,
      tracked: id === view.questState.lastAcceptedId,
      readyToTurnIn: q.statusLabel === 'Ready to turn in',
      verified: true, readOnly: true,
    })];
  }));
}

export function createAXEVerifiedQuestbookSession172({
  reader = null, createModel, getIdentity, subscribeIdentityChange,
  schedule = (fn, ms) => setInterval(fn, ms),
  unschedule = id => clearInterval(id),
  pollMs = 20000,
} = {}) {
  if (reader !== null && (typeof reader !== 'function' ||
      typeof createModel !== 'function' || typeof getIdentity !== 'function' ||
      typeof subscribeIdentityChange !== 'function')) {
    throw Error('17.2 requires a trusted reader, 16.9 model and identity fence');
  }
  if (!Number.isInteger(pollMs) || pollMs < 5000 || pollMs > 120000 ||
      typeof schedule !== 'function' || typeof unschedule !== 'function')
    throw Error('17.2 polling configuration is invalid');

  const enabled = reader !== null;
  const model = enabled ? createModel() : null;
  if (enabled && (!model || typeof model.getQuery !== 'function' ||
      typeof model.apply !== 'function' || typeof model.reset !== 'function'))
    throw Error('17.2 requires the complete 16.9 read-only reconciler');
  const listeners = new Set();
  let snapshot = unavailable(enabled);
  let uses = 0, revision = 0, pending = null, pollId = null, unsubscribeIdentity = null;
  const emit = next => {
    snapshot = Object.freeze(next);
    for (const fn of listeners) { try { fn(snapshot); } catch {} }
  };
  const identity = () => {
    try {
      const result = getIdentity();
      return typeof result === 'string' && result.length <= 512 ? result : null;
    } catch { return null; }
  };
  const update = (status, view, reason = null) => emit({
    enabled, status, view, reason, readOnly: true, rewardsIssued: false,
  });
  const refresh = () => {
    if (!enabled || !uses) return Promise.resolve(null);
    if (pending) return pending;
    const generation = revision, ownerKey = identity();
    if (!ownerKey) {
      model.reset(); update('unavailable', null, 'character_unavailable');
      return Promise.resolve(null);
    }
    let current;
    current = Promise.resolve()
      .then(() => reader(model.getQuery()))
      .then(envelope => {
        if (!uses || generation !== revision || identity() !== ownerKey) return null;
        const result = model.apply(envelope);
        if (result.ok !== true || !result.view?.readOnly ||
            result.view.rewardsIssued !== false) {
          model.reset(); update('unavailable', null, 'unverified_projection');
          return null;
        }
        update('verified', result.view);
        return result.view;
      })
      .catch(() => {
        if (!uses || generation !== revision || identity() !== ownerKey) return null;
        model.reset(); update('unavailable', null, 'questbook_unavailable');
        return null;
      })
      .finally(() => { if (pending === current) pending = null; });
    pending = current;
    return current;
  };
  const clearIdentity = () => {
    revision++;
    pending = null; // Detached old responses are fenced by revision.
    if (model) model.reset();
    update('loading', null);
    return refresh();
  };
  const start = () => {
    if (!enabled) return () => {};
    uses++;
    if (uses === 1) {
      unsubscribeIdentity = subscribeIdentityChange(clearIdentity);
      pollId = schedule(refresh, pollMs);
      clearIdentity();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      uses--;
      if (uses === 0) {
        revision++;
        pending = null;
        model.reset();
        unsubscribeIdentity?.(); unsubscribeIdentity = null;
        unschedule(pollId); pollId = null;
        update('loading', null);
      }
    };
  };
  const subscribe = listener => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener(snapshot);
    return () => listeners.delete(listener);
  };
  return Object.freeze({
    version: '17.2', readOnly: true, rewardsIssued: false, enabled,
    getSnapshot: () => snapshot, start, refresh, subscribe,
  });
}
