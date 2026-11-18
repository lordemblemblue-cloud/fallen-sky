// Deterministic relief geometry. Shared combat/collision remains authoritative.
export function appendExpeditionDetail(L, materialMesh, colorFor, tris, solids) {
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
 for(const patch of L.terrainPatches||[]){
  const m=materialMesh(patch.mat),color=colorFor(patch.mat,[patch.x0,0,patch.z0]);
  const point=(x,z)=>[x,patch.height(x,z),z];
  for(let x=patch.x0;x<patch.x1;x+=patch.step)for(let z=patch.z0;z<patch.z1;z+=patch.step){
   const x1=Math.min(x+patch.step,patch.x1),z1=Math.min(z+patch.step,patch.z1);
   const a=point(x,z),b=point(x1,z),c=point(x1,z1),d=point(x,z1);
   for(const [p,q,r] of [[a,d,b],[b,d,c]]){
    const n=unit(cross(sub(q,p),sub(r,p)));m.quad(p,q,r,r,n,color);tris.push({a:p,b:q,c:r,normal:n});
   }
  }
 }
 for(const t of L.tubes||[]){
  const n=unit(sub(t.b,t.a)),u=unit(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0])),v=cross(n,u),m=materialMesh(t.mat),c=colorFor(t.mat,t.a);
  const point=(p,a)=>p.map((x,i)=>x+t.r*(u[i]*Math.cos(a)+v[i]*Math.sin(a)));
  for(let j=0;j<12;j++){
   const a=j*Math.PI/6,b=(j+1)*Math.PI/6,normal=u.map((x,i)=>x*Math.cos((a+b)/2)+v[i]*Math.sin((a+b)/2));
   m.quad(point(t.a,a),point(t.b,a),point(t.b,b),point(t.a,b),normal,c);
   m.quad(t.a,point(t.a,b),point(t.a,a),t.a,n.map(x=>-x),c);
   m.quad(t.b,point(t.b,a),point(t.b,b),t.b,n,c);
  }
 }
 for(const r of L.rockForms||[]){
  const m=materialMesh(r.mat),color=colorFor(r.mat,r.p),rows=19,cols=37;
  const point=(j,i)=>{
   const a=i/cols*Math.PI*2,b=j/rows*Math.PI;
   const f=1+.13*Math.sin(a*3+r.seed)+.09*Math.cos(b*5+a*2+r.seed*.7);
   return [r.p[0]+Math.sin(b)*Math.cos(a)*r.scale[0]*f,r.p[1]+Math.cos(b)*r.scale[1]*(1+.07*Math.sin(a*2+b)*Math.sin(b)),r.p[2]+Math.sin(b)*Math.sin(a)*r.scale[2]*f];
  };
  const face=(a,b,c)=>{
   let n=unit(cross(sub(b,a),sub(c,a)));
   const outward=sub(a,r.p);if(n.reduce((s,x,i)=>s+x*outward[i],0)<0){[b,c]=[c,b];n=n.map(x=>-x);}
   m.quad(a,b,c,c,n,color.map(x=>x*(.88+.12*Math.sin(a[0]+a[2]))));
   tris.push({a,b,c,normal:n});
  };
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   const a=point(j,i),b=point(j+1,i),c=point(j+1,i+1),d=point(j,i+1);
   if(j<rows-1)face(a,b,c);if(j>0)face(a,c,d);
  }
  // Conservative bolt/camera bounds; locomotion uses the actual faceted triangles.
  solids.push({min:r.p.map((x,i)=>x-r.scale[i]*1.23),max:r.p.map((x,i)=>x+r.scale[i]*1.23)});
 }
}
