import { createFileRoute } from '@tanstack/react-router';
import DuelistAdventure from '@/pages/DuelistAdventure';

// Preserve the full original Game 2 engine for players and existing modes.
// The main /duelist route now opens the cinematic Duelist home screen.
export const Route = createFileRoute('/duelist-classic')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Classic · Adam X Eve Games' }] }),
  component: DuelistAdventure,
});
