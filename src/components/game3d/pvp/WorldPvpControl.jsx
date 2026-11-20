import {useEffect,useRef,useState} from 'react';
import {getPlayerPosition,subscribePlayerPosition} from '../playerPositionStore';
import {resolveWorldPvpZone,WORLD_PVP_MODE,WORLD_PVP_ZONE} from './WorldPvpRules.mjs';
import './WorldPvpControl.css';

const MODE_REQUEST='game3dWorldPvpFlagRequested';
const MODE_CONFIRMED='game3dWorldPvpFlagCommitted';

// User preference UI, not a damage authority. A verified world server must
// acknowledge the request before this screen calls the PvP flag "active".
export default function WorldPvpControl({region='wolfveil',suppressed=false}){
  const [zone,setZone]=useState(()=>resolveWorldPvpZone({
    region,position:getPlayerPosition(),
  }));
  const [requested,setRequested]=useState(WORLD_PVP_MODE.PVE);
  const [confirmed,setConfirmed]=useState(WORLD_PVP_MODE.PVE);
  const previousZone=useRef(null);
  useEffect(()=>subscribePlayerPosition(position=>{
    const next=resolveWorldPvpZone({region,position});
    setZone(before=>before.id===next.id?before:next);
  }),[region]);
  useEffect(()=>{
    if(previousZone.current&&previousZone.current!==zone.id){
      window.dispatchEvent(new CustomEvent('game3dLocalWorldNotice',{detail:{
        message:zone.kind===WORLD_PVP_ZONE.SAFE
          ?zone.label+' — all players protected'
          :zone.label+' — PvP requires both players to opt in',
      }}));
    }
    previousZone.current=zone.id;
  },[zone]);
  useEffect(()=>{
    const onCommit=event=>{
      const data=event?.detail;
      // Presentation only. The server must enforce flag and zone itself.
      if(data?.verified!==true||![WORLD_PVP_MODE.PVE,WORLD_PVP_MODE.PVP].includes(data.mode))return;
      setConfirmed(data.mode);
      setRequested(data.mode);
    };
    window.addEventListener(MODE_CONFIRMED,onCommit);
    return ()=>window.removeEventListener(MODE_CONFIRMED,onCommit);
  },[]);
  const request=mode=>{
    if(mode===requested)return;
    setRequested(mode);
    window.dispatchEvent(new CustomEvent(MODE_REQUEST,{detail:{mode}}));
    window.dispatchEvent(new CustomEvent('game3dLocalWorldNotice',{detail:{
      message:mode===WORLD_PVP_MODE.PVP
        ?'PvP requested. Waiting for the world server to authorize combat.'
        :'PvE requested. Waiting for the world server to confirm protection.',
    }}));
  };
  if(suppressed)return null;
  const pending=requested!==confirmed;
  const safeZone=zone.kind===WORLD_PVP_ZONE.SAFE;
  return <section className="game3d-pvp-control" aria-label="World player combat preference">
    <div className="game3d-pvp-control-title">WORLD COMBAT <span>{safeZone?'SAFE ZONE':'OPT-IN ZONE'}</span></div>
    <div className="game3d-pvp-control-switch" role="group" aria-label="PvE or PvP preference">
      <button type="button" aria-pressed={requested==='pve'} onClick={()=>request('pve')}
        className={requested==='pve'?'is-selected':''}>PvE</button>
      <button type="button" aria-pressed={requested==='pvp'} onClick={()=>request('pvp')}
        className={requested==='pvp'?'is-selected is-danger':''}>PvP</button>
    </div>
    <p>{safeZone?'Players cannot damage each other here.':
      pending?'Awaiting server confirmation — PvP not authorized.':
      confirmed==='pvp'?'PvP opt-in · server confirmed':'PvE protected · no open-world PvP'}</p>
    <small>{zone.label}</small>
  </section>;
}
