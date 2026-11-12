// 32.9–33.0: opt-in private staging-only renewal scheduling.
// A late timer cannot revive an expired DB lease: the PG CAS decides.
export function createPrivateAccountHeartbeat330({enabled=false,
  intervalMs=5000,ttlMs=15000,renewTimeoutMs=Math.min(3000,Math.floor(ttlMs/3)),
  renew,onFailure}={}){
 if(enabled!==true||process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging'||
    typeof renew!=='function'||typeof onFailure!=='function'||
    !Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>30000||
    !Number.isInteger(intervalMs)||intervalMs<100||
    intervalMs*3>ttlMs||
    !Number.isInteger(renewTimeoutMs)||renewTimeoutMs<100||
    renewTimeoutMs>=ttlMs-intervalMs)
  throw Error('32.9 requires explicitly enabled short-interval staging heartbeat');
 let started=false,stopped=false,inFlight=false,timer=null,cycles=0,
  deadlineTimer=null,stageLost=false,failed=false;
 const stop=()=>{
  if(stopped)return false;
  stopped=true;clearTimeout(timer);clearTimeout(deadlineTimer);
  timer=null;deadlineTimer=null;
  return true;
 };
 const fail=()=>{
  if(failed||stopped)return;
  failed=true;stop();
  try{Promise.resolve(onFailure()).catch(()=>{})}catch{}
 };
 const staging=()=>{
  if(process.env.GAME3D_PRIVATE_STAGING_ENV!=='staging')stageLost=true;
  return !stageLost;
 };
 const schedule=()=>{
  if(stopped)return;
  timer=setTimeout(()=>{void tick()},intervalMs);
  timer.unref?.();
 };
 // 33.3–33.6: if a backend Promise stalls beyond the renewal deadline,
 // permanently fail closed. Late completions are ignored (no new timer).
 const tick=async()=>{
  if(stopped)return;
  if(!staging()||inFlight){fail();return;}
  inFlight=true;
  let ok=false;
  try{
   ok=await Promise.race([
    Promise.resolve().then(()=>renew()),
    new Promise(resolve=>{deadlineTimer=setTimeout(()=>resolve(false),renewTimeoutMs)}),
   ]);
  }catch{}
  finally{clearTimeout(deadlineTimer);deadlineTimer=null;inFlight=false;}
  if(stopped)return;
  if(!ok||!staging()){fail();return;}
  cycles++;
  schedule();
 };
 const start=()=>{
  if(started||stopped||!staging()){
   if(!staging())fail();
   return false;
  }
  started=true;schedule();return true;
 };
 return Object.freeze({version:'32.9',start,stop,
  snapshot:()=>Object.freeze({active:started&&!stopped,inFlight,cycles,
   failed,deadlineMs:renewTimeoutMs}),
  privateServerOnly:true,publicRouteInstalled:false,
  productionReady:false});
}
