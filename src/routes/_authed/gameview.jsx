import { createFileRoute } from '@tanstack/react-router';
import Game3DHost from '@/components/game3d/Game3DHost';

// Same entry as the original Atom x Eve app, which served the game at /gameview.
export const Route = createFileRoute('/_authed/gameview')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Game 3D · Atom × Eve' }] }),
  component: Game3DHost,
});