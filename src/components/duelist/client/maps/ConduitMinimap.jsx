import {useEffect,useMemo,useState} from 'react';
import {buildConduitMinimap,CONDUIT_TIERS,CONDUIT_TIER_NAMES,selectConduitTier,conduitMinimapMarkers,conduitPickupStatus} from './conduitMinimap.mjs';
import './conduitMinimap.css';

const EMPTY=[];
const COLORS={self:'#f8fafc',ally:'#63a6ef',enemy:'#f07976'};
const SHORT={armory:'ARM',reactor:'REACT',medbay:'MED',barracks:'BARR'};
function MapMarker({m}){
  const color=COLORS[m.kind];
  return <g transform={`translate(${m.x} ${m.z})`} aria-label={m.kind+(m.relative>0?' above':m.relative<0?' below':'')}>
    {m.kind==='self'?<path d="M0 -2.8 L1.8 1.8 L0 .8 L-1.8 1.8 Z" fill={color} stroke="#10151a" strokeWidth=".55" transform={`rotate(${m.heading*180/Math.PI})`}/>:
      <circle r="1.55" fill={m.relative? '#1c242d':color} stroke={color} strokeWidth=".6"/>}
    {m.relative!==0&&<path d={m.relative>0?'M-1.1 -3 L0 -4.1 L1.1 -3':'M-1.1 3 L0 4.1 L1.1 3'} fill="none" stroke={color} strokeWidth=".7"/>}
  </g>;
}
// Standalone mount for the approved future Conduit HUD. This component does
// not read the simulation, subscribe to raw opponents, or register a map.
export function ConduitMinimap({arena,self,actors=EMPTY,localTeam,pickupStates,certifiedVentRoutes=EMPTY}){
  const [autoTier,setAutoTier]=useState(()=>selectConduitTier(self));
  const [manual,setManual]=useState(null);
  useEffect(()=>{setAutoTier(prev=>selectConduitTier(self,prev));},[self?.x,self?.y,self?.z,self?.grounded,self?.supportTier]);
  const model=useMemo(()=>arena?buildConduitMinimap(arena,{certifiedVentRoutes}):null,[arena,certifiedVentRoutes]);
  const tier=manual??autoTier;
  if(!model)return null;
  const layer=model.levels[tier],extent=model.radius+4;
  const markers=conduitMinimapMarkers({self:self?{...self,supportTier:autoTier}:null,actors,tier,localTeam})
    .filter(m=>Math.hypot(m.x,m.z)<=model.radius+2);
  return <section className="conduit-minimap" aria-label="The Conduit minimap">
    <div className="conduit-minimap-head"><span>CONDUIT</span><span>{CONDUIT_TIER_NAMES[tier]}</span></div>
    <svg className="conduit-minimap-map" viewBox={`${-extent} ${-extent} ${extent*2} ${extent*2}`} role="img" aria-label={CONDUIT_TIER_NAMES[tier]+' map, north up'}>
      <circle r={model.radius} fill="#151b22" stroke="#525b65" strokeWidth=".5"/>
      {layer.floors.map((f,i)=><path key={f.id+i} d={f.path} fill="#424b56" fillRule="evenodd" stroke="#69737e" strokeWidth=".22"/>)}
      {layer.vents.map(v=><polyline key={v.id} points={v.points.map(p=>p.join(',')).join(' ')} stroke="#79c2a0" strokeWidth="1.5" strokeDasharray="2 1" fill="none"/>)}
      {layer.stairs.map((s,i)=><g key={s.id+i} transform={`translate(${s.x} ${s.z}) rotate(${s.angle})`}>
        <rect x="-1.6" y="-2.1" width="3.2" height="4.2" rx=".25" fill="#242a31" stroke="#d7b579" strokeWidth=".45"/>
        <path d="M-1.2 -1.2 H1.2 M-1.2 0 H1.2 M-1.2 1.2 H1.2" stroke="#d7b579" strokeWidth=".45"/>
      </g>)}
      {layer.buildings.map(b=><text key={b.id} x={b.x} y={b.z-3.2} fill="#e3e8ed" stroke="#1a2028" strokeWidth=".55" paintOrder="stroke" textAnchor="middle" fontSize="2.8">{SHORT[b.id]??b.label}</text>)}
      {layer.pads.map(p=><g key={p.id} transform={`translate(${p.x} ${p.z})`}><circle r="2" fill="#20343c" stroke="#71cbd6" strokeWidth=".6"/><path d="M-1 .4 L0 -1 L1 .4" stroke="#71cbd6" fill="none" strokeWidth=".55"/></g>)}
      {layer.pickups.map(p=>{const s=conduitPickupStatus(p.id,pickupStates);return <g key={p.id} transform={`translate(${p.x} ${p.z})`}>
        <path d="M0 -1.8 L1.8 0 L0 1.8 L-1.8 0 Z" fill={s.available===true?'#d6b36a':'#242a31'} stroke="#d6b36a" strokeWidth=".55" opacity={s.available===false?.6:1}/>
        {s.seconds!==null&&<text x="0" y="4" textAnchor="middle" fontSize="2.9" fill="#f0dfbf">{s.seconds}s</text>}
      </g>;})}
      {markers.map(m=><MapMarker key={m.id} m={m}/>)}
      <text x="0" y={-extent+3} fill="#b6c0cb" textAnchor="middle" fontSize="2.8">N</text>
    </svg>
    <div className="conduit-minimap-controls" role="group" aria-label="Minimap level">
      <button type="button" aria-pressed={manual===null} onClick={()=>setManual(null)}>AUTO</button>
      {[...CONDUIT_TIERS].reverse().map(t=><button type="button" key={t} aria-label={CONDUIT_TIER_NAMES[t]} aria-pressed={manual===t} onClick={()=>setManual(t)}>{t}</button>)}
    </div>
    <div className="conduit-minimap-key"><span>◇ Pickup</span><span>⇧ / ⇩ Other floor</span></div>
  </section>;
}
