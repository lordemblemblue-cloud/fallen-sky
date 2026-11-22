// The War of Three Roads: one switch for everything under threeroads/.
//
// Off by default while it is being built. Turn it on for one visit with
// ?threeRoads=1, or keep it on in this browser with
// localStorage['game3d.threeRoads']='1'. ?threeRoads=0 always turns it off.
// Pure: it only reads what it is handed, so it can be tested in node.
export const THREE_ROADS_DEFAULT_ON = false;
export const THREE_ROADS_QUERY_KEY = 'threeRoads';
export const THREE_ROADS_STORAGE_KEY = 'game3d.threeRoads';

const asSwitch = value => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (text === '1' || text === 'true' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'off') return false;
  return null;
};

export function threeRoadsEnabled(win = globalThis.window) {
  let fromQuery = null;
  let fromStorage = null;
  try {
    const search = win?.location?.search;
    if (typeof search === 'string' && search)
      fromQuery = asSwitch(new globalThis.URLSearchParams(search).get(THREE_ROADS_QUERY_KEY));
  } catch { /* an unreadable address bar means "no choice made" */ }
  try {
    fromStorage = asSwitch(win?.localStorage?.getItem(THREE_ROADS_STORAGE_KEY));
  } catch { /* storage can throw in private windows */ }
  if (fromQuery !== null) return fromQuery;
  if (fromStorage !== null) return fromStorage;
  return THREE_ROADS_DEFAULT_ON;
}
