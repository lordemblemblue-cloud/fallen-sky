// Skyrim/ESO-like center-top HUD compass: real bearings, cardinal labels,
// POI markers and the active quest direction. Uses the same map and quest
// coordinates as the full map, with silver / pale-blue navigation accents.
import { useEffect, useState } from 'react';
import { getPlayerPosition, subscribePlayerPosition } from '../playerPositionStore';
import { getQuestState, subscribeQuests } from '../useQuestStore';
import { getMapMarkers, getQuestNavigationTarget } from './worldMapData';
import './HUDCompassStrip.css';
import HorizonVisionPanel from './HorizonVisionPanel';

const DIRECTIONS = [
  ['N',0],['NE',45],['E',90],['SE',135],
  ['S',180],['SW',225],['W',270],['NW',315],
];
const FOV = 170;
const circularDelta = (target,player) => ((target-player+540)%360)-180;
export function compassOffset(targetBearing,playerYaw) {
  const delta=circularDelta(targetBearing,playerYaw);
  return Math.abs(delta)>FOV/2?null:delta/FOV*100;
}

export default function HUDCompassStrip({ region='wolfveil' }) {
  const [pos,setPos]=useState(getPlayerPosition);
  const [quests,setQuests]=useState(getQuestState);
  useEffect(()=>subscribeQuests(setQuests),[]);
  useEffect(()=>{
    let last=0;
    return subscribePlayerPosition(p=>{
      const time=typeof performance==='undefined'?0:performance.now();
      if(last&&time-last<110)return;
      last=time;
      setPos(p);
    });
  },[]);
  const yaw=((Number(pos.yaw)||0)*180/Math.PI+360)%360;
  const tracked=getQuestNavigationTarget(region,quests,pos);
  const markers=getMapMarkers(region).filter(m=>m.type==='npc'||
    ((m.type==='cave'||m.type==='portal')&&m.live));
  const compassMarkers=[
    ...markers.map(m=>({...m,tracked:false})),
    ...(tracked?[{...tracked,id:'objective:'+tracked.questId,tracked:true}]:[]),
  ].flatMap(m=>{
    const dx=m.x-pos.x,dz=m.z-pos.z;
    const bearing=(Math.atan2(dx,dz)*180/Math.PI+360)%360;
    const offset=compassOffset(bearing,yaw);
    return offset===null?[]:[{...m,offset,distance:Math.round(Math.hypot(dx,dz))}];
  });
  const ticks=Array.from({length:72},(_,i)=>i*5);
  return <div className="axe-navigation-compass" role="group" aria-label={tracked ? `Navigation compass. Tracked: ${tracked.navLabel}` : "Navigation compass"}>
    <div className="axe-navigation-compass-frame">
      <div className="axe-navigation-compass-ticks" aria-hidden="true">
        {ticks.map(deg=>{
          const offset=compassOffset(deg,yaw);
          return offset===null?null:<span key={deg} className={deg%45===0?'is-major':deg%15===0?'is-medium':''}
            style={{left:(50+offset)+'%'}}/>;
        })}
      </div>
      {DIRECTIONS.map(([label,deg])=>{
        const offset=compassOffset(deg,yaw);
        return offset===null?null:<span key={label}
          className={'axe-navigation-bearing '+(label.length===1?'is-major':'')}
          style={{left:(50+offset)+'%'}}>{label}</span>;
      })}
      {compassMarkers.map(m=><span key={m.id}
        className={'axe-navigation-marker '+(m.tracked?'is-quest':'')}
        title={m.name+' · '+m.distance+' m'} style={{left:(50+m.offset)+'%'}}>
        {m.tracked?'✦':m.type==='npc'?'◇':'⌂'}
      </span>)}
      <div className="axe-navigation-compass-center" aria-hidden="true">▾</div>
    </div>
    <HorizonVisionPanel region={region} />
  </div>;
}
