// Combat Foundation 4.3: deterministic, read-only lifecycle archive policy.
// This is only called on a worker-created terminal payload already validated
// by the 3.9 journal. It NEVER authorizes account rewards or inventory writes.
const id=s=>typeof s==='string'&&s.length>0&&s.length<=160;
const reasons=new Set(['knockout','forfeit','timeout']);
export function createTerminalLifecycleArchive(p){
  if(!p||p.kind!=='settle'||p.ledgerOnly!==true||!id(p.duelId)||
     !id(p.epoch)||typeof p.resultId!=='string'||
     p.resultId.length<1||p.resultId.length>200||
     !Number.isSafeInteger(p.sequence)||p.sequence<1||
     !Number.isSafeInteger(p.snapshot?.seq)||p.snapshot.seq<0||
     p.snapshot.status!=='finished'||p.snapshot.matchId!==p.duelId||
     p.checkpoint?.state?.sequence!==p.snapshot.seq||
     p.checkpoint?.state?.status!=='finished')
    throw Error('Invalid terminal lifecycle envelope');
  const players=p.snapshot.players,actors=p.checkpoint.state.actors;
  if(!Array.isArray(players)||players.length!==2||
     !Array.isArray(actors)||actors.length!==2||
     !players.every(a=>id(a?.id))||players[0].id===players[1].id||
     !actors.every(a=>id(a?.id))||actors[0].id===actors[1].id||
     !players.every(a=>actors.some(b=>b.id===a.id)))
    throw Error('Invalid terminal lifecycle participant roster');
  for(const player of players){
    const actor=actors.find(a=>a.id===player.id);
    if(!Number.isFinite(player.hp)||!Number.isFinite(player.maxHp)||
       player.maxHp<=0||player.hp<0||player.hp>player.maxHp||
       !actor||!Number.isFinite(actor.hp)||actor.hp!==player.hp)
      throw Error('Terminal lifecycle HP must match worker checkpoint');
  }
  const winner=p.snapshot.winnerId??null;
  if(winner!==null&&!players.some(a=>a.id===winner))
    throw Error('Terminal winner not in duel roster');
  const loser=winner===null?null:players.find(a=>a.id!==winner).id;
  const reason=reasons.has(p.snapshot.finishReason)?p.snapshot.finishReason:null;
  return Object.freeze({
    duelId:p.duelId,epoch:p.epoch,resultId:p.resultId,
    reportSequence:p.sequence,simulationSequence:p.snapshot.seq,
    playerAId:players[0].id,playerBId:players[1].id,
    winnerId:winner,loserId:loser,finishReason:reason,
    outcome:winner===null?'draw':'win',
    rewardEligibility:'unverified_account',rewardsIssued:false,
  });
}
export function verifyStoredLifecycle(row,p){
  if(!row)return false;
  let expected;
  try{expected=createTerminalLifecycleArchive(p);}catch{return false;}
  return row.duel_id===expected.duelId&&row.epoch===expected.epoch&&
    row.result_id===expected.resultId&&
    Number(row.report_sequence)===expected.reportSequence&&
    Number(row.simulation_sequence)===expected.simulationSequence&&
    row.player_a_id===expected.playerAId&&
    row.player_b_id===expected.playerBId&&
    row.winner_id===expected.winnerId&&
    row.loser_id===expected.loserId&&
    row.finish_reason===expected.finishReason&&
    row.outcome===expected.outcome&&
    row.reward_eligibility==='unverified_account'&&
    row.rewards_issued===false;
}
