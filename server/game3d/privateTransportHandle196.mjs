// 19.6: private handoff handle expires without renewing the original world.
export function createPrivateTransportHandle196({now=Date.now,
 expiresAtMs,onClose=()=>{}}={}){
 if(typeof now!=='function'||typeof onClose!=='function'||
    !Number.isSafeInteger(expiresAtMs)||expiresAtMs<=now())
  throw Error('19.6 invalid private handoff expiration');
 let closed=false;
 const active=()=>!closed&&Number.isSafeInteger(now())&&now()<expiresAtMs;
 const close=()=>{
  if(closed)return false;
  closed=true;onClose();return true;
 };
 return Object.freeze({active,close,get closed(){return closed},
  expiresAtMs,privateServerOnly:true,publicRouteInstalled:false});
}
