// Shared C-key decision for any caller still using this legacy helper.
// The live GameView uses resolveGame3DMenuToggle with the same rule:
// C opens Character directly, then C closes the WHOLE workspace regardless
// of whether the player is in Character, Equipment, Vanity or Aura.
export function getAXECharacterShortcutAction({
  activeGroupId = null, legacyHubOpen = false,
} = {}) {
  if (legacyHubOpen || activeGroupId !== 'character') return 'open';
  return 'close';
}
