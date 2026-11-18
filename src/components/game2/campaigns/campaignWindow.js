// Only the edition identifier crosses into a new window. Archives and signed
// storage URLs are obtained by the authenticated game window itself.
export const CAMPAIGN_LAUNCH_KEY = 'game2Campaign';
export const CAMPAIGN_EDITIONS = Object.freeze(['jedi_outcast', 'jedi_academy']);
export function parseCampaignWindow(search) {
  const key = new URLSearchParams(search).get(CAMPAIGN_LAUNCH_KEY);
  return CAMPAIGN_EDITIONS.includes(key) ? key : null;
}
export function campaignWindowUrl(currentUrl, gameKey) {
  if (!CAMPAIGN_EDITIONS.includes(gameKey)) throw new Error('Unknown original campaign');
  const url = new URL('/Game2', currentUrl);
  url.searchParams.set(CAMPAIGN_LAUNCH_KEY, gameKey);
  return url;
}
export function openCampaignWindow(currentUrl, gameKey, open) {
  const url = campaignWindowUrl(currentUrl, gameKey);
  const popup = open(url.href, 'atomxe_game2_campaign_' + gameKey,
    'popup=yes,resizable=yes,scrollbars=no,width=1280,height=800');
  if (!popup) return { opened: false, url: url.href };
  try { popup.opener = null; } catch { /* Browser isolation policy. */ }
  try { popup.focus(); } catch { /* Focus remains under browser control. */ }
  return { opened: true, url: url.href };
}
