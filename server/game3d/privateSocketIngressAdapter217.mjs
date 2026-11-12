// 21.7: call ONLY 21.1's pinned backend ingress, not gameplay engine.
export async function readPrivateQuest217({ingress,serverTransportContext,rawFrame,abortSignal=null}={}){
 if(abortSignal?.aborted||ingress?.version!=='21.1'||ingress.privateServerOnly!==true||
    ingress.publicRouteInstalled!==false||
    ingress.transportBindingCreated!==false||
    ingress.resumeCombatAuthorized!==false||
    typeof ingress.receive!=='function')return null;
 let result;
 try{result=await ingress.receive(Object.freeze({
  serverTransportContext,rawFrame,
 }),{signal:abortSignal})}catch{return null}
 if(abortSignal?.aborted)return null;
 if(result?.ok!==true||result.version!=='21.1'||
    result.privateServerOnly!==true||
    result.publicRouteInstalled!==false||
    result.transportBindingCreated!==false||
    result.resumeCombatAuthorized!==false||
    result.rewardsIssued!==false||
    typeof result.payload!=='string')return null;
 return result.payload;
}
