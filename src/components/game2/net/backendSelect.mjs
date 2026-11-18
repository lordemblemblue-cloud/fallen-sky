/**
 * Game 2 transport selection is an admission-time decision, not a mid-match
 * reconnect strategy. Never transfer tickets, player IDs, or live rooms from
 * one provider to the other: the two backends do not share a room registry.
 *
 * The Base44 website's authenticated Actor is preferred for Game 2.
 * Railway remains a compatible legacy fallback ONLY before a match is admitted.
 * A provider must advertise the requested server feature before selection;
 * never fabricate queue readiness or migrate a live ticket between providers.
 */
export function game2BackendPreference({ search, configured } = {}) {
  const query = search === undefined
    ? (typeof window === 'undefined' ? '' : window.location.search)
    : search;
  const value = new URLSearchParams(query);
  if (value.get('g2actor') === '1' || value.get('g2transport') === 'base44') return 'base44';
  if (value.get('g2actor') === '0' || value.get('g2transport') === 'railway') return 'railway';
  const preferred = configured === undefined
    ? (typeof import.meta.env === 'object' ? import.meta.env.VITE_GAME2_TRANSPORT : '')
    : configured;
  return preferred === 'railway' ? 'railway' : 'base44';
}

export async function selectGame2Backend({
  preference = 'base44',
  railwayStatus,
  actorStatus,
  queueRequired = false,
  requiredModes = [],
  customRequired = false,
} = {}) {
  if (typeof railwayStatus !== 'function' || typeof actorStatus !== 'function') {
    throw new Error('Game 2 backend status providers are missing');
  }
  const order = preference === 'base44' ? ['base44','railway'] : ['railway','base44'];
  const failures = [];
  let notQueueReady = null;
  for (const backend of order) {
    try {
      const status = await (backend === 'railway' ? railwayStatus() : actorStatus());
      if (status?.ready !== true) throw new Error('Service did not report ready');
      if (queueRequired && (!status.queueSupported || !status.matchmaking?.modes ||
        (requiredModes.length && !requiredModes.some(mode=>status.matchmaking.modes[mode])))) {
        notQueueReady ??= {backend,status};
        failures.push(backend + ': waiting-room queue unavailable');
        continue;
      }
      if (customRequired && !status.serverBrowser) {
        failures.push(backend + ': custom-room browser unavailable');
        continue;
      }
      return {backend,status,usedFallback:backend!==order[0],queueReady:!!(status.queueSupported && status.matchmaking?.modes)};
    } catch (error) {
      failures.push(backend + ': ' + String(error?.message || error));
    }
  }
  // Preserve real legacy occupied-public-room joins when neither backend has
  // an online waiting queue. Never pretend the old Railway service can queue.
  if (notQueueReady && !customRequired) return {...notQueueReady,usedFallback:notQueueReady.backend!==order[0],
    queueReady:false, warning:failures.join('; ')};
  throw new Error('Neither multiplayer backend is available. ' + failures.join('; '));
}
