// Game 3D Echo Chronicle: keep only mutually agreed, factual shared memories.
// Stored per signed-in user AND active character, not as global game flags.
import { characterScopedStorage, subscribeCharacterChange } from '../characterStorage';
import {isChroniclePhoto} from './echoChroniclePhoto';

const storage = characterScopedStorage('game3d_echo_chronicle_v1');
const introStorage = characterScopedStorage('game3d_echo_intros_v1');
const listeners = new Set();

const load = () => {
  try {
    const entries = JSON.parse(storage.get() || '[]');
    return Array.isArray(entries) ? entries.slice(0, 100) : [];
  } catch { return []; }
};
let memories = load();
subscribeCharacterChange(() => {
  memories = load();
  listeners.forEach((fn) => fn(getEchoMemories()));
});

export function getEchoMemories() { return [...memories]; }
export function subscribeEchoMemories(fn) {
  listeners.add(fn);
  fn(getEchoMemories());
  return () => listeners.delete(fn);
}

// A dialogue still visible to the pair on the server is NOT a Chronicle memory.
// Both players must explicitly consent; the server alone sets remembered_at.
export function rememberEchoSession(session, myUserId) {
  if (!session?.id || !session.remembered_at || !session.consent_initiator || !session.consent_recipient) return false;
  if (session.initiator_id !== myUserId && session.recipient_id !== myUserId) return false;
  if (memories.some((entry) => entry.id === session.id)) return false;
  const partnerName = session.initiator_id === myUserId ? session.recipient_name : session.initiator_name;
  const entry = {
    id: session.id,
    date: session.created_date || session.remembered_at,
    rememberedAt: session.remembered_at,
    partnerName: String(partnerName || 'Another traveler').slice(0, 80),
    region: String(session.region || '').slice(0, 60),
    context: session.context_type || 'chance',
    // Factual context comes from the server-saved encounter, not narrative guesses.
    meetingDistanceM: Number.isFinite(Number(session.meeting_distance_m)) ? Number(session.meeting_distance_m) : null,
    previousEncounters: Math.max(0, Number(session.previous_encounters) || 0),
    previousMetAt: session.previous_met_at || null,
    previousRegion: String(session.previous_region || '').slice(0, 60),
    // Only an actual two-player agreement may become a remembered plan;
    // never describe the quest as completed or claim a boss rescue.
    agreedAdventure: session.adventure_proposal?.status === 'agreed' &&
      ['echo_branch_hidden_echo', 'echo_branch_broken_road'].includes(session.adventure_proposal.quest_id)
      ? session.adventure_proposal.quest_id : null,
    bookmarked: false,
    reflection: '', // private to this character/browser, never written to multiplayer
    photoDataUri: '', // optional compressed local JPG, never sent to the server
    lines: (session.lines || []).slice(0, 24).map((line) => ({
      name: String(line.speaker_name || 'Traveler').slice(0, 80),
      kind: line.kind === 'gesture' ? 'gesture' : 'speech',
      gestureId: line.kind === 'gesture' ? String(line.gesture_id || '').slice(0, 24) : null,
      // Server-authored interaction time; never substitute Date.now() for a
      // missing timestamp or pretend old, undated entries have exact times.
      at: typeof line.at === 'string' && Number.isFinite(Date.parse(line.at))
        ? line.at : null,
      text: String(line.text || '').slice(0, 220),
    })),
  };
  memories = [entry, ...memories].slice(0, 100);
  if (!storage.setChecked(JSON.stringify(memories))) {
    memories = load(); // avoid claiming the memory persisted if storage is unavailable
    return false;
  }
  listeners.forEach((fn) => fn(getEchoMemories()));
  return true;
}

export function getIntroSeenCount() {
  const n = Number(introStorage.get() || 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0;
}
export function markIntroSeen() {
  const next = Math.min(2, getIntroSeenCount() + 1);
  introStorage.set(String(next));
  return next;
}


// Changes only the local reader's PRIVATE note and bookmark, never the shared
// transcript, consent flags, partner metadata, server session or quest progress.
export function updateEchoMemoryAnnotation(id, patch = {}) {
  const index = memories.findIndex((entry) => entry.id === id);
  if (index < 0 || !id) return false;
  const previous = memories;
  const current = previous[index];
  const next = {
    ...current,
    ...(typeof patch.bookmarked === 'boolean' ? { bookmarked: patch.bookmarked } : {}),
    ...(typeof patch.reflection === 'string'
      ? { reflection: patch.reflection.replace(/[\\u0000-\\u001f\\u007f]/g, ' ').slice(0, 500) } : {}),
    ...(patch.photoDataUri === '' || isChroniclePhoto(patch.photoDataUri)
      ? {photoDataUri:patch.photoDataUri} : {}),
  };
  memories = previous.map((entry, i) => i === index ? next : entry);
  if (!storage.setChecked(JSON.stringify(memories))) {
    memories = previous;
    return false;
  }
  listeners.forEach((fn) => fn(getEchoMemories()));
  return true;
}
