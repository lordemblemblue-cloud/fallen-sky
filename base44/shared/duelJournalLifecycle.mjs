// Combat Foundation 4.2: pure, read-only journal lifecycle projection.
// No Base44 writes, payouts or client-derived victory authority.
const nonempty=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const statuses=new Set(['waiting','active','finished']);
const reasons=new Set(['knockout','forfeit','timeout']);
export function projectCommittedDuelLifecycle({
  duelId,epoch,reportSequence,simulationSequence,
  settled,resultId,snapshot,participants,
}={}){
  if(!nonempty(duelId)||!nonempty(epoch)||
     !Number.isSafeInteger(reportSequence)||reportSequence<1||
     !Number.isSafeInteger(simulationSequence)||simulationSequence<0||
     !snapshot||snapshot.matchId!==duelId||
     snapshot.seq!==simulationSequence||
     !statuses.has(snapshot.status)||
     !Array.isArray(participants)||participants.length!==2||
     !participants.every(nonempty)||participants[0]===participants[1]||
     !Array.isArray(snapshot.players)||snapshot.players.length!==2||
     new Set(snapshot.players.map(p=>p?.id)).size!==2||
     !participants.every(id=>snapshot.players.some(p=>p.id===id)))
    return {ok:false,reason:'invalid_committed_lifecycle'};
  const finished=snapshot.status==='finished';
  if(settled!==finished||
     (finished?typeof resultId!=='string'||!resultId||resultId.length>200:
       resultId!==null&&resultId!==undefined)||
     (finished? snapshot.winnerId!=null&&!participants.includes(snapshot.winnerId):
       snapshot.winnerId!=null))
    return {ok:false,reason:'invalid_terminal_lifecycle'};
  const winnerId=finished?snapshot.winnerId??null:null;
  const loserId=winnerId===null?null:participants.find(id=>id!==winnerId);
  const reason=finished&&reasons.has(snapshot.finishReason)
    ?snapshot.finishReason:null;
  return {ok:true,status:snapshot.status,finished,
    duelId,epoch,reportSequence,simulationSequence,
    resultId:finished?resultId:null,
    winnerId,loserId,draw:finished&&winnerId===null,
    finishReason:reason,
    // Results are display-only; eligibility/payout require separate
    // verified-account authority and an atomic award ledger.
    rewardsEligible:false,rewardsIssued:false,
  };
}
