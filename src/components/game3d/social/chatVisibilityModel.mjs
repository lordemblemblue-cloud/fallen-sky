// Pure UI state transitions. Chat activation must work even when a guest
// character has no Base44 account id. Message delivery remains server-owned.
export function nextChatEnterState({typing=false, tab='world',
  suppressed=false, editable=false, composing=false, repeat=false} = {}) {
  if (suppressed || typing || editable || composing || repeat) return null;
  // One Enter both reveals the full chat and focuses its composer.
  // The faint idle panel is already mounted; no extra launcher is needed.
  return {
    expanded:true,
    typing:true,
    tab:tab==='combat'?'world':tab,
  };
}

export function isIncomingChatMessage(message, localUserId) {
  if (!message || typeof message !== 'object' || message.is_deleted) return false;
  return !localUserId || message.sender_id !== localUserId;
}
