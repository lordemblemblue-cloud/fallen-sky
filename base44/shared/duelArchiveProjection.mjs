// Combat Foundation 4.3 — trusted server-side archive verification.
// The archive is read from PostgreSQL through the HMAC-only worker endpoint.
// It is never enough to issue XP, items, currency or ranked credit.
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=160;
export function validateCommittedDuelArchive({archive,duel,snapshot,epoch,resultId,
  reportSequence,simulationSequence}={}){
  if(!duel||duel.dedicated_mode!=='dedicated'||!valid(duel.id)||
     !valid(epoch)||epoch!==duel.dedicated_epoch||
     !snapshot||snapshot.status!=='finished'||snapshot.matchId!==duel.id||
     snapshot.seq!==simulationSequence||
     !Number.isSafeInteger(reportSequence)||reportSequence<1||
     !Number.isSafeInteger(simulationSequence)||simulationSequence<0||
     !archive||archive.status!=='archived'||
     archive.duelId!==duel.id||archive.epoch!==epoch||
     archive.resultId!==resultId||!valid(resultId)||
     archive.reportSequence!==reportSequence||
     archive.simulationSequence!==simulationSequence||
     archive.rewardEligibility!=='unverified_account'||
     archive.rewardsEligible!==false||archive.rewardsIssued!==false||
     !Array.isArray(archive.players)||archive.players.length!==2||
     !Array.isArray(snapshot.players)||snapshot.players.length!==2)
    return {ok:false,reason:'committed_archive_invalid'};
  const ids=[duel.challenger_id,duel.opponent_id];
  if(!ids.every(valid)||ids[0]===ids[1]||
     new Set(archive.players).size!==2||
     !ids.every(id=>archive.players.includes(id)&&snapshot.players.some(p=>p.id===id)))
    return {ok:false,reason:'archive_roster_mismatch'};
  const winner=snapshot.winnerId??null,archivedWinner=archive.winnerId??null;
  const archivedLoser=archive.loserId??null;
  if(winner!==archivedWinner||
     (winner===null?archivedLoser!==null||archive.draw!==true:
       (!ids.includes(winner)||archivedLoser!==ids.find(id=>id!==winner)||
        archive.draw!==false))||
     (archive.finishReason??null)!==
       (['knockout','forfeit','timeout'].includes(snapshot.finishReason)
         ?snapshot.finishReason:null))
    return {ok:false,reason:'archive_outcome_mismatch'};
  return {ok:true,archive:{
    status:'archived',duelId:duel.id,epoch,resultId,
    reportSequence,simulationSequence,
    winnerId:archivedWinner,loserId:archivedLoser,draw:winner===null,
    finishReason:archive.finishReason??null,
    rewardsEligible:false,rewardsIssued:false,
    rewardEligibility:'unverified_account',
  }};
}
