import { createFileRoute } from '@tanstack/react-router';
import DuelistTemplateHub from '@/components/duelist/menu/DuelistTemplateHub';

// The Games Hub launches /duelist. Show the new cinematic home screen here,
// not the legacy Game 2 menu. Keep the legacy engine at /duelist-classic.
export const Route = createFileRoute('/duelist')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Duelist Adventure · Adam X Eve Games' }] }),
  component: DuelistTemplateHub,
});
