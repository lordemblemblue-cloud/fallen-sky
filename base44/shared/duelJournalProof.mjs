// Combat Foundation 4.1: stable report canonicalization for signed
// Base44 -> PostgreSQL journal proof comparison. No Node-specific modules.
export const canonicalJournalValue=value=>
  Array.isArray(value)?value.map(canonicalJournalValue):
  value&&typeof value==='object'?Object.fromEntries(Object.keys(value)
    .filter(k=>value[k]!==undefined).sort()
    .map(k=>[k,canonicalJournalValue(value[k])])):value;

// 'at' is the sender's delivery timestamp, not part of the durable report.
// Never allow browser input here; callers must verify HMAC first.
export function journalPayloadFromDelivery(report){
  if(!report||typeof report!=='object'||Array.isArray(report))
    throw Error('Invalid journal delivery');
  const {at,...payload}=report;
  return payload;
}
export function stableJournalJSON(payload){
  return JSON.stringify(canonicalJournalValue(payload));
}
export async function journalPayloadSHA256(payload){
  const bytes=new TextEncoder().encode(stableJournalJSON(payload));
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(v=>v.toString(16).padStart(2,'0')).join('');
}
