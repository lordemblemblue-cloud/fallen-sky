import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AuthGateError, requireSignedIn } from '@/components/auth/AuthGate';

// Remove the old GitSync repository dashboard shell; preserve the platform's
// actual sign-in / account gating and TanStack route boundaries.
export const Route = createFileRoute('/_authed')({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  component: () => <Outlet />,
});
