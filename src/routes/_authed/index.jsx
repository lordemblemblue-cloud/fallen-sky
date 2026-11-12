import { createFileRoute } from '@tanstack/react-router';
import Game3DHost from '@/components/game3d/Game3DHost';

export const Route = createFileRoute('/_authed/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Game 3D / Book · Atom × Eve' }] }),
  component: Game3DHost,
});