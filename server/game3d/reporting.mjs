import { createHmac } from 'node:crypto';

// One signed worker is the only writer of dedicated match checkpoints.
// Never allow browser requests to choose HP, winner, epoch or master key.
export function createDuelReportSender({url,secret,fetchImpl=fetch,now=Date.now}={}){
  if(!/^https:\/\/[^\s#?]+$/.test(url||''))
    throw Error('GAME3D_COMBAT_REPORT_URL requires an HTTPS function URL');
  if(typeof secret!=='string'||secret.length<32)
    throw Error('GAME3D_COMBAT_SECRET required for settlement');
  return async payload=>{
    const report={...payload,at:now()};
    const body=JSON.stringify(report);
    const signature=createHmac('sha256',secret).update(body).digest('hex');
    const response=await fetchImpl(url,{
      method:'POST',headers:{
        'Content-Type':'application/json',
        'x-game3d-signature':signature,
      },body,signal:AbortSignal.timeout(6000),
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.success)
      throw Error('Match report rejected: '+(result.code||response.status));
    // An HTTP 200 alone is not an acknowledgment of THIS report. In
    // particular, never remove a persisted terminal result on stale or
    // conflicting Base44 acknowledgments.
    if(!Number.isSafeInteger(result.sequence)||
       result.sequence!==payload.sequence ||
       (payload.kind==='settle' && (result.settled!==true ||
         result.resultId!==payload.resultId)) ||
       (payload.kind==='checkpoint' && result.settled!==false))
      throw Error('Match report acknowledgment does not match submitted result');
    return result;
  };
}
