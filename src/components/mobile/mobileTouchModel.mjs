// Screen geometry is based on actual CSS viewport size, not assumed 16:9 pixels.
// Layouts are independent in portrait/landscape and for each of the two games.
export const MOBILE_TOUCH_LAYOUT_KEY = 'axe_mobile_touch_layout_v2';
export const MOBILE_TOUCH_GAMES = Object.freeze(['fallen', 'duelist']);
export const MOBILE_TOUCH_ACTIONS = Object.freeze({
  duelist: Object.freeze([
    ['light','ATTACK'],['heavy','HEAVY'],['guard','GUARD'],['jump','JUMP'],
    ['roll','ROLL'],['dash','DASH'],['ability1','1'],['ability2','2'],
    ['ability3','3'],['ability4','4'],['special','ULT'],['lock','LOCK'],
    ['more','MORE'],['interact','USE'],['sprint','RUN'],['mode','MODE'],
    ['breach','BREACH'],['resist','RESIST'],['itemActive','ITEM'],
    ['shop','SHOP'],
  ]),
  fallen: Object.freeze([
    ['attack','ATTACK'],['guard','GUARD'],['jump','JUMP'],['roll','ROLL'],
    ['dodge','DODGE'],['ability1','1'],['ability2','2'],['ability3','3'],
    ['ability4','4'],['ultimate','ULT'],['lock','LOCK'],['more','MORE'],
    ['interact','USE'],['mount','MOUNT'],['crouch','CROUCH'],
    ['skill5','5'],['skill6','6'],['skill7','7'],['skill8','8'],['skill9','9'],
  ]),
});
export const MOBILE_TOUCH_SECONDARY = Object.freeze({
  duelist: Object.freeze(['interact','sprint','mode','breach','resist','itemActive','shop']),
  fallen: Object.freeze(['interact','mount','crouch','skill5','skill6','skill7','skill8','skill9']),
});
const pct = (x) => Math.max(7, Math.min(93, Number(x) || 50));
export function isMobileTouchDevice(host = globalThis.window) {
  if (!host) return false;
  try {
    const forced = new globalThis.URLSearchParams(host.location?.search || '').get('touchControls');
    if (forced === '1') return true; // explicit QA mode on a desktop
    if (forced === '0') return false;
  } catch { /* unavailable URL in a sandbox */ }
  let coarse = false;
  try { coarse = !!host.matchMedia?.('(any-pointer: coarse)')?.matches; }
  catch { /* old browser */ }
  return coarse || Number(host.navigator?.maxTouchPoints || 0) > 0;
}
export function touchLandscape(width, height) {
  return Number(width) > Number(height);
}
const LANDSCAPE = Object.freeze({
  joystick:[16,74],
  // Arc-shaped four-skill cluster wrapping the attack circle from below-left
  // to above-right. Thumb sizes and min safe areas are handled in CSS.
  light:[89,79],attack:[89,79],
  ability1:[76,86],ability2:[70,68],ability3:[77,50],ability4:[89,45],
  heavy:[92,62],guard:[59,53],jump:[60,69],roll:[57,86],
  dash:[52,60],dodge:[52,60],
  special:[51,78],ultimate:[51,78],lock:[59,33],more:[94,19],
  interact:[45,27],sprint:[45,44],mode:[45,62],breach:[35,28],
  resist:[35,48],itemActive:[35,66],shop:[27,28],
  mount:[45,44],crouch:[45,62],
  skill5:[44,24],skill6:[44,42],skill7:[34,24],skill8:[34,43],skill9:[27,65],
});
const PORTRAIT = Object.freeze({
  joystick:[20,80],
  light:[87,78],attack:[87,78],
  ability1:[71,85],ability2:[64,70],ability3:[71,55],ability4:[87,49],
  heavy:[90,65],guard:[51,48],jump:[53,62],roll:[51,83],dash:[52,73],dodge:[52,73],
  special:[52,27],ultimate:[52,27],lock:[52,14],more:[88,94],
  interact:[52,18],sprint:[52,28],mode:[52,38],breach:[52,48],
  resist:[52,58],itemActive:[52,68],shop:[52,78],
  mount:[52,28],crouch:[52,38],
  skill5:[52,18],skill6:[52,28],skill7:[52,38],skill8:[52,48],skill9:[52,58],
});
export function defaultMobileTouchLayout(game, landscape) {
  const presets = landscape ? LANDSCAPE : PORTRAIT;
  const ids = ['joystick', ...(MOBILE_TOUCH_ACTIONS[game] || MOBILE_TOUCH_ACTIONS.duelist).map(([id]) => id)];
  return Object.fromEntries(ids.map(id => [id, { x: pct(presets[id]?.[0]), y: pct(presets[id]?.[1]) }]));
}
export function normalizeMobileTouchLayout(game, landscape, saved) {
  const defaults = defaultMobileTouchLayout(game, landscape);
  if (!saved || typeof saved !== 'object') return defaults;
  return Object.fromEntries(Object.entries(defaults).map(([id, pos]) => {
    const source = saved[id];
    return [id, { x: Number.isFinite(source?.x) ? pct(source.x) : pos.x,
      y: Number.isFinite(source?.y) ? pct(source.y) : pos.y }];
  }));
}
export function touchLayoutStorageKey(game, landscape) {
  return `${MOBILE_TOUCH_LAYOUT_KEY}:${game}:${landscape ? 'landscape' : 'portrait'}`;
}
