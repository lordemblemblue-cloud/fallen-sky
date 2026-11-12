// 23.0 - aggregate counters only. Never log owner, character or bearer data.
const keys=['attempted','denied','authenticated','upgraded','ready','closed','failed'];
export function createPrivateLoopbackMetrics230(){
 const counters=Object.fromEntries(keys.map(k=>[k,0]));
 return Object.freeze({
  mark(k){if(!Object.hasOwn(counters,k))return false;
   counters[k]=Math.min(Number.MAX_SAFE_INTEGER,counters[k]+1);return true},
  snapshot(){return Object.freeze({...counters})},
 });
}
