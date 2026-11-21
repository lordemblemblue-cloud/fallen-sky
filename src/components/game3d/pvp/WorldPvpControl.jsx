import {useEffect,useRef,useState} from 'react';
import {getPlayerPosition,subscribePlayerPosition} from '../playerPositionStore';
import {resolveWorldPvpSceneZone,WORLD_PVP_MODE,WORLD_PVP_ZONE} from './WorldPvpRules.mjs';
import './WorldPvpControl.css';

const MODE_REQUEST='game3dWorldPvpFlagRequested';
const MODE_CONFIRMED='game3dWorldPvpFlagCommitted';

// User preference UI, not a damage authority. A verified world server must
// acknowledge the request before this screen calls the PvP flag "active".
// `area`: the Wolfveil area scene that is loaded; its status holds until the
// player goes through a gate (WorldPvpRules resolveWorldPvpSceneZone).
export default function WorldPvpControl({region='wolfveil',area=null,suppressed=false}){
  const [zone,setZone]=useState(()=>resolveWorldPvpSceneZone({
    region,area,position:getPlayerPosition(),
  }));
  const [requested,setRequested]=useState(WORLD_PVP_MODE.PVE);
  const [confirmed,setConfirmed]=useState(WORLD_PVP_MODE.PVE);
  const previousZone=useRef(null);
  const [weatherBottomPx,setWeatherBottomPx]=useState(null);
  // Weather height varies with the forecast and HUD screen size. Anchor to
  // its measured bottom so World Combat never sits on top of the forecast.
  // A late-mounted weather HUD is discovered once, not polled every frame.
  useEffect(()=>{
    if(suppressed){setWeatherBottomPx(null);return undefined;}
    let weather=null,resizeObserver=null,mutationObserver=null;
    const measure=()=>{
      if(!weather?.isConnected)return;
      const bottom=Math.ceil(weather.getBoundingClientRect().bottom)+10;
      setWeatherBottomPx(previous=>previous===bottom?previous:bottom);
    };
    const attach=()=>{
      if(weather?.isConnected)return;
      const found=document.querySelector('.game3d-view .game3d-world-weather');
      if(!found)return;
      weather=found;
      mutationObserver?.disconnect();
      mutationObserver=null;
      measure();
      if(typeof ResizeObserver!=='undefined'){
        resizeObserver=new ResizeObserver(measure);
        resizeObserver.observe(weather);
      }
    };
    attach();
    if(!weather && typeof MutationObserver!=='undefined'){
      const root=document.querySelector('.game3d-view') || document.body;
      mutationObserver=new MutationObserver(attach);
      mutationObserver.observe(root,{childList:true,subtree:true});
    }
    window.addEventListener('resize',measure);
    return ()=>{
      window.removeEventListener('resize',measure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  },[region,suppressed]);
  useEffect(()=>subscribePlayerPosition(position=>{
    const next=resolveWorldPvpSceneZone({region,area,position});
    setZone(before=>before.id===next.id?before:next);
  }),[region,area]);
  // Keep zone text current when changing streamed regions without walking.
  useEffect(()=>{
    const next=resolveWorldPvpSceneZone({region,area,position:getPlayerPosition()});
    setZone(before=>before.id===next.id?before:next);
  },[region,area]);
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
  useEffect(()=>{
    if(requested===confirmed)return undefined;
    // Fail closed when no verified world-server acknowledgement arrives.
    const timeout=window.setTimeout(()=>{
      setRequested(confirmed);
      window.dispatchEvent(new CustomEvent('game3dLocalWorldNotice',{detail:{
        message:'Open-world PvP is unavailable until the trusted world server is connected.',
      }}));
    },6000);
    return ()=>window.clearTimeout(timeout);
  },[requested,confirmed]);
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
  const wantsPvp=requested===WORLD_PVP_MODE.PVP;
  const effectivePvp=!safeZone && !pending && confirmed===WORLD_PVP_MODE.PVP;
  const toggleTitle=safeZone
    ? 'Safe Zone: players cannot damage each other here, even with PvP preference enabled.'
    : pending ? 'Waiting for the world server to confirm the requested PvP preference.'
      : 'PvP combat requires both players to opt in and world-server authorization.';
  return <section className="game3d-pvp-control" data-safe-zone={safeZone}
    style={weatherBottomPx == null ? undefined : {'--axe-weather-bottom-px': weatherBottomPx+'px'}}
    aria-label="World combat and safe zone status">
    <div className="game3d-pvp-control-title">
      <span>WORLD COMBAT</span>
      <strong role="status">{safeZone?'SAFE ZONE':'OPT-IN ZONE'}</strong>
    </div>
    <div className="game3d-pvp-control-row">
      <span className="game3d-pvp-control-hint" title={zone.label}>
        {safeZone?'Combat protected':pending?'Awaiting server':effectivePvp?'PvP authorized':'Mutual opt-in'}
      </span>
      <button type="button" className="game3d-pvp-control-toggle"
        role="switch" aria-label="PvP preference" aria-checked={wantsPvp}
        aria-describedby="game3d-pvp-zone-note"
        data-pending={pending} data-requested={requested} disabled={pending}
        title={toggleTitle}
        onClick={()=>request(wantsPvp?WORLD_PVP_MODE.PVE:WORLD_PVP_MODE.PVP)}>
        <span>PvP</span>
        <span className="game3d-pvp-control-track" aria-hidden="true"><i /></span>
        <span className="game3d-pvp-control-state">{pending?'…':wantsPvp?'ON':'OFF'}</span>
      </button>
    </div>
    <span id="game3d-pvp-zone-note" className="game3d-pvp-control-sr-only">
      {safeZone?'Safe Zone. Player damage is always disabled here.':
        'Optional world combat. Both players must opt in, and the server must authorize damage.'}
      {pending?' The PvP preference change is pending server confirmation.':''}
    </span>
  </section>;
}
