// Deterministic, visual-only secondary motion. All input coordinates are character-local.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const CLOTH_PROFILES=Object.freeze({
 leaf:Object.freeze({stiffness:42,damping:8,limit:.48,inertia:1.05,length:282,shoulder:50,hem:87}),
 ward:Object.freeze({stiffness:72,damping:13,limit:.31,inertia:.72,length:253,shoulder:54,hem:96}),
 dusk:Object.freeze({stiffness:33,damping:7,limit:.57,inertia:1.18,length:290,shoulder:48,hem:72})
});
export function createSecondaryMotion(){return {angle:0,velocity:0,lastX:null,lastY:null,lastVx:0,lastVy:0,ax:0,ay:0};}
export function resetSecondaryMotion(s){Object.assign(s,createSecondaryMotion());}
export function sampleMotion(s,x,y,dt){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(dt)||dt<=0)return;
 if(s.lastX===null||dt>.1||Math.hypot(x-s.lastX,y-s.lastY)>600){resetSecondaryMotion(s);s.lastX=x;s.lastY=y;return;}
 const vx=(x-s.lastX)/dt,vy=(y-s.lastY)/dt,mix=1-Math.exp(-dt*22);
 s.ax+=(clamp((vx-s.lastVx)/dt,-18000,18000)-s.ax)*mix;
 s.ay+=(clamp((vy-s.lastVy)/dt,-18000,18000)-s.ay)*mix;
 s.lastX=x;s.lastY=y;s.lastVx=vx;s.lastVy=vy;
}
export function stepCloth(s,p,dt,amount=1,breath=0){
 if(amount<=0){s.angle=0;s.velocity=0;return 0;}
 if(!Number.isFinite(dt)||dt<=0)return s.angle;
 const total=Math.min(dt,.1),steps=Math.ceil(total*120),h=total/steps;
 const target=clamp(-s.ax/p.length*.007*p.inertia+clamp(breath,-1,1)*.025,-p.limit,p.limit)*clamp(amount,0,1);
 for(let i=0;i<steps;i++){s.velocity+=(p.stiffness*(target-s.angle)-p.damping*s.velocity)*h;s.angle+=s.velocity*h;if(Math.abs(s.angle)>p.limit){s.angle=clamp(s.angle,-p.limit,p.limit);s.velocity=0;}}
 return s.angle;
}
export function capeGeometry(p,width=1,rows=8){
 const positions=new Float32Array((rows+1)*2*3),indices=[];
 for(let i=0;i<=rows;i++){const u=i/rows,w=(p.shoulder+(p.hem-p.shoulder)*u)*width;
  for(let side=0;side<2;side++){const j=(i*2+side)*3;positions[j]=(side?1:-1)*w;positions[j+1]=85-p.length*u;}
  if(i<rows){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
 }
 return {positions,indices};
}
export function deformCape(bind,out,angle){
 const a=Number.isFinite(angle)?angle:0;
 for(let j=0;j<bind.length;j+=3){const x=bind[j],y=bind[j+1],u=clamp((85-y)/300,0,1),rad=a*u*u,cs=Math.cos(rad),sn=Math.sin(rad);out[j]=x*cs-(y-85)*sn;out[j+1]=85+x*sn+(y-85)*cs;out[j+2]=bind[j+2];}
 return out;
}
