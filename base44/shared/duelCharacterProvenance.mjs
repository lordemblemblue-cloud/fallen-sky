// Combat Foundation 4.7 — private-beta duelist character evidence.
// Game3DCharacterSave is copied from a BROWSER, checked against caps but NOT
// awarded by a full authoritative event stream. A matching stored fingerprint
// proves database consistency, NOT provenance of earned levels/equipment.
// All reward eligibility remains explicitly false.
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)&&
  s!=='__default__'&&s!=='__anon__';
const unique=rows=>Array.isArray(rows)&&rows.length===1;
// Mirror the current Character Vault FNV-1a consistency check precisely.
// This does NOT make browser-reported XP or items earned/authoritative.
export function storedVaultFingerprint(save){
  const joined=Object.keys(save).sort().map(k=>k+String.fromCharCode(0)+save[k]).join(String.fromCharCode(1));
  let h=0x811c9dc5;
  for(let i=0;i<joined.length;i++){
    h^=joined.charCodeAt(i);
    h=Math.imul(h,0x01000193)>>>0;
  }
  return joined.length.toString(36)+'-'+h.toString(36);
}
export function inspectStoredCharacterEvidence({ownerId,characterId,rows}={}){
  if(!validId(characterId)||typeof ownerId!=='string'||!ownerId||
     ownerId.length>160)
    return {ok:false,code:'invalid_character_binding'};
  if(!unique(rows))return {ok:false,code:rows?.length>1?
    'duplicate_character_saves':'character_save_unavailable'};
  const row=rows[0];
  if(row.owner_id!==ownerId||row.character_id!==characterId)
    return {ok:false,code:'character_owner_mismatch'};
  if(!Number.isSafeInteger(row.revision)||row.revision<1||
     typeof row.fingerprint!=='string'||!row.fingerprint||
     !row.data||typeof row.data!=='object'||Array.isArray(row.data)||
     Object.keys(row.data).length>150||
     Object.entries(row.data).some(([key,val])=>!/^([a-z][a-z0-9_]{2,63})$/.test(key)||
       typeof val!=='string'||val.length>400000)||
     storedVaultFingerprint(row.data)!==row.fingerprint||
     !Array.isArray(row.flags)||row.flags.length>0||
     Number(row.flag_count||0)>0||
     !Number.isFinite(Date.parse(row.saved_at||'')))
    return {ok:false,code:'character_save_requires_review'};
  return {ok:true,
    ownerId,characterId,revision:row.revision,
    fingerprint:row.fingerprint,savedAt:row.saved_at,
    source:'browser-synced-character-vault',
    ownerBindingVerified:true,saveConsistencyVerified:true,
    combatStatsVerified:false,equipmentProvenanceVerified:false,
    eligible:false,rewardsIssued:false,
  };
}
export function validateDuelProvenancePair({duel,challenger,opponent}={}){
  if(!duel||!challenger?.ok||!opponent?.ok||
     challenger.ownerId!==duel.challenger_id||
     opponent.ownerId!==duel.opponent_id||
     challenger.characterId!==duel.challenger_character_id||
     opponent.characterId!==duel.opponent_character_id||
     challenger.combatStatsVerified!==false||
     opponent.combatStatsVerified!==false||
     challenger.equipmentProvenanceVerified!==false||
     opponent.equipmentProvenanceVerified!==false)
    return {ok:false,code:'character_provenance_binding_mismatch'};
  return {ok:true,
    challenger,opponent,
    source:'browser-synced-character-vault',
    combatStatsVerified:false,equipmentProvenanceVerified:false,
    rewardEligibility:'unverified_account',rewardsIssued:false};
}

// Verifies the HMAC-protected worker ticket was minted from backend-read
// accounts and that its classification does not falsely claim verified gear.
export function verifySignedCharacterEvidence(ticket){
  const p=ticket?.characterEvidence;
  if(!p||p.source!=='browser-synced-character-vault'||
     p.combatStatsVerified!==false||
     p.equipmentProvenanceVerified!==false||
     p.rewardEligibility!=='unverified_account'||
     p.rewardsIssued!==false)
    return {ok:false,code:'missing_character_evidence'};
  const check=(item,owner)=>{
    if(!item||item.ownerId!==owner||!validId(item.characterId)||
       !Number.isSafeInteger(item.revision)||item.revision<1||
       typeof item.fingerprint!=='string'||item.fingerprint.length>100||
       !item.fingerprint||item.ownerBindingVerified!==true||
       item.saveConsistencyVerified!==true||
       item.source!=='browser-synced-character-vault'||
       item.combatStatsVerified!==false||
       item.equipmentProvenanceVerified!==false||
       item.eligible!==false||item.rewardsIssued!==false)
      return false;
    return true;
  };
  if(!check(p.challenger,ticket.challengerId)||
     !check(p.opponent,ticket.opponentId)||
     p.challenger.ownerId===p.opponent.ownerId||
     p.challenger.ownerId!==ticket.challengerId||
     p.opponent.ownerId!==ticket.opponentId)
    return {ok:false,code:'character_evidence_identity_mismatch'};
  return {ok:true};
}
