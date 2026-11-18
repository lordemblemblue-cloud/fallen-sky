import { createContext, useContext } from 'react';

// Temporary account-free mode. This is deliberately NOT a fabricated server
// identity: gameplay endpoints that require a real account remain protected.
const guestSession = Object.freeze({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: false,
  authError: null,
  refresh: async () => null,
  logout: async () => {},
  navigateToLogin: () => {},
});
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  return <AuthContext.Provider value={guestSession}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
