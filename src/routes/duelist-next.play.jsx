import { createFileRoute } from '@tanstack/react-router';
import DuelistArena from '@/pages/DuelistNext';
import { MISSION_ORDER } from '@/components/duelist/sim/mission.mjs';

// The arena: ?mode=practice|duel|ffa|tdm|ctf|football|control|online|any&online=1 (any = Join: the busiest online
// match with players; online = a random TDM, CTF or Three-Point Control match chosen by the server; matchId=m<n> joins
// a listed match), or ?mode=story&mission=contraband|saltmarch: a co-op mission, played here; with online=1 on the
// match server with a crew (room=<a crew's code>, room=new for a room of your own, room=open for an open one,
// room=m<n> for a listed crew, or no room: any open crew). from=duelist: Menu goes back to /duelist.
const MODES = ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'football', 'control', 'escort', 'online', 'any', 'story'];

export const Route = createFileRoute('/duelist-next/play')({
  ssr: false,
  validateSearch: (search) => {
    const mode = MODES.includes(search.mode) ? search.mode : 'practice';
    const online = mode === 'any' || mode === 'online' || ((search.online === 1 || search.online === '1' || search.online === true) && mode !== 'practice');
    const asked = typeof search.room === 'string' ? search.room.trim() : '';
    const room = mode !== 'story' || !online ? null : ['new', 'open'].includes(asked) ? asked : /^m[0-9]+$/.test(asked) ? asked : /^[A-HJ-NP-Z]{5}$/.test(asked.toUpperCase()) ? asked.toUpperCase() : null;
    const mission = mode === 'story' ? (MISSION_ORDER.includes(search.mission) ? search.mission : MISSION_ORDER[0]) : null;
    const from = search.from === 'duelist' ? 'duelist' : null;
    const matchId = online && !['story', 'any', 'online'].includes(mode) && /^m[0-9]+$/.test(String(search.matchId || '')) ? String(search.matchId) : null;
    return { mode, online: online ? 1 : 0, ...(mission ? { mission } : {}), ...(room ? { room } : {}), ...(matchId ? { matchId } : {}), ...(from ? { from } : {}) };
  },
  component: function DuelistPlay() {
    const { mode, online, room, mission, matchId, from } = Route.useSearch();
    return <DuelistArena mode={mode} online={!!online} room={room || null} mission={mission || 'contraband'} matchId={matchId || null} from={from || null} />;
  },
});
