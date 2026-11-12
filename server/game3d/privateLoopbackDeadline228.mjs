// 22.8 - bound independent authentication wait; never fail open on timeout.
export async function withPrivateLoopbackDeadline228(callback,{timeoutMs=1500}={}){
 if(typeof callback!=='function'||!Number.isInteger(timeoutMs)||
    timeoutMs<100||timeoutMs>3000)throw Error('22.8 invalid authentication deadline');
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(callback),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('private_auth_timeout')),timeoutMs);}),
  ]);
 }finally{clearTimeout(timer)}
}
