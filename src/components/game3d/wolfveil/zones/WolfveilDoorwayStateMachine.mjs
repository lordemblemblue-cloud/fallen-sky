// The doorway state machine of the natural-zone audit, section 5:
//
//   ACTIVE(A) -> APPROACH_GATE -> OCCLUDE -> LOAD(B) -> COMMIT(B) -> UNLOAD(A) -> ACTIVE(B)
//
// One playable zone owns the player at a time (`activeZone`). A transition
// only starts through an authored doorway (never from a coordinate border),
// only constructs B once the player stands in the screened pocket, and only
// releases A after B has been verified and the player handed to it. Leaving
// the pocket before COMMIT, a failed or late load, or a doorway the player
// cannot use (mounted, airborne) returns safely to ACTIVE(A); a partially
// built B is unloaded immediately.
//
// Two commit kinds:
//   'relocate' : B is not physically joined to A (a cave interior under an
//                uncut hillside). COMMIT moves the player exactly once to the
//                doorway's anchor in B.
//   'walk'     : A and B touch at a door. COMMIT opens the door; the player
//                walks through; the door closes behind them before UNLOAD(A).
//
// Pure logic, no Three.js. Positions are Wolfveil LOCAL metres.

export const DOORWAY_STATE = Object.freeze({
  ACTIVE: 'ACTIVE', APPROACH_GATE: 'APPROACH_GATE', OCCLUDE: 'OCCLUDE',
  LOAD: 'LOAD', COMMIT: 'COMMIT', UNLOAD: 'UNLOAD',
});
const S = DOORWAY_STATE;
export const DOORWAY_DEFAULTS = Object.freeze({
  occludeSeconds: .28,     // in the pocket this long before B is constructed
  loadTimeoutSeconds: 8,   // a load slower than this is a failure (back to A)
  commitHoldSeconds: .12,  // relocate: the screen stays sealed this long after the move
  doorSeconds: .55,        // walk: door opening / closing time
  historyLimit: 240,
});

const finite = Number.isFinite;
const meets = (requires = {}, sample = {}) => {
  if (requires.onFoot && sample.mounted) return 'mounted';
  if (requires.grounded && sample.airborne) return 'airborne';
  return null;
};

/**
 * @param {object} options
 * @param {Array}  options.doorways   directional doorways (see WolfveilZoneGraph.mjs)
 * @param {object} options.zones      id -> adapter {kind:'legacy'|'runtime', prefetch?, load, verify?, unload}
 * @param {string} options.initialZone
 * @param {object} [options.hooks]    {relocate(anchor, doorway) -> bool, onEvent(event)}
 */
export function createDoorwayStateMachine({
  doorways = [], zones = {}, initialZone, hooks = {}, options = {},
} = {}) {
  const o = {...DOORWAY_DEFAULTS, ...options};
  if (!zones[initialZone]) throw new TypeError('Unknown initial zone ' + initialZone);
  for (const doorway of doorways) {
    if (!zones[doorway.from] || !zones[doorway.to])
      throw new TypeError('Doorway ' + doorway.id + ' joins an unknown zone');
    if (!['relocate', 'walk'].includes(doorway.commit))
      throw new TypeError('Doorway ' + doorway.id + ' has no commit kind');
    if (doorway.commit === 'relocate' && !doorway.anchor)
      throw new TypeError('Relocating doorway ' + doorway.id + ' needs an anchor in ' + doorway.to);
  }
  const handles = new Map();     // zone id -> handle while loaded
  const history = [];
  const counters = {transitions: 0, aborts: 0, failures: 0, evictions: 0, loads: 0, unloads: 0};
  let state = S.ACTIVE, active = initialZone, clock = 0;
  let transition = null;          // {doorway, phase timers, pending load, handle}
  let blockedNotice = null;
  handles.set(initialZone, loadSync(initialZone));

  function log(type, extra = {}) {
    const event = {type, t: +clock.toFixed(3), state, active, doorway: transition?.doorway?.id ?? null, ...extra};
    history.push(event);
    if (history.length > o.historyLimit) history.splice(0, history.length - o.historyLimit);
    try { hooks.onEvent?.(event); } catch { /* a listener must not break travel */ }
    return event;
  }
  function loadSync(zoneId) {
    // Only legacy zones may be "loaded" synchronously at construction.
    const zone = zones[zoneId];
    if (zone.kind !== 'legacy') {
      const value = zone.load({signal: {aborted: false}});
      if (value && typeof value.then === 'function')
        throw new TypeError('The initial zone must load synchronously');
      return value;
    }
    return zone.load?.({signal: {aborted: false}}) ?? 'legacy';
  }
  function unloadZone(zoneId, reason) {
    if (!handles.has(zoneId)) return null;
    const handle = handles.get(zoneId);
    handles.delete(zoneId);
    let report = null;
    try { report = zones[zoneId].unload?.(handle, reason) ?? null; }
    catch (error) { report = {error: String(error?.message || error)}; }
    counters.unloads++;
    log('unload', {zone: zoneId, reason, report});
    return report;
  }
  function setState(next, extra) {
    state = next;
    if (transition) transition.t = 0;
    log('state', {to: next, ...extra});
  }
  function abort(reason) {
    const t = transition;
    if (!t) return;
    counters.aborts++;
    if (t.load) t.load.signal.aborted = true;
    // B was never handed the player: release whatever of it exists.
    if (t.doorway.to !== active && handles.has(t.doorway.to)) unloadZone(t.doorway.to, 'abort:' + reason);
    log('abort', {reason});
    transition = null;
    state = S.ACTIVE;
  }
  function fail(reason) {
    counters.failures++;
    log('load-failed', {reason});
    abort('failed:' + reason);
  }
  function startLoad() {
    const t = transition, target = t.doorway.to, zone = zones[target];
    if (handles.has(target)) { t.ready = true; return; } // already resident (legacy surface)
    const signal = {aborted: false};
    t.load = {signal, started: clock};
    counters.loads++;
    log('load-start', {zone: target});
    const accept = handle => {
      if (signal.aborted || transition !== t) {
        // Arrived after an abort: never keep a zone nobody owns.
        try { zone.unload?.(handle, 'late-load'); } catch { /* ignore */ }
        return;
      }
      handles.set(target, handle);
      t.ready = true;
      log('load-done', {zone: target, ms: Math.round((clock - t.load.started) * 1000)});
    };
    try {
      const result = zone.load({signal, doorway: t.doorway});
      if (result && typeof result.then === 'function') {
        result.then(accept, error => {
          if (transition === t && !signal.aborted) t.error = String(error?.message || error);
        });
      } else accept(result);
    } catch (error) {
      t.error = String(error?.message || error);
    }
  }
  function verifyTarget() {
    const t = transition, zone = zones[t.doorway.to];
    const verdict = zone.verify ? zone.verify(handles.get(t.doorway.to), t.doorway.anchor, t.doorway) : true;
    return verdict === true ? null : String(verdict || 'not ready');
  }
  function handOver() {
    const t = transition, from = active;
    active = t.doorway.to;
    counters.transitions++;
    log('commit', {from, to: active});
    setState(S.UNLOAD);
    const report = from === active ? null : unloadZone(from, 'transition');
    t.unloadReport = report;
  }

  /**
   * One tick. `sample`: {position:{x,y,z} LOCAL, mounted, airborne}.
   * Returns a small frame summary for the caller (overlay and doors).
   */
  function update(dt, sample = {}) {
    const step = Math.max(0, Math.min(finite(dt) ? dt : 0, .25));
    clock += step;
    const p = sample.position;
    const valid = p && finite(p.x) && finite(p.z);
    if (transition) transition.t += step;

    if (state === S.ACTIVE) {
      if (valid) {
        const candidate = doorways.find(d => d.from === active && d.approach(p, sample));
        if (candidate) {
          transition = {doorway: candidate, t: 0, ready: false, load: null, error: null};
          zones[candidate.to].prefetch?.(candidate);
          setState(S.APPROACH_GATE);
        }
      }
    } else if (state === S.APPROACH_GATE) {
      const d = transition.doorway;
      if (!valid || (!d.approach(p, sample) && !d.pocket(p, sample))) {
        transition = null; state = S.ACTIVE; log('leave-approach');
      } else if (d.pocket(p, sample)) {
        const why = meets(d.requires, sample);
        if (why) {
          if (blockedNotice !== d.id + why) { blockedNotice = d.id + why; log('blocked', {reason: why}); }
        } else {
          blockedNotice = null;
          setState(S.OCCLUDE);
        }
      }
    } else if (state === S.OCCLUDE) {
      const d = transition.doorway;
      if (!valid || !d.pocket(p, sample) || meets(d.requires, sample)) {
        // Stepped back out before anything was built: no cost, no abort count.
        transition.t = 0; state = S.APPROACH_GATE; log('leave-pocket');
      } else if (transition.t >= o.occludeSeconds) {
        setState(S.LOAD);
        startLoad();
      }
    } else if (state === S.LOAD) {
      const t = transition, d = t.doorway;
      if (t.error) fail(t.error);
      else if (d.commit === 'relocate' && (!valid || !d.pocket(p, sample))) abort('left-pocket');
      else if (d.commit === 'walk' && valid && d.retreated?.(p, sample)) abort('retreated');
      else if (!t.ready && t.t > o.loadTimeoutSeconds) fail('timeout');
      else if (t.ready) {
        const problem = verifyTarget();
        if (problem) fail('verify:' + problem);
        else {
          setState(S.COMMIT);
          if (d.commit === 'relocate') {
            let moved = false;
            try { moved = hooks.relocate?.(d.anchor, d) !== false; } catch { moved = false; }
            if (!moved) fail('relocate-refused');
            else handOver();
          } else {
            transition.doorOpening = true;
            log('door-open', {door: d.door});
          }
        }
      }
    } else if (state === S.COMMIT) {
      // Only walk-through doors stay in COMMIT: the player crosses on foot.
      const t = transition, d = t.doorway;
      if (valid && d.passed(p, sample)) {
        if (!t.closeAt) { t.closeAt = t.t; log('door-close', {door: d.door}); }
        if (t.t - t.closeAt >= o.doorSeconds) handOver();
      } else if (valid && d.retreated?.(p, sample)) {
        // Walked back away from the open door: close it and release B. While
        // the player dithers in the doorway itself the door simply stays open.
        abort('retreated');
      } else if (t.closeAt) {
        // Stepped back into the doorway while it was closing: reopen.
        t.closeAt = 0; log('door-open', {door: d.door, reopened: true});
      }
    } else if (state === S.UNLOAD) {
      const t = transition;
      if (t.t >= (t.doorway.commit === 'relocate' ? o.commitHoldSeconds : 0)) {
        transition = null;
        state = S.ACTIVE;
        log('active', {zone: active});
      }
    }
    return frame();
  }

  /** Leave every runtime zone NOW (death, respawn, teleport, reconnect). */
  function evict(toZone, reason = 'evict') {
    if (!zones[toZone]) throw new TypeError('Unknown zone ' + toZone);
    if (transition) abort('evict');
    const from = active;
    if (!handles.has(toZone)) {
      try { handles.set(toZone, loadSync(toZone)); } catch { return false; }
    }
    active = toZone;
    for (const zoneId of [...handles.keys()]) if (zoneId !== toZone) unloadZone(zoneId, reason);
    counters.evictions++;
    log('evict', {from, to: toZone, reason});
    return true;
  }

  function doorOpen(doorId) {
    const t = transition;
    if (!t || t.doorway.door !== doorId || t.doorway.commit !== 'walk') return 0;
    if (state !== S.COMMIT) return 0;
    const open = Math.min(1, t.t / o.doorSeconds);
    if (!t.closeAt) return open;
    return Math.max(0, 1 - (t.t - t.closeAt) / o.doorSeconds);
  }
  // How sealed the screen should look (0 clear .. 1 fully sealed) for
  // relocating doorways; walk-through doors are physical and need none.
  function occlusion() {
    const t = transition;
    if (!t || t.doorway.commit !== 'relocate') return 0;
    if (state === S.OCCLUDE) return Math.min(1, t.t / o.occludeSeconds);
    if (state === S.LOAD || state === S.COMMIT) return 1;
    if (state === S.UNLOAD) return 1;
    return 0;
  }
  function frame() {
    return {
      state, active, doorway: transition?.doorway?.id ?? null,
      occlusion: occlusion(), loaded: [...handles.keys()],
    };
  }
  return {
    update, evict, doorOpen, frame,
    get state() { return state; },
    get activeZone() { return active; },
    get transition() { return transition ? {doorway: transition.doorway.id, state, t: transition.t} : null; },
    handle: zoneId => handles.get(zoneId),
    loadedZones: () => [...handles.keys()],
    history: () => history.slice(),
    counters: () => ({...counters}),
    /** Unload everything (component unmount). */
    dispose() {
      if (transition) abort('dispose');
      for (const zoneId of [...handles.keys()]) unloadZone(zoneId, 'dispose');
    },
  };
}
