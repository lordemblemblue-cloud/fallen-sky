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

// Appearance and Character share the same unified service group. Every menu
// shortcut toggles its page, and a second press collapses the entire menu.
export function resolveGame3DMenuToggle(destination, { groupId = null, mapOpen = false, characterTab = 'Character' } = {}) {
  if (!destination) return null;
  if (destination === 'map') return { action: mapOpen ? 'close' : 'open', groupId: null };
  const canonicalGroupId = destination === 'appearance' ? 'character' : destination;
  // C first returns from Equipment/Vanity/Aura to the actual Character tab.
  // Only a second C, already on Character, closes the entire workspace.
  if (destination === 'character' && groupId === 'character' && characterTab !== 'Character')
    return { action: 'focus', groupId: 'character' };
  return { action: groupId === canonicalGroupId ? 'close' : 'open', groupId: canonicalGroupId };
}

const EDITABLE_TARGETS = 'input, textarea, select, [contenteditable], [role="textbox"]';

export function getGame3DMenuShortcut(event) {
  if (!event || event.repeat || event.defaultPrevented ||
    event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return null;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.(EDITABLE_TARGETS)) return null;
  return GAME3D_MENU_HOTKEYS[event.code] || null;
}
