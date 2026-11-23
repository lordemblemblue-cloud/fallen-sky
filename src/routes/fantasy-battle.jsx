import { createFileRoute } from '@tanstack/react-router';
import FantasyBattlePage from '@/components/fantasybattle/FantasyBattlePage';

// Fantasy Battle: a turn-based 2D bow duel with layered, Live2D-style animated characters. The games hub links here.
export const Route = createFileRoute('/fantasy-battle')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Fantasy Battle · Adam X Eve Games' }] }),
  component: FantasyBattlePage,
});
