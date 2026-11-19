// Which key or mouse button does what in Duelist Adventure. Each action has one input: a key's code (the
// KeyboardEvent.code, so it is the same key whatever the keyboard's layout) or a mouse button ("Mouse0" left,
// "Mouse1" middle, "Mouse2" right, "Mouse3" and "Mouse4" the side buttons). A player's own choices are kept in
// their preferences (client/prefs.mjs `keys`) and changed on the Settings page; anything missing or broken
// falls back to the defaults. Pure: no window, no document.

/** kind: 'hold' read while held · 'press' a command on press · 'guard' raised while held · 'grip' grips, and throws on letting go */
export const ACTIONS = Object.freeze([
  { id: 'forward', label: 'Move forward', kind: 'hold' },
  { id: 'back', label: 'Move back', kind: 'hold' },
  { id: 'left', label: 'Move left', kind: 'hold' },
  { id: 'right', label: 'Move right', kind: 'hold' },
  { id: 'sprint', label: 'Sprint', kind: 'hold' },
  { id: 'light', label: 'Light strike (chain three)', kind: 'press' },
  { id: 'heavy', label: 'Heavy strike', kind: 'press' },
  { id: 'guard', label: 'Guard (a fresh guard parries)', kind: 'guard' },
  { id: 'roll', label: 'Roll (into a push or a strike)', kind: 'press' },
  { id: 'dash', label: 'Dash', kind: 'press' },
  { id: 'push', label: 'Push', kind: 'press' },
  { id: 'pull', label: 'Pull', kind: 'press' },
  { id: 'grip', label: 'Telekinesis grip (let go to throw)', kind: 'grip' },
  { id: 'breach', label: 'Veil Breach', kind: 'press' },
  { id: 'resist', label: 'Resist (break a grip)', kind: 'press' },
  { id: 'lock', label: 'Lock on', kind: 'press' },
  { id: 'interact', label: 'Use (crates, consoles, cores, bells)', kind: 'hold' },
]);
export const KIND = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, a.kind])));

export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', light: 'Mouse0', heavy: 'KeyE', guard: 'Mouse2',
  roll: 'Space', dash: 'ControlLeft', push: 'Digit1', pull: 'Digit2', grip: 'Digit3', breach: 'Digit4', resist: 'KeyZ', lock: 'Tab', interact: 'KeyF',
});

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
  const wanted = (id) => (saved && bindable(saved[id]) ? saved[id] : DEFAULT_KEYS[id]);
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

/** The keys line at the bottom of the screen, from the bindings. */
export function helpLine(keys, { story = false } = {}) {
  const k = (id) => keyLabel(keys[id], { short: true });
  const move = ['forward', 'left', 'back', 'right'].map(k).join('');
  const parts = [`${move.length === 4 ? move : `${k('forward')} ${k('left')} ${k('back')} ${k('right')}`} move`, `${k('sprint')} sprint`,
    `${k('light')} light`, `${k('heavy')} heavy`, `${k('guard')} guard`, `${k('roll')} roll`, `${k('push')} push`, `${k('pull')} pull`,
    `${k('grip')} grip`, `${k('breach')} breach`, `${k('resist')} resist`, `${k('lock')} lock on`];
  if (story) parts.push(`${k('interact')} (hold) use`);
  return `Click to fight · ${parts.join(' · ')}`;
}
