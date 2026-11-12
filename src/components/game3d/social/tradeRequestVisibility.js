// Trade invitation visibility is based on its creation time, not on how often
// realtime refreshes deliver the same database row.
export const TRADE_REQUEST_TTL_MS = 6000;

export function tradeRequestCreatedAt(request, firstSeenAt, now = Date.now()) {
  const created = Date.parse(request.created_date || '');
  if (Number.isFinite(created)) return created;
  const id = request.id || `${request.sender_id}:${request.receiver_id}`;
  if (!firstSeenAt.has(id)) firstSeenAt.set(id, now);
  return firstSeenAt.get(id);
}

export function visibleIncomingRequests(requests, firstSeenAt, now = Date.now()) {
  const visible = requests.filter((request) => request.kind !== 'trade');
  const expiredTrades = [];
  const seenSenders = new Set();
  const trades = requests.filter((request) => request.kind === 'trade')
    .sort((a, b) => tradeRequestCreatedAt(b, firstSeenAt, now) - tradeRequestCreatedAt(a, firstSeenAt, now));

  for (const request of trades) {
    if (now - tradeRequestCreatedAt(request, firstSeenAt, now) >= TRADE_REQUEST_TTL_MS) {
      expiredTrades.push(request);
      continue;
    }
    const sender = request.sender_id || request.id;
    if (seenSenders.has(sender)) continue;
    seenSenders.add(sender);
    // A crowd of senders must not cover the entire world HUD.
    if (seenSenders.size <= 3) visible.push(request);
  }

  return { visible, expiredTrades };
}
