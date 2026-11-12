// Proximity voice over WebRTC needs a signaling service the migrated build did
// not include. The hook keeps MultiplayerSystem's call sites intact and silent:
// no microphone is requested and no peer connection is opened.
export function useWebRTCVoice() {
  return { active: false, peers: [], muted: true };
}