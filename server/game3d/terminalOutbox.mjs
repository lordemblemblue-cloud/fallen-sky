// Optional disk-backed terminal outbox for the ONE-worker staging topology.
// A mounted, persistent directory is required for process-restart replay.
// This does not make Base44 writes atomic or prevent every crash window.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, openSync, writeFileSync,
  fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES=24000;
const MAX_PENDING=500;
const keyOf=p=>createHash('sha256').update(
  String(p.duelId)+'\0'+String(p.epoch)).digest('hex');
const validate=p=>p && p.kind==='settle' &&
  typeof p.duelId==='string'&&p.duelId.length>0&&p.duelId.length<=160&&
  typeof p.epoch==='string'&&p.epoch.length>0&&p.epoch.length<=160&&
  typeof p.resultId==='string'&&p.resultId.length>0&&
  Number.isSafeInteger(p.sequence)&&p.sequence>0 &&
  p.snapshot?.status==='finished'&&p.checkpoint?.state?.status==='finished';

export function createTerminalOutbox({directory=null,report}={}){
  if(typeof report!=='function')throw Error('Terminal outbox requires a report sender');
  const enabled=typeof directory==='string'&&directory.length>0;
  const pending=new Map(), inflight=new Set();
  let initialized=false;
  const pathFor=key=>join(directory,key+'.json');
  const syncDir=()=>{
    // Filesystem directory fsync supported on Linux durable volumes.
    const fd=openSync(directory,'r');
    try{fsyncSync(fd);}finally{closeSync(fd);}
  };
  const initialize=()=>{
    if(initialized)return;
    if(!enabled){initialized=true;return;}
    mkdirSync(directory,{recursive:true,mode:0o700});
    const names=readdirSync(directory).filter(n=>n.endsWith('.json'));
    if(names.length>MAX_PENDING)throw Error('Settlement outbox exceeds capacity');
    for(const name of names){
      if(!/^[a-f0-9]{64}\.json$/.test(name))
        throw Error('Invalid settlement record filename');
      const raw=readFileSync(join(directory,name),'utf8');
      if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('Oversized settlement record');
      const payload=JSON.parse(raw);
      if(!validate(payload)||keyOf(payload)+'.json'!==name)
        throw Error('Invalid persisted settlement record');
      pending.set(keyOf(payload),{payload,restored:true});
    }
    initialized=true;
  };
  const hasPending=(duelId,epoch)=>pending.has(keyOf({duelId,epoch}));
  // An unsettled result in ANY epoch of this duel blocks re-admission.
  // This is a one-replica durability fence, not a distributed lease.
  const hasPendingDuel=duelId=>[...pending.values()].some(
    r=>r.payload.duelId===duelId);
  const stage=payload=>{
    if(!enabled)return payload;
    if(!initialized)throw Error('Settlement outbox not initialized');
    if(!validate(payload))throw Error('Invalid terminal settlement payload');
    const key=keyOf(payload),previous=pending.get(key);
    if(previous){
      if(JSON.stringify(previous.payload)!==JSON.stringify(payload))
        throw Error('Conflicting terminal payload for dedicated epoch');
      return previous.payload;
    }
    if(pending.size>=MAX_PENDING)throw Error('Settlement outbox is full');
    const raw=JSON.stringify(payload);
    if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('Terminal report exceeds disk limit');
    const temp=join(directory,key+'.'+randomUUID()+'.tmp');
    let fd;
    try{
      fd=openSync(temp,'wx',0o600);
      writeFileSync(fd,raw,'utf8');
      fsyncSync(fd);closeSync(fd);fd=null;
      renameSync(temp,pathFor(key));
      syncDir();
    }catch(err){
      if(fd!==undefined&&fd!==null)closeSync(fd);
      try{unlinkSync(temp);}catch{}
      throw err;
    }
    pending.set(key,{payload,restored:false});
    return payload;
  };
  const ack=payload=>{
    if(!enabled)return;
    const key=keyOf(payload),record=pending.get(key);
    if(!record || record.payload.resultId!==payload.resultId)return;
    unlinkSync(pathFor(key));
    syncDir();
    pending.delete(key);
  };
  const replayRestored=async()=>{
    if(!enabled||!initialized)return;
    // A live room owns its own retry. Only orphaned pre-restart records are
    // retried here; never concurrently post two different terminal payloads.
    for(const [key,record] of pending){
      if(!record.restored||inflight.has(key))continue;
      inflight.add(key);
      try{
        const reply=await report(record.payload);
        if(!reply.settled)throw Error('Terminal settlement not confirmed');
        ack(record.payload);
      }catch(err){
        // Keep the byte-identical terminal payload on disk.
        console.warn('[Game 3D Authority] pending durable terminal result',key,err?.message);
      }finally{inflight.delete(key);}
    }
  };
  return {enabled,initialize,hasPending,hasPendingDuel,stage,ack,replayRestored,
    pendingCount:()=>pending.size};
}
