// The match server's live matches for a menu page, refreshed every few seconds while the page is open.
import { useEffect, useState } from 'react';
import { duelistServerUrl, fetchLobby } from '../net/client.mjs';

/** { serverUrl, matches (array or null), reachable, players (total), byMode: { mode: players } } */
export function useLobby(everyMs = 3000) {
  const [serverUrl] = useState(() => (typeof window === 'undefined' ? null : duelistServerUrl()));
  const [state, setState] = useState({ matches: null, reachable: false, loaded: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!serverUrl) { setState({ matches: null, reachable: false, loaded: true }); return undefined; }
    let alive = true, timer;
    const poll = async () => {
      const matches = await fetchLobby(serverUrl);
      if (!alive) return;
      setState({ matches: matches || [], reachable: matches !== null, loaded: true });
      timer = setTimeout(poll, serverUrl === 'base44:duelist' ? Math.max(10000, everyMs) : everyMs);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [serverUrl, everyMs, revision]);
  const byMode = {};
  let players = 0;
  for (const m of state.matches || []) { byMode[m.mode] = (byMode[m.mode] || 0) + m.players; players += m.players; }
  return { serverUrl, ...state, players, byMode, online: !!serverUrl && state.reachable, refresh: () => setRevision(value => value + 1) };
}
