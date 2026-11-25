// Stage 3 prototype: four enclosed, full-height ventilation connectors.
// Not registered in the live arena. Portal cuts and authoritative collision
// integration require Stage 2 clearance and combined-map certification.
export const VENT_SPEC=Object.freeze({width:2.4,height:2.5,wall:.18,deck:.22,y:5,midRadius:36.2,foundationRadius:44.8});
const add=(a,b)=>({x:a.x+b.x,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
const mul=(a,s)=>({x:a.x*s,z:a.z*s});
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const length=a=>Math.hypot(a.x,a.z);
const unit=a=>mul(a,1/length(a));
const normal=a=>({x:-a.z,z:a.x});
const polar=(r,a)=>({x:Math.sin(a)*r,z:Math.cos(a)*r});
const building=(id,angle)=>({id,angle,center:polar(38,angle),tangent:{x:Math.cos(angle),z:-Math.sin(angle)},radial:polar(1,angle)});
const BUILDINGS=[
  building('armory',-3*Math.PI/4),building('medbay',-Math.PI/4),
  building('barracks',Math.PI/4),building('reactor',3*Math.PI/4)
];
const at=(b,x,z)=>add(b.center,add(mul(b.tangent,x),mul(b.radial,z)));
function slab(id,kind,a,b,width,y,height,extend=0){
  const d=unit(sub(b,a)),c=mul(add(a,b),.5);
  // Local X follows the segment; local Z is its perpendicular.
  const rotY=Math.atan2(-d.z,d.x);
  return {id,label:id,kind,cx:c.x,cy:y,cz:c.z,hx:(length(sub(b,a))+2*extend)/2,hy:height/2,hz:width/2,rotY,cos:Math.cos(rotY),sin:Math.sin(rotY),walkable:kind==='floor'};
}
function offsetJoint(a,b,c,distance){
  const n0=normal(unit(sub(b,a))),n1=normal(unit(sub(c,b)));
  const m=unit(add(n0,n1));
  return add(b,mul(m,distance/dot(m,n0)));
}
function endPortal(b,other,mid){
  const sign=Math.sign(dot(sub(other.center,b.center),b.tangent));
  // Both sides have upper-floor support near local Z=-2.3; avoid the stairwell.
  const inner=at(b,sign*8.25,-2.3),start=at(b,sign*8.62,-2.3);
  const d=unit(sub(mid,start));
  const faceT=dot(d,b.tangent);
  const t=(sign*9-dot(sub(start,b.center),b.tangent))/faceT;
  const face=add(start,mul(d,t)),z=dot(sub(face,b.center),b.radial);
  // Wall cut is wider than the duct because it meets the wall obliquely.
  const span=(VENT_SPEC.width+2*VENT_SPEC.wall)/Math.abs(faceT)+.28;
  return {building:b.id,side:sign<0?'Left Wall':'Right Wall',localX:sign*9,localZ:z,width:span,bottom:VENT_SPEC.y,top:VENT_SPEC.y+VENT_SPEC.height,inner:{...inner,y:VENT_SPEC.y},start};
}
export function createConduitVentPlan(){
  const spec=VENT_SPEC,routes=[];
  for(let i=0;i<4;i++){
    const a=BUILDINGS[i],b=BUILDINGS[(i+1)%4],id=a.id+'-'+b.id;
    const middle=mul(unit(add(a.center,b.center)),spec.midRadius);
    const p=endPortal(a,b,middle),q=endPortal(b,a,middle);
    const A=p.start,B=middle,C=q.start,n0=normal(unit(sub(B,A))),n1=normal(unit(sub(C,B)));
    const boxes=[];
    for(const [j,u,v] of [[0,A,B],[1,B,C]]){
      // Small center overlap closes the shallow elbow; no collision gaps.
      const endExtension=.28;
      boxes.push(slab(id+'-floor-'+j,'floor',u,v,spec.width+2*spec.wall,spec.y-spec.deck/2,spec.deck,endExtension));
      boxes.push(slab(id+'-roof-'+j,'roof',u,v,spec.width+2*spec.wall,spec.y+spec.height+spec.deck/2,spec.deck,endExtension));
    }
    for(const sign of [-1,1]){
      const offset=sign*(spec.width/2+spec.wall/2);
      const u=add(A,mul(n0,offset)),v=offsetJoint(A,B,C,offset),w=add(C,mul(n1,offset));
      boxes.push(slab(id+'-side-'+sign+'-0','wall',u,v,spec.wall,spec.y+spec.height/2,spec.height,.03));
      boxes.push(slab(id+'-side-'+sign+'-1','wall',v,w,spec.wall,spec.y+spec.height/2,spec.height,.03));
    }
    // Low-profile emissive strips on the side walls; no point lights or collision.
    const guides=[];
    for(const [j,u,v,n] of [[0,A,B,n0],[1,B,C,n1]])for(const sign of [-1,1]){
      const offset=mul(n,sign*(spec.width/2+.025));
      guides.push(slab(id+'-guide-'+j+'-'+sign,'guide',add(u,offset),add(v,offset),.035,spec.y+.35,.045));
    }
    routes.push({id,from:a.id,to:b.id,portals:[p,q],waypoints:[p.inner,{...A,y:spec.y},{...B,y:spec.y},{...C,y:spec.y},q.inner],boxes,guides});
  }
  return routes;
}
export function ventBoxCorners(b){
  const out=[];
  for(const x of [-b.hx,b.hx])for(const z of [-b.hz,b.hz])out.push({x:b.cx+x*b.cos+z*b.sin,z:b.cz-x*b.sin+z*b.cos});
  return out;
}
export function ventContains(b,p,radius=.4,height=1.8){
  const dx=p.x-b.cx,dz=p.z-b.cz,x=dx*b.cos-dz*b.sin,z=dx*b.sin+dz*b.cos;
  const overlap=Math.hypot(Math.max(0,Math.abs(x)-b.hx),Math.max(0,Math.abs(z)-b.hz))<radius-1e-6;
  return overlap&&p.y<b.cy+b.hy-1e-6&&p.y+height>b.cy-b.hy+1e-6;
}
// Explicit opt-in renderer helper. Caller supplies existing materials and THREE;
// no CDN, renderer, lights, textures, frame loop, or live scene modification.
export function mountConduitVentPrototype(parent,THREE,materials,routes=createConduitVentPlan()){
  if(!parent?.isObject3D||!THREE?.InstancedMesh)throw new TypeError('Existing Three.js parent required');
  const parts=routes.flatMap(r=>[...r.boxes,...r.guides]),kinds=['floor','roof','wall','guide'];
  if(kinds.some(k=>!materials[k]?.isMaterial))throw new TypeError('Four shared materials required');
  const root=new THREE.Group();root.name='Conduit Ventilation Prototype';
  const geo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  for(const kind of kinds){
    const batch=parts.filter(p=>p.kind===kind),mesh=new THREE.InstancedMesh(geo,materials[kind],batch.length);
    mesh.name='Conduit vent '+kind;
    batch.forEach((b,i)=>{dummy.position.set(b.cx,b.cy,b.cz);dummy.rotation.set(0,b.rotY,0);dummy.scale.set(b.hx*2,b.hy*2,b.hz*2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=kind!=='guide';root.add(mesh);
  }
  parent.add(root);let disposed=false;
  return {root,routes,colliders:routes.flatMap(r=>r.boxes),dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.children.forEach(m=>m.dispose?.());geo.dispose();}};
}
