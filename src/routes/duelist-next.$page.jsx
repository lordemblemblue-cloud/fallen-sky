import { createFileRoute, Navigate } from '@tanstack/react-router';
import { ModePage, JoinPage, FighterPage, SettingsPage, StoryPage } from '@/components/duelist/menu/MenuPages';
import { MENU_MODES } from '@/components/duelist/menu/modes';

// One page per mode (practice, duel, ffa, tdm, ctf), plus Join, fighter, settings and the story mission.
const PAGES = { join: JoinPage, fighter: FighterPage, settings: SettingsPage, story: StoryPage };

function DuelistMenuPage() {
  const { page } = Route.useParams();
  if (MENU_MODES[page]) return <ModePage key={page} mode={page} />;
  const Page = PAGES[page];
  return Page ? <Page /> : <Navigate to="/duelist-next" replace />;
}

export const Route = createFileRoute('/duelist-next/$page')({
  ssr: false,
  component: DuelistMenuPage,
});
