import { createFileRoute } from '@tanstack/react-router';
import MotionLab from '@/components/duelist/client/MotionLab';

// Duelist Adventure's motion lab: the clip pack on both bodies, for checking animations (development tool).
export const Route = createFileRoute('/duelist-lab')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist motion lab · Adam X Eve Games' }] }),
  component: () => (
    <main className="h-screen min-h-0 bg-[#05080d]">
      <MotionLab />
    </main>
  ),
});
