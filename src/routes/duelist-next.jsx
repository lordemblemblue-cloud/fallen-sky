import { createFileRoute, Outlet } from '@tanstack/react-router';

// Duelist Adventure (new build): the menus (index, a page per mode, Join, fighter, settings, story) and the
// arena (/duelist-next/play) live under this path, beside the current /duelist until it replaces it.
export const Route = createFileRoute('/duelist-next')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Adventure (new build) · Adam X Eve Games' }] }),
  component: () => <Outlet />,
});
