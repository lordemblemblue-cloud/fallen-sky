import { questTestRuntimePreview } from './questTestRuntime.mjs';

// The story tools' switch. It was the War of Three Roads' (retired 2026-11-27): the tools still
// read it as their own lock, but nothing in the game mounts them now, so it changes nothing
// a player sees until a story mounts the tools again.
//
// Off by default. Turn it on for one visit with
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

function readSwitch(win, queryKey, storageKey) {
  let fromQuery = null;
  let fromStorage = null;
  try {
    const search = win?.location?.search;
    if (typeof search === 'string' && search)
      fromQuery = asSwitch(new globalThis.URLSearchParams(search).get(queryKey));
  } catch { /* an unreadable address bar means "no choice made" */ }
  try {
    fromStorage = asSwitch(win?.localStorage?.getItem(storageKey));
  } catch { /* storage can throw in private windows */ }
  return fromQuery !== null ? fromQuery : fromStorage;
}

export function threeRoadsEnabled(win = globalThis.window) {
  if (questTestRuntimePreview() !== null) return true;
  return readSwitch(win, THREE_ROADS_QUERY_KEY, THREE_ROADS_STORAGE_KEY) ?? THREE_ROADS_DEFAULT_ON;
}

// A second switch, for the people building it. Places and people of a band that
// is not finished show only with ?threeRoadsPreview=1 (or
// localStorage['game3d.threeRoadsPreview']='1') on top of the main switch. A
// player who turns the story on sees finished bands only.
export const THREE_ROADS_PREVIEW_QUERY_KEY = 'threeRoadsPreview';
export const THREE_ROADS_PREVIEW_STORAGE_KEY = 'game3d.threeRoadsPreview';

export function threeRoadsPreviewEnabled(win = globalThis.window) {
  const adminPreview = questTestRuntimePreview();
  if (adminPreview !== null) return adminPreview;
  if (!threeRoadsEnabled(win)) return false;
  return readSwitch(win, THREE_ROADS_PREVIEW_QUERY_KEY, THREE_ROADS_PREVIEW_STORAGE_KEY) ?? false;
}
