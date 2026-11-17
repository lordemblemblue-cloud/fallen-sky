import { createFileRoute } from '@tanstack/react-router';
import { CaveMaterialShowcase } from '@/components/game3d/cave/materials/CaveMaterialShowcase';

export const Route = createFileRoute('/cave-materials')({
  ssr: false,
  validateSearch: (search) => ({
    focus: typeof search.focus === 'string' && search.focus ? search.focus : 'all',
  }),
  head: () => ({ meta: [{ title: 'Cave surfaces · Game 3D' }] }),
  component: CaveMaterialsRoute,
});

function CaveMaterialsRoute() {
  const { focus } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CaveMaterialShowcase
      focus={focus}
      onFocus={(next) => navigate({ search: { focus: next } })}
    />
  );
}
