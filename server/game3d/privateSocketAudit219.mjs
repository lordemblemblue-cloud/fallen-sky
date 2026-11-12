// 21.9: aggregate status only; don't log identities or transport IDs.
const EVENTS=['accepted','sent','denied','closed','overflow','revoked'];
export function createPrivateSocketAudit219(){
 const counts=Object.fromEntries(EVENTS.map(e=>[e,0]));
 return Object.freeze({
  mark(event){if(!Object.hasOwn(counts,event))return;
   counts[event]=Math.min(Number.MAX_SAFE_INTEGER,counts[event]+1)},
  snapshot(){return Object.freeze({...counts})},
 });
}
