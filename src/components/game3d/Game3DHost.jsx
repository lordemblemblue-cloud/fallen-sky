import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/components/auth/AuthContext';

// The real Game 3D / Book entry, mounted by both the app home and /gameview.
// Game systems share the platform session; storage and cloud saves use the
// signed-in account instead of an unbound guest roster.
const GameView = lazy(() => import('@/pages/GameView'));

export default function Game3DHost() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <main role="status" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#070d15',color:'#dbf4ff'}}>
          Entering Game 3D / Book…
        </main>
      }>
        {/* GameView and the original Game 3D pages still use react-router-dom's
            useNavigate. TanStack's ClientOnly does not provide that context.
            Without this nested router the entire GameView crashes before the
            character viewer or world can mount. Keep it isolated from the
            outer TanStack app router until all legacy navigation is migrated. */}
        <ClientOnly fallback={<main role="status" className="min-h-screen grid place-items-center bg-background text-foreground">Entering Game 3D / Book…</main>}>
          <MemoryRouter>
            <GameView />
          </MemoryRouter>
        </ClientOnly>
      </Suspense>
    </AuthProvider>
  );
}