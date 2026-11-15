import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {CLONE_TOWN_HOUSES,CLONE_TOWN_GUARDS,CLONE_TOWN_CITIZENS,
  chooseTownPlots}
  from './WolfveilTownLivingQuarterLayout.mjs';
import {makeTownDialogueBrain,makeTownSentence,townConversationResult}
  from './WolfveilTownDialogueBrain.mjs';

// Clone-only: light procedural architecture + decorative NPC presentation.
// Not an extra terrain plate, not a new combat opponent, and never a client
// inventory grant. Every mesh is owned/disposed by the imported town handle.
const WORLD_SEED=20261114;
const mat=(hex,roughness=.8,extra={})=>new THREE.MeshStandardMaterial({
  color:hex,roughness,metalness:.025,...extra,
});
const noop=()=>{};
function writeLabel(label,{width=384,height=100,background='#101c2b',
  color='#f5e6c9',fontSize=28}={}){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 if(!ctx)return null;
 const paint=text=>{
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle=background;
  ctx.beginPath();
  ctx.roundRect(5,7,width-10,height-14,20);
  ctx.fill();
  ctx.lineWidth=3;ctx.strokeStyle='#c9aa72';ctx.stroke();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 '+fontSize+'px system-ui, sans-serif';
  const txt=String(text||'').replace(/[\r\n]/g,' ').slice(0,52);
  // Long lines are scaled down rather than overflowing or creating huge bars.
  const widthPx=ctx.measureText(txt).width;
  ctx.save();
  ctx.translate(width/2,height/2);
  if(widthPx>width-36)ctx.scale((width-36)/widthPx,1);
  ctx.fillText(txt,0,0);ctx.restore();
 };
 paint(label);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=THREE.LinearFilter;
 texture.magFilter=THREE.LinearFilter;
 return {texture,paint(text){paint(text);texture.needsUpdate=true;}};
}
const newSprite=(label,scale,options={})=>{
 const canvas=writeLabel(label,options);
 if(!canvas)return {sprite:null,draw:noop,dispose:noop};
 const material=new THREE.SpriteMaterial({
  map:canvas.texture,transparent:true,depthTest:true,depthWrite:false,
 });
 const sprite=new THREE.Sprite(material);
 sprite.scale.set(scale[0],scale[1],1);
 return {sprite,draw:canvas.paint,dispose(){material.dispose();canvas.texture.dispose();}};
};
function houseModel(h,materials){
 const root=new THREE.Group();
 root.name='CloneTownHouse_'+h.id;
 root.userData={houseId:h.id,role:h.role,walkable:false};
 root.position.set(h.x,h.y,h.z);
 const wallHeight=h.role==='lodge'?5.2:3.75;
 const thickness=.26;
 const add=(geometry,material,x,y,z,rx=0,rz=0)=>{
  const m=new THREE.Mesh(geometry,material);
  m.position.set(x,y,z);m.rotation.x=rx;m.rotation.z=rz;
  m.castShadow=true;m.receiveShadow=true;root.add(m);return m;
 };
 const box=(w,d,depth,x,y,z,material)=>add(new THREE.BoxGeometry(w,d,depth),material,x,y,z);
 const wall=materials.plaster,frame=materials.timber;
 // A shallow stone footing settles on the existing brick surface, but the
 // original floor mesh and collision heights never get altered.
 box(h.w+.4,.22,h.d+.4,0,.09,0,materials.stone);
 const frontX=h.facade==='east'?h.w/2:h.facade==='west'?-h.w/2:null;
 if(frontX!==null){
  box(h.w,.12,h.d,0,.21,0,materials.floor);
  box(h.w/2*2,.27,h.d,0,wallHeight+.28,0,frame);
  // Side facade with a deliberately centered 2.6m shop door.
  const remaining=(h.d-2.6)/2;
  for(const sign of [-1,1])
   box(thickness,wallHeight,remaining,frontX,wallHeight/2+.23,
     sign*(2.6+remaining)/2,wall);
  box(thickness,wallHeight-2.8,2.6,frontX,2.8+(wallHeight-2.8)/2+.23,0,wall);
  box(.10,2.72,2.38,frontX+(frontX>0?.075:-.075),1.58,0,materials.door);
  box(thickness,wallHeight,h.d,-frontX,wallHeight/2+.23,0,wall);
  box(h.w,wallHeight,thickness,0,wallHeight/2+.23,-h.d/2,wall);
  box(h.w,wallHeight,thickness,0,wallHeight/2+.23,h.d/2,wall);
  const signLabel=newSprite(h.name,[5.4,1.12],{fontSize:26});
  if(signLabel.sprite){
   signLabel.sprite.position.set(frontX+(frontX>0?.23:-.23),wallHeight+.48,0);
   root.add(signLabel.sprite);root.userData.signDispose=signLabel.dispose;
  }
 }else{
  // The one detached hall is roughly twice the footprint of a single shop.
  const rem=(h.w-3.6)/2;
  for(const sign of [-1,1])
    box(rem,wallHeight,thickness,sign*(3.6+rem)/2,wallHeight/2+.23,-h.d/2,wall);
  box(3.6,wallHeight-3.15,thickness,0,3.15+(wallHeight-3.15)/2+.23,-h.d/2,wall);
  box(3.36,3.05,.14,0,1.73,-h.d/2-.08,materials.door);
  box(h.w,wallHeight,thickness,0,wallHeight/2+.23,h.d/2,wall);
  for(const sign of [-1,1])
    box(thickness,wallHeight,h.d,sign*h.w/2,wallHeight/2+.23,0,wall);
  const signLabel=newSprite(h.name,[8.0,1.35],{fontSize:27});
  if(signLabel.sprite){
   signLabel.sprite.position.set(0,wallHeight+.42,-h.d/2-.25);
   root.add(signLabel.sprite);root.userData.signDispose=signLabel.dispose;
  }
 }
 // Twin pitched, tiled roof panels with dark cedar eaves. Their highest
 // point is well above any walkable tile and uses no intersecting bridge.
 const rise=h.role==='lodge'?2.6:1.85,half=h.w/2,angle=Math.atan2(rise,half);
 const panelWidth=Math.hypot(half+.65,rise);
 for(const dir of [-1,1]){
  const panel=add(new THREE.BoxGeometry(panelWidth,.24,h.d+1.45),
    materials.roof,dir*h.w/4,wallHeight+rise/2+.38,0,0,-dir*angle);
  panel.name='CloneTownRoof_'+h.id;
 }
 box(.32,.32,h.d+1.6,0,wallHeight+rise+.42,0,materials.timber);
 // Warm practical window panes (NOT cyan ground lights).
 for(const side of [-1,1]){
  const x=side*(h.w/2-.03);
  for(const z of [-h.d*.29,h.d*.29]){
   box(.045,1.02,1.28,x,2.32,z,materials.window);
   box(.09,.08,1.42,x,2.32,z,materials.timber);
   box(.11,1.15,.08,x,2.32,z,materials.timber);
  }
 }
 return root;
}
// Merge all static house boxes by PBR material: 9 buildings become a handful
// of draw calls, not hundreds of separate meshes. Keep each house parent and
// its independent name sign. If a Three.js attribute mismatch prevents a
// merge, leave the original buildings visible rather than losing the town.
function mergeStaticTownHouses(townRoot,houseGroups,materials){
 const buckets=new Map(),copies=[];
 for(const h of houseGroups){
  h.updateWorldMatrix(true,true);
  h.traverse(node=>{
   if(!node.isMesh)return;
   const geometry=node.geometry.clone();
   geometry.applyMatrix4(node.matrixWorld);
   copies.push(geometry);
   if(!buckets.has(node.material))buckets.set(node.material,[]);
   buckets.get(node.material).push(geometry);
  });
 }
 const mergedMeshes=[];
 try{
  for(const [material,geometries] of buckets){
   const combined=mergeGeometries(geometries,false);
   if(!combined)throw Error('Different vertex attributes in town meshes');
   const mesh=new THREE.Mesh(combined,material);
   mesh.name='CloneTown_BatchedArchitecture';
   mesh.castShadow=true;mesh.receiveShadow=true;
   mergedMeshes.push(mesh);
  }
 }catch(err){
  for(const mesh of mergedMeshes)mesh.geometry.dispose();
  for(const g of copies)g.dispose();
  console.warn('Wolfveil town geometry batching unavailable; using separate houses',err);
  return false;
 }
 // Only remove the original meshes when every merged group exists.
 for(const h of houseGroups){
  const list=[];
  h.traverse(node=>{if(node.isMesh)list.push(node);});
  for(const node of list){
   node.parent?.remove(node);node.geometry.dispose();
  }
 }
 for(const mesh of mergedMeshes)townRoot.add(mesh);
 for(const g of copies)g.dispose();
 return true;
}
function makeCitizen(agent,materials){
 const actor=new THREE.Group();
 actor.name='CloneTownNPC_'+agent.id;
 actor.userData={npcId:agent.id,role:agent.role,nonCombat:true};
 const guard=agent.role==='guard';
 const clothes=guard?materials.guard:agent.role==='smith'?materials.smith:
   agent.role==='resident'?materials.resident:materials.vendor;
 const head=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),materials.skin);
 head.position.y=1.59;actor.add(head);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.24,9,7),materials.hair);
 hair.position.y=1.76;hair.scale.y=.55;actor.add(hair);
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.60,4,8),clothes);
 torso.position.y=1.05;actor.add(torso);
 const legGeo=new THREE.CapsuleGeometry(.10,.50,3,7),limbs=[];
 for(const x of [-.17,.17]){
  const legJoint=new THREE.Group();legJoint.position.set(x,.72,0);
  const leg=new THREE.Mesh(legGeo,materials.trousers);leg.position.y=-.35;
  legJoint.add(leg);actor.add(legJoint);limbs.push(legJoint);
 }
 const armGeo=new THREE.CapsuleGeometry(.09,.46,3,7),arms=[];
 for(const x of [-.36,.36]){
  const shoulder=new THREE.Group();shoulder.position.set(x,1.42,0);
  const arm=new THREE.Mesh(armGeo,guard?materials.guard:clothes);
  arm.position.y=-.31;shoulder.add(arm);actor.add(shoulder);arms.push(shoulder);
 }
 if(guard){
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.29,.3,.17,10),materials.guardHelm);
  cap.position.y=1.76;actor.add(cap);
  const staff=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2,8),materials.timber);
  staff.position.set(.48,1.03,-.04);actor.add(staff);
 }
 const speech=newSprite('',[2.9,.76],{width:384,height:94,fontSize:29,
   background:'#0d182bdc',color:'#f8eee2'});
 if(speech.sprite){
  speech.sprite.position.set(0,2.13,0);
  speech.sprite.visible=false;actor.add(speech.sprite);
 }
 return {actor,limbs,arms,speech};
}
function houseBlocked(plots,x,z,pad=.52){
 return plots.some(h=>Math.abs(x-h.x)<h.w/2+pad&&Math.abs(z-h.z)<h.d/2+pad);
}
function slideAgainstHouses(plots,position,previous,pad){
 if(!previous||!houseBlocked(plots,position.x,position.z,pad)||
   houseBlocked(plots,previous.x,previous.z,pad))return false;
 if(!houseBlocked(plots,position.x,previous.z,pad))position.z=previous.z;
 else if(!houseBlocked(plots,previous.x,position.z,pad))position.x=previous.x;
 else{position.x=previous.x;position.z=previous.z;}
 return true;
}
/**
 * Runs after the imported model's clearance and floor/collision bake.
 * Each accepted house is an explicit 3D mesh with bounded collision. NPC
 * motion and dialogue are purely client presentation; rewards never minted.
 */
export function buildWolfveilTownLivingQuarter(parent,{collision,onStatus}={}){
 if(!parent||!collision)return null;
 const layout=chooseTownPlots(collision);
 const root=new THREE.Group();root.name='CloneTown_LivingQuarter';
 parent.add(root);
 const materials={
  plaster:mat(0xd7cfbd),stone:mat(0x898982),floor:mat(0x9d9685),
  timber:mat(0x493a33),roof:mat(0x374c67,.55),door:mat(0x65503a),
  window:mat(0xd9b976,.35,{emissive:0x604126,emissiveIntensity:.38}),
  skin:mat(0xb99374),hair:mat(0x28212b),guard:mat(0x415873),
  guardHelm:mat(0x9d895e,.42),vendor:mat(0x7d7060),
  resident:mat(0x5d7970),smith:mat(0x634d46),trousers:mat(0x393940),
 };
 const houseGroups=layout.accepted.map(h=>houseModel(h,materials));
 for(const house of houseGroups)root.add(house);
 const architectureBatched=mergeStaticTownHouses(root,houseGroups,materials);
 const houses=new Map(layout.accepted.map(h=>[h.id,h]));
 const agents=[];
 const ground=(x,z)=>collision.groundAt(x,z);
 const createAgent=(data,initialX,initialZ)=>{
  if(!Number.isFinite(ground(initialX,initialZ))||
      houseBlocked(layout.accepted,initialX,initialZ,1.0)||
      collision.isSolid(initialX,initialZ))return;
  const model=makeCitizen(data,materials);
  root.add(model.actor);
  const brain=makeTownDialogueBrain(WORLD_SEED+agents.length*1559);
  const agent={...data,...model,rand:brain,
    x:initialX,z:initialZ,timer:5+brain()*16,chatLeft:0,
    stepPhase:brain()*Math.PI*2,progress:0,moving:false};
  model.actor.position.set(initialX,ground(initialX,initialZ),initialZ);
  agents.push(agent);
 };
 for(const h of layout.accepted){
  if(h.role==='lodge'){
   createAgent({id:'town_warden',name:'Warden Ilan',role:'guard',
     questNpcId:'archer_vex'},h.x,h.z-h.d/2-3.5);
   continue;
  }
  const def=CLONE_TOWN_CITIZENS.find(c=>c.houseId===h.id);
  const x=h.x+(h.facade==='east'?h.w/2+3.1:-h.w/2-3.1);
  if(def)createAgent({...def,homeX:x,homeZ:h.z},x,h.z);
 }
 for(const def of CLONE_TOWN_GUARDS){
  const p=def.route[0];
  createAgent({...def,questNpcId:def.side==='left'?'archer_vex':'archer_lyra'},
    p[0],p[1]);
 }
 const placed=layout.accepted.length;
 const report={plannedHouses:CLONE_TOWN_HOUSES.length,houses:placed,
   architectureBatched,
   shops:layout.accepted.filter(h=>h.role==='shop').length,
   citizens:agents.length,guards:agents.filter(a=>a.role==='guard').length,
   rejected:layout.rejected};
 root.userData.cloneTownQuarter=report;onStatus?.(report);
 let now=0,disposed=false;
 function nearestResident(player,maxDistance=3.7){
  if(!player||disposed)return null;
  let best=null,near=maxDistance;
  for(const a of agents){
   const d=Math.hypot(a.actor.position.x-player.x,a.actor.position.z-player.z);
   if(d<near){best=a;near=d;}
  }
  return best?{id:best.id,name:best.name,role:best.role,questNpcId:best.questNpcId||null}:null;
 }
 function interact(player){
  const pick=nearestResident(player);
  if(!pick)return null;
  const a=agents.find(v=>v.id===pick.id);
  const friend=agents.find(v=>v!==a&&v.side===a.side&&
    Math.hypot(v.x-a.x,v.z-a.z)<6);
  const result=townConversationResult(a,a.rand,{friend});
  a.timer=4+a.rand()*5;
  return result;
 }
 function update(delta,playerPosition){
  if(disposed)return;
  const dt=Math.max(0,Math.min(Number(delta)||0,.08));now+=dt;
  for(const a of agents){
   const oldX=a.x,oldZ=a.z;
   if(a.route&&Array.isArray(a.route)&&a.route.length===2){
    const [[ax,az],[bx,bz]]=a.route;
    const length=Math.hypot(bx-ax,bz-az);
    a.progress=(a.progress+dt*a.speed)%(2*length);
    const ratio=a.progress<length?a.progress/length:2-a.progress/length;
    const nx=ax+(bx-ax)*ratio,nz=az+(bz-az)*ratio;
    if(Number.isFinite(ground(nx,nz))&&!collision.isSolid(nx,nz)&&
        !houseBlocked(layout.accepted,nx,nz,1)){
      a.x=nx;a.z=nz;
    }
   }else if(a.homeX!=null){
    const nx=a.homeX+Math.sin(now*.44+a.stepPhase)*.62,
      nz=a.homeZ+Math.cos(now*.33+a.stepPhase)*.5;
    if(Number.isFinite(ground(nx,nz))&&!collision.isSolid(nx,nz)&&
        !houseBlocked(layout.accepted,nx,nz,.6)){a.x=nx;a.z=nz;}
   }
   const motion=Math.hypot(a.x-oldX,a.z-oldZ),moving=motion>dt*.05;
   a.actor.position.set(a.x,ground(a.x,a.z)??a.actor.position.y,a.z);
   if(moving)a.actor.rotation.y=Math.atan2(a.x-oldX,a.z-oldZ);
   a.stepPhase+=dt*(moving?7:1.2);
   const stride=moving?Math.sin(a.stepPhase)*.37:0;
   a.limbs[0].rotation.x=stride;a.limbs[1].rotation.x=-stride;
   a.arms[0].rotation.x=-stride*.56;a.arms[1].rotation.x=stride*.56;
   a.timer-=dt;a.chatLeft=Math.max(0,a.chatLeft-dt);
   if(a.timer<=0){
    const friend=agents.find(v=>v!==a&&v.side===a.side&&
      Math.hypot(v.x-a.x,v.z-a.z)<7.5);
    const replying=typeof a.pendingReply==='string';
    const text=replying?a.pendingReply:makeTownSentence(a,a.rand,{friend});
    a.pendingReply=null;
    a.speech.draw(text);
    a.chatLeft=3.6+a.rand()*1.9;
    a.timer=11+a.rand()*16;
    if(friend){
      // When two guards cross paths, briefly face one another and trade
      // two short, asynchronous lines rather than repeating solo chatter.
      a.actor.rotation.y=Math.atan2(friend.x-a.x,friend.z-a.z);
      if(!replying&&!friend.pendingReply&&friend.chatLeft<=0){
        friend.pendingReply=a.role==='guard'?
          'All clear. I will take the next watch.':
          'Thanks. The market has been peaceful.';
        friend.timer=Math.min(friend.timer,1.65);
      }
    }
   }
   // Wide-area avatar visibility culling to avoid the 100+ NPC actor draw
   // calls when no player is nearby; ambient patrol logic still advances.
   const away=playerPosition?
     Math.hypot(playerPosition.x-a.x,playerPosition.z-a.z):Infinity;
   a.actor.visible=away<65;
   if(a.speech.sprite){
    const visible=playerPosition&&
      Math.hypot(playerPosition.x-a.x,playerPosition.z-a.z)<24&&
      a.chatLeft>0;
    a.speech.sprite.visible=Boolean(visible);
   }
  }
 }
 function dispose(){
  if(disposed)return;disposed=true;
  parent.remove(root);
  for(const a of agents)a.speech.dispose();
  root.traverse(node=>{
   if(node.userData?.signDispose)node.userData.signDispose();
   if(node.isMesh)node.geometry.dispose();
  });
  for(const m of Object.values(materials))m.dispose();
  root.clear();
 }
 return {
  root,report,get houses(){return [...layout.accepted];},
  get agents(){return agents.map(a=>({id:a.id,name:a.name,x:a.x,z:a.z,role:a.role}));},
  update,nearestResident,interact,
  isSolid(x,z){return houseBlocked(layout.accepted,x,z,.52);},
  resolveCollision(position,previous,radius=.55){
    return slideAgainstHouses(layout.accepted,position,previous,Math.max(.3,radius));
  },
  dispose,
 };
}
