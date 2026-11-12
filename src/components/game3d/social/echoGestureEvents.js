// Detects new, real, server-authored gesture lines in mutually accepted talks.
// The first snapshot is seeded without playback, so refreshing/rejoining cannot
// replay all old interactions. Server timestamps gate stale/late observations.
export const ECHO_GESTURE_IDS = Object.freeze(['nod', 'wave', 'bow', 'thanks', 'farewell']);
const validIds = new Set(ECHO_GESTURE_IDS);
export const GESTURE_CUE_LABELS = Object.freeze({
  nod: 'Nods', wave: 'Waves', bow: 'Bows', thanks: 'Thanks', farewell: 'Farewell',
});

export function createEchoGestureObserver() {
  const observed = new Set();
  let firstSnapshot = true;
  return {
    observe(sessions, currentUserId, onGesture, { now = Date.now(), forcePlayback = false } = {}) {
      const initial = firstSnapshot && !forcePlayback;
      if (!forcePlayback) firstSnapshot = false;
      const emitted = [];
      for (const session of (Array.isArray(sessions) ? sessions : [])) {
        if (!session?.id || !['active', 'finished'].includes(session.status)) continue;
        if (session.initiator_id !== currentUserId && session.recipient_id !== currentUserId) continue;
        for (const line of (Array.isArray(session.lines) ? session.lines : [])) {
          if (line?.kind !== 'gesture' || !validIds.has(line.gesture_id)) continue;
          if (line.speaker_id !== session.initiator_id && line.speaker_id !== session.recipient_id) continue;
          const timestamp = Date.parse(line.at || '');
          const key = [session.id, line.speaker_id, line.at, line.gesture_id].join('|');
          if (observed.has(key)) continue;
          observed.add(key);
          // Reactions are fleeting, and shouldn't play minutes later after reconnect.
          if (initial || !Number.isFinite(timestamp) || timestamp > now + 2000 ||
              now - timestamp > 7000) continue;
          const payload = {
            sessionId: session.id,
            speakerId: line.speaker_id,
            gestureId: line.gesture_id,
            at: line.at,
            isLocal: line.speaker_id === currentUserId,
          };
          emitted.push(payload);
          onGesture?.(payload);
        }
      }
      // Keeps memory bounded during long play sessions.
      if (observed.size > 4000) observed.clear();
      return emitted;
    },
    reset() { observed.clear(); firstSnapshot = true; },
  };
}
