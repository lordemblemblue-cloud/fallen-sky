import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import DuelistGame from '@/components/duelist/client/DuelistGame';
import { BODIES } from '@/components/duelist/client/assets.mjs';
import { readPrefs } from '@/components/duelist/client/prefs.mjs';
import { duelistServerUrl } from '@/components/duelist/net/client.mjs';
import { MENU_MODES } from '@/components/duelist/menu/modes';
import { missionTitle } from '@/components/duelist/menu/missions';

// Duelist Adventure's arena (the new build): the match the menus chose, with your saved fighter and settings.
// mode: practice | duel | ffa | tdm | ctf | any (Join) | story (mission: which); online: on the match server, else against bots here.
export default function DuelistArena({ mode = 'practice', online = false, room = null, mission = 'contraband' }) {
  const [prefs] = useState(readPrefs);
  const [playing, setPlaying] = useState(mission); // a crew may play another mission (a friend's code, the next one)
  const navigate = useNavigate();
  const [serverUrl] = useState(() => (typeof window === 'undefined' ? null : duelistServerUrl()));
  const back = mode === 'any' ? 'join' : mode;
  const title = mode === 'any' ? 'Join' : mode === 'story' ? missionTitle(playing) : MENU_MODES[mode]?.title || 'Practice';
  const where = mode === 'story' ? (online ? 'story mission, with a crew' : 'story mission, solo') : online ? 'online' : mode === 'practice' ? 'practice' : `against bots (${prefs.level})`;
  const unavailable = online && !serverUrl;
  return (
    <main className="flex h-screen min-h-0 flex-col bg-[#05080d] text-white">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/10 bg-[#08111b] px-3">
        <Link to="/duelist-next/$page" params={{ page: back }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Menu
        </Link>
        <div className="h-5 w-px bg-white/10" />
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-white/40">{where} · {BODIES[prefs.fighter]?.name}</div>
      </header>
      <section className="relative min-h-0 flex-1">
        {unavailable ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-white/60">
            Online play is not set up yet: the match server is not deployed.
            <Link to="/duelist-next/$page" params={{ page: 'practice' }} className="text-cyan-200 hover:underline">Practice instead</Link>
          </div>
        ) : (
          <DuelistGame mode={mode} online={online} serverUrl={serverUrl} you={prefs.fighter} foe={prefs.foe} botLevel={prefs.level}
            bots={prefs.bots} sensitivity={prefs.sensitivity} room={room} mission={mission} onMission={setPlaying}
            onNext={(id) => navigate({ to: '/duelist-next/play', search: { mode: 'story', mission: id, online: 0 } })} onLeave={() => navigate({ to: '/duelist-next/$page', params: { page: back } })} />
        )}
      </section>
    </main>
  );
}
