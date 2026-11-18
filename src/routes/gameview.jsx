import { createFileRoute } from '@tanstack/react-router';
import Game3DHost from '@/components/game3d/Game3DHost';

// Preserve the historical /gameview URL without an account gate.
export const Route = createFileRoute('/gameview')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Game 3D · Atom × Eve' }] }),
  component: Game3DHost,
});
