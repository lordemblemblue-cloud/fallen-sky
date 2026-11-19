import { createFileRoute } from '@tanstack/react-router';
import { DuelistHub } from '@/components/duelist/menu/MenuPages';

export const Route = createFileRoute('/duelist-next/')({
  ssr: false,
  component: DuelistHub,
});
