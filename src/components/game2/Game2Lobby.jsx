import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { LocalSignaling, makePeerId, pickArena, MAX_PLAYERS } from './net/signaling.js';
import { game2RailwayStatus } from './net/railway.js';
import Game2ServerBrowser from './Game2ServerBrowser';

let icePromise = null;
export function getIceServers() { // same helper as the voice chat: STUN, plus TURN when the backend has one configured
  if (!icePromise) icePromise = base44.functions.invoke('getIceServers', {}).then(r => r?.data?.iceServers || r?.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]).catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
  return icePromise;
}


export default function Game2Lobby({onBack,onStart,onPractice,initialHost=false}) {
  const local=useMemo(()=>['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('g2net')==='local',[]);
  const [user,setUser]=useState(null),[status,setStatus]=useState(null),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false);
  useEffect(()=>{let off=false;if(local){setUser({id:'local'+Math.random().toString(36).slice(2,6),full_name:'Jedi'});return;}base44.auth.me().then(u=>{if(!off)setUser(u);}).catch(()=>{});return()=>{off=true;};},[local]);
  const sig=useMemo(()=>local&&user?new LocalSignaling(makePeerId(user.id)):null,[local,user]);
  useEffect(()=>()=>sig?.close(),[sig]);
  const refresh=useCallback(async(signal)=>{
    setRefreshing(true);
    try {
      let next;
      if(local){const room=sig?pickArena(await sig.listRooms()):null;next={ready:true,rooms:false,max_players:MAX_PLAYERS,players:room?.players||0};}
      else next=await game2RailwayStatus();
      if(!signal?.aborted){setStatus(next);setError('');}
    }catch(e){if(!signal?.aborted)setError('Could not refresh the server list. '+String(e?.message||e));}
    finally{if(!signal?.aborted)setRefreshing(false);}
  },[sig,local]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);const id=setInterval(()=>void refresh(controller.signal),5000);return()=>{controller.abort();clearInterval(id);};},[refresh]);
  const enter=(server,createServer)=>{
    if(!user||error)return;
    let name;try{name=localStorage.getItem('atomxe.game2.callsign');}catch{/* private browsing */}
    onStart({name:name||user.full_name?.split(' ')[0]||'Jedi',side:'light',ai:0,selfId:makePeerId(user.id),local,
      mapId:server.mapId,serverId:createServer?undefined:server.id,serverName:server.name,matchMode:server.matchMode,maxPlayers:server.maxPlayers,createServer});
  };
  return <Game2ServerBrowser initialHost={initialHost} status={status} error={error} refreshing={refreshing} signedIn={!!user} onBack={onBack} onRefresh={()=>void refresh()} onJoin={server=>enter(server)} onCreate={settings=>enter(settings,settings)} onSignIn={()=>base44.auth.redirectToLogin(window.location.href)} onPractice={onPractice}/>;
}
