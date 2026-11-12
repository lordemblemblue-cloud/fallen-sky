// Combat / Quest 42.5–43.0: pin the ORIGINAL trusted backend candidate,
// not just its recovery proof. A mutable provider object must not replace the
// authenticateUpgrade or private Questbook ingress while a socket is active.
// This neither creates an admission credential nor adds any public endpoint.
const data=(object,key)=>{
  if(!object||typeof object!=='object')return undefined;
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;
};

export function sealOriginalRecoveryCandidate425(candidate,pinned,onInvalid=()=>{}){
  try{
    if(!candidate||!pinned||typeof onInvalid!=='function')return null;
    const scope=data(candidate,'scope');
    const ingress=data(candidate,'ingress211');
    const authenticate=data(candidate,'authenticateUpgrade');
    const bind=data(ingress,'bind');
    const receive=data(ingress,'receive');
    const close=data(ingress,'close');
    if(!scope||!ingress||typeof authenticate!=='function'||
       typeof bind!=='function'||typeof receive!=='function'||
       typeof close!=='function'||data(ingress,'version')!=='21.1'||
       data(ingress,'privateServerOnly')!==true||
       data(ingress,'publicRouteInstalled')!==false||
       data(ingress,'transportBindingCreated')!==false||
       data(ingress,'resumeCombatAuthorized')!==false||
       !['ownerId','characterId','instanceId','instanceEpoch'].every(
         key=>data(scope,key)===pinned[key]))return null;
    let closed=false;
    const stable=()=>{
      try{
        return !closed&&data(candidate,'scope')===scope&&
          data(candidate,'ingress211')===ingress&&
          data(candidate,'authenticateUpgrade')===authenticate&&
          data(ingress,'bind')===bind&&data(ingress,'receive')===receive&&
          data(ingress,'close')===close&&
          data(ingress,'version')==='21.1'&&
          data(ingress,'privateServerOnly')===true&&
          data(ingress,'publicRouteInstalled')===false&&
          data(ingress,'transportBindingCreated')===false&&
          data(ingress,'resumeCombatAuthorized')===false&&
          ['ownerId','characterId','instanceId','instanceEpoch'].every(
            key=>data(scope,key)===pinned[key]);
      }catch{return false}
    };
    const invalid=()=>{try{onInvalid()}catch{}};
    const invoke=async (target,fn,args)=>{
      if(!stable()){invalid();return null}
      let value;
      try{value=await Reflect.apply(fn,target,args)}catch{invalid();return null}
      if(!stable()){invalid();return null}
      return value;
    };
    const closeOnce=()=>{
      if(closed)return false;
      closed=true;
      try{Reflect.apply(close,ingress,[])}catch{}
      return true;
    };
    const publicScope=Object.freeze({
      ownerId:pinned.ownerId,characterId:pinned.characterId,
      instanceId:pinned.instanceId,instanceEpoch:pinned.instanceEpoch,
    });
    const publicIngress=Object.freeze({
      version:'21.1',privateServerOnly:true,publicRouteInstalled:false,
      transportBindingCreated:false,resumeCombatAuthorized:false,
      bind:async(...args)=>(await invoke(ingress,bind,args))??{ok:false},
      receive:async(...args)=>invoke(ingress,receive,args),
      close:closeOnce,
    });
    return Object.freeze({
      candidate,scope:publicScope,ingress211:publicIngress,
      authenticateUpgrade:async(...args)=>invoke(candidate,authenticate,args),
      stable,close:closeOnce,
    });
  }catch{return null}
}
