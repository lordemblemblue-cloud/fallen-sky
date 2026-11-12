// Combat / Quest 23.6 — one private account per active socket on THIS worker.
// Not a cross-worker lock, not an authentication provider, not public admission.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const TRANSPORT=/^tx-[a-f0-9]{32}$/;
const banned=new Set(['__anon__','__default__','__dev_test__']);
const validId=x=>typeof x==='string'&&ID.test(x)&&!banned.has(x);
export function createPrivateLoopbackSessions236({maxAccounts=2,now=Date.now}={}){
 if(!Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>2||
    typeof now!=='function')throw Error('23.6 invalid private account capacity');
 const byAccount=new Map(),byTransport=new Set();let stopped=false;
 const reserve=({ownerId,characterId,transportId,expiresAtMs}={})=>{
  const at=now();
  if(stopped||!validId(ownerId)||!validId(characterId)||
     !TRANSPORT.test(transportId)||!Number.isSafeInteger(at)||at<=0||
     !Number.isSafeInteger(expiresAtMs)||expiresAtMs<=at||
     expiresAtMs>at+60000||byAccount.size>=maxAccounts||
     byAccount.has(ownerId)||byTransport.has(transportId))return null;
  const claim=Object.freeze({ownerId,characterId,transportId,expiresAtMs});
  // Reserve synchronously before the next awaited socket upgrade.
  byAccount.set(ownerId,claim);byTransport.add(transportId);
  let released=false;
  const release=()=>{
   if(released)return false;released=true;
   if(byAccount.get(ownerId)===claim)byAccount.delete(ownerId);
   byTransport.delete(transportId);
   return true;
  };
  return Object.freeze({release,
   matches:x=>!stopped&&!released&&byAccount.get(ownerId)===claim&&
    x?.ownerId===ownerId&&x.characterId===characterId&&
    x.transportId===transportId&&Number.isSafeInteger(now())&&
    now()<expiresAtMs&&x.expiresAtMs<=expiresAtMs});
 };
 const shutdown=()=>{stopped=true;byAccount.clear();byTransport.clear()};
 return Object.freeze({reserve,shutdown,
  snapshot:()=>Object.freeze({accounts:byAccount.size,stopped}),
  privateServerOnly:true,productionReady:false});
}
