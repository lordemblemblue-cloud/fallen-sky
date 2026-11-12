// 21.8: permit only an allowlisted Questbook snapshot outbound frame.
export function verifyPrivateQuestReply218(payload){
 if(typeof payload!=='string'||Buffer.byteLength(payload,'utf8')>16384)return null;
 let v;try{v=JSON.parse(payload)}catch{return null}
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).length!==4||
    v.v!==1||v.type!=='questbook.snapshot'||
    !Number.isSafeInteger(v.seq)||v.seq<1||v.seq>256||
    !Array.isArray(v.objectives)||v.objectives.length>32)return null;
 const ids=new Set(),safe=[];
 for(const o of v.objectives){
  if(!o||typeof o!=='object'||Array.isArray(o)||
     Object.keys(o).length!==6||
     !/^[A-Za-z0-9_.:-]{1,128}$/.test(o.questId)||
     !/^[A-Za-z0-9_.:-]{1,128}$/.test(o.objectiveId)||
     !/^[a-z_]{1,40}$/.test(o.type)||
     !/^[a-z_]{1,40}$/.test(o.status)||
     !Number.isSafeInteger(o.current)||!Number.isSafeInteger(o.required)||
     o.current<0||o.current>o.required||o.required>100000)return null;
  const key=JSON.stringify([o.questId,o.objectiveId]);
  if(ids.has(key))return null;
  ids.add(key);safe.push(Object.freeze({
   questId:o.questId,objectiveId:o.objectiveId,
   type:o.type,status:o.status,current:o.current,required:o.required,
  }));
 }
 const out=JSON.stringify({v:1,type:'questbook.snapshot',seq:v.seq,objectives:safe});
 return Buffer.byteLength(out,'utf8')<=16384?out:null;
}
