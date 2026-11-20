// Small, local Wolfveil cave watch. NPCs are noncombat, have no collision
// mesh, do not mint inventory/XP, and use the existing E-dialogue quest handoff.
import * as THREE from 'three';
import {planWolfveilCaveWatch} from './WolfveilCaveWatchPlan.mjs';
import {attachWolfveilGuardVisual} from './WolfveilGuardVisuals.mjs';

function makeFallback() {
  const meshGroup = new THREE.Group(), limbs=[];
  const armor=new THREE.MeshStandardMaterial({color:0x425167,metalness:0.25,roughness:0.74});
  const face=new THREE.MeshStandardMaterial({color:0xb89177,roughness:0.92});
  const helm=new THREE.MeshStandardMaterial({color:0x6b6470,metalness:0.48,roughness:0.45});
  const shapes=[];
  const add=(geometry,material,y,group=meshGroup)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=y;group.add(mesh);shapes.push(geometry);return mesh;
  };
  add(new THREE.CapsuleGeometry(.28,.65,4,8),armor,1.02);
  add(new THREE.SphereGeometry(.23,10,8),face,1.6);
  add(new THREE.CylinderGeometry(.29,.3,.14,10),helm,1.75);
  for(const x of [-.17,.17]){
    const leg=new THREE.Group();leg.position.set(x,.71,0);
    add(new THREE.CapsuleGeometry(.10,.50,3,7),armor,-.34,leg);
    meshGroup.add(leg);limbs.push(leg);
  }
  for(const x of [-.36,.36]){
    const arm=new THREE.Group();arm.position.set(x,1.41,0);
    add(new THREE.CapsuleGeometry(.09,.46,3,7),armor,-.31,arm);
    meshGroup.add(arm);limbs.push(arm);
  }
  return {
    root:meshGroup,
    update(t){limbs[0].rotation.x=Math.sin(t)*.025;limbs[1].rotation.x=-Math.sin(t)*.025;},
    dispose(){for(const shape of shapes)shape.dispose();[armor,face,helm].forEach(m=>m.dispose());},
  };
}
function makeLabel(text) {
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=68;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='rgba(17,27,41,0.87)';ctx.fillRect(2,2,316,64);
  ctx.strokeStyle='#c6a675';ctx.strokeRect(2,2,316,64);
  ctx.font='bold 25px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f7e6c0';
  ctx.fillText(text,160,34,302);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(mat);sprite.position.y=2.25;sprite.scale.set(2.5,.54,1);
  return {sprite,dispose(){mat.dispose();tex.dispose();}};
}

export function createWolfveilCaveWatch(parent,{caveSystem,offsetZ=70,mode='both'}={}) {
  if (!parent || !caveSystem) return null;
  const group=new THREE.Group();group.name='FallingSky_JadeTunnel_Watch';
  parent.add(group);
  let destroyed=false,elapsed=0;
  const guards=planWolfveilCaveWatch().filter(g=>
    mode==='both'||(mode==='inside'&&g.inside)||(mode==='outside'&&!g.inside)
  ).map(plan=>{
    const actor=new THREE.Group();actor.name='FallingSky_TunnelGuard_'+plan.id;
    actor.userData={npcId:plan.id,nonCombat:true,role:'guard',questNpcId:plan.questNpcId};
    actor.position.set(plan.x,plan.y,plan.z);actor.rotation.y=plan.facing;
    group.add(actor);
    const fallback=makeFallback();actor.add(fallback.root);
    const label=makeLabel(plan.name+(plan.questNpcId?' · ?':''));if(label)actor.add(label.sprite);
    const visual=attachWolfveilGuardVisual(actor,plan.variant,{
      onAttached:()=>{fallback.root.visible=false;},
    });
    return { ...plan,actor,fallback,label,visual };
  });
  const activeFor=guard=>guard.inside===Boolean(caveSystem.isActive());
  const distance=(plan,pos)=>Math.hypot(plan.x-pos.x,plan.z-(pos.z-offsetZ));
  function nearestResident(player,maxDistance=3.7) {
    if(destroyed||!player)return null;
    let selected=null,best=maxDistance;
    for(const g of guards){
      if(!activeFor(g)||Math.abs(g.y-player.y)>3.6)continue;
      const d=distance(g,player);if(d>=best)continue;
      best=d;selected=g;
    }
    return selected?{
      id:selected.id,name:selected.name,role:'guard',
      questNpcId:selected.questNpcId,
    }:null;
  }
  function interact(player) {
    const candidate=nearestResident(player);
    if(!candidate)return null;
    const found=guards.find(g=>g.id===candidate.id);
    if(!found)return null;
    return {
      id:found.id,name:found.name,role:'guard',questNpcId:found.questNpcId,
      questOffer:Boolean(found.questNpcId),text:found.line,canGrantItems:false,
    };
  }
  function update(dt,player) {
    if(destroyed)return;
    elapsed+=Math.max(0,Math.min(.1,Number(dt)||0));
    for(const guard of guards){
      const nearby=player && distance(guard,player)<65;
      guard.actor.visible=Boolean(nearby&&activeFor(guard));
      if(!guard.actor.visible)continue;
      guard.visual.update(dt,false);
      if(!guard.visual.loaded)guard.fallback.update(elapsed*.7);
    }
  }
  function dispose() {
    if(destroyed)return;destroyed=true;
    for(const g of guards){g.visual.dispose();g.label?.dispose();g.fallback.dispose();}
    group.removeFromParent();group.clear();
  }
  return {group,get count(){return guards.length;},nearestResident,interact,update,dispose};
}
