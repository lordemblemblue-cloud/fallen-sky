// The embedded Duelist competitive hub: no separate Online page. Player
// sees four modes, a hairline divider and all server-confirmed running arenas.
import { useState } from 'react';
import { Play, Radio, RefreshCw, Shuffle, Users } from 'lucide-react';
import { useLobby } from '../duelist/menu/useLobby.js';
import { MENU_MODES } from '../duelist/menu/modes.js';

export const PUBLIC_MODE_ORDER = Object.freeze(['duel', 'ctf', 'football', 'tdm', 'control']);

export default function DuelistModeBrowser({ onJoin, onSolo, onQuickMatch }) {
  const lobby = useLobby();
  const [selected, setSelected] = useState(null);
  const matches = (lobby.matches || [])
    .filter(room => PUBLIC_MODE_ORDER.includes(room.mode))
    .sort((a, b) => PUBLIC_MODE_ORDER.indexOf(a.mode) - PUBLIC_MODE_ORDER.indexOf(b.mode) ||
      (a.publicRoom === b.publicRoom ? b.players - a.players : a.publicRoom ? -1 : 1));
  const visible = selected ? matches.filter(room => room.mode === selected) : matches;
  const status = !lobby.serverUrl ? 'Match service not configured. The arenas will appear after deployment.'
    : !lobby.loaded ? 'Connecting to the match service…'
      : !lobby.online ? 'The match service is offline. Check the connection before joining.'
        : 'Players take the place of bots. When a server fills, a second one opens automatically.';

  return (
    <div className="g2-duelist-browser g2-shell" data-testid="duelist-embedded-modes">
      <button type="button" className="g2-duelist-browser__quickplay" onClick={onQuickMatch}
        disabled={!lobby.online} data-testid="duelist-online-quickplay">
        <Shuffle size={23} aria-hidden="true" />
        <span><strong>Online</strong><small>Random match · Team Deathmatch, Capture the Flag or Three-Point Control</small></span>
        <span className="g2-duelist-browser__quickplay-action">{lobby.online ? 'Find Match' : 'Offline'} <Play size={14} aria-hidden="true" /></span>
      </button>
      <div className="g2-duelist-browser__tabs" role="group" aria-label="Choose a Duelist game mode">
        {PUBLIC_MODE_ORDER.map((id) => {
          const mode = MENU_MODES[id];
          const Icon = mode.icon;
          const count = matches.filter(room => room.mode === id).length;
          return (
            <button key={id} type="button" aria-pressed={selected === id}
              onClick={() => setSelected(previous => previous === id ? null : id)}
              className={'g2-duelist-browser__tab' + (selected === id ? ' is-selected' : '')}>
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
              <span>{mode.title}</span>
              {count > 1 && <small>{count} servers</small>}
            </button>
          );
        })}
      </div>
      <div className="g2-duelist-browser__divider" aria-hidden="true" />
      <div className="g2-duelist-browser__status">
        <span><Radio size={15} aria-hidden="true" /> {lobby.online ? `${lobby.players} human players online` : 'Servers'}</span>
        <button type="button" onClick={lobby.refresh} aria-label="Refresh servers"><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
      </div>
      <p className="g2-duelist-browser__note" role="status">{status}</p>
      <div className="g2-duelist-browser__servers" aria-label="Live Duelist servers">
        {visible.map((room) => {
          const mode = MENU_MODES[room.mode];
          const Icon = mode.icon;
          const available = lobby.online && room.open && room.players < room.seats;
          return (
            <div key={room.id} className="g2-duelist-browser__row">
              <Icon size={19} style={{ color: mode.accent }} aria-hidden="true" />
              <div className="g2-duelist-browser__name">
                <strong>{mode.title} <span>{room.publicRoom ? '01' : room.id}</span></strong>
                <small>{room.phase === 'over' ? 'Next round soon' : 'Public arena'} · {room.bots} bots</small>
              </div>
              <div className="g2-duelist-browser__players"><Users size={14} aria-hidden="true" /> {room.players}/{room.seats}</div>
              <button type="button" disabled={!available} onClick={() => onJoin(room.mode, room.id)}
                className="g2-duelist-browser__join">{available ? 'Join' : 'Full'} <Play size={13} aria-hidden="true" /></button>
            </div>
          );
        })}
        {!visible.length && <div className="g2-duelist-browser__empty">{lobby.online
          ? 'No open servers match the selected mode.'
          : 'No live servers are available until the match service connects.'}</div>}
      </div>
      <div className="g2-duelist-browser__footer">
        <span>{visible.length} {visible.length === 1 ? 'server' : 'servers'} listed</span>
        {selected && <button type="button" onClick={() => onSolo(selected)}>Play {MENU_MODES[selected].title} against bots</button>}
      </div>
    </div>
  );
}
