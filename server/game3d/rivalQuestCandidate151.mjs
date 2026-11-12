// Game 3D / Combat 15.1 planning seam: non-rewarding Rival quest leads.
// Server-only: never call this from GameView or trust browser kill reports.
// A trusted PvP adjudicator must resolve a receipt into an authoritative result.
const VALID_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const DAY = 24 * 60 * 60 * 1000;
const reject = reason => Object.freeze({status:'ignored', reason});
const validId = value => typeof value === 'string' && VALID_ID.test(value);

export function createRivalQuestCandidateTracker151({
  resolveTrustedOutcome, clock = Date.now,
  threshold = 3, windowMs = 7 * DAY, maxTrackedPairs = 512,
} = {}) {
  if (typeof resolveTrustedOutcome !== 'function') {
    throw Error('Rival leads require a server-owned trusted PvP outcome resolver');
  }
  if (typeof clock !== 'function' || !Number.isInteger(threshold) ||
    threshold < 2 || threshold > 10 || !Number.isSafeInteger(windowMs) ||
    windowMs < 60_000 || !Number.isInteger(maxTrackedPairs) ||
    maxTrackedPairs < 1 || maxTrackedPairs > 4096) {
    throw Error('invalid Rival policy configuration');
  }
  // Ephemeral, bounded evidence cache. Production persistence/reconnect
  // requires a separately reviewed server owner and durable proof store.
  const pairs = new Map();
  const seen = new Map();
  function observe(receipt) {
    // This function receives arbitrary input, but derives ALL decisions only
    // from the result of the independently trusted server-side resolver.
    const event = resolveTrustedOutcome(receipt);
    if (event && typeof event.then === 'function') {
      throw Error('trusted PvP outcome resolver must be synchronous');
    }
    const now = clock();
    if (!event || event.kind !== 'verified_pvp_defeat' ||
      !validId(event.encounterId) || !validId(event.matchId) ||
      !validId(event.worldInstanceId) ||
      !validId(event.killerAccountId) || !validId(event.killerCharacterId) ||
      !validId(event.victimAccountId) || !validId(event.victimCharacterId) ||
      event.killerAccountId === event.victimAccountId ||
      !Number.isSafeInteger(event.occurredAt) ||
      !Number.isSafeInteger(now) || event.occurredAt > now ||
      now - event.occurredAt > windowMs) {
      return reject('no_current_trusted_distinct_player_defeat');
    }
    const evidenceId = event.worldInstanceId + ':' + event.encounterId;
    if (seen.has(evidenceId)) return reject('duplicate_authoritative_encounter');
    seen.set(evidenceId, now);
    if (seen.size > maxTrackedPairs * 12) seen.delete(seen.keys().next().value);

    const key = event.killerAccountId + '/' + event.killerCharacterId + '=>' +
      event.victimAccountId + '/' + event.victimCharacterId;
    const previous = pairs.get(key);
    // Delete-and-set keeps least recently used pairs at the oldest end.
    const events = (previous?.events || []).filter(e => now - e.at <= windowMs);
    events.push({id:evidenceId, matchId:event.matchId, at:event.occurredAt});
    const issued = previous?.issued || false;
    pairs.delete(key);
    pairs.set(key, {events, issued:issued || events.length >= threshold});
    if (pairs.size > maxTrackedPairs) pairs.delete(pairs.keys().next().value);
    if (issued) return reject('lead_already_suggested');
    if (events.length < threshold) {
      return Object.freeze({status:'tracking', verifiedDefeats:events.length, threshold});
    }
    // Only a candidate: no forced meeting, cinematic, relationship, XP,
    // quest acceptance or save changes. Both real players must opt in later.
    return Object.freeze({
      status:'candidate',
      lead:Object.freeze({
        id:'axe_rival_meeting_candidate',
        title:'Rival',
        source:'trusted_pvp_evidence',
        initiatorCharacterId:event.killerCharacterId,
        counterpartCharacterId:event.victimCharacterId,
        verifiedDefeats:events.length,
        distinctMatches:new Set(events.map(e => e.matchId)).size,
        meeting:'neutral_zone_pending_approval',
        branches:Object.freeze(['rival','friendly_rival','decline']),
        consent:'required_from_both_players',
        cinematic:'not_implemented',
        questAcceptance:'not_implemented',
        rewardAuthority:'none',
      }),
    });
  }
  return Object.freeze({observe});
}
