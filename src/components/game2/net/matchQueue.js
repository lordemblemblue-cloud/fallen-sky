// Game 2 authenticated matchmaking socket. It never constructs a map or
// admits an arena player while the relay says "queue_wait".
import { game2RailwayUrl, GAME2_RAILWAY_PROTOCOL } from './railway.js';
import { GAME2_QUEUE_MODES, normalizeGame2QueueModes } from '../../../../server/game2/queueRules.mjs';
import { queueMapAllowed } from '../../../../server/game2/onlineArenaPolicy.mjs';

export function openGame2MatchQueue({
  token, peer, name, modes, mapId = null, onWaiting = () => {}, onMatch = () => {},
  onError = () => {}, WebSocketImpl = globalThis.WebSocket, url = game2RailwayUrl(),
}) {
  const validModes = normalizeGame2QueueModes(modes);
  if (!validModes || !token || !peer || !WebSocketImpl ||
      (mapId != null && validModes.some(mode=>!queueMapAllowed(mode,mapId)))) {
    throw new Error('A signed-in player and a valid multiplayer mode are required.');
  }
  let active = true;
  let found = false;
  const socket = new WebSocketImpl(url);
  const fail = message => {
    if (!active || found) return;
    active = false;
    onError(String(message || 'Connection to the matchmaking service was lost.'));
    try { socket.close(); } catch { /* already closed */ }
  };
  socket.onopen = () => {
    if (!active) return;
    socket.send(JSON.stringify({
      t: 'queue', version: GAME2_RAILWAY_PROTOCOL,
      token, peer, name: String(name || 'Jedi').slice(0, 20), modes: validModes, mapId,
    }));
    token = null;
  };
  socket.onmessage = event => {
    if (!active) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.t === 'queue_wait') {
      onWaiting(message);
    } else if (message.t === 'match_found') {
      if (!GAME2_QUEUE_MODES.includes(message.matchMode) ||
          typeof message.serverId !== 'string' || !/^(match-|public-(?:duel|team_duel)-[12]$)/.test(message.serverId) ||
          typeof message.mapId !== 'string' || typeof message.matchTicket !== 'string' ||
          !message.matchTicket) {
        fail('The match server sent an invalid admission ticket.');
        return;
      }
      found = true;
      active = false;
      onMatch(message);
      try { socket.close(1000, 'Match found'); } catch { /* socket closing */ }
    } else if (message.t === 'error') {
      fail(message.message || 'The multiplayer queue rejected this request.');
    }
  };
  socket.onerror = () => fail('The matchmaking connection could not be established.');
  socket.onclose = () => { if (active && !found) fail('Matchmaking disconnected. Try queueing again.'); };
  return {
    cancel() {
      if (!active) return;
      active = false;
      token = null;
      if (socket.readyState === 1) {
        try { socket.send(JSON.stringify({ t: 'queue_cancel' })); } catch { /* closing */ }
      }
      try { socket.close(1000, 'Queue cancelled'); } catch { /* already closed */ }
    },
  };
}
