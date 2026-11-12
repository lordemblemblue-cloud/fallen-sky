// Participants visible in the current dashboard room.
//
// The dashboard room used to be backed by a presence channel that was not part
// of the migrated code, so this reports no remote participants until a presence
// source is connected. MultiplayerSystem falls back to the party roster and PvP
// match participants, which still work.
export function useDashboardRoom() {
  return [];
}