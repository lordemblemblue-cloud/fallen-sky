// Player-centred, north-up minimap for Classic Wolfveil. The underlay is the
// real terrain (rendered from the shared height + surface functions by
// scripts/render-wolfveil-map.mjs); roads, river, fighting grounds, mob areas
// and landmarks are drawn from the same data the world is built from.
import {useEffect,useState} from 'react';
import {getPlayerPosition,subscribePlayerPosition} from '../playerPositionStore';
import {
  WOLFVEIL_MAP_WORLD_BOUNDS as BOUNDS,WOLFVEIL_MAP_UNDERLAY,WOLFVEIL_MAP_ROADS,
  WOLFVEIL_MAP_RIVER,WOLFVEIL_MAP_BRIDGES,WOLFVEIL_MAP_FIGHTING_GROUNDS,
  WOLFVEIL_MAP_MOB_AREAS,WOLFVEIL_MAP_LANDMARKS,WOLFVEIL_MAP_SAFE_ZONES,wolfveilMapZoneAt,
} from '../wolfveil/WolfveilMapDesign.mjs';

// Radar units per metre: the 88-unit radar radius shows ~140 m around you.
export const WOLFVEIL_MINIMAP_SCALE=.63;
const REACH=88/WOLFVEIL_MINIMAP_SCALE;
const ZONE_COLORS={safe:'#9be3a4',fighting:'#ffd58a',mob:'#ff9d92',mountain:'#dfe7ec',open:'#cfe2ea'};

export default function WolfveilMinimap(){
  const [position,setPosition]=useState(getPlayerPosition);
  useEffect(()=>{
    let last=0;
    return subscribePlayerPosition(next=>{
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(last&&now-last<110)return;
      last=now;setPosition(next);
    });
  },[]);
  const S=WOLFVEIL_MINIMAP_SCALE;
  const px=Number(position?.x)||0,pz=Number(position?.z)||0;
  const tx=x=>(x-px)*S,ty=z=>(pz-z)*S;
  const line=points=>points.map(([x,z])=>tx(x).toFixed(1)+','+ty(z).toFixed(1)).join(' ');
  const near=(x,z,r=0)=>Math.hypot(x-px,z-pz)<=REACH+r;
  const zone=wolfveilMapZoneAt(px,pz);
  const mobs=WOLFVEIL_MAP_MOB_AREAS.filter(m=>near(m.x,m.z,m.radius));
  const fields=WOLFVEIL_MAP_FIGHTING_GROUNDS.filter(f=>near(f.x,f.z,f.radius));
  return <svg className="jade-dungeon-radar jade-wolfveil-radar" viewBox="-100 -100 200 200"
    preserveAspectRatio="xMidYMid meet" role="img" data-testid="game3d-wolfveil-minimap"
    aria-label={`Wolfveil minimap. ${zone.name}. ${mobs.length} mob areas nearby. Player centred; north up.`}>
    <defs><clipPath id="jade-wolfveil-radar-clip"><circle r="88"/></clipPath></defs>
    <g clipPath="url(#jade-wolfveil-radar-clip)">
      <circle r="100" fill="#22311f"/>
      <image href={WOLFVEIL_MAP_UNDERLAY.url} x={tx(BOUNDS.minX)} y={ty(BOUNDS.maxZ)}
        width={(BOUNDS.maxX-BOUNDS.minX)*S} height={(BOUNDS.maxZ-BOUNDS.minZ)*S}
        preserveAspectRatio="none"/>
      {WOLFVEIL_MAP_SAFE_ZONES.filter(z=>near(z.x,z.z,z.radius)).map(z=>
        <circle key={z.id} cx={tx(z.x)} cy={ty(z.z)} r={z.radius*S} fill="#8de29a"
          fillOpacity=".07" stroke="#9be3a4" strokeOpacity=".55" strokeWidth="1" strokeDasharray="3 3"/>)}
      <polyline points={line(WOLFVEIL_MAP_RIVER.points)} fill="none" stroke="#5fb0d6"
        strokeWidth={WOLFVEIL_MAP_RIVER.width*S} strokeLinejoin="round" strokeLinecap="round"/>
      {WOLFVEIL_MAP_ROADS.map(r=><polyline key={r.id} points={line(r.points)} fill="none"
        stroke={r.kind==='frontier'?'#f0d2a6':'#ead6b0'} strokeOpacity=".92"
        strokeWidth={Math.max(1.5,r.width*S*1.25)} strokeDasharray={r.kind==='frontier'?'4 3':undefined}
        strokeLinejoin="round" strokeLinecap="round"/>)}
      {WOLFVEIL_MAP_BRIDGES.map(b=><line key={b.id} x1={tx(b.from[0])} y1={ty(b.from[1])}
        x2={tx(b.to[0])} y2={ty(b.to[1])} stroke="#b98a5c" strokeWidth={Math.max(2,b.width*S)}/>)}
      {fields.map(f=><g key={f.id}>
        <circle cx={tx(f.x)} cy={ty(f.z)} r={f.radius*S} fill="#f2c46b" fillOpacity=".14"
          stroke="#f2c46b" strokeWidth="1.6"/>
        <text x={tx(f.x)} y={ty(f.z)+4} fontSize="11" textAnchor="middle" fill="#ffe0a3">⚔</text>
      </g>)}
      {mobs.map(m=><g key={m.id}>
        <circle cx={tx(m.x)} cy={ty(m.z)} r={Math.max(4,m.radius*S)} fill="#e5675f" fillOpacity=".28"
          stroke="#ff8b80" strokeWidth="1.4"/>
        <text x={tx(m.x)} y={ty(m.z)+3} fontSize="7.5" fontWeight="bold" textAnchor="middle"
          fill="#ffe5e1" stroke="#3a1414" strokeWidth="2" paintOrder="stroke">{m.levels[0]}</text>
      </g>)}
      {WOLFVEIL_MAP_LANDMARKS.filter(l=>near(l.x,l.z)).map(l=><circle key={l.id}
        cx={tx(l.x)} cy={ty(l.z)} r="2.4" fill={l.type==='cave'||l.type==='portal'?'#d9c8ff':'#b4e1f2'}
        stroke="#0b1620" strokeWidth=".8"/>)}
    </g>
    <path d="M0 -11 L8 10 L0 5 L-8 10 Z" transform={`rotate(${(Number(position?.yaw)||0)*180/Math.PI})`}
      fill="#e8faff" stroke="#38bcff" strokeWidth="2.5"/>
    <circle r="88" fill="none" stroke="#a4cee2" strokeOpacity=".47" strokeWidth="1.5"/>
    <rect x="-62" y="62" width="124" height="15" rx="7.5" fill="#06131d" fillOpacity=".72"/>
    <text x="0" y="72.5" fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing=".04em"
      fill={ZONE_COLORS[zone.kind]||ZONE_COLORS.open}>{zone.name.toUpperCase()}{zone.levels?' · LV '+zone.levels.join('–'):''}</text>
  </svg>;
}
