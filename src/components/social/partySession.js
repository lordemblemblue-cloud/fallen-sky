// Shared party state: one store for the dashboard party panel, the in-world
// MultiplayerSystem (which reads the party voice room from it) and the social
// toasts. IncomingRequestToast publishes the party snapshot it reads from the
// party backend; everything else subscribes.
import { useEffect, useState } from 'react';

const EMPTY = Object.freeze({ party: null, members: [], invitations: [] });

let state = EMPTY;
const listeners = new Set();

export const partySession = {
  get value() {
    return state;
  },
  publish(next) {
    state = { ...EMPTY, ...(next || {}) };
    listeners.forEach((fn) => fn(state));
  },
  clear() {
    partySession.publish(EMPTY);
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
};

export function usePartySession() {
  const [value, setValue] = useState(state);
  useEffect(() => partySession.subscribe(setValue), []);
  return value;
}