import { createFileRoute } from '@tanstack/react-router';
import DuelistNext from '@/pages/DuelistNext';

export const Route = createFileRoute('/duelist-next')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Adventure (new build) · Adam X Eve Games' }] }),
  component: DuelistNext,
});
