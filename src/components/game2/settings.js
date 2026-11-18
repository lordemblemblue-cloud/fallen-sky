// Game 2 player settings: chosen in the main menu (Settings), stored in this browser, read by the engine when a match
// starts (Game: mouse sensitivity / invert, volumes, field of view, render quality, FPS readout).
export const SETTINGS_KEY = 'atomxe.game2.settings.v1';

export const GAME2_DEFAULT_BINDINGS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', evade: 'KeyQ', block: 'KeyB', saberCycle: 'KeyV',
  attack: 'Mouse0', alt: 'Mouse2', lockOn: 'Mouse1', passFlag: 'KeyH',
  skillTree: 'KeyK',
});
export const GAME2_BINDING_LABELS = Object.freeze({
  forward: 'Move forward', back: 'Move back', left: 'Strafe left',
  right: 'Strafe right', jump: 'Jump', evade: 'Force evade', block: 'Hold saber guard',
  saberCycle: 'Cycle saber form (360° Experimental)',
  attack: 'Primary attack / fire', alt: 'Secondary attack / saber throw',
  lockOn: 'Target lock / unlock',
  passFlag: 'Pass captured flag to locked-on teammate (CTF)',
  skillTree: 'Skill tree',
});
// Browsers expose the physical mouse button index in MouseEvent.button:
 // 0 left, 1 wheel click, 2 right, 3/4 browser back/forward, 5+ extra keys.
 // Escape, F1 and platform modifiers remain reserved for the menu/help/OS.
export const GAME2_VALID_CODES = /^(?:Key[A-Z]|Digit[0-9]|Space|Mouse(?:[0-9]|1[0-5]))$/;
export const game2MouseCode = button => Number.isInteger(button) && button >= 0 && button <= 15
  ? 'Mouse' + button : null;
export const game2BindingLabel = code => {
  if (/^Mouse(?:[0-9]|1[0-5])$/.test(code || '')) {
    const index = Number(code.slice(5));
    return ['Mouse Left', 'Mouse Middle', 'Mouse Right', 'Mouse Back (4)', 'Mouse Forward (5)'][index] || 'Mouse Button ' + (index + 1);
  }
  if (code === 'Space') return 'Space';
  if (code?.startsWith('Key')) return code.slice(3);
  if (code?.startsWith('Digit')) return code.slice(5);
  return code || '—';
};
export function normalizeBindings(raw) {
  const supplied = raw && typeof raw === 'object' ? raw : {};
  const result = { ...GAME2_DEFAULT_BINDINGS };
  for (const action of Object.keys(result)) {
    if (typeof supplied[action] === 'string' && GAME2_VALID_CODES.test(supplied[action])) result[action] = supplied[action];
  }
  // Legacy profiles predate lock-on. If they already assigned the middle
  // mouse button to another action, preserve that existing action and choose
  // an unused lock key rather than resetting the user's entire control set.
  if (!Object.hasOwn(supplied, 'lockOn') && Object.entries(result).some(([action, code]) => action !== 'lockOn' && code === 'Mouse1')) {
    const spare = ['KeyL', 'Mouse5', 'Mouse6', 'KeyP'].find(code => !Object.values(result).includes(code));
    if (spare) result.lockOn = spare;
  }
  // Preserve older custom bindings when adding this new action.
  if (!Object.hasOwn(supplied, 'saberCycle') &&
      Object.entries(result).some(([action, code]) => action !== 'saberCycle' && code === result.saberCycle)) {
    const spare = ['KeyN', 'KeyJ', 'KeyP', 'Mouse5', 'Mouse6']
      .find(code => !Object.values(result).includes(code));
    if (spare) result.saberCycle = spare;
  }
  // Old custom K assignments keep their action. New profiles use K; the menu
  // is listed in the binding editor so an existing custom profile can remap it.
  if (!Object.hasOwn(supplied, 'skillTree') &&
      Object.entries(result).some(([action, code]) => action !== 'skillTree' && code === result.skillTree)) {
    const spare = ['KeyU', 'KeyJ', 'KeyP', 'Mouse7', 'Mouse8'].find(code => !Object.values(result).includes(code));
    if (spare) result.skillTree = spare;
  }
  // Legacy profiles may already use H for another action; do not wipe their
  // entire control layout when introducing the new optional CTF binding.
  if (!Object.hasOwn(supplied, 'passFlag') &&
      Object.entries(result).some(([action, code]) => action !== 'passFlag' && code === result.passFlag)) {
    const spare = ['KeyU', 'KeyN', 'KeyL', 'Mouse7', 'Mouse8']
      .find(code => !Object.values(result).includes(code));
    if (spare) result.passFlag = spare;
  }
  // No ambiguous duplicate keys: a rebind wins by overriding its prior owner
  // in the editor; corrupted/hand-edited settings revert safely to defaults.
  if (new Set(Object.values(result)).size !== Object.keys(result).length) return { ...GAME2_DEFAULT_BINDINGS };
  return result;
}
export function rebindGame2Action(bindings, action, code) {
  if (!Object.hasOwn(GAME2_DEFAULT_BINDINGS, action) || !GAME2_VALID_CODES.test(code)) return normalizeBindings(bindings);
  const next = { ...normalizeBindings(bindings) };
  const other = Object.keys(next).find(key => key !== action && next[key] === code);
  if (other) next[other] = next[action]; // swap, do not create duplicates
  next[action] = code;
  return next;
}

export const DEFAULT_SETTINGS = Object.freeze({
  bindings: GAME2_DEFAULT_BINDINGS,
  sensitivity: 1,      // x the engine's base mouse sensitivity (0.0022 rad / px)
  invertY: false,
  masterVolume: 0.7,   // sound effects master gain (the engine's default)
  musicVolume: 0.5,    // battle theme
  fov: 62,             // degrees, base camera field of view
  quality: 'medium',   // very low / medium / high / 4K / 8K mountain source
  showFps: false,
  timeOfDay: 'sunset', // training environment only
  temperatureC: 18,   // cold breath condensation at <=5°C; visual only
  combatMode: 'classic', // classic remains default; experimental 360 rules are opt-in
  menuMotion: true,    // the live duel behind the main menu
});

export const QUALITY_PRESETS = Object.freeze([
  { id: 'very_low', label: 'Very low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: '4k', label: '4K target' },
  { id: '8k', label: '8K mountain materials (high memory)' },
]);
export const QUALITY_DPR = Object.freeze({
  very_low: .65, medium: 1.35, high: 2,
  '4k': 4, // renderer caps render target at 3840 x 2160 and GPU limits
  '8k': 4, // 8K source rock; framebuffer remains 4K capped
  performance: .65, balanced: 1.35, sharp: 2, // legacy consumers
});
const LEGACY_QUALITY = Object.freeze({performance:'very_low',balanced:'medium',sharp:'high'});

const clamp = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : d);

// any stored / user value -> a complete, valid settings object
export function normalizeSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const D = DEFAULT_SETTINGS;
  return {
    bindings: normalizeBindings(s.bindings),
    sensitivity: clamp(s.sensitivity, 0.25, 3, D.sensitivity),
    invertY: s.invertY === true,
    masterVolume: clamp(s.masterVolume, 0, 1, D.masterVolume),
    musicVolume: clamp(s.musicVolume, 0, 1, D.musicVolume),
    fov: clamp(s.fov, 50, 90, D.fov),
    quality: LEGACY_QUALITY[s.quality] || (QUALITY_PRESETS.some(p => p.id === s.quality) ? s.quality : D.quality),
    timeOfDay: ['morning','day','sunset','night'].includes(s.timeOfDay) ? s.timeOfDay : D.timeOfDay,
    temperatureC: clamp(s.temperatureC, -15, 35, D.temperatureC),
    showFps: s.showFps === true,
    combatMode: s.combatMode === 'directional360' ? 'directional360' : 'classic',
    menuMotion: s.menuMotion !== false,
  };
}

export function loadSettings(storage = globalThis.localStorage) {
  try { return normalizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}')); } catch { return normalizeSettings(); }
}

export function saveSettings(value, storage = globalThis.localStorage) {
  const s = normalizeSettings(value);
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode: the settings last for this visit */ }
  return s;
}
