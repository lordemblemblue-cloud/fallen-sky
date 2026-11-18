import { createFileRoute } from '@tanstack/react-router';
import Game3DHost from '@/components/game3d/Game3DHost';

// Public guest game entry. Account registration/login will be added separately later.
export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Game 3D / Book · Atom × Eve' }] }),
  component: Game3DHost,
});
