import * as THREE from 'three';

// Original, lightweight visual feedback for the user's bow reference footage.
// The bird is an abstract spirit falcon built from triangles, not an imported
// copyrighted animation. VFX does not create hitboxes or apply any damage.
const WING='#a7f0fc',BODY='#f5d690',EDGE='#56bbd4';
const MAX_BIRDS=6;
const clamp01=v=>Math.max(0,Math.min(1,v));
const vec=v=>new THREE.Vector3(v?.x||0,v?.y||0,v?.z||0);
const tmp=new THREE.Vector3();
const axis=new THREE.Vector3(0,0,1);

function featherShape(right){
  const side=right?1:-1;
  const shape=new THREE.Shape();
  shape.moveTo(0,0);
  shape.lineTo(side*.34,.12);
  shape.lineTo(side*.9,.28);
  shape.lineTo(side*1.42,.11);
  shape.lineTo(side*1.04,-.05);
  shape.lineTo(side*.7,-.24);
  shape.lineTo(side*.37,-.16);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
function makeBird(){
  const root=new THREE.Group();
  const bodyMaterial=new THREE.MeshBasicMaterial({color:BODY,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  const wingMaterial=new THREE.MeshBasicMaterial({color:WING,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  const edgeMaterial=new THREE.MeshBasicMaterial({color:EDGE,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  const torso=new THREE.Mesh(new THREE.ConeGeometry(.15,.74,4),bodyMaterial);
  torso.rotation.x=Math.PI/2;
  root.add(torso);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(.17,.38,3),edgeMaterial);
  tail.rotation.x=-Math.PI/2;tail.position.z=-.44;root.add(tail);
  const face=new THREE.Mesh(new THREE.ConeGeometry(.105,.31,4),bodyMaterial);
  face.rotation.x=Math.PI/2;face.position.z=.41;root.add(face);
  const wings=[];
  for(const right of [false,true]){
    const joint=new THREE.Group();
    joint.position.z=.03;
    const mesh=new THREE.Mesh(featherShape(right),wingMaterial);
    mesh.rotation.x=.34;
    joint.add(mesh);root.add(joint);wings.push(joint);
  }
  const glowMaterial=new THREE.MeshBasicMaterial({
    color:0x86def4,opacity:.13,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
  // A soft translucent oval, never an untextured screen-facing square.
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.46,8,6),glowMaterial);
  glow.scale.set(1.75,.30,.65);root.add(glow);
  return {root,wings,materials:[bodyMaterial,wingMaterial,edgeMaterial,glowMaterial]};
}
function releaseBird(item,scene){
  scene.remove(item.root);
  item.root.traverse(node=>{if(node.geometry)node.geometry.dispose();});
  for(const material of [...item.bird.materials,item.traceMaterial])material.dispose();
}
function pointLike(position){
  return position&&[position.x,position.y,position.z].every(Number.isFinite);
}
function buildReticle(container){
  const host=document.createElement('div');
  host.dataset.game3dBowReticle='true';
  Object.assign(host.style,{
    position:'absolute',left:'50%',top:'50%',width:'34px',height:'34px',
    transform:'translate(-50%,-50%)',pointerEvents:'none',zIndex:'13',
    opacity:'0',transition:'opacity 110ms ease-out',
  });
  const center=document.createElement('div');
  Object.assign(center.style,{
    position:'absolute',left:'15px',top:'15px',width:'4px',height:'4px',
    borderRadius:'50%',background:'#ffecad',boxShadow:'0 0 5px #ffd96b, 0 0 2px #040608',
    border:'1px solid #10161d',
  });
  host.appendChild(center);
  const marker=document.createElement('div');
  Object.assign(marker.style,{position:'absolute',inset:0,opacity:'0',transform:'scale(1.45)'});
  const positions=[
    {left:'5px',top:'5px',transform:'rotate(-45deg)'},
    {right:'5px',top:'5px',transform:'rotate(45deg)'},
    {left:'5px',bottom:'5px',transform:'rotate(45deg)'},
    {right:'5px',bottom:'5px',transform:'rotate(-45deg)'},
  ];
  for(const props of positions){
    const dash=document.createElement('div');
    Object.assign(dash.style,{
      position:'absolute',width:'8px',height:'2px',borderRadius:'2px',
      background:'#f5f2cd',boxShadow:'0 0 8px #fbd46e',...props,
    });
    marker.appendChild(dash);
  }
  host.appendChild(marker);
  container.appendChild(host);
  return {host,marker};
}

export function createGame3DBowAimVisuals({scene,container,showDot=true}={}){
  if(!scene||!container)return {fire:()=>false,confirmHit:()=>{},update:()=>{},dispose:()=>{}};
  const overlay=typeof document!=='undefined'?buildReticle(container):null;
  if(overlay&&!showDot){overlay.host.firstChild.style.display='none';overlay.host.style.zIndex='61';}
  const birds=[];
  let hitSeconds=0,disposed=false;
  const fire=({origin,target}={})=>{
    if(disposed||!pointLike(origin)||!pointLike(target))return false;
    if(birds.length>=MAX_BIRDS)releaseBird(birds.shift(),scene);
    const p0=vec(origin),p3=vec(target);
    p0.y+=1.45;
    // An illuminated trajectory exposes the direct hit test, even on a miss.
    const distance=p0.distanceTo(p3);
    if(distance<.3)return false;
    // The physical arrow and visual spirit now follow EXACTLY one straight
    // segment from shoulder-height muzzle to the combat resolver's hit point.
    // The tracing line is not a separate weapon and cannot grant damage.
    const direction=tmp.copy(p3).sub(p0).normalize();
    const duration=Math.max(.36,Math.min(.75,distance/75+.28));
    const bird=makeBird();
    const root=new THREE.Group();
    bird.root.position.copy(p0);
    bird.root.quaternion.setFromUnitVectors(axis,direction);
    bird.root.scale.setScalar(.63);
    root.add(bird.root);
    const traceMaterial=new THREE.LineBasicMaterial({
      color:hitSeconds>0?0x81f6b1:0xffd375,
      transparent:true,opacity:.93,depthWrite:false,
      blending:THREE.AdditiveBlending,
    });
    const trace=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0,p3]),traceMaterial);
    trace.frustumCulled=false;
    root.add(trace);
    scene.add(root);
    birds.push({bird,root,traceMaterial,p0,p3,duration,elapsed:0});
    return true;
  };
  const confirmHit=()=>{
    if(disposed)return;
    hitSeconds=.23;
    const current=birds[birds.length-1];
    if(current)current.traceMaterial.color.setHex(0x81f6b1);
  };
  const update=(dt,{active=false,blocked=false}={})=>{
    if(disposed)return;
    const delta=Math.max(0,Math.min(Number(dt)||0,.08));
    hitSeconds=Math.max(0,hitSeconds-delta);
    if(overlay){
      overlay.host.style.opacity=active&&!blocked?'1':'0';
      const t=hitSeconds/.23;
      overlay.marker.style.opacity=active&&!blocked?String(clamp01(t)):'0';
      overlay.marker.style.transform='scale('+(1+.5*(1-t)).toFixed(3)+')';
    }
    for(let i=birds.length-1;i>=0;i--){
      const b=birds[i];
      b.elapsed+=delta;
      const t=clamp01(b.elapsed/b.duration);
      b.bird.root.position.lerpVectors(b.p0,b.p3,t);
      // The whole visible flight remains linear: no Bezier arc, sideways
      // steer, gravity drop, or curved dive that disagrees with the reticle.
      b.traceMaterial.opacity=.93*Math.min(1,(1-t)*4);
      b.bird.wings[0].rotation.z=Math.sin(b.elapsed*27)*.38;
      b.bird.wings[1].rotation.z=-Math.sin(b.elapsed*27)*.38;
      b.bird.root.scale.setScalar((.65+.18*Math.sin(Math.PI*t))*Math.min(1,(1-t)*8));
      if(t>=1){releaseBird(b,scene);birds.splice(i,1);}
    }
  };
  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    birds.splice(0).forEach(item=>releaseBird(item,scene));
    overlay?.host.remove();
  };
  return {fire,confirmHit,update,dispose};
}
