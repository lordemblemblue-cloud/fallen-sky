import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCw, Server, Users, ArrowRight, Shield } from 'lucide-react';
import { MenuShell } from './MenuPages.jsx';
import { MENU_MODES } from './modes.js';
import { useLobby } from './useLobby.js';
import { ONLINE_SERVER_MODES, visibleDuelistServers, serverJoinSearch, modeServerDirectory } from './serverBrowser.mjs';

/** Real public servers, not a queue or simulated list of rooms. */
export default function OnlinePlayPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [mode, setMode] = useState(() =>
    ONLINE_SERVER_MODES.includes(search?.mode) ? search.mode : 'all');
  const lobby = useLobby();
  const rooms = visibleDuelistServers(lobby.matches, mode);
  const directory = modeServerDirectory(lobby.matches, lobby.online, mode);

  const join = (room) => {
    const exactServer = serverJoinSearch(room);
    if (lobby.online && exactServer) {
      navigate({ to: '/duelist-next/play', search: exactServer });
    }
  };
  const status = !lobby.serverUrl
    ? 'The online match server is not configured for this website. Practice is still available.'
    : !lobby.loaded ? 'Checking live servers…'
      : !lobby.online ? 'The match server is not responding. Refresh to try again.'
        : rooms.length ? `${rooms.length} live server${rooms.length === 1 ? '' : 's'} listed`
          : 'No available public servers are listed for this mode.';

  return (
    <MenuShell title="Online Play" subtitle="Browse live Duelist Adventure servers. Pick the match you want and join it directly—no waiting queue."
      back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="space-y-5" aria-label="Online Play server browser">
        <div className="duelist-menu-panel flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-200/90">Public servers</p>
            <h2 className="text-xl font-bold text-white">Choose your arena</h2>
            <p className="text-sm text-white/60">Each mode has a planned 100-player server pool with smaller playable arenas. Duel remains 1v1.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/65">
              Game mode
              <select value={mode} onChange={event => setMode(event.target.value)}
                className="min-w-44 rounded border border-white/25 bg-slate-900 px-3 py-2 text-sm text-white"
                aria-label="Filter servers by game mode">
                <option value="all">All modes</option>
                {ONLINE_SERVER_MODES.map(id => <option key={id} value={id}>{MENU_MODES[id]?.title || id}</option>)}
              </select>
            </label>
            <button type="button" onClick={lobby.refresh} disabled={!lobby.serverUrl}
              className="flex items-center gap-2 rounded border border-white/25 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
              <RefreshCw size={16} aria-hidden="true"/> Refresh
            </button>
          </div>
        </div>

        <p className="flex items-center gap-2 text-sm text-white/70" role="status" aria-live="polite">
          <Server size={17} aria-hidden="true"/> {status}
        </p>

        <div className="grid gap-3" aria-label="Permanent mode servers">
          {directory.map(entry => (
            <article key={entry.mode} className="duelist-menu-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-bold text-white">{MENU_MODES[entry.mode]?.title || entry.mode} server</div>
                <p className="text-xs text-white/60">{entry.mode === 'duel' ? 'One-on-one arenas' : 'Direct-join battle arenas'} · {lobby.online && entry.rooms.length ? entry.rooms.length + ' rooms' : 'Unavailable'}</p>
              </div>
              <div className="text-sm text-white/70">{entry.capacity ? (entry.players ?? '—') + ' / ' + entry.capacity : (entry.players ?? '—') + ' online · 100 target'}</div>
              <button type="button" onClick={() => join(entry.joinable)} disabled={!entry.joinable || !lobby.online}
                className="rounded border border-amber-300/50 bg-amber-600/80 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                {entry.joinable && lobby.online ? 'Join now' : 'Unavailable'}
              </button>
            </article>
          ))}
        </div>
        {lobby.online && rooms.length > 0 ? (
          <div className="grid gap-3" role="list" aria-label="Live public servers">
            {rooms.map(room => (
              <article role="listitem" key={room.id}
                className="duelist-menu-panel flex flex-wrap items-center gap-4 border border-white/15 bg-slate-950/65 p-4">
                <div className="flex min-w-48 flex-1 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded border border-cyan-300/35 bg-cyan-950/50">
                    <Shield size={23} className="text-cyan-200" aria-hidden="true"/>
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">{MENU_MODES[room.mode]?.title || room.mode}</div>
                    <div className="text-xs text-white/50">Server {room.id.toUpperCase()} · {room.phase === 'over' ? 'Finishing' : room.phase === 'live' ? 'Playing' : 'Starting'}</div>
                  </div>
                </div>
                <div className="min-w-32 text-sm text-white/70">
                  <div className="flex items-center gap-2 text-base font-bold text-white">
                    <Users size={18} aria-hidden="true"/> {room.players} / {room.seats}
                  </div>
                  <span className="text-xs text-white/50">{room.bots} bot{room.bots === 1 ? '' : 's'} · {Math.max(0, room.seats - room.players)} player slots open</span>
                </div>
                <button type="button" onClick={() => join(room)} disabled={!room.open}
                  className="flex min-w-32 items-center justify-center gap-2 rounded border border-amber-300/50 bg-amber-600/80 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={room.open ? `Join ${MENU_MODES[room.mode]?.title || room.mode} server ${room.id}` : `Server ${room.id} unavailable`}>
                  {room.open ? <>Join server <ArrowRight size={16} aria-hidden="true"/></> : 'Unavailable'}
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {!lobby.online && lobby.loaded && (
          <div className="duelist-menu-panel space-y-3">
            <p className="text-sm text-white/65">Online matches require a reachable Duelist Adventure match server. This page will show real rooms once the server is connected.</p>
            <Link to="/duelist-next/$page" params={{ page: 'practice' }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:underline">
              Play offline practice <ArrowRight size={16} aria-hidden="true"/>
            </Link>
          </div>
        )}
      </div>
    </MenuShell>
  );
}
