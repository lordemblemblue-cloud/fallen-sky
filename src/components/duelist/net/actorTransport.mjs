// Native Base44 realtime transport for the existing Duelist wire protocol.
import { DEFAULT_PUBLIC_ROOMS, PROTOCOL } from './protocol.mjs';
export const ACTOR_TRANSPORT = 'base44:duelist';
const actorClient=async()=> (await import('../../../api/base44Client.js')).base44;
export async function actorLobby(){
  try{
    const base44=await actorClient();
    const result=await Promise.all(DEFAULT_PUBLIC_ROOMS.map(async room=>{
      const value=await base44.actors.DuelistArena(room.id).status({});
      return value?.protocol===PROTOCOL&&value.room?.id===room.id&&value.room?.mode===room.mode?value.room:null;
    }));
    return result.every(Boolean)?result:null;
  }catch{return null;}
}
export function createActorSocket({mode,matchId}){
  let conn=null,sub=null,closed=false,timeout=null;
  const socket={readyState:0,onopen:null,onmessage:null,onclose:null,onerror:null,
    send(raw){
      if(closed||socket.readyState!==1)return;
      try{const msg=JSON.parse(raw);if(msg.t==='hello')delete msg.token;conn?.send(msg);}catch{/* malformed local message */}
    },
    close(){if(closed)return;closed=true;socket.readyState=3;globalThis.clearTimeout(timeout);sub?.unsubscribe();conn?.close();}
  };
  const fail=()=>{if(closed)return;socket.close();socket.onclose?.({code:1006});};
  timeout=globalThis.setTimeout(fail,12000);
  (async()=>{
    try{
      const base44=await actorClient();
      const room=matchId?DEFAULT_PUBLIC_ROOMS.find(r=>r.id===matchId&&r.mode===mode):
        DEFAULT_PUBLIC_ROOMS.find(r=>r.mode===mode)||DEFAULT_PUBLIC_ROOMS.find(r=>r.mode==='tdm');
      if(closed)return;
      if(!room||mode==='story'){fail();return;}
      conn=base44.actors.DuelistArena(room.id).connect({id:globalThis.crypto.randomUUID()});
      sub=conn.subscribe(msg=>{
        if(closed)return;
        if(msg?.t==='actorReady'){globalThis.clearTimeout(timeout);socket.readyState=1;socket.onopen?.();return;}
        socket.onmessage?.({data:JSON.stringify(msg)});
      });
    }catch{fail();}
  })();
  return socket;
}

