// 19.7: copy only public Questbook objective counters; never leak PG rows.
import {isRecord} from './privateTransportContract190.mjs';
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const KIND=/^[a-z_]{1,40}$/;
export function sanitizePrivateQuestSnapshot197(progress){
 if(!Array.isArray(progress)||progress.length>32)return null;
 const result=[],seen=new Set();
 for(const row of progress){
  if(!isRecord(row)||!ID.test(row.questId)||!ID.test(row.objectiveId)||
     !KIND.test(row.type)||!KIND.test(row.status)||
     !Number.isSafeInteger(row.current)||
     !Number.isSafeInteger(row.required)||
     row.current<0||row.required<0||row.current>row.required||
     row.required>100000)return null;
  const id=JSON.stringify([row.questId,row.objectiveId]);
  if(seen.has(id))return null;
  seen.add(id);
  result.push(Object.freeze({questId:row.questId,
   objectiveId:row.objectiveId,type:row.type,status:row.status,
   current:row.current,required:row.required}));
 }
 return Object.freeze(result);
}
