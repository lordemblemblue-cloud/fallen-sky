// Combat Foundation 4.1 — strict receipt-only bridge.
// A committed PostgreSQL journal row is the ONLY acceptable proof.
// No Base44 DuelSession write is performed by this policy.
const same=(a,b)=>(a??null)===(b??null);
const isNum=x=>typeof x==='number'&&Number.isFinite(x);
const str=x=>typeof x==='string'&&x.length>0&&x.length<=160;
export function validateLedgerOnlyReceipt({duel,delivery,proof,payloadDigest}={}){
  if(!duel||duel.dedicated_mode!=='dedicated'||duel.status!=='active'||
     !str(delivery?.duelId)||delivery.duelId!==duel.id||
     delivery.ledgerOnly!==true||
     !str(delivery.epoch)||delivery.epoch!==duel.dedicated_epoch||
     !Number.isSafeInteger(delivery.sequence)||delivery.sequence<1||
     !['checkpoint','settle'].includes(delivery.kind))
    return {ok:false,reason:'invalid_dedicated_delivery'};
  const c=delivery.checkpoint,ss=delivery.snapshot,base=duel.dedicated_checkpoint;
  if(!base||!c||!ss||ss.matchId!==duel.id||
     !Number.isSafeInteger(ss.seq)||ss.seq<0||
     c.state?.sequence!==ss.seq||c.state?.status!==ss.status||
     (delivery.kind==='settle')!==(ss.status==='finished')||
     !['active','waiting','finished'].includes(ss.status))
    return {ok:false,reason:'checkpoint_snapshot_mismatch'};
  if(!same(base.mapId,c.mapId)||!same(base.instanceId,c.instanceId)||
     !same(base.mapFingerprint,c.mapFingerprint)||
     !same(base.spawnPresetId,c.spawnPresetId)||
     !same(base.worldOrigin?.x,c.worldOrigin?.x)||
     !same(base.worldOrigin?.z,c.worldOrigin?.z)||
     !same(ss.mapId,base.mapId)||!same(ss.instanceId,base.instanceId)||
     !same(ss.mapFingerprint,base.mapFingerprint)||
     !same(ss.spawnPresetId,base.spawnPresetId))
    return {ok:false,reason:'immutable_binding_mismatch'};
  const pair=[duel.challenger_id,duel.opponent_id];
  const actors=c.state?.actors;
  if(!pair.every(str)||pair[0]===pair[1]||
     !Array.isArray(ss.players)||ss.players.length!==2||
     !Array.isArray(actors)||actors.length!==2||
     new Set(ss.players.map(p=>p.id)).size!==2||
     new Set(actors.map(p=>p.id)).size!==2||
     !pair.every(id=>ss.players.some(p=>p.id===id)&&actors.some(a=>a.id===id)))
    return {ok:false,reason:'participant_mismatch'};
  for(const p of ss.players){
    const a=actors.find(a=>a.id===p.id);
    if(!a||!isNum(p.hp)||!isNum(p.maxHp)||p.maxHp<=0||
       p.hp<0||p.hp>p.maxHp||!isNum(p.x)||!isNum(p.z)||
       !isNum(p.stamina)||!isNum(p.will)||
       p.x!==a.x||p.z!==a.z||p.hp!==a.hp||
       p.stamina!==a.stamina||p.will!==a.will)
      return {ok:false,reason:'invalid_actor_state'};
  }
  const terminal=delivery.kind==='settle';
  if(terminal&&(!str(delivery.resultId)||
      delivery.resultId.length>200||
      !same(ss.winnerId,null)&&!pair.includes(ss.winnerId)))
    return {ok:false,reason:'invalid_terminal_result'};
  if(!terminal&&delivery.resultId!=null)
    return {ok:false,reason:'unexpected_result_id'};
  if(!proof||proof.success!==true||proof.duelId!==delivery.duelId||
     proof.epoch!==delivery.epoch||proof.sequence!==delivery.sequence||
     proof.simulationSequence!==ss.seq||proof.kind!==delivery.kind||
     proof.payloadDigest!==payloadDigest||
     !/^[1-9][0-9]*$/.test(String(proof.fence||''))||
     !same(proof.resultId,terminal?delivery.resultId:null))
    return {ok:false,reason:'journal_proof_mismatch'};
  return {ok:true,settled:terminal,sequence:delivery.sequence,
    resultId:terminal?delivery.resultId:null};
}
