import { createFileRoute, Navigate } from '@tanstack/react-router';
import { ModePage, JoinPage, StoryPage, DuelistHub } from '@/components/duelist/menu/MenuPages';
import { MENU_MODES } from '@/components/duelist/menu/modes';

// One page per mode (practice, duel, ffa, tdm, ctf), plus Join, fighter, settings and the story mission.
const PAGES = { join: JoinPage, story: StoryPage };

function DuelistMenuPage() {
  const { page } = Route.useParams();
  if (MENU_MODES[page]) return <ModePage key={page} mode={page} />;
  if (page === 'fighter' || page === 'settings') return <DuelistHub initialPanel={page === 'fighter' ? 'character' : 'settings'} />;
  const Page = PAGES[page];
  return Page ? <Page /> : <Navigate to="/duelist-next" replace />;
}

export const Route = createFileRoute('/duelist-next/$page')({
  ssr: false,
  component: DuelistMenuPage,
});
