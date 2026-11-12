// Passive Game 1 forest wildlife. Small, stylised but anatomical deer and
// boar (ellipsoid bodies, tapered legs, ears, antlers, tusks), with one
// InstancedMesh draw per species rather than many tiny Game 2 style boxes.
// Wildlife never changes server combat, quests, rewards or hitpoints.
import * as THREE from 'three';
import { ForestMeshWriter } from './forestBiomeMeshes.js';
import { game1ForestHeight,game1ForestTrees,forestStreamDistance,seededRandom } from './forestBiomeData.js';

function ellipsoid(mesh,center,scale,color,quality=10,flex=0) {
  const [cx,cy,cz]=center,[rx,ry,rz]=scale;
  const rings=5,sides=quality;
  for(let i=0;i<rings;i++){
    const a=i/rings*Math.PI,b=(i+1)/rings*Math.PI;
    for(let j=0;j<sides;j++){
      const c=j/sides*2*Math.PI,d=(j+1)/sides*2*Math.PI;
      const v=(theta,phi)=>[cx+Math.cos(phi)*Math.sin(theta)*rx,
        cy+Math.cos(theta)*ry,cz+Math.sin(phi)*Math.sin(theta)*rz];
      mesh.quad(v(a,c),v(a,d),v(b,d),v(b,c),color,[flex,flex,flex,flex]);
    }
  }
}
function limb(mesh,a,b,thickness,color,segments=6,legId=0) {
  const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
  const right=len>.0001?[-dz/len,0,dx/len]:[1,0,0];
  const forward=[0,0,1];
  for(let i=0;i<segments;i++){
    const t=i/segments*Math.PI*2,u=(i+1)/segments*Math.PI*2;
    const p=(base,k,angle)=>[base[0]+Math.cos(angle)*right[0]*thickness*k+Math.sin(angle)*forward[0]*thickness*k,
      base[1],base[2]+Math.cos(angle)*right[2]*thickness*k+Math.sin(angle)*forward[2]*thickness*k];
    mesh.quad(p(a,1,t),p(a,1,u),p(b,.54,u),p(b,.54,t),color,
      [legId,legId,legId,legId]);
  }
}
export function buildGame1Animal(type='deer') {
  const g=new ForestMeshWriter(),boar=type==='boar';
  const coat=boar?[.37,.28,.23]:[.51,.34,.20];
  const dark=boar?[.23,.18,.15]:[.31,.23,.17];
  const cream=[.88,.79,.61];
  const bodyHeight=boar?.87:1.17;
  ellipsoid(g,[0,bodyHeight,0],[boar?.56:.45,boar?.53:.37,boar?.92:.94],coat,12);
  ellipsoid(g,[0,boar?1.17:1.45,.59],[boar?.47:.25,boar?.53:.52,boar?.55:.33],coat,10);
  ellipsoid(g,[0,boar?1.26:1.91,boar?1.02:.92],
    [boar?.40:.21,boar?.34:.23,boar?.44:.36],coat,11);
  ellipsoid(g,[0,boar?1.15:1.83,boar?1.37:1.20],
    [boar?.23:.12,.13,.13],boar?[.70,.47,.41]:cream,8);
  for(const side of [-1,1]){
    // four nonparallel tapered legs and darker hooves.
    for(const z of [-.65,.56]){
      const x=side*(boar?.31:.29),top=[x,boar?.81:1.03,z];
      const legId=(side<0?0:2)+(z<0?1:2);
      const knee=[x+side*.03,.43,z+(z>0?.07:-.09)];
      const hoof=[x,.06,z+(z>0?.06:-.14)];
      limb(g,top,knee,boar?.17:.105,coat,6,legId);
      limb(g,knee,hoof,boar?.13:.074,dark,6,legId);
      ellipsoid(g,[hoof[0],.06,hoof[2]+.10],[boar?.16:.095,.075,.18],dark,7,legId);
    }
    // ears lean to left/right rather than forming a blocky head.
    ellipsoid(g,[side*(boar?.38:.32),boar?1.47:2.07,boar?.81:.95],
      [boar?.20:.16,.11,.075],boar?dark:cream,7);
    if(boar){
      ellipsoid(g,[side*.32,1.13,1.27],[.10,.12,.20],cream,7); // tusks
    }else{
      const base=[side*.13,2.05,.76],top=[side*.38,2.78,.56];
      limb(g,base,top,.045,dark,5);
      limb(g,[side*.26,2.40,.69],[side*.57,2.57,.90],.035,dark,5);
    }
  }
  ellipsoid(g,[0,boar?1.01:1.19,-.96],[.14,.14,.29],boar?dark:cream,7);
  return g.geometry();
}
function safeWildlifePosition(x,z,trees) {
  if(Math.hypot(x,z)<17||forestStreamDistance(x,z)<4.3)return false;
  return !trees.some(t=>Math.hypot(x-t.x,z-t.z)<t.radius+2.3);
}
export function game1ForestWildlifeSites(trees=game1ForestTrees(),count=12){
  const random=seededRandom(0x85ba61),animals=[];
  for(let tries=0;tries<1200&&animals.length<count;tries++){
    const x=(random()-.5)*110,z=(random()-.5)*110;
    if(!safeWildlifePosition(x,z,trees))continue;
    animals.push({x,z,y:game1ForestHeight(x,z),type:animals.length%3===0?'boar':'deer'});
  }
  return animals;
}
export class Game1ForestWildlife {
  constructor(scene,trees=game1ForestTrees()){
    this.trees=trees;this.random=seededRandom(9045);
    const geometry={deer:buildGame1Animal('deer'),boar:buildGame1Animal('boar')};
    this.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89,side:THREE.DoubleSide});
    // Lightweight quadruped gait: shader bends each lower leg and hoof in
    // alternating phases while keeping the pelvis/shoulders anchored.
    // No CPU-side skinning and no extra animated Mesh per animal.
    this.gaitUniform={value:0};
    this.material.customProgramCacheKey=()=> 'game1-deer-boar-gait-v1';
    this.material.onBeforeCompile=shader=>{
      shader.uniforms.uAnimalTime=this.gaitUniform;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>',`#include <common>\nattribute float aFlex;\nuniform float uAnimalTime;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>\nif(aFlex>.5){\n  float ankle=1.0-smoothstep(.14,1.2,position.y);\n  float phase=aFlex*1.570796+position.x*.6;\n  transformed.z+=sin(uAnimalTime*5.1+phase)*ankle*.10;\n  transformed.y+=max(0.0,sin(uAnimalTime*5.1+phase))*ankle*.055;\n}`);
    };
    this.animals=game1ForestWildlifeSites(trees).map((p,i)=>({
      ...p,yaw:i*.73,nextTurn:.5+this.random()*2,
      walkSpeed:.35+this.random()*.42,phase:i*.53,state:'wander',
    }));
    this.meshes={};
    for(const type of ['deer','boar']){
      const count=this.animals.filter(a=>a.type===type).length;
      this.meshes[type]=new THREE.InstancedMesh(geometry[type],this.material,count);
      this.meshes[type].name='Game 1 passive '+type+' wildlife';
      this.meshes[type].frustumCulled=false;
      scene.add(this.meshes[type]);
    }
    this.scene=scene;this.dummy=new THREE.Object3D();this.elapsed=0;
    this.sync();
  }
  sync(){
    const indices={deer:0,boar:0};
    for(const a of this.animals){
      this.dummy.position.set(a.x,a.y+
        (a.state==='flee'?.035:.015)*Math.sin(this.elapsed*(a.state==='flee'?11:5)+a.phase),a.z);
      this.dummy.rotation.y=a.yaw;
      this.dummy.scale.setScalar(a.type==='boar'?.82:.76);
      this.dummy.updateMatrix();
      this.meshes[a.type].setMatrixAt(indices[a.type]++,this.dummy.matrix);
    }
    for(const m of Object.values(this.meshes))m.instanceMatrix.needsUpdate=true;
  }
  update(dt,hero){
    const step=Math.min(Math.max(dt,0),.05),r=this.random;
    this.elapsed+=step;
    this.gaitUniform.value=this.elapsed;
    for(const a of this.animals){
      const dx=a.x-(hero?.x??0),dz=a.z-(hero?.z??0),distance=Math.hypot(dx,dz);
      a.state=distance<11?'flee':'wander';
      a.nextTurn-=step;
      if(a.state==='flee')a.yaw=Math.atan2(dx,dz)+(r()-.5)*.06;
      else if(a.nextTurn<=0){a.yaw+=(r()-.5)*1.25;a.nextTurn=1+r()*2.5;}
      const speed=a.walkSpeed*(a.state==='flee'?4.2:1);
      const nx=a.x+Math.sin(a.yaw)*speed*step,nz=a.z+Math.cos(a.yaw)*speed*step;
      if(Math.hypot(nx,nz)>96||!safeWildlifePosition(nx,nz,this.trees)) {
        a.yaw+=Math.PI*.61;continue;
      }
      a.x=nx;a.z=nz;a.y=game1ForestHeight(nx,nz);
    }
    this.sync();
  }
  dispose(){
    for(const mesh of Object.values(this.meshes)){this.scene.remove(mesh);
      mesh.geometry.dispose();mesh.dispose();}
    this.material.dispose();
  }
}
