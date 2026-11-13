import { lazy, Suspense } from 'react';
import { AuthProvider } from '@/components/auth/AuthContext';

// The real Game 3D / Book entry, mounted by both the app home and /gameview.
// Legacy in-game transitions use their own client-only MemoryRouter until the
// migration adapters are validated.
const GameView = lazy(() => import('@/pages/GameView'));

export default function Game3DHost() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <main role="status" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#070d15',color:'#dbf4ff'}}>
          Entering Game 3D / Book…
        </main>
      }>
        <GameView />
      </Suspense>
    </AuthProvider>
  );
}