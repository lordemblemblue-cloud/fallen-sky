// 34.3: independent, backend-only read replay gate for the original 21.1 ingress.
// Never handles combat frames, network sockets, world writes, XP or rewards.
const own=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)&&
  Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

export function createPrivateQuestReadFence343({serverTransportContext}={}){
 if(serverTransportContext===null||typeof serverTransportContext!=='object'||
    Array.isArray(serverTransportContext))
  throw Error('34.3 requires the original backend transport context');
 let next=1,inFlight=null,closed=false;
 const close=()=>{if(closed)return false;closed=true;inFlight=null;return true};
 const begin=request=>{
  if(closed||inFlight||!own(request,['serverTransportContext','rawFrame'])||
      request.serverTransportContext!==serverTransportContext||
      typeof request.rawFrame!=='string'||
      Buffer.byteLength(request.rawFrame,'utf8')>192)return null;
  let frame;
  try{frame=JSON.parse(request.rawFrame)}catch{return null}
  if(!own(frame,['v','seq','op'])||frame.v!==1||
     frame.op!=='questbook.read'||!Number.isSafeInteger(frame.seq)||
     frame.seq!==next||next>256)return null;
  const ticket=Object.freeze({seq:next});
  inFlight=ticket;
  return ticket;
 };
 const finish=(ticket,ok)=>{
  if(closed||!inFlight||inFlight!==ticket)return false;
  inFlight=null;
  if(ok!==true){close();return false}
  next++;
  return !closed;
 };
 return Object.freeze({version:'34.3',begin,finish,close,
  snapshot:()=>Object.freeze({next,active:!closed,inFlight:inFlight!==null}),
  privateServerOnly:true,publicRouteInstalled:false,
  resumeCombatAuthorized:false,rewardsIssued:false,productionReady:false});
}
