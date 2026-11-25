// Shared authoritative streak rules and presentation vocabulary.
// Multi-kills are consecutive eliminations at most five seconds apart;
// a life streak is independent of time and ends on any death.
export const MULTI_KILL_WINDOW = 5;
export const KILL_MILESTONES = Object.freeze({3:'KILLING SPREE',5:'SLAUGHTER',7:'UNSTOPPABLE',10:'UNTOUCHABLE',12:'GODLIKE',15:'LEGENDARY'});
const MULTI = Object.freeze({2:'DOUBLE KILL',3:'TRIPLE KILL',4:'QUADRA KILL',5:'PENTA KILL'});
export function resetKillChain(seat) {
  seat.killStreak = 0;
  seat.multiKill = 0;
  seat.lastKillAt = null;
}
export function recordKill(seat, now) {
  if (!Number.isFinite(now)) return null;
  const previous = seat.lastKillAt;
  seat.killStreak = (seat.killStreak || 0) + 1;
  seat.multiKill = Number.isFinite(previous) && now >= previous && now - previous <= MULTI_KILL_WINDOW ? (seat.multiKill || 0) + 1 : 1;
  seat.lastKillAt = now;
  return { streak: seat.killStreak, multiKill: seat.multiKill };
}
export function killAnnouncement(streak, multiKill) {
  const milestone = Object.hasOwn(KILL_MILESTONES, streak) ? KILL_MILESTONES[streak] : null;
  const rapid = Number.isSafeInteger(multiKill) && multiKill >= 2 ? (MULTI[multiKill] || 'MULTI KILL') : null;
  return { text: rapid || milestone || 'KO', subtitle: rapid && milestone ? milestone : null };
}
