// Live AI-battle snapshot. Battles are fought through the DuelSession backend
// functions; the dashboard only needs to know whether a PvP match is open to
// widen its voice room. No match subscription is available in this build, so
// the snapshot stays empty and the party room keeps carrying voice.
export function useAIBattleSnapshot() {
  return { match: null, queued: false };
}