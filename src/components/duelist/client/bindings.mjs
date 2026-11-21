// Which key or mouse button does what in Duelist Adventure. Each action has one input: a key's code (the
// KeyboardEvent.code, so it is the same key whatever the keyboard's layout) or a mouse button ("Mouse0" left,
// "Mouse1" middle, "Mouse2" right, "Mouse3" and "Mouse4" the side buttons). A player's own choices are kept in
// their preferences (client/prefs.mjs `keys`) and changed on the Settings page; anything missing or broken
// falls back to the defaults. Pure: no window, no document.
//
// Abilities 1-4 are the class's four (core/classes.mjs); without a class (the story crews) they are the first
// build's push, pull, grip (hold, let go to throw) and Veil Breach. The special goes off when the meter allows.

/**
 * kind: 'hold' read while held · 'press' a command on press · 'guard' raised while held · 'ability' a class
 * ability: its command on press, and a release on letting go (a held grip throws)
 */
export const ACTIONS = Object.freeze([
  { id: 'forward', label: 'Move forward', kind: 'hold' },
  { id: 'back', label: 'Move back', kind: 'hold' },
  { id: 'left', label: 'Move left', kind: 'hold' },
  { id: 'right', label: 'Move right', kind: 'hold' },
  { id: 'sprint', label: 'Sprint', kind: 'hold' },
  { id: 'light', label: 'Light strike (chain)', kind: 'press' },
  { id: 'heavy', label: 'Heavy strike', kind: 'press' },
  { id: 'guard', label: 'Guard (a fresh guard parries)', kind: 'guard' },
  { id: 'jump', label: 'Jump', kind: 'press' },
  { id: 'roll', label: 'Roll (into a power or a strike)', kind: 'press' },
  { id: 'dash', label: 'Dash (double-tap during jump for air dash)', kind: 'press' },
  { id: 'itemActive', label: 'Use active relic', kind: 'press' },
  { id: 'mode', label: 'Sword mode (swift, balanced, heavy)', kind: 'press' },
  { id: 'ability1', label: 'Ability 1', kind: 'ability' },
  { id: 'ability2', label: 'Ability 2', kind: 'ability' },
  { id: 'ability3', label: 'Ability 3', kind: 'ability' },
  { id: 'ability4', label: 'Ability 4', kind: 'ability' },
  { id: 'special', label: 'Special (when charged)', kind: 'press' },
  { id: 'breach', label: 'Veil Breach', kind: 'press' },
  { id: 'resist', label: 'Resist (break a grip)', kind: 'press' },
  { id: 'shop', label: 'Battle Shop', kind: 'press' },
  { id: 'lock', label: 'Lock on', kind: 'press' },
  { id: 'interact', label: 'Use (crates, consoles, cores, bells)', kind: 'hold' },
]);
export const KIND = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, a.kind])));

export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', light: 'Mouse0', heavy: 'KeyE', guard: 'Mouse2',
  jump: 'Space', roll: 'KeyC', dash: 'AltLeft', itemActive: 'KeyG', mode: 'KeyX', ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3', ability4: 'Digit4', special: 'KeyQ',
  breach: 'KeyR', resist: 'KeyZ', shop: 'Tab', lock: 'Mouse1', interact: 'KeyF',
});
// bindings saved before the classes: the old power keys become the ability keys
const LEGACY = Object.freeze({ ability1: 'push', ability2: 'pull', ability3: 'grip' });
// bindings saved before the jump (2026-11-21) have no `jump`: a roll still on Space or a dash still on Ctrl was
// never the player's own choice, so they move to their new keys (C and Alt) and Space becomes the jump
const BEFORE_JUMP = Object.freeze({ roll: 'Space', dash: 'ControlLeft' });

// never bound: Escape lets go of the mouse; the browser's and the system's own keys
export const RESERVED = Object.freeze(new Set(['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu']));
const VALID = /^(Key[A-Z]|Digit\d|Numpad\w+|F\d{1,2}|Mouse[0-4]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Enter|Backspace|CapsLock|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Insert|Delete|Home|End|PageUp|PageDown|IntlBackslash)$/;

/** May this input be bound at all? */
export const bindable = (code) => typeof code === 'string' && VALID.test(code) && !RESERVED.has(code);

// a modifier's two sides are one input: left or right Shift, Ctrl, Alt
const SIDED = /^(Shift|Control|Alt)(Left|Right)$/;
export const inputOf = (code) => (typeof code === 'string' && SIDED.test(code) ? code.replace(SIDED, '$1') : code);

/**
 * A complete set of bindings from what was saved: every action bound (defaults for anything missing or not
 * bindable), and no input doing two things (a clash keeps the first action in ACTIONS order; the other goes
 * back to its default if that is free, else is left unbound: null).
 */
export function keysFrom(saved = {}) {
  const keys = {};
  const used = new Map(); // input -> action
  const old = !saved || !Object.hasOwn(saved, 'jump');
  const wanted = (id) => (old && saved && BEFORE_JUMP[id] && saved[id] === BEFORE_JUMP[id] ? DEFAULT_KEYS[id]
    : saved && bindable(saved[id]) ? saved[id]
    : saved && LEGACY[id] && bindable(saved[LEGACY[id]]) ? saved[LEGACY[id]] : DEFAULT_KEYS[id]);
  for (const { id } of ACTIONS) {
    const code = wanted(id);
    if (!used.has(inputOf(code))) { keys[id] = code; used.set(inputOf(code), id); }
    else keys[id] = null;
  }
  for (const { id } of ACTIONS) {
    if (keys[id] !== null) continue;
    const fallback = DEFAULT_KEYS[id];
    if (!used.has(inputOf(fallback))) { keys[id] = fallback; used.set(inputOf(fallback), id); }
  }
  return keys;
}

/** The action an input does, or null (side-agnostic for Shift, Ctrl and Alt). */
export function actionFor(keys, code) {
  const input = inputOf(code);
  for (const { id } of ACTIONS) if (keys[id] && inputOf(keys[id]) === input) return id;
  return null;
}

/**
 * Bind an action to an input. If another action had that input, the two swap (it gets this action's old
 * one). Returns { keys, swapped (the other action, or null), refused (true for an input that cannot be bound) }.
 */
export function rebind(keys, action, code) {
  const current = keysFrom(keys);
  if (!KIND[action] || !bindable(code)) return { keys: current, swapped: null, refused: true };
  const other = actionFor(current, code);
  const next = { ...current, [action]: code };
  if (other && other !== action) next[other] = current[action];
  return { keys: next, swapped: other && other !== action ? other : null, refused: false };
}

const NAMES = {
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
  PageUp: 'Page Up', PageDown: 'Page Down',
};
const MOUSE = { long: ['Left mouse', 'Middle mouse', 'Right mouse', 'Mouse 4', 'Mouse 5'], short: ['LMB', 'MMB', 'RMB', 'M4', 'M5'] };

/** How an input is written for people: 'E', '1', 'Shift', 'Right mouse' (short: 'RMB', for the HUD). */
export function keyLabel(code, { short = false } = {}) {
  if (!code) return 'unbound';
  const mouse = /^Mouse([0-4])$/.exec(code);
  if (mouse) return (short ? MOUSE.short : MOUSE.long)[Number(mouse[1])];
  const input = inputOf(code);
  if (input === 'Shift' || input === 'Alt') return input;
  if (input === 'Control') return 'Ctrl';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return NAMES[code] || code;
}

/**
 * The keys line at the bottom of the screen, from the bindings. abilityNames: the class's four ability names
 * (else the first build's push, pull, grip, breach: the story crews).
 */
export function helpLine(keys, { story = false, abilityNames = null } = {}) {
  const k = (id) => keyLabel(keys[id], { short: true });
  const move = ['forward', 'left', 'back', 'right'].map(k).join('');
  const names = abilityNames || ['push', 'pull', 'grip', 'breach'];
  const parts = [`${move.length === 4 ? move : `${k('forward')} ${k('left')} ${k('back')} ${k('right')}`} move`, `${k('sprint')} sprint`,
    `${k('light')} light (with a direction: a cut that way)`, `${k('mode')} sword mode`, `${k('heavy')} heavy`, `${k('guard')} guard`, `${k('jump')} jump`, `${k('roll')} roll`, `${k('dash')} dash (double-tap in air)`, `${k('itemActive')} relic`,
    ...names.map((name, i) => `${k(`ability${i + 1}`)} ${name.toLowerCase()}`)];
  if (abilityNames) parts.push(`${k('special')} special`, `${k('breach')} breach`);
  parts.push(`${k('resist')} resist`, `${k('shop')} shop`, `${k('lock')} lock on`);
  if (story) parts.push(`${k('interact')} (hold) use`);
  return `Click to fight · ${parts.join(' · ')}`;
}
