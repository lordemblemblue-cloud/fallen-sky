// World-map (M) layers for Classic Wolfveil, in the overlay's 0..1000 map
// space. Same data as the minimap and the terrain: real terrain underlay,
// river, roads, Hunter's Loop, fighting grounds, mob areas, ranges, summits.
import {
  WOLFVEIL_MAP_UNDERLAY,WOLFVEIL_MAP_ROADS,WOLFVEIL_MAP_RIVER,WOLFVEIL_MAP_BRIDGES,
  WOLFVEIL_MAP_FIGHTING_GROUNDS,WOLFVEIL_MAP_MOB_AREAS,WOLFVEIL_MAP_SAFE_ZONES,
  WOLFVEIL_MAP_SUMMITS,WOLFVEIL_MAP_WORLD_BOUNDS as B,projectWolfveilMap,
} from '../wolfveil/WolfveilMapDesign.mjs';

const M=1000/(B.maxX-B.minX);
const P=(x,z)=>projectWolfveilMap(x,z,1000);
const line=points=>points.map(([x,z])=>{const p=P(x,z);return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
const RANGE_LABELS=[['Wolf-Ear Range',0,630],['Cedar Spine',-505,160],['Highfall Range',500,210],['Southern Downs',-120,-380]];

export default function WolfveilWorldMapLayers({zoom=1,flags={},onSelect}){
  const textScale=1/Math.sqrt(zoom);
  const label=(key,x,y,text,size,fill)=><text key={key} x={x} y={y} fontSize={size*textScale}
    textAnchor="middle" fill={fill} stroke="#142c40" strokeWidth={4*textScale} paintOrder="stroke">{text}</text>;
  return <g aria-label="Wolfveil terrain, roads, river, fighting grounds and mob areas">
    <image href={WOLFVEIL_MAP_UNDERLAY.url} x="0" y="0" width="1000" height="1000" preserveAspectRatio="none"/>
    {WOLFVEIL_MAP_SAFE_ZONES.map(z=>{const p=P(z.x,z.z);return <circle key={z.id} cx={p.x} cy={p.y}
      r={z.radius*M} fill="#7fd18a" fillOpacity=".08" stroke="#7fd18a" strokeOpacity=".7"
      strokeWidth="2" strokeDasharray="6 6"/>;})}
    <polyline points={line(WOLFVEIL_MAP_RIVER.points)} fill="none" stroke="#6fb7d8"
      strokeWidth={WOLFVEIL_MAP_RIVER.width*M} strokeLinejoin="round" strokeLinecap="round"/>
    {WOLFVEIL_MAP_ROADS.map(r=><polyline key={r.id} points={line(r.points)} fill="none"
      stroke={r.kind==='frontier'?'#e9c9a0':'#dbcaa8'} strokeOpacity=".9"
      strokeWidth={Math.max(2,r.width*M*1.4)} strokeDasharray={r.kind==='frontier'?'9 6':undefined}
      strokeLinejoin="round" strokeLinecap="round"><title>{r.name}</title></polyline>)}
    {WOLFVEIL_MAP_BRIDGES.map(b=>{const a=P(...b.from),c=P(...b.to);
      return <line key={b.id} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke="#a37a52" strokeWidth="5"/>;})}
    {flags.fighting!==false&&WOLFVEIL_MAP_FIGHTING_GROUNDS.map(f=>{const p=P(f.x,f.z);
      return <g key={f.id} role="button" tabIndex={0} style={{cursor:'pointer'}}
        aria-label={f.name+' — open fighting ground. '+f.purpose}
        onClick={e=>{e.stopPropagation();onSelect?.({id:'field:'+f.id,name:f.name,type:'landmark',
          x:f.x,z:f.z,live:true,description:'Open fighting ground · '+f.purpose});}}>
        <circle cx={p.x} cy={p.y} r={f.radius*M} fill="#f2c46b" fillOpacity=".16" stroke="#f2c46b" strokeWidth="3"/>
        <text x={p.x} y={p.y+7*textScale} fontSize={21*textScale} textAnchor="middle" fill="#f2c46b">⚔</text>
        {label('l',p.x,p.y-f.radius*M-8,f.name,15,'#ffe2a6')}
      </g>;})}
    {flags.mob!==false&&WOLFVEIL_MAP_MOB_AREAS.map(m=>{const p=P(m.x,m.z),r=Math.max(9,m.radius*M);
      return <g key={m.id} role="button" tabIndex={0} style={{cursor:'pointer'}}
        aria-label={m.name+' — mob area, '+m.label}
        onClick={e=>{e.stopPropagation();onSelect?.({id:'mobarea:'+m.id,name:m.name,type:'mob',x:m.x,z:m.z,
          live:true,levelRange:m.levels,description:(m.kind==='boss'?'Boss arena':m.kind==='camp'?'Zombie camp':'Hostile area')+' · '+m.label});}}>
        <circle cx={p.x} cy={p.y} r={r} fill="#e5675f" fillOpacity=".22" stroke="#e5675f" strokeWidth="2.5"/>
        {label('l',p.x,p.y+r+15*textScale,m.name+' · '+m.label,12,'#ffd0c9')}
      </g>;})}
    {WOLFVEIL_MAP_SUMMITS.map(s=>{const p=P(s.x,s.z);
      if(p.x<0||p.x>1000||p.y<0||p.y>1000)return null;
      return <g key={s.id}><path d={`M${p.x-8} ${p.y+6} L${p.x} ${p.y-8} L${p.x+8} ${p.y+6} Z`}
        fill="#eef3f6" stroke="#1d2a33" strokeWidth="1.5"/>{label('l',p.x,p.y-12,s.name,13,'#eef3f6')}</g>;})}
    {RANGE_LABELS.map(([name,x,z])=>{const p=P(x,z);return label(name,p.x,p.y,name,17,'#eef3f6');})}
  </g>;
}
