// Combat Foundation 4.6 — fail-closed ticket preflight from committed
// PostgreSQL. A Base44 'active' DuelSession is NOT combat authority.
// Pure policy; the caller must verify HMAC at the backend-to-worker boundary.
const textId=x=>typeof x==='string'&&x.length>0&&x.length<=160;
export function evaluateDedicatedAdmission({duel,preflight}={}){
  if(!duel||!textId(duel.id)||!textId(duel.dedicated_epoch)||
     duel.dedicated_mode!=='dedicated'||duel.status!=='active')
    return {ok:false,code:'base44_duel_not_active'};
  if(!preflight||preflight.authoritative!==true||
     preflight.duelId!==duel.id)
    return {ok:false,code:'unverifiable_admission_state'};
  if(preflight.status==='archived'){
    if(preflight.epoch!==duel.dedicated_epoch||
       typeof preflight.resultId!=='string'||
       preflight.resultId.length<1||preflight.resultId.length>200||
       !Number.isSafeInteger(preflight.reportSequence)||
       preflight.reportSequence<1||
       preflight.rewardsIssued!==false)
      return {ok:false,code:'unverifiable_archived_duel'};
    return {ok:false,code:'dedicated_match_archived'};
  }
  if(preflight.status==='active'){
    if(preflight.epoch!==duel.dedicated_epoch||
       !Number.isSafeInteger(preflight.reportSequence)||
       preflight.reportSequence<0)
      return {ok:false,code:'journal_epoch_mismatch'};
    return {ok:true,source:'postgres-journal'};
  }
  if(preflight.status==='absent'&&
     preflight.epoch===undefined&&preflight.resultId===undefined)
    return {ok:true,source:'postgres-no-match-yet'};
  return {ok:false,code:'unrecognized_admission_state'};
}
