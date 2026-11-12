import { useAuth } from '@/lib/AuthContext';

// The platform session hook throws when a component renders outside
// <AuthProvider>. Game code mounts in places that can render before the
// provider is ready (portals, lazily loaded world shells), so it reads the
// session through this nullable wrapper instead.
export function useOptionalAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export default useOptionalAuth;