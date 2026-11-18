import { createContext, useContext, useEffect, useState } from 'react';
import { setStorageUser } from '@/components/game3d/characterStorage';

// Compatibility context for existing Game 3D components while the account
// system is intentionally removed. Do not pretend an anonymous visitor is a
// trusted account or grant server-side permissions to this context.
const AuthContext = createContext(null);
const loginUnavailable = async () => ({ success: false, error: 'Account login will be added later.' });
const guest = Object.freeze({
  user: null,
  avatar: null,
  isAuthenticated: false,
  loading: false,
  showSignUp: false,
  login: loginUnavailable,
  loginWithRedirect: loginUnavailable,
  logout: async () => {},
  updateUserData: loginUnavailable,
  completeSignUp: loginUnavailable,
  setShowSignUp: () => {},
  refreshUserData: async () => null,
  isLoginFlow: false,
  updatePresenceContext: async () => {},
  sessionConflict: false,
  claimSession: () => {},
});

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Guest characters use the existing __anon__ local save namespace.
    // Reset BEFORE mounting the character screen so an old signed-in roster
    // cannot briefly appear when a browser has legacy account storage.
    setStorageUser(null);
    setReady(true);
  }, []);
  return (
    <AuthContext.Provider value={guest}>
      {ready ? children : (
        <main role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          Preparing local game saves…
        </main>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext) || guest;
}
