// Screen geometry is based on actual CSS viewport size, not assumed 16:9 pixels.
// Layouts are independent in portrait/landscape and for each of the two games.
export const MOBILE_TOUCH_LAYOUT_KEY = 'axe_mobile_touch_layout_v1';
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
    ['ability4','4'],['ultimate','ULT'],['more','MORE'],
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
    const forced = new URLSearchParams(host.location?.search || '').get('touchControls');
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
  joystick:[18,75],
  light:[89,82],heavy:[80,82],guard:[70,82],
  attack:[89,82],jump:[91,62],roll:[80,62],dash:[69,62],dodge:[69,62],
  ability1:[68,41],ability2:[77,41],ability3:[86,41],ability4:[93,41],
  special:[84,20],ultimate:[84,20],lock:[68,20],more:[94,20],
  interact:[55,28],sprint:[55,48],mode:[55,68],breach:[45,28],
  resist:[45,48],itemActive:[45,68],shop:[35,28],
  mount:[55,48],crouch:[55,68],
  skill5:[55,26],skill6:[55,45],skill7:[45,26],skill8:[45,45],skill9:[35,26],
});
const PORTRAIT = Object.freeze({
  joystick:[21,79],
  light:[86,72],heavy:[69,72],guard:[69,61],
  attack:[86,72],jump:[86,61],roll:[86,50],dash:[69,50],dodge:[69,50],
  ability1:[69,39],ability2:[86,39],ability3:[69,30],ability4:[86,30],
  special:[86,20],ultimate:[86,20],lock:[69,20],more:[86,83],
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
