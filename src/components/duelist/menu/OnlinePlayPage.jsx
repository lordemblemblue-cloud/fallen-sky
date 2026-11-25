import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCw, Users, ArrowRight } from 'lucide-react';
import { MenuShell } from './MenuPages.jsx';
import { MENU_MODES } from './modes.js';
import { useLobby } from './useLobby.js';
import OnlineArenaPreview from './OnlineArenaPreview.jsx';
import { ONLINE_SERVER_MODES, persistentServerCards, serverJoinSearch } from './serverBrowser.mjs';

// Every 3D card represents one exact public room, not a mode queue.
export default function OnlinePlayPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [mode, setMode] = useState(() =>
    ONLINE_SERVER_MODES.includes(search?.mode) ? search.mode : 'all');
  const lobby = useLobby();
  const rooms = persistentServerCards(lobby.online ? lobby.matches : null, mode);
  const join = room => {
    const exactServer = serverJoinSearch(room);
    if (lobby.online && exactServer) {
      navigate({ to: '/duelist-next/play', search: exactServer });
    }
  };

  return (
    <MenuShell title="Online Play" subtitle="Choose a room and drop straight into its arena. No matchmaking queue."
      back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="space-y-4" aria-label="Online Play server browser">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            Mode
            <select value={mode} onChange={event => setMode(event.target.value)}
              className="rounded border border-white/25 bg-slate-900 px-3 py-2 text-white" aria-label="Filter servers by game mode">
              <option value="all">All rooms</option>
              {ONLINE_SERVER_MODES.map(id => <option key={id} value={id}>{MENU_MODES[id]?.title || id}</option>)}
            </select>
          </label>
          <button type="button" onClick={lobby.refresh} disabled={!lobby.serverUrl}
            className="flex items-center gap-2 rounded border border-white/25 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            <RefreshCw size={16} aria-hidden="true"/> Refresh
          </button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-white/70">
          {lobby.online ? `${lobby.players} players online · Permanent public rooms`
            : !lobby.loaded ? 'Connecting to public rooms…' : 'Connection unavailable · Public rooms remain listed; reconnect to enter.'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Public arena rooms">
          {rooms.map(room => {
            const canJoin = lobby.online && room.open;
            const title = MENU_MODES[room.mode]?.title || room.mode;
            return <article key={room.id} role="listitem" className="overflow-hidden rounded-lg border border-white/15 bg-slate-950/65">
              <button type="button" disabled={!canJoin} onClick={() => join(room)}
                className="block w-full text-left focus-visible:outline focus-visible:outline-cyan-300 disabled:cursor-default"
                aria-label={`Enter ${title} room ${room.id}`}>
                <OnlineArenaPreview mode={room.mode}/>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="font-bold text-white">{title}</div>
                    <div className="text-xs text-white/50">{room.official ? 'Official room' : 'Additional room'} · {room.id.toUpperCase()}</div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-white">
                    <Users size={16} aria-hidden="true"/> {room.confirmed ? `${room.players}/${room.seats}` : '—/—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-3">
                  <span className="text-xs text-white/65">{!room.confirmed ? 'Connecting' : room.phase === 'over' ? 'Round resetting' : room.players >= room.seats ? 'Full' : room.phase === 'live' ? 'In progress' : 'Starting round'}</span>
                  <span className="flex items-center gap-1 text-sm font-bold text-amber-200">{canJoin ? 'Join room' : 'Join when ready'} <ArrowRight size={15} aria-hidden="true"/></span>
                </div>
              </button>
            </article>;
          })}
        </div>
      </div>
    </MenuShell>
  );
}
