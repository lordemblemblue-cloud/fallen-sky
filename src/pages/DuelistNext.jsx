import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import DuelistGame from '@/components/duelist/client/DuelistGame';
import { BODIES } from '@/components/duelist/client/assets.mjs';
import { readPrefs, writePrefs, classProgressOf } from '@/components/duelist/client/prefs.mjs';
import { duelistServerUrl } from '@/components/duelist/net/client.mjs';
import { MENU_MODES } from '@/components/duelist/menu/modes';
import { missionTitle } from '@/components/duelist/menu/missions';
import '@/components/duelist/menu/duelistUnifiedVisual.css';
import '@/components/duelist/menu/duelistSapphire.css';

// Duelist Adventure's arena (the new build): the match the menus chose, with your saved fighter and settings.
// mode: practice | duel | ffa | tdm | ctf | football | control | online | any (Join) | story (mission: which);
// online: on the match server, else against bots here. matchId: a listed match to join. from: 'duelist' when the
// /duelist menu sent the player here (Menu goes back there).
export default function DuelistArena({ mode = 'practice', online = false, room = null, mission = 'contraband', matchId = null, from = null, testMode = false, practiceMode = false }) {
  const [prefs] = useState(readPrefs);
  const [testBots, setTestBots] = useState(false);
  const [playing, setPlaying] = useState(mission); // a crew may play another mission (a friend's code, the next one)
  const navigate = useNavigate();
  const [serverUrl] = useState(() => (typeof window === 'undefined' ? null : duelistServerUrl(mode)));
  const back = mode === 'any' ? 'join' : mode;
  const backToMenu = from === 'duelist' ? '/duelist' : null;
  const leave = () => (from === 'online-play'
    ? navigate({ to: '/duelist-next/$page', params: { page: 'online-play' }, search: { mode } })
    : backToMenu ? navigate({ to: backToMenu }) : navigate({ to: '/duelist-next/$page', params: { page: back } }));
  const title = mode === 'any' ? 'Join' : mode === 'story' ? missionTitle(playing) : MENU_MODES[mode]?.title || 'Practice';
  const where = testMode ? (testBots ? 'private test · bots on' : 'private test · solo') : mode === 'story' ? (online ? 'story mission, with a crew' : 'story mission, solo') : online ? 'online' : mode === 'practice' ? 'practice' : `against bots (${prefs.level})`;
  const unavailable = online && !serverUrl;
  return (
    <main className="duelist-arena-page">
      <header className="duelist-arena-header">
        <button type="button" onClick={leave} className="duelist-arena-back">
          <ArrowLeft className="h-4 w-4" /> MENU
        </button>
        <div className="duelist-arena-brand"><span>EMBLEM BLUE</span><strong>DUELIST ADVENTURE</strong></div>
        <div className="duelist-arena-title">{title}</div>
        {testMode && <button type="button" aria-pressed={testBots} title="Restarts this private test with the selected bot setting" className="duelist-arena-back" onClick={() => { if (document.pointerLockElement) document.exitPointerLock?.(); setTestBots(v => !v); }}>Bots: {testBots ? "On" : "Off"} (restart)</button>}
        <div className="duelist-arena-meta">{where} · {BODIES[prefs.fighter]?.name}</div>
      </header>
      <section className="duelist-arena-section">
        {unavailable ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-white/60">
            Online story crews are not available on this host.
            <Link to="/duelist-next/$page" params={{ page: 'practice' }} className="text-cyan-200 hover:underline">Practice instead</Link>
          </div>
        ) : (
          <DuelistGame mode={mode} online={online} serverUrl={serverUrl} you={prefs.fighter} foe={prefs.foe} botLevel={prefs.level}
            testMode={testMode} practiceMode={practiceMode} practiceSettings={prefs.practiceSettings} testBots={testBots} bots={prefs.bots} sensitivity={prefs.sensitivity} keys={prefs.keys} voicesOn={prefs.voices !== false} room={room} matchId={matchId}
            classId={prefs.classId} onClassChange={testMode ? null : (id) => writePrefs({ classId: id })}
            progress={classProgressOf(prefs)}
            onProgress={testMode || practiceMode || mode === 'practice' ? null : (classId, total) => writePrefs({ classXp: { ...classProgressOf(readPrefs()), [classId]: total } })}
            mission={mission} onMission={setPlaying} onLeave={leave}
            onNext={(id) => navigate({ to: '/duelist-next/play', search: { mode: 'story', mission: id, online: 0, ...(from ? { from } : {}) } })} />
        )}
      </section>
    </main>
  );
}
