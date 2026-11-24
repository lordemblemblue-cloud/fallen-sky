// Story Campaign: the existing Contraband mission, solo or with 1–4 players
// in public crews and private five-letter code rooms.
import { useState } from 'react';
import { BookOpen, ChevronRight, Copy, KeyRound, Play, Radio, Users } from 'lucide-react';
import { useLobby } from '../duelist/menu/useLobby.js';

export default function DuelistCampaignPanel({ onLaunch }) {
  const lobby = useLobby();
  const [typed, setTyped] = useState('');
  const code = typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);
  const crews = (lobby.matches || []).filter(room => room.mode === 'story' && room.open);
  const online = lobby.online;
  return (
    <section className="g2-duelist-detail g2-duelist-campaign" aria-label="Story campaign">
      <div className="g2-duelist-detail__kicker"><BookOpen size={18} aria-hidden="true" /> Story Campaign · Chapter One</div>
      <h2>Contraband</h2>
      <p className="g2-duelist-detail__intro">Infiltrate a freight depot, trace the blue drug and uncover who is arming the Ash Legion. Complete the mission alone or with a crew of up to four.</p>
      <div className="g2-duelist-campaign__steps">
        <span>Infiltrate</span><span>Find the Ledger</span><span>Escape</span><span>Face the Mentor</span>
      </div>
      <div className="g2-duelist-campaign__choices">
        <button type="button" onClick={() => onLaunch({ online: false })} className="g2-duelist-action g2-duelist-action--primary">
          <Play size={16} /> Play Solo <ChevronRight size={15} />
        </button>
        <button type="button" disabled={!online} onClick={() => onLaunch({ online: true })} className="g2-duelist-action">
          <Users size={16} /> Join an Open Crew
        </button>
        <button type="button" disabled={!online} onClick={() => onLaunch({ online: true, room: 'open' })} className="g2-duelist-action">
          <Radio size={16} /> Host Open Crew
        </button>
        <button type="button" disabled={!online} onClick={() => onLaunch({ online: true, room: 'new' })} className="g2-duelist-action">
          <KeyRound size={16} /> Create Private Crew
        </button>
      </div>
      <div className="g2-duelist-campaign__join">
        <label htmlFor="duelist-crew-code">Join a friend's private room</label>
        <div>
          <input id="duelist-crew-code" type="text" aria-label="Five-letter crew room code"
            autoCapitalize="characters" spellCheck={false} placeholder="ROOM CODE"
            maxLength={5} value={code} onChange={e => setTyped(e.target.value)} />
          <button type="button" disabled={!online || code.length !== 5}
            onClick={() => onLaunch({ online: true, room: code })}>Join Code</button>
        </div>
      </div>
      <div className="g2-duelist-campaign__rooms">
        <strong>Open co-op crews</strong>
        {crews.length ? crews.map(crew => (
          <button type="button" key={crew.id} disabled={!crew.open}
            onClick={() => onLaunch({ online: true, room: crew.id })}>
            <span>{crew.name || 'Contraband'} <small>{crew.players}/{crew.seats} players</small></span>
            <ChevronRight size={15} />
          </button>
        )) : <p>{online ? 'No public crews yet. Host one for others to join.' : 'Public crews appear when the match server connects.'}</p>}
      </div>
      <p className="g2-duelist-campaign__status">{online
        ? 'Co-op server connected. Everyone shares mission objectives and checkpoints.'
        : 'Co-op requires the dedicated match server. Solo play is available now.'}</p>
    </section>
  );
}
