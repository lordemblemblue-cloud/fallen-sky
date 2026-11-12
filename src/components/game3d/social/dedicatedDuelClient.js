import { callGameServer } from './socialServer';

// Opt-in transport adapter for 3.1. NO automatic DuelSystem hook yet.
// Switching live combat to this transport also requires a single authoritative
// handoff of DuelSession HP/shield, persistent outcome commits, verified
// equipment and server-owned world collision. Never run BOTH hit paths.
export async function connectDedicatedDuelPreview(duelId, handlers = {}) {
  const issued=await callGameServer('game3dCombatTicket','ticket',{duelId});
  if(!issued?.success||issued?.protocol!==1||!issued?.ticket||
      typeof issued.webSocketUrl!=='string')
    throw Error('Dedicated duel admission unavailable');
  const url=new URL(issued.webSocketUrl);
  if(url.protocol!=='wss:' && !(url.protocol==='ws:' &&
    ['localhost','127.0.0.1'].includes(url.hostname)))
    throw Error('Unsafe dedicated duel URL');
  const socket=new WebSocket(url.href);
  let connected=false,closed=false,inputSeq=0,intentSeq=0;
  const pending=new Map();
  socket.addEventListener('open',()=>{
    if(!closed)socket.send(JSON.stringify({
      t:'hello',protocol:1,ticket:issued.ticket,
    }));
  });
  socket.addEventListener('message',event=>{
    let packet;
    try{packet=JSON.parse(event.data);}catch{return;}
    if(packet.t==='welcome'){
      connected=true;
      const player=packet.snapshot?.players?.find(p=>p.id===packet.playerId);
      // On reconnect the worker may restore the last accepted actor-intent
      // counter from a signed checkpoint. Do not start again at sequence 1.
      intentSeq=Math.max(intentSeq,Number(player?.lastIntentSeq)||0);
    }
    if((packet.t==='command_result'||packet.t==='rejected')&&packet.intentId){
      const cb=pending.get(packet.intentId);
      pending.delete(packet.intentId);
      cb?.(packet);
    }
    handlers.onMessage?.(packet);
    if(packet.t==='snapshot'||packet.t==='welcome')handlers.onSnapshot?.(
      packet.snapshot||packet,
    );
    if(packet.t==='events')handlers.onEvents?.(packet.events||[]);
  });
  socket.addEventListener('close',()=>{
    connected=false;closed=true;
    for(const callback of pending.values())callback({ok:false,reason:'disconnected'});
    pending.clear();
    handlers.onClose?.();
  });
  const send=packet=>{
    if(!connected||socket.readyState!==WebSocket.OPEN)return false;
    socket.send(JSON.stringify(packet));return true;
  };
  return {
    socket,
    setMovement:({x=0,z=0,facing=0})=>send({
      t:'input',seq:++inputSeq,x,z,facing,
    }),
    sendCommand:(action,fields={})=>{
      // Never consume a command counter while disconnected. On reconnect,
      // the next accepted counter is restored from the server snapshot.
      if(!connected||socket.readyState!==WebSocket.OPEN)
        return Promise.resolve({ok:false,reason:'not_connected'});
      const intentId='axehi'+Date.now().toString(36)+
        '_'+Math.random().toString(36).slice(2,14);
      const nextSeq=intentSeq+1;
      const intent={...fields,intentId,intentSeq:nextSeq,action};
      return new Promise(resolve=>{
        pending.set(intentId,resolve);
        if(send({t:'command',command:intent})){
          intentSeq=nextSeq;
        }else{
          pending.delete(intentId);
          resolve({ok:false,reason:'not_connected'});
        }
      });
    },
    requestEvents:afterSeq=>send({t:'events',afterSeq}),
    close:()=>{
      closed=true;
      if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({t:'leave'}));
      socket.close();
    },
  };
}

// Optional 4.0 read-only journal fallback for connection loss or debugging.
// This does NOT submit combat, mutate the duel, or replace live WebSocket ticks.
export async function readCommittedDedicatedDuel(duelId){
  const response=await callGameServer('game3dCombatRead','read',{duelId});
  if(!response?.success||response?.authoritative!==true||
     response?.source!=='postgres-journal' ||
     response?.snapshot?.matchId!==duelId ||
     !Number.isSafeInteger(response.reportSequence))
    throw Error('Authoritative committed duel state unavailable');
  // An optional lifecycle must match the exact committed read envelope.
  if(response.lifecycle){
    const c=response.lifecycle;
    if(!c.ok||c.duelId!==duelId||c.epoch!==response.authorityEpoch||
       c.reportSequence!==response.reportSequence||
       c.simulationSequence!==response.simulationSequence||
       c.finished!==(response.settled===true)||
       c.rewardsEligible!==false||c.rewardsIssued!==false)
      throw Error('Invalid committed duel lifecycle response');
  }
  return response;
}

// 4.4: account-scoped history is read from the PostgreSQL archive via
// authenticated Base44. Never sends userId, awards items, or changes duels.
export async function listArchivedDedicatedDuels(limit=10){
  const result=await callGameServer('game3dCombatHistory','list',{limit});
  if(!result?.success||result.source!=='postgres-archive'||
     result.rewardPayoutsEnabled!==false||
     !Array.isArray(result.history))
    throw Error('Trusted duel archive history unavailable');
  return result.history;
}
