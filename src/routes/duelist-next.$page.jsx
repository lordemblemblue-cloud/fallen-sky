import { createFileRoute, Navigate } from '@tanstack/react-router';
import { ModePage, JoinPage } from '@/components/duelist/menu/MenuPages';
import DuelistTemplateHub from '@/components/duelist/menu/DuelistTemplateHub';
import { MENU_MODES } from '@/components/duelist/menu/modes';

// One page per mode (practice, duel, ffa, tdm, ctf), plus Join, fighter, settings and the story mission.
const PAGES = { join: JoinPage };

function DuelistMenuPage() {
  const { page } = Route.useParams();
  if (MENU_MODES[page]) return <ModePage key={page} mode={page} />;
  if (['story', 'fighter', 'character', 'settings', 'store', 'play-menu'].includes(page))
    return <DuelistTemplateHub initialPanel={page === 'fighter' ? 'character' : page === 'play-menu' ? 'play' : page} />;
  const Page = PAGES[page];
  return Page ? <Page /> : <Navigate to="/duelist-next" replace />;
}

export const Route = createFileRoute('/duelist-next/$page')({
  ssr: false,
  component: DuelistMenuPage,
});
