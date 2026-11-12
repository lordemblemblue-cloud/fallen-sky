// Player-following, north-up radar for the *actual* Lunar Cave route.
// Shares room and corridor geometry with cave collision and the full map.
import {useEffect,useState} from 'react';
import {getPlayerPosition,subscribePlayerPosition} from '../playerPositionStore';
import {getLunarCaveMapEnemies,subscribeLunarCaveMapEnemies} from '../dungeons/LunarCaveMapStore.mjs';
import {
  LUNAR_CAVE_CHAMBERS,LUNAR_CAVE_PASSAGES,LUNAR_CAVE_WATER_END,
  LUNAR_CAVE_PASSAGE_HALF_WIDTH,LUNAR_CAVE_ROOM_RADIUS,
} from '../dungeons/LunarCaveLayout.mjs';

const SCALE=2.1;
export default function LunarCaveMinimap(){
  const [position,setPosition]=useState(getPlayerPosition);
  const [enemies,setEnemies]=useState(getLunarCaveMapEnemies);
  useEffect(()=>{
    let last=0;
    return subscribePlayerPosition(next=>{
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(last && now-last<110)return;
      last=now;setPosition(next);
    });
  },[]);
  useEffect(()=>subscribeLunarCaveMapEnemies(setEnemies),[]);
  const tx=x=>(x-(Number(position.x)||0))*SCALE;
  const ty=z=>((Number(position.z)||0)-z)*SCALE;
  const rooms=[...LUNAR_CAVE_CHAMBERS,LUNAR_CAVE_WATER_END];
  const nearby=enemies.filter(e=>Math.hypot(e.x-position.x,e.z-position.z)<=46);
  return <svg className="jade-dungeon-radar" viewBox="-100 -100 200 200"
    preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={`Lunar Cave minimap. ${nearby.length} nearby monsters. Player centered; north up.`}>
    <defs><clipPath id="jade-dungeon-radar-clip"><circle r="88"/></clipPath></defs>
    <g clipPath="url(#jade-dungeon-radar-clip)">
      <circle r="100" fill="#061522"/>
      {rooms.map((c,i)=><circle key={'wall'+i} cx={tx(c.x)} cy={ty(c.z)}
        r={(LUNAR_CAVE_ROOM_RADIUS+2.5)*SCALE} fill="#778fa3" />)}
      {LUNAR_CAVE_PASSAGES.map((p,i)=><line key={'outer'+i}
        x1={tx(p.ax)} y1={ty(p.az)} x2={tx(p.bx)} y2={ty(p.bz)}
        stroke="#778fa3" strokeWidth={(LUNAR_CAVE_PASSAGE_HALF_WIDTH+2.5)*2*SCALE}
        strokeLinecap="round" strokeLinejoin="round"/>)}
      {rooms.map((c,i)=><circle key={'room'+i} cx={tx(c.x)} cy={ty(c.z)}
        r={LUNAR_CAVE_ROOM_RADIUS*SCALE} fill="#1c3444" />)}
      {LUNAR_CAVE_PASSAGES.map((p,i)=><line key={'path'+i}
        x1={tx(p.ax)} y1={ty(p.az)} x2={tx(p.bx)} y2={ty(p.bz)}
        stroke="#1c3444" strokeWidth={LUNAR_CAVE_PASSAGE_HALF_WIDTH*2*SCALE}
        strokeLinecap="round" strokeLinejoin="round"/>)}
      {LUNAR_CAVE_CHAMBERS.map(c=><text key={c.id} x={tx(c.x)} y={ty(c.z)-9}
        fill="#a2bfce" fontSize="10" textAnchor="middle">{c.index}</text>)}
      {nearby.map(enemy=><circle key={enemy.id} cx={tx(enemy.x)} cy={ty(enemy.z)}
        r={enemy.tier==='boss'?6:4.4} fill="#fb6868" stroke="#4f1825" strokeWidth="1.5"/>)}
    </g>
    <path d="M0 -11 L8 10 L0 5 L-8 10 Z"
      transform={`rotate(${(Number(position.yaw)||0)*180/Math.PI})`}
      fill="#e8faff" stroke="#38bcff" strokeWidth="2.5"/>
    <circle r="88" fill="none" stroke="#a4cee2" strokeOpacity=".47" strokeWidth="1.5"/>
    <text x="0" y="97" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#c4ebf9">LUNAR CAVE</text>
  </svg>;
}
