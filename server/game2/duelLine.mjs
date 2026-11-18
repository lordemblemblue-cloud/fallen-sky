// Server-managed winner-stays duel line. This controls room admission, active
// competitors, and sideline ordering; it does not pretend the legacy client-
// owned hit/damage protocol is anti-cheat-safe.
export function duelTeamSize(mode) { return mode === 'team_duel' ? 2 : mode === 'duel' ? 1 : 0; }
export function createDuelLine(mode) {
  if (!duelTeamSize(mode)) throw new Error('Not a rotating duel mode');
  return {mode,round:0,revision:0,active:{light:[],dark:[]},
    waiting:{light:[],dark:[]},bench:{light:[],dark:[]},fallen:[],lastWinner:null};
}
const opposite=side=>side==='light'?'dark':'light';
export function duelSideForArrival(line) {
  const weight=side=>line.active[side].length+line.waiting[side].length;
  return weight('light')<=weight('dark')?'light':'dark';
}
function buildNextRound(line) {
  const size=duelTeamSize(line.mode);
  for(const side of ['light','dark']) while(line.active[side].length<size) {
    // 1v1 is not a faction queue: any next spectator can challenge the
    // champion, taking the eliminated opponent's arena side for that round.
    const queue=line.waiting[side].length ? line.waiting[side] :
      ['duel','team_duel'].includes(line.mode) ? line.waiting[opposite(side)] : [];
    if(!queue.length)break;
    line.active[side].push(queue.shift());
  }
  const ready=line.active.light.length===size && line.active.dark.length===size;
  if(ready && !line.round)line.round=1;
  return ready;
}
export function joinDuelLine(line,id,side=duelSideForArrival(line)) {
  if (typeof id!=='string'||!id||!['light','dark'].includes(side))return false;
  if([...line.active.light,...line.active.dark,...line.waiting.light,...line.waiting.dark,...line.bench.light,...line.bench.dark].includes(id))return false;
  line.waiting[side].push(id);
  // A competitor who has already lost cannot jump ahead of newer contenders.
  buildNextRound(line);
  line.revision++;
  return true;
}
export function leaveDuelLine(line,id) {
  let found=false;
  for(const side of ['light','dark']) {
    for(const key of ['active','waiting','bench']) {
      const list=line[key][side],idx=list.indexOf(id);
      if(idx>=0){list.splice(idx,1);found=true;}
    }
  }
  const idx=line.fallen.indexOf(id);
  if(idx>=0){line.fallen.splice(idx,1);found=true;}
  if(found){buildNextRound(line);line.revision++;}
  return found;
}
export function defeatDuelFighter(line,id) {
  const side=['light','dark'].find(s=>line.active[s].includes(id));
  if(!side || !duelLineReady(line) || line.fallen.includes(id))return null;
  line.fallen.push(id);
  const eliminated=line.active[side].every(peer=>line.fallen.includes(peer));
  if(!eliminated) {line.revision++;return {complete:false,fallen:id};}
  const winner=opposite(side), benched=line.active[side].slice();
  // Losing players watch at least one next duel; after the next completed
  // round previous spectators enter the tail of the waiting queue again.
  for(const s of ['light','dark']){
    line.waiting[s].push(...line.bench[s]);
    line.bench[s]=[];
  }
  line.bench[side].push(...benched);
  line.active[side]=[];
  line.fallen=[];
  line.lastWinner=winner;
  line.round++;
  buildNextRound(line);
  line.revision++;
  return {complete:true,winner,benched,round:line.round};
}
export function duelLineReady(line) {
  const size=duelTeamSize(line.mode);
  return !!size && line.active.light.length===size && line.active.dark.length===size;
}
export function publicDuelLine(line) {
  if(!line)return null;
  const active=[...line.active.light,...line.active.dark];
  return {
    mode:line.mode,round:line.round,revision:line.revision,
    active,activeBySide:{light:[...line.active.light],dark:[...line.active.dark]},
    waiting:[...line.waiting.light,...line.waiting.dark],
    waitingBySide:{light:[...line.waiting.light],dark:[...line.waiting.dark]},
    spectators:[...line.bench.light,...line.bench.dark],fallen:[...line.fallen],
    phase:duelLineReady(line)?'fighting':'waiting',
    lastWinner:line.lastWinner,
  };
}
export function duelRole(state,id) {
  if(state?.active?.includes(id))return 'duelist';
  return state?.waiting?.includes(id)||state?.spectators?.includes(id)?'spectator':'none';
}
