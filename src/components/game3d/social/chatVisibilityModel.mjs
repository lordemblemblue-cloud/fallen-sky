// Pure UI state transitions. Chat activation must work even when a guest
// character has no Base44 account id. Message delivery remains server-owned.
export function nextChatEnterState({expanded=false, typing=false, tab='world',
  suppressed=false, editable=false, composing=false, repeat=false} = {}) {
  if (suppressed || typing || editable || composing || repeat) return null;
  return {
    expanded:true,
    typing:Boolean(expanded),
    tab:tab==='combat'?'world':tab,
  };
}

export function isIncomingChatMessage(message, localUserId) {
  if (!message || typeof message !== 'object' || message.is_deleted) return false;
  return !localUserId || message.sender_id !== localUserId;
}
