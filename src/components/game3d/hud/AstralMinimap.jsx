// Live player-following Moonfall radar. All twelve pads and seventeen bridges come from collision authority.
import {useEffect,useState} from 'react';
import {getPlayerPosition,subscribePlayerPosition} from '../playerPositionStore';
import {getLunarCaveMapEnemies,subscribeLunarCaveMapEnemies} from '../dungeons/LunarCaveMapStore.mjs';
import {ASTRAL_PADS,ASTRAL_BRIDGES,ASTRAL_PAD_RADIUS,ASTRAL_BRIDGE_HALF_WIDTH} from '../dungeons/AstralDungeonLayout.mjs';

const SCALE=2.5;
export default function AstralMinimap(){
  const [pos,setPos]=useState(getPlayerPosition);
  const [enemies,setEnemies]=useState(getLunarCaveMapEnemies);
  useEffect(()=>{
    let last=0;
    return subscribePlayerPosition(next=>{
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(last&&now-last<100)return;last=now;setPos(next);
    });
  },[]);
  useEffect(()=>subscribeLunarCaveMapEnemies(setEnemies),[]);
  const px=x=>(x-(pos.x||0))*SCALE;
  const py=z=>((pos.z||0)-z)*SCALE;
  const nearby=enemies.filter(e=>Math.hypot(e.x-pos.x,e.z-pos.z)<=42);
  return <svg className="jade-dungeon-radar" viewBox="-100 -100 200 200"
    preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={'Moonfall Expanse minimap. '+nearby.length+' nearby monsters.'}>
    <defs><clipPath id="axe-moonfall-radar-clip"><circle r="88"/></clipPath></defs>
    <g clipPath="url(#axe-moonfall-radar-clip)">
      <circle r="100" fill="#050b25"/>
      {ASTRAL_BRIDGES.map(b=><line key={b.id} x1={px(b.ax)} y1={py(b.az)}
        x2={px(b.bx)} y2={py(b.bz)}
        stroke="#8594c6" strokeWidth={ASTRAL_BRIDGE_HALF_WIDTH*2*SCALE}
        strokeLinecap="round"/>)}
      {ASTRAL_PADS.map(p=><g key={p.id}>
        <circle cx={px(p.x)} cy={py(p.z)} r={ASTRAL_PAD_RADIUS*SCALE}
          fill="#435474" stroke="#d6b97a" strokeWidth="3"/>
        <circle cx={px(p.x)} cy={py(p.z)} r={(ASTRAL_PAD_RADIUS-4)*SCALE}
          fill="none" stroke="#89c6ff" strokeWidth="1"/>
        <text x={px(p.x)} y={py(p.z)+4} fontSize="12" textAnchor="middle"
          fill="#dfeaff">{p.index}</text>
      </g>)}
      {nearby.map(enemy=><circle key={enemy.id} cx={px(enemy.x)} cy={py(enemy.z)}
        r="4.6" fill="#ff6969" stroke="#3d1324" strokeWidth="1.5"/>)}
    </g>
    <path d="M0 -12 L8 10 L0 5 L-8 10 Z"
      transform={'rotate('+((pos.yaw||0)*180/Math.PI)+')'}
      fill="#eaf6ff" stroke="#4dbdff" strokeWidth="2"/>
    <circle r="88" fill="none" stroke="#96b6e4" strokeOpacity=".7" strokeWidth="1.6"/>
    <text x="0" y="97" fontSize="10" fontWeight="bold" textAnchor="middle" fill="#e1e7ff">MOONFALL</text>
  </svg>;
}
