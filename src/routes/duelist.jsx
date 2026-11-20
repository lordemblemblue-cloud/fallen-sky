import { createFileRoute } from '@tanstack/react-router';
import { DuelistHub } from '@/components/duelist/menu/MenuPages';

// The Games Hub launches /duelist. Show the new cinematic home screen here,
// not the legacy Game 2 menu. Keep the legacy engine at /duelist-classic.
export const Route = createFileRoute('/duelist')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Adventure · Adam X Eve Games' }] }),
  component: DuelistHub,
});
