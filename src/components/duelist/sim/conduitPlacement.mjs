// Renderer-independent candidate spawn/pickup policy. Intended for eventual
// authoritative server use; does not reserve a server spawn or grant a pickup.
const EPS=1e-6;
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const local=(b,x,z)=>[(x-b.cx)*b.cos-(z-b.cz)*b.sin,(x-b.cx)*b.sin+(z-b.cz)*b.cos];
const box=(b,x,z,r=0)=>{const [u,v]=local(b,x,z);return Math.hypot(Math.max(0,Math.abs(u)-b.hx),Math.max(0,Math.abs(v)-b.hz))<=r;};
const cut=(d,x,z,r=0)=>(d.cutouts??[]).some(c=>{const [u,v]=local(c,x,z);return Math.abs(u)+r<c.hx&&Math.abs(v)+r<c.hz;});
const disc=(d,x,z,r=0)=>Math.hypot(x-d.cx,z-d.cz)<=d.radius+r&&!cut(d,x,z,r);
const ann=(a,x,z,r=0)=>{const d=Math.hypot(x,z);return d+r>=a.rMin&&d-r<=a.rMax;};
const same=(a,b)=>Math.abs(a-b)<=.055;
export function auditConduitPlacement(world,p,{radius=.4,height=1.8}={}){
  if(!valid(p))return {ok:false,reason:'invalid coordinates'};
  const supported=(x,z)=>world.obbs.some(b=>b.walkable&&same(b.cy+b.hy,p.y)&&box(b,x,z))||
    world.discs.some(d=>d.walkable&&same(d.yMax,p.y)&&disc(d,x,z))||
    world.annuli.some(a=>a.walkable&&same(a.yMax,p.y)&&ann(a,x,z));
  // Check the footprint, not just the center of the capsule.
  for(let i=-1;i<8;i++){
    const a=i*Math.PI/4,r=i<0?0:radius;
    if(!supported(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r))return {ok:false,reason:'unsupported footprint'};
  }
  const hits=(lo,hi)=>p.y<hi-EPS&&p.y+height>lo+EPS;
  for(const b of world.obbs)if(hits(b.cy-b.hy,b.cy+b.hy)&&box(b,p.x,p.z,radius))return {ok:false,reason:b.label||'box'};
  for(const d of world.discs)if(hits(d.yMin,d.yMax)&&disc(d,p.x,p.z,radius))return {ok:false,reason:d.label||'disc'};
  for(const a of world.annuli)if(hits(a.yMin,a.yMax)&&ann(a,p.x,p.z,radius))return {ok:false,reason:a.label||'ring'};
  for(const c of world.cylinders)if(hits(c.yMin,c.yMax)&&Math.hypot(p.x-c.cx,p.z-c.cz)<c.radius+radius)return {ok:false,reason:c.label||'cylinder'};
  for(const s of world.shaftOpenings)if(hits(s.yMin,s.yMax)&&box(s,p.x,p.z,radius))return {ok:false,reason:'shaft opening'};
  for(const s of world.ramps){
    const [u,v]=local(s,p.x,p.z);
    if(Math.abs(u)>s.width/2+radius||Math.abs(v)>s.length/2+radius)continue;
    const t=Math.max(0,Math.min(1,(v+s.length/2)/s.length));
    const y=s.yStart+(s.yEnd-s.yStart)*t;
    if(hits(y-(s.thickness??.36),y))return {ok:false,reason:s.label||'ramp'};
  }
  for(const pad of world.jumpPads)if(Math.abs(p.y-pad.y)<.45&&Math.hypot(p.x-pad.x,p.z-pad.z)<pad.triggerRadius+radius)return {ok:false,reason:'jump pad'};
  return {ok:true};
}
export function chooseConduitSpawn(world,candidates,{enemies=[],occupants=[],reserved=[],recentIds=[],canSee=null,minimumEnemyDistance=4,requireUnexposed=false}={}){
  const live=enemies.filter(e=>valid(e)&&e.alive!==false),occupied=[...occupants,...reserved,...live].filter(valid);
  const recent=new Set(recentIds);let best=null;
  for(const p of candidates){
    if(!auditConduitPlacement(world,p).ok)continue;
    if(occupied.some(o=>Math.abs(o.y-p.y)<1.8&&Math.hypot(o.x-p.x,o.z-p.z)<1.2))continue;
    let nearest=40,exposure=0,danger=false;
    for(const e of live){
      const d=dist(p,e);
      // Unknown visibility is treated conservatively, not as cover.
      const visible=canSee?canSee(p,e)!==false:true;
      if(d<minimumEnemyDistance&&(visible||Math.abs(p.y-e.y)<2.2)){danger=true;break;}
      nearest=Math.min(nearest,d);
      if(visible&&d<30)exposure+=1+(30-d)/30;
    }
    if(danger||(requireUnexposed&&exposure>0))continue;
    const score=nearest*2-exposure*18-(recent.has(p.id)?8:0);
    if(!best||score>best.score||(score===best.score&&String(p.id)<String(best.spawn.id)))best={spawn:{...p},score,nearestEnemy:nearest,exposure};
  }
  // Never manufacture a fallback position or force a spawn in danger.
  return best;
}
export function resolveConduitPickupPosition(world,id,position){
  if(!Array.isArray(position)||position.length!==3)return null;
  const [x,y,z]=position,original={x,y,z};
  // Move the T0 pickup off the central station, on the existing central node.
  const preferred=id==='t0_core'?{x:0,y,z:2.6}:original;
  const allowed=p=>Math.hypot(p.x-original.x,p.z-original.z)<=3.01;
  const points=[preferred,original];
  for(const r of [.6,1.2,1.8,2.4,3])for(let i=0;i<16;i++){
    const a=i*Math.PI/8;points.push({x:original.x+Math.cos(a)*r,y,z:original.z+Math.sin(a)*r});
  }
  const found=points.find(p=>allowed(p)&&auditConduitPlacement(world,p,{radius:.55,height:1.8}).ok);
  return found?[found.x,found.y,found.z]:null;
}
