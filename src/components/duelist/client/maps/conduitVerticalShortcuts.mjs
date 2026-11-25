// Optional Conduit maintenance climbing frames; renderer-independent plan.
 // Not registered in TDM. Portal cuts and combined-map tests are release gates.
export const SHORTCUT_SPEC=Object.freeze({count:4,bodyRadius:.4,bodyHeight:1.8,gravity:18,jumpHeight:2.6,ringY:5,ringInner:27.2,ringOuter:32.2,portalWidth:3.2});
const polar=(a,r,t=0)=>({x:Math.sin(a)*r+Math.cos(a)*t,z:Math.cos(a)*r-Math.sin(a)*t});
const point=(a,r,t,y)=>({...polar(a,r,t),y});
function box(id,kind,a,r,t,y,width,height,depth){
  const p=polar(a,r,t);
  return {id,label:id,kind,cx:p.x,cy:y,cz:p.z,hx:width/2,hy:height/2,hz:depth/2,rotY:a,cos:Math.cos(a),sin:Math.sin(a),walkable:kind==='deck'};
}
export function createConduitVerticalPlan(){
  const routes=[];
  for(let i=0;i<4;i++){
    const angle=Math.PI/8+i*Math.PI/2,id='maintenance-'+i;
    const stages=[
      {r:20.5,t:0,y:0},{r:22.1,t:-.65,y:1.25},
      {r:24.0,t:.65,y:2.50},{r:25.7,t:-.35,y:3.75},{r:29.0,t:0,y:5}
    ];
    const points=stages.map(p=>point(angle,p.r,p.t,p.y)),boxes=[],guides=[];
    // Offset landing decks allow the next jump to clear the previous underside.
    for(let j=1;j<=3;j++){
      const s=stages[j];
      boxes.push(box(id+'-deck-'+j,'deck',angle,s.r,s.t,s.y-.12,2.2,.24,1.65));
      guides.push(box(id+'-guide-'+j,'guide',angle,s.r-.72,s.t,s.y+.012,1.9,.024,.07));
      // Under-deck crossmember connects the landing to the open frame.
      boxes.push(box(id+'-beam-'+j,'frame',angle,s.r,0,s.y-.34,4.28,.20,.22));
    }
    // Open-sided support frame: no ceiling and no mandatory wall climb.
    for(const side of [-1,1]){
      for(const [r,top] of [[22.1,1.25],[24.0,2.50],[25.7,3.75]]){
        const base=r<=24?0:.65;
        boxes.push(box(id+'-post-'+side+'-'+r,'frame',angle,r,side*2.05,(base+top)/2,.18,top-base,.18));
      }
    }
    // Existing ring rail must be split at this angle before installation.
    // No opening is cut by this standalone plan.
    const halfAngle=Math.asin(SHORTCUT_SPEC.portalWidth/(2*SHORTCUT_SPEC.ringInner));
    const portal={angle,from:angle-halfAngle,to:angle+halfAngle,radius:SHORTCUT_SPEC.ringInner,width:SHORTCUT_SPEC.portalWidth};
    const edges=points.slice(1).map((p,j)=>({from:j,to:j+1,type:'jump',requiredRise:p.y-points[j].y}));
    routes.push({id,angle,points,boxes,guides,portal,edges});
  }
  return routes;
}
export function shortcutOverlap(b,p,radius=.4,height=1.8){
  const dx=p.x-b.cx,dz=p.z-b.cz,x=dx*b.cos-dz*b.sin,z=dx*b.sin+dz*b.cos;
  return Math.hypot(Math.max(0,Math.abs(x)-b.hx),Math.max(0,Math.abs(z)-b.hz))<radius-1e-6&&p.y<b.cy+b.hy-1e-6&&p.y+height>b.cy-b.hy+1e-6;
}
// Ballistic feasibility only, not a replacement for the production world.
 // Uses the descending root so landing occurs from above; no free teleport.
export function shortcutArc(from,to,{gravity=SHORTCUT_SPEC.gravity,jumpHeight=SHORTCUT_SPEC.jumpHeight}={}){
  const vy=Math.sqrt(2*gravity*jumpHeight),rise=to.y-from.y,disc=vy*vy-2*gravity*rise;
  if(!Number.isFinite(disc)||disc<0||gravity<=0||jumpHeight<=0)return null;
  const time=(vy+Math.sqrt(disc))/gravity;
  if(!(time>0))return null;
  return {time,vx:(to.x-from.x)/time,vz:(to.z-from.z)/time,vy,gravity,
    at(t){return {x:from.x+(to.x-from.x)*t/time,y:from.y+vy*t-.5*gravity*t*t,z:from.z+(to.z-from.z)*t/time};}};
}
export function shortcutArcClear(route,from,to){
  const arc=shortcutArc(from,to);if(!arc)return {ok:false,reason:'rise exceeds jump'};
  const n=Math.ceil(arc.time*240);
  for(let i=0;i<=n;i++){
    const p=arc.at(arc.time*i/n);
    const blockers=route.boxes.filter(b=>shortcutOverlap(b,p));
    if(blockers.length)return {ok:false,reason:'prototype shell obstruction',blockers:blockers.map(b=>b.id)};
  }
  return {ok:true,time:arc.time,horizontalSpeed:Math.hypot(arc.vx,arc.vz)};
}
// Opt-in map helper, not invoked by existing scenes. Uses borrowed materials.
export function mountConduitVerticalPrototype(parent,THREE,materials,routes=createConduitVerticalPlan()){
  if(!parent?.isObject3D||!THREE?.InstancedMesh)throw new TypeError('Existing Three.js scene required');
  const kinds=['deck','frame','guide'];
  if(kinds.some(k=>!materials[k]?.isMaterial))throw new TypeError('Shared deck, frame and guide materials required');
  const root=new THREE.Group();root.name='Conduit Vertical Shortcut Prototype';
  const geo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  const parts=routes.flatMap(r=>[...r.boxes,...r.guides]);
  for(const kind of kinds){
    const batch=parts.filter(b=>b.kind===kind),mesh=new THREE.InstancedMesh(geo,materials[kind],batch.length);
    batch.forEach((b,i)=>{dummy.position.set(b.cx,b.cy,b.cz);dummy.rotation.set(0,b.rotY,0);dummy.scale.set(b.hx*2,b.hy*2,b.hz*2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.name='Conduit shortcut '+kind;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=kind!=='guide';root.add(mesh);
  }
  parent.add(root);let disposed=false;
  return {root,routes,colliders:routes.flatMap(r=>r.boxes),dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.children.forEach(m=>m.dispose?.());geo.dispose();}};
}
