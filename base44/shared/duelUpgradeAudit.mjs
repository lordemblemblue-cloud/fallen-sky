// Combat Foundation 4.9 — a read-only digest of Base44 server-rolled
// upgrade records. These records attest only to rolls/restores, NOT that
// the base item was issued by an action-authoritative item minting ledger.
// Never treat this audit as ranked or equipment-stat authorization.
import {stableJournalJSON} from './duelJournalProof.mjs';

export const UPGRADE_AUDIT_VERSION='game3d-upgrade-roll-audit-v1';
export const MAX_UPGRADE_AUDIT_ROWS=250;
const services=new Set(['reinforcement','over_enchant','refine','ultimate']);
const identifier=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sha256=async value=>{
  const bytes=new TextEncoder().encode(stableJournalJSON(value));
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(b=>b.toString(16).padStart(2,'0')).join('');
};
export async function inspectServerRolledUpgradeRecords({ownerId,characterId,rows}={}){
  if(!identifier(ownerId)||!identifier(characterId)||
     !/^[A-Za-z0-9_-]{1,128}$/.test(characterId)||
     !Array.isArray(rows)||rows.length>MAX_UPGRADE_AUDIT_ROWS)
    return {ok:false,code:'upgrade_audit_input_invalid'};
  const normalized=[],keys=new Set();
  for(const r of rows){
    if(r?.owner_id!==ownerId||r.character_id!==characterId||
       typeof r.item_id!=='string'||r.item_id.length<1||
       r.item_id.length>200||!services.has(r.service)||
       !r.record||typeof r.record!=='object'||Array.isArray(r.record)||
       !Number.isSafeInteger(r.attempts??0)||(r.attempts??0)<0||
       !Array.isArray(r.spent??[])||(r.spent??[]).length>150||
       (r.spent??[]).some(v=>typeof v!=='string'||!v||v.length>200)||
       (r.rolled_at!=null&&!Number.isFinite(Date.parse(r.rolled_at)))||
       (r.restored_at!=null&&!Number.isFinite(Date.parse(r.restored_at))))
      return {ok:false,code:'unverifiable_upgrade_record'};
    const key=r.item_id+'\u0000'+r.service;
    if(keys.has(key))return {ok:false,code:'duplicate_upgrade_records'};
    keys.add(key);
    normalized.push({
      itemId:r.item_id,service:r.service,record:r.record,
      attempts:r.attempts??0,
      spent:r.spent??[],
      rolledAt:r.rolled_at??null,restoredAt:r.restored_at??null,
      lastTransactionId:r.last_transaction_id??null,
    });
  }
  normalized.sort((a,b)=>a.itemId.localeCompare(b.itemId)||
    a.service.localeCompare(b.service));
  if(stableJournalJSON(normalized).length>300000)
    return {ok:false,code:'upgrade_audit_too_large'};
  const digest=await sha256(normalized);
  return {
    ok:true,ownerId,characterId,recordCount:normalized.length,
    recordsDigest:digest,
    source:UPGRADE_AUDIT_VERSION,
    serverRollRecordsConsistent:true,
    baseItemIssuanceVerified:false,equipmentProvenanceVerified:false,
    combatStatsVerified:false,eligible:false,rewardsIssued:false,
  };
}
export function buildDuelUpgradeAudit({duelId,epoch,characterEvidence,
  challenger,opponent}={}){
  const pair=characterEvidence;
  const valid=(audit,person)=>audit?.ok===true&&
    audit.ownerId===person?.ownerId&&
    audit.characterId===person?.characterId&&
    Number.isSafeInteger(audit.recordCount)&&
    audit.recordCount>=0&&audit.recordCount<=MAX_UPGRADE_AUDIT_ROWS&&
    hex(audit.recordsDigest)&&audit.source===UPGRADE_AUDIT_VERSION&&
    audit.serverRollRecordsConsistent===true&&
    audit.baseItemIssuanceVerified===false&&
    audit.equipmentProvenanceVerified===false&&
    audit.combatStatsVerified===false&&
    audit.eligible===false&&audit.rewardsIssued===false;
  if(!identifier(duelId)||!identifier(epoch)||!pair||
     !valid(challenger,pair.challenger)||!valid(opponent,pair.opponent)||
     challenger.ownerId===opponent.ownerId)
    throw Error('Invalid signed upgrade audit participants');
  const summary=a=>({
    ownerId:a.ownerId,characterId:a.characterId,
    recordCount:a.recordCount,recordsDigest:a.recordsDigest,
  });
  return {
    version:1,source:UPGRADE_AUDIT_VERSION,duelId,epoch,
    challenger:summary(challenger),opponent:summary(opponent),
    baseItemIssuanceVerified:false,equipmentProvenanceVerified:false,
    combatStatsVerified:false,eligible:false,rewardsIssued:false,
  };
}
export function verifyDuelUpgradeAudit(ticket){
  const a=ticket?.upgradeAudit,c=ticket?.characterEvidence;
  if(!a||a.version!==1||a.source!==UPGRADE_AUDIT_VERSION||
     a.duelId!==ticket.duelId||a.epoch!==ticket.authorityEpoch||
     a.baseItemIssuanceVerified!==false||
     a.equipmentProvenanceVerified!==false||
     a.combatStatsVerified!==false||a.eligible!==false||
     a.rewardsIssued!==false)
    return {ok:false,code:'invalid_upgrade_audit'};
  const check=(p,identity)=>p?.ownerId===identity?.ownerId&&
    p.characterId===identity?.characterId&&
    Number.isSafeInteger(p.recordCount)&&p.recordCount>=0&&
    p.recordCount<=MAX_UPGRADE_AUDIT_ROWS&&hex(p.recordsDigest);
  if(!check(a.challenger,c?.challenger)||
     !check(a.opponent,c?.opponent)||
     a.challenger.ownerId!==ticket.challengerId||
     a.opponent.ownerId!==ticket.opponentId)
    return {ok:false,code:'upgrade_audit_identity_mismatch'};
  const expected={
    version:1,source:UPGRADE_AUDIT_VERSION,
    duelId:ticket.duelId,epoch:ticket.authorityEpoch,
    challenger:a.challenger,opponent:a.opponent,
    baseItemIssuanceVerified:false,equipmentProvenanceVerified:false,
    combatStatsVerified:false,eligible:false,rewardsIssued:false,
  };
  if(stableJournalJSON(a)!==stableJournalJSON(expected))
    return {ok:false,code:'unexpected_upgrade_audit_fields'};
  return {ok:true,audit:expected};
}
