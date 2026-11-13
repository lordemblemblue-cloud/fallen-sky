import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
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
        <ClientOnly fallback={<main role="status" className="min-h-screen grid place-items-center bg-background text-foreground">Entering Game 3D / Book…</main>}><GameView /></ClientOnly>
      </Suspense>
    </AuthProvider>
  );
}