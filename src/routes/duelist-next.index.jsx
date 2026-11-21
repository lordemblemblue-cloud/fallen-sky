import { createFileRoute } from '@tanstack/react-router';
import DuelistTemplateHub from '@/components/duelist/menu/DuelistTemplateHub';

export const Route = createFileRoute('/duelist-next/')({
  ssr: false,
  component: DuelistTemplateHub,
});
