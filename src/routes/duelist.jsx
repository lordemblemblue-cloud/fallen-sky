import { createFileRoute } from '@tanstack/react-router';
import DuelistAdventure from '@/pages/DuelistAdventure';

export const Route = createFileRoute('/duelist')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Adventure · Adam X Eve Games' }] }),
  component: DuelistAdventure,
});
