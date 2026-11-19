import { useState } from 'react';
import { ArrowLeft, ChevronRight, Radio, RefreshCw, Server, Users } from 'lucide-react';
import { useLobby } from '../duelist/menu/useLobby.js';
import { MENU_MODES } from '../duelist/menu/modes.js';

const FILTERS = Object.freeze([
  ['all', 'All'],
  ['tdm', 'Team Deathmatch'],
  ['ffa', 'Free For All'],
  ['ctf', 'Capture the Flag'],
  ['duel', 'Duel'],
]);
const ORDER = FILTERS.slice(1).map(([mode]) => mode);

/** Full-width multiplayer browser. It lists only rooms confirmed by the Duelist match server. */
export default function DuelistOnlineBrowser({ onBack, onJoin }) {
  const lobby = useLobby();
  const [filter, setFilter] = useState('all');
  const matches = (lobby.matches || [])
    .filter((match) => ORDER.includes(match.mode))
    .sort((a, b) => ORDER.indexOf(a.mode) - ORDER.indexOf(b.mode) || b.players - a.players);
  const visible = matches.filter((match) => filter === 'all' || match.mode === filter);
  const status = !lobby.serverUrl
    ? 'Online matches require the Duelist match server to be deployed and VITE_DUELIST_WS_URL configured.'
    : !lobby.loaded ? 'Contacting the match server…'
      : !lobby.reachable ? 'The match server is not responding. Try again when it is online.'
        : 'Bots occupy empty seats and one bot leaves for each player who joins.';

  return (
    <div className="g2-shell relative z-10 h-full overflow-y-auto bg-[#06101b]/85 px-4 pb-12 pt-5 text-white sm:px-8 lg:px-12" data-testid="duelist-online-browser">
      <div className="mx-auto max-w-7xl">
        <button type="button" onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/80 hover:bg-white/10">
          <ArrowLeft size={17} aria-hidden="true" /> Back to main menu
        </button>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="g2-eyebrow">Duelist Adventure / Online</div>
            <h1 className="!mb-3 !mt-3">Choose your battle.</h1>
            <p className="g2-muted">Join a living arena. Every mode has a public bot-filled server ready when the match service is running.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white/75">
            <Radio size={17} className={lobby.online ? 'text-emerald-300' : 'text-amber-300'} />
            {lobby.online ? `${lobby.players} players online` : 'Multiplayer offline'}
          </div>
        </div>
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Online game mode filters">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
              className={`rounded-lg border px-4 py-2.5 text-sm transition ${filter === id
                ? 'border-amber-200/65 bg-amber-200/15 text-amber-100'
                : 'border-white/15 bg-white/[0.045] text-white/70 hover:border-white/30 hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mb-5 text-sm text-white/60" role="status">{status}</p>
        {visible.length ? (
          <div className="grid gap-3" aria-label="Available match servers">
            {visible.map((match) => {
              const mode = MENU_MODES[match.mode];
              const Icon = mode.icon;
              const available = lobby.online && match.open;
              return (
                <div key={match.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/15 bg-[#122337]/65 p-4 shadow-lg shadow-black/10 backdrop-blur-lg sm:p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]" style={{ color: mode.accent }}>
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <div className="min-w-[160px] flex-1">
                    <div className="text-base font-semibold">{mode.title}</div>
                    <div className="mt-1 text-xs text-white/50">{match.publicRoom ? 'Official public server' : 'Public match'} · {match.phase === 'over' ? 'Round ending' : 'Active arena'}</div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
                    <div><Users size={14} className="mr-1 inline text-cyan-200" aria-hidden="true" /> {match.players}/{match.seats} players</div>
                    <div>{match.bots} {match.bots === 1 ? 'bot' : 'bots'}</div>
                  </div>
                  <button type="button" disabled={!available} onClick={() => onJoin(match.mode)}
                    className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg border border-amber-200/50 bg-amber-200/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-200/25 disabled:cursor-not-allowed disabled:opacity-35">
                    {available ? 'Join Server' : 'Unavailable'} <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.035] px-6 py-12 text-center">
            <Server className="mx-auto mb-3 text-white/40" size={30} aria-hidden="true" />
            <h2 className="!m-0 !text-lg">No connected servers to show</h2>
            <p className="g2-muted mx-auto mt-2">{lobby.online ? 'No live matches match this filter.' : 'The four public modes will appear here when the Duelist match server is online.'}</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-sm text-white/50">
          <span>{visible.length} {visible.length === 1 ? 'server' : 'servers'} listed · Empty seats are played by bots.</span>
          <button type="button" onClick={lobby.refresh} className="inline-flex items-center gap-2 text-cyan-200/80 hover:text-white">
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
