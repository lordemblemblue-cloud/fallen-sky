import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { MemoryRouter } from 'react-router-dom';

// Render the REAL imported Game 3D / Book entry inside TanStack Start.
// Keep the destination app's router/auth; legacy in-game transitions use
// their own client-only MemoryRouter until migration adapters are validated.
const GameView = lazy(() => import('@/pages/GameView'));

function Game3DBookHome() {
  return (
    <MemoryRouter>
      <Suspense fallback={
        <main role="status" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#070d15',color:'#dbf4ff'}}>
          Entering Game 3D / Book…
        </main>
      }>
        <GameView />
      </Suspense>
    </MemoryRouter>
  );
}
export const Route = createFileRoute('/_authed/')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Game 3D / Book · Atom × Eve' }] }),
  component: Game3DBookHome,
});
