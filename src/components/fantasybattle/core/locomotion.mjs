// Pure exploration movement and pose controller. World collision and vertical physics stay authoritative.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(dt,k)=>1-Math.exp(-Math.max(0,dt)*k);
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const WALK_FACTOR=.62;
export function createLocomotion(){return {vx:0,vz:0,heading:Math.PI/2,phase:0,gait:0,run:0,land:0,grounded:true,airTime:0,mode:'idle',pose:{hipY:0,lean:0,thighL:0,thighR:0,kneeL:0,kneeR:0,armL:0,armR:0,elbowL:0,elbowR:0,cape:0}};}
export function resetLocomotion(s,grounded=true){const heading=s.heading;Object.assign(s,createLocomotion(),{heading,grounded});}
export function advanceVelocity(s,keys,grounded,dt){
 const x=Number(!!keys.right)-Number(!!keys.left),z=Number(!!keys.out)-Number(!!keys.in);
 const diag=x&&z?Math.SQRT1_2:1,speed=keys.run?1:WALK_FACTOR;
 const tx=x*7.4*diag*speed,tz=z*4.8*diag*speed;
 const rate=grounded?(x||z?16:22):7;
 s.vx=mix(s.vx,tx,blend(dt,rate));s.vz=mix(s.vz,tz,blend(dt,rate));
 if(!x&&Math.abs(s.vx)<.025)s.vx=0;if(!z&&Math.abs(s.vz)<.025)s.vz=0;
 return {x:s.vx*dt,z:s.vz*dt};
}
export function updateLocomotion(s,{dx=0,dz=0,vy=0,grounded=true,impact=0,running=false},dt){
 if(!Number.isFinite(dt)||dt<=0)return s.pose;
 dt=Math.min(dt,.1);
 const speed=Math.hypot(dx,dz)/dt, moving=speed>.10;
 if(moving)s.heading+=angleDelta(s.heading,Math.atan2(dx,dz))*blend(dt,15);
 s.gait=mix(s.gait,grounded?clamp(speed/2.2,0,1):0,blend(dt,12));
 s.run=mix(s.run,running?clamp((speed-1.8)/3.6,0,1):0,blend(dt,10));
 if(!grounded){s.airTime+=dt;s.land=0;}else{
  if(!s.grounded&&s.airTime>.08)s.land=clamp(Math.abs(impact)/9,.22,1);
  s.airTime=0;
 }
 s.grounded=grounded;
 s.land=Math.max(0,s.land-dt*3.8);
 if(grounded&&moving)s.phase=(s.phase+speed*dt*(s.run>.5?2.8:3.3))%(2*Math.PI);
 s.mode=!grounded?(vy>0?'jump':'fall'):s.land>.08?'land':moving?(running?'run':'walk'):'idle';
 const swing=Math.sin(s.phase),amp=mix(.42,.85,s.run)*s.gait,land=s.land;
 const target={hipY:-.12*land+.022*s.gait*Math.sin(s.phase*2),lean:.13*s.run+.13*land,thighL:swing*amp,thighR:-swing*amp,kneeL:Math.max(0,-swing)*amp*.95,kneeR:Math.max(0,swing)*amp*.95,armL:-swing*amp*.85,armR:swing*amp*.85,elbowL:.17+.4*s.run,elbowR:.17+.4*s.run,cape:.12+.30*s.run+.14*s.gait};
 if(!grounded)Object.assign(target,{hipY:0,lean:vy>0?-.12:.12,thighL:vy>0?-.55:-.32,thighR:vy>0?-.8:.24,kneeL:.7,kneeR:1,armL:-.65,armR:-.82,elbowL:.4,elbowR:.4,cape:.32});
 else if(land>.08){target.thighL-=land*.35;target.thighR-=land*.35;target.kneeL+=land*.65;target.kneeR+=land*.65;}
 for(const k of Object.keys(target))s.pose[k]=mix(s.pose[k],target[k],blend(dt,18));
 return s.pose;
}
