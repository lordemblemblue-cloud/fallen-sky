import { createFileRoute } from '@tanstack/react-router';
import GamesHub from '@/pages/GamesHub';

// Adam X Eve Games hub: a cross-scroll menu of the games (Fallen Sky Online,
// Duelist Adventure, Fantasy Battle); see components/games/hub/gamesHubCatalog.mjs.
export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Adam X Eve Games' }] }),
  component: GamesHub,
});
