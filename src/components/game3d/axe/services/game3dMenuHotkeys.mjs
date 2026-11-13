// Single source of truth for Game 3D's unmodified service/menu hotkeys.
// World and clone load this same table; combat shortcuts with modifiers remain separate.
export const GAME3D_MENU_HOTKEYS = Object.freeze({
  KeyI: 'appearance',
  KeyC: 'character',
  KeyL: 'quest_logbook',
  KeyK: 'skills',
  KeyP: 'companion',
  KeyM: 'map',
  KeyJ: 'spiritual',
  Equal: 'blacksmith',
});

const EDITABLE_TARGETS = 'input, textarea, select, [contenteditable], [role="textbox"]';

export function getGame3DMenuShortcut(event) {
  if (!event || event.repeat || event.defaultPrevented ||
    event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return null;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.(EDITABLE_TARGETS)) return null;
  return GAME3D_MENU_HOTKEYS[event.code] || null;
}
