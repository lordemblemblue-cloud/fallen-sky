// Pure visual wildlife rules. No terrain edits, collision, combat, AI or rewards.
export const BIRD_QUALITY=Object.freeze({
  low:Object.freeze({near:4,far:7}),
  medium:Object.freeze({near:9,far:14}),
  high:Object.freeze({near:14,far:22}),
  ultra:Object.freeze({near:18,far:28}),
});
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
export function birdRandom(seed=0xB1D05){let s=seed>>>0;return()=>{
 s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);
 t^=t+Math.imul(t^(t>>>7),t|61);
 return ((t^(t>>>14))>>>0)/4294967296;
};}
export function birdBudget(quality='medium',frameMs=16.7,mobile=false){
 const p=BIRD_QUALITY[quality]??BIRD_QUALITY.medium;
 // At 35 FPS, shed detail before touching terrain, quests or combat assets.
 const load=mobile?0.72:1;
 const fps=finite(frameMs)&&frameMs>28?clamp(28/frameMs,.35,1):1;
 return {near:Math.max(2,Math.floor(p.near*load*fps)),
   far:Math.max(4,Math.floor(p.far*load*fps)),maxNear:p.near,maxFar:p.far};
}
export function makeBird(index,center,terrainY,random){
 const a=random()*TAU,r=35+random()*110;
 const x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r;
 const y=(terrainY(x,z)??center.y??0)+24+random()*9;
 return {id:index,x,y,z,heading:a+Math.PI*.5,
   phase:random()*TAU,speed:2.8+random()*2.5,
   mode:'flight',time:0,flightFor:7+random()*11,
   restFor:3+random()*7,target:null,ground:0,
   wing:0,flightY:y};
}
export function findBirdLanding(center,random,{
 groundAt,clearAt,originZ=70,coreHalf=550,tries=32,
}={}){
 if(!center||!finite(center.x)||!finite(center.z)||
   typeof groundAt!=='function'||typeof clearAt!=='function')return null;
 for(let i=0;i<tries;i++){
   const a=random()*TAU,r=25+random()*125;
   const x=center.x+Math.cos(a)*r,z=center.z+Math.sin(a)*r;
   const localZ=z-originZ;
   if(Math.abs(x)>coreHalf-5||Math.abs(localZ)>coreHalf-5)continue;
   if(!clearAt(x,localZ))continue;
   const y=groundAt(x,localZ);
   if(!finite(y))continue;
   const up=groundAt(x+1,localZ),down=groundAt(x-1,localZ);
   const front=groundAt(x,localZ+1),back=groundAt(x,localZ-1);
   if(![up,down,front,back].every(finite))continue;
   if(Math.hypot((up-down)*.5,(front-back)*.5)>.25)continue;
   return {x,y,z};
 }
 return null;
}
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function advanceBird(b,dt,{
 center,terrainY,windX=0,windZ=0,chooseLanding=()=>null,
}={}){
 const step=clamp(finite(dt)?dt:0,0,.08);
 if(!step||!b||!center)return b;
 b.time+=step;
 if(b.mode==='flight'){
   const distance=Math.hypot(center.x-b.x,center.z-b.z);
   const towards=Math.atan2(center.z-b.z,center.x-b.x);
   const desired=distance>155?towards:towards+.85*Math.cos(b.phase+b.time*.22);
   b.heading+=clamp(turn(b.heading,desired),-step*.42,step*.42);
   b.x+=(Math.cos(b.heading)*b.speed+windX*.035)*step;
   b.z+=(Math.sin(b.heading)*b.speed+windZ*.035)*step;
   const floor=typeof terrainY==='function'?terrainY(b.x,b.z):null;
   const targetY=(finite(floor)?floor:b.flightY-25)+23+
     4*Math.sin(b.phase+b.time*.29);
   b.y+=(targetY-b.y)*Math.min(1,step*.85);
   if(b.time>=b.flightFor){
     const target=chooseLanding(b);
     if(target&&[target.x,target.y,target.z].every(finite)){
       b.target=target;b.time=0;b.mode='descending';
     }else b.time=0;
   }
 }else if(b.mode==='descending'){
   if(!b.target){b.mode='flight';b.time=0;return b;}
   const dx=b.target.x-b.x,dz=b.target.z-b.z;
   const d=Math.hypot(dx,dz);
   const h=Math.min(d,step*5);
   if(d>.001){b.x+=dx/d*h;b.z+=dz/d*h;
      b.heading=Math.atan2(dz,dx);}
   b.y=Math.max(b.target.y+.04,b.y-step*4.2);
   if(d<.75&&b.y<=b.target.y+.09){
     b.x=b.target.x;b.z=b.target.z;
     b.y=b.target.y+.04;b.mode='landed';b.time=0;
   }
 }else if(b.mode==='landed'){
   b.y=b.target.y+.04;
   if(b.time>=b.restFor){b.mode='takeoff';b.time=0;}
 }else if(b.mode==='takeoff'){
   b.y+=step*5;
   b.x+=(Math.cos(b.heading)*b.speed*.7)*step;
   b.z+=(Math.sin(b.heading)*b.speed*.7)*step;
   if(b.y>=(b.target?.y??0)+9){
     b.mode='flight';b.time=0;b.target=null;
   }
 }
 b.wing=b.mode==='landed'?0.025:
   (b.mode==='descending'?0.48:b.mode==='takeoff'?0.85:0.62);
 return b;
}
