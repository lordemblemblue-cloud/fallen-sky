// Cosmetic contact response; never changes movement, damage, or network authority.
import { trainingPavingDistance } from './levels/trainingGround.js';
export function looseGround(level,x,z){
 if(level==='training_garden')return (Math.abs(x)<89&&z>64&&z<239)||(Math.abs(x)<26&&z>14&&z<62&&trainingPavingDistance(x,z)>1);
 return level==='kejim_frontier'&&((x>164&&x<232&&z>-30&&z<34)||(x>66&&x<144&&z>170&&z<248));
}
export class ContactAtmosphere {
 constructor(){this.previous=new WeakMap();this.clock=0;}
 update(g,dt){
  if(!(dt>0))return;this.clock+=dt;
  const level=g.world.level?.name;if(!['training_garden','kejim_frontier'].includes(level))return;
  const low=g.settings?.quality==='veryLow',wind=[Math.sin(this.clock*.17)*.15,.08,Math.cos(this.clock*.13)*.12];
  for(const f of g.fighters()){
   const old=this.previous.get(f),p=f.pos;
   const state={p:p.slice(),travel:old?.travel||0,breath:old?.breath||0};this.previous.set(f,state);
   if(!old||f.status==='dead')continue;
   const dx=p[0]-old.p[0],dz=p[2]-old.p[2],distance=Math.hypot(dx,dz);
   if(distance>2)continue; // respawns/teleports do not create a dust trail
   state.travel+=distance;state.breath+=dt;
   const floor=g.world.floorAt(p[0],p[2],p[1]+.2),grounded=f.onGround&&floor!==null&&Math.abs(p[1]-floor)<.2;
   if(grounded&&distance>.002&&state.travel>(low?1.5:.75)&&looseGround(level,p[0],p[2])){
    state.travel=0;const speed=Math.min(8,distance/dt),ux=dx/(distance||1),uz=dz/(distance||1);
    for(let i=0;i<(low?1:3);i++)g.fx.emit({p:[p[0]-ux*.18+(i-1)*.08,floor+.04,p[2]-uz*.18],v:[wind[0]+ux*speed*.07,.14+i*.04,wind[2]+uz*speed*.07],life:.65,size:.07,grow:.22,drag:1.4,mode:1,c0:[.39,.33,.25,.17],c1:[.43,.39,.32,0]});
   }
   // Explicit cold region only. Normal warm interiors never emit breath.
   const cold=(level==='kejim_frontier'||level==='training_garden')&&p[2]>170;
   if(cold&&state.breath>(distance/dt>2?1.6:3.2)){
    state.breath=0;const forward=[Math.sin(f.yaw),0,Math.cos(f.yaw)];
    const head=f.actor?.skel?.idx?.cranium!==undefined?f.actor.bonePos('cranium'):[p[0],p[1]+1.62,p[2]];
    g.fx.emit({p:[head[0]+forward[0]*.13,head[1],head[2]+forward[2]*.13],v:[forward[0]*.3+wind[0],.09,forward[2]*.3+wind[2]],life:.9,size:.055,grow:.19,drag:.6,mode:1,c0:[.7,.78,.82,.18],c1:[.7,.78,.82,0]});
   }
  }
 }
}
