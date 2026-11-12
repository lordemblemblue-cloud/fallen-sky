// 19.8: bounded aggregate counters only; no usernames, tokens or nonces.
const EVENTS=Object.freeze(['attached','read','denied','expired','revoked',
 'shutdown','closed']);
export function createPrivateTransportAudit198(){
 const counts=Object.fromEntries(EVENTS.map(key=>[key,0]));
 return Object.freeze({
  mark(event){
   if(!Object.hasOwn(counts,event))return false;
   counts[event]=Math.min(Number.MAX_SAFE_INTEGER,counts[event]+1);
   return true;
  },
  snapshot(){return Object.freeze({...counts});},
 });
}
