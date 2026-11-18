import { createFileRoute } from '@tanstack/react-router';
import GamesHub from '@/pages/GamesHub';

// Adam X Eve Games hub: Fallen Sky Online (/gameview) on the left,
// Duelist Adventure (/duelist) on the right.
export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Adam X Eve Games' }] }),
  component: GamesHub,
});
