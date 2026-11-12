// Combat / Quest 43.6 and 44.7–45.2: bound original private Questbook
// operations by an elapsed budget AND by the original socket lifetime.
// Abort ends the WAIT and discards eventual results; it does not promise to
// cancel an external server operation that ignores AbortSignal.
import {performance} from 'node:perf_hooks';

const ABORTED=Object.freeze({ok:false,aborted:true});
const TIMEOUT=Object.freeze({ok:false,timedOut:true});
const REFUSED=Object.freeze({ok:false,timedOut:false});
const validSignal=signal=>signal===null||
 (typeof signal==='object'&&typeof signal.aborted==='boolean'&&
  typeof signal.addEventListener==='function'&&
  typeof signal.removeEventListener==='function');
export async function withPrivateQuestDeadline436(work,{
 timeoutMs=1500,submittedAt=performance.now(),onTimeout=()=>{},signal=null,
}={}){
 if(typeof work!=='function'||typeof onTimeout!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3000||
    typeof submittedAt!=='number'||!Number.isFinite(submittedAt)||
    !validSignal(signal))
  throw Error('43.6 requires a bounded original Questbook operation');
 // 44.7: an already-closed original socket must not even start a callback.
 if(signal?.aborted)return ABORTED;
 const remaining=timeoutMs-(performance.now()-submittedAt);
 if(remaining<=0){
  try{onTimeout()}catch{}
  return TIMEOUT;
 }
 let timer=null,unsubscribe=()=>{};
 const abortPromise=signal?new Promise(resolve=>{
  const notify=()=>resolve(ABORTED);
  signal.addEventListener('abort',notify,{once:true});
  unsubscribe=()=>signal.removeEventListener('abort',notify);
  // Closing between the pre-check and listener attachment is still caught.
  if(signal.aborted)notify();
 }):new Promise(()=>{});
 const pending=Promise.resolve().then(()=>{
  if(signal?.aborted)return ABORTED;
  return Promise.resolve().then(()=>{
   if(signal?.aborted)return ABORTED;
   return work(signal);
  }).then(value=>value===ABORTED?ABORTED:{ok:true,value},()=>REFUSED);
 });
 // The promise always has a rejection observer, including after abort/expiry.
 pending.then(()=>{},()=>{});
 try{
  const deadline=new Promise(resolve=>{
   timer=setTimeout(()=>{
    if(signal?.aborted){resolve(ABORTED);return}
    try{onTimeout()}catch{}
    resolve(TIMEOUT);
   },Math.max(1,Math.ceil(remaining)));
  });
  const result=await Promise.race([pending,deadline,abortPromise]);
  if(signal?.aborted)return ABORTED;
  // A blocked event loop can delay the timer; monotonic time remains final.
  if(result.ok&&performance.now()-submittedAt>=timeoutMs){
   try{onTimeout()}catch{}
   return TIMEOUT;
  }
  return Object.freeze(result);
 }finally{
  clearTimeout(timer);
  unsubscribe();
 }
}
