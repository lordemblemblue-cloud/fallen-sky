import { createFileRoute } from '@tanstack/react-router';
import DuelistArena from '@/pages/DuelistNext';
import { MISSION_ORDER } from '@/components/duelist/sim/mission.mjs';

// The arena: ?mode=practice|duel|ffa|tdm|ctf|any&online=1 (any = Join: the busiest online match with players),
// or ?mode=story&mission=contraband|saltmarch: a co-op mission, played here; with online=1 on the match server
// with a crew (room=<a crew's code>, room=new for a room of your own, or no room: any open crew)
const MODES = ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'any', 'story'];

export const Route = createFileRoute('/duelist-next/play')({
  ssr: false,
  validateSearch: (search) => {
    const mode = MODES.includes(search.mode) ? search.mode : 'practice';
    const online = mode === 'any' || ((search.online === 1 || search.online === '1' || search.online === true) && mode !== 'practice');
    const asked = typeof search.room === 'string' ? search.room.trim() : '';
    const room = mode !== 'story' || !online ? null : asked === 'new' ? 'new' : /^[A-HJ-NP-Z]{5}$/.test(asked.toUpperCase()) ? asked.toUpperCase() : null;
    const mission = mode === 'story' ? (MISSION_ORDER.includes(search.mission) ? search.mission : MISSION_ORDER[0]) : null;
    return { mode, online: online ? 1 : 0, ...(mission ? { mission } : {}), ...(room ? { room } : {}) };
  },
  component: function DuelistPlay() {
    const { mode, online, room, mission } = Route.useSearch();
    return <DuelistArena mode={mode} online={!!online} room={room || null} mission={mission || 'contraband'} />;
  },
});
