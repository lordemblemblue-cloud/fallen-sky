import { createFileRoute } from '@tanstack/react-router';
import DuelistArena from '@/pages/DuelistNext';

// The arena: ?mode=practice|duel|ffa|tdm|ctf|any&online=1 (any = Join: the busiest online match with players),
// or ?mode=story: the co-op mission, played here
const MODES = ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'any', 'story'];

export const Route = createFileRoute('/duelist-next/play')({
  ssr: false,
  validateSearch: (search) => {
    const mode = MODES.includes(search.mode) ? search.mode : 'practice';
    const online = mode === 'any' || ((search.online === 1 || search.online === '1' || search.online === true) && mode !== 'practice' && mode !== 'story');
    return { mode, online: online ? 1 : 0 };
  },
  component: function DuelistPlay() {
    const { mode, online } = Route.useSearch();
    return <DuelistArena mode={mode} online={!!online} />;
  },
});
