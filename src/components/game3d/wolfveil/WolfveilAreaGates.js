// Spirit-veil borders and walk-through torii gates for the five Wolfveil
// areas (streaming/WolfveilAreaVeils.mjs). Drop-in for the light arches of
// WolfveilAreaPortals.js (same update/setEnabled/visibleIds API), plus
// client collision: the veils let a mover cross a border only through a
// gate opening, and the gate posts are solid.
//
// Cheap and always loaded: one veil mesh for every border, four merged torii
// meshes, one membrane mesh; a gate's destination label holds a texture only
// while the camera is near it. Positions are Wolfveil LOCAL metres in the
// valley group. The area loader never manages it (wolfveilAreaShared).
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {wolfveilHeight} from './WolfveilLayout.js';
import {
  WOLFVEIL_AREA_VEIL_LINES,wolfveilAreaGates,wolfveilAreaGatePosts,wolfveilAreaGateDestination,
  wolfveilAreaColor,resolveWolfveilAreaVeilMovement,
} from './streaming/WolfveilAreaVeils.mjs';
import {wolfveilAreaAtLocal} from './streaming/WolfveilFiveAreaPlan.mjs';

export const WOLFVEIL_AREA_VEIL_STYLE=Object.freeze({
  height:38,          // mist rises this far above the ground
  sample:6,           // metres between veil columns
  layers:[-1.8,1.8],  // two sheets either side of the border for depth
  labelRange:48,      // gate labels exist (and hold a texture) only this close
  approach:3.2,       // the crossing mist starts this far from a gate plane
  reportRange:220,    // visibleIds(): gates of the current area within this
});
const S=WOLFVEIL_AREA_VEIL_STYLE;

const NOISE=`
float wvHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wvNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(wvHash(i),wvHash(i+vec2(1,0)),f.x),mix(wvHash(i+vec2(0,1)),wvHash(i+vec2(1,1)),f.x),f.y);}
float wvFbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*wvNoise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}
`;
const VEIL_VERTEX=`
attribute vec2 aSheet;attribute float aBase;attribute vec2 aSide;attribute vec3 aColA;attribute vec3 aColB;
varying vec3 vLocal;varying vec2 vSheet;varying float vBase;varying vec2 vSide;varying vec3 vColA;varying vec3 vColB;
#include <common>
#include <fog_pars_vertex>
void main(){
  vLocal=position;vSheet=aSheet;vBase=aBase;vSide=aSide;vColA=aColA;vColB=aColB;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const VEIL_FRAGMENT=`
uniform float uTime;uniform vec3 uCam;uniform vec4 uGates[24];uniform int uGateCount;
varying vec3 vLocal;varying vec2 vSheet;varying float vBase;varying vec2 vSide;varying vec3 vColA;varying vec3 vColB;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main(){
  float h=vLocal.y-vBase;
  // The colour of the area BEYOND the veil, seen from the camera's side.
  vec3 beyond=dot(uCam.xz-vLocal.xz,vSide)>0.?vColB:vColA;
  vec2 flow=vec2(vSheet.x+vSheet.y*3.7,h*.07-uTime*.035);
  float n=wvFbm(flow+vec2(uTime*.02,0.));
  float n2=wvFbm(flow*2.3+vec2(-uTime*.05,uTime*.01));
  float density=1.-smoothstep(5.,34.,h+(n-.5)*12.);
  float alpha=density*mix(.6,.98,smoothstep(.25,.75,n))*(vSheet.y>.5?.78:.9);
  for(int i=0;i<24;i++){
    if(i>=uGateCount)break;
    vec4 g=uGates[i];
    float d=length(vLocal.xz-g.xy);
    alpha*=1.-(1.-smoothstep(g.z-.2,g.z+1.5,d))*(1.-smoothstep(g.w-.6,g.w+.9,vLocal.y));
  }
  alpha*=smoothstep(.8,7.,length(uCam-vLocal));
  vec3 mist=mix(vec3(.84,.89,.97),beyond,.36)*(.82+.32*n2);
  mist+=beyond*.28*(1.-smoothstep(0.,9.,h));
  gl_FragColor=vec4(mist,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const MEMBRANE_VERTEX=`
attribute vec2 aPortalUv;attribute vec3 aColBehind;attribute vec3 aColAhead;attribute vec4 aGate;attribute float aAspect;
varying vec2 vUvP;varying vec3 vLocal;varying vec3 vBehind;varying vec3 vAhead;varying vec4 vGate;varying float vAspect;
#include <common>
#include <fog_pars_vertex>
void main(){
  vUvP=aPortalUv;vLocal=position;vBehind=aColBehind;vAhead=aColAhead;vGate=aGate;vAspect=aAspect;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const MEMBRANE_FRAGMENT=`
uniform float uTime;uniform vec3 uCam;
varying vec2 vUvP;varying vec3 vLocal;varying vec3 vBehind;varying vec3 vAhead;varying vec4 vGate;varying float vAspect;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main(){
  // vGate = (x, z, facing.x, facing.z): show the area you would enter.
  bool ahead=dot(uCam.xz-vGate.xy,vGate.zw)>0.;
  vec3 target=ahead?vBehind:vAhead;
  vec2 c=(vUvP-.5)*vec2(vAspect,1.);
  float r=length(c),a=atan(c.y,c.x);
  float swirl=wvFbm(vec2(a*1.6+r*7.-uTime*.9,r*4.-uTime*.35));
  float rim=smoothstep(.5,.36,max(abs(vUvP.x-.5),abs(vUvP.y-.5)*.92));
  vec3 col=mix(target*.55,vec3(1.),pow(swirl,2.6))+target*(1.-smoothstep(0.,.6,r))*.55;
  col+=vec3(1.)*pow(1.-smoothstep(.0,.08,abs(swirl-.55)),3.)*.35;
  float fade=smoothstep(.6,3.,length(uCam-vLocal));
  gl_FragColor=vec4(col,.93*rim*mix(.35,1.,fade));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function buildVeilGeometry(heightAt){
  const pos=[],sheet=[],base=[],side=[],colA=[],colB=[],index=[];
  for(const line of WOLFVEIL_AREA_VEIL_LINES){
    const samples=[];
    for(let i=0;i<line.points.length-1;i++){
      const [ax,az]=line.points[i],[bx,bz]=line.points[i+1];
      const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/S.sample));
      for(let k=i===0?0:1;k<=n;k++)samples.push([ax+(bx-ax)*k/n,az+(bz-az)*k/n]);
    }
    const [ax,az]=line.points[0],[bx,bz]=line.points[line.points.length-1];
    const len=Math.hypot(bx-ax,bz-az)||1,nx=(bz-az)/len,nz=-(bx-ax)/len;
    // Which area lies on the +normal side of this border.
    const mid=samples[samples.length>>1];
    const plus=wolfveilAreaAtLocal(mid[0]+nx*6,mid[1]+nz*6);
    const [ra,rb]=line.areas,cPlus=wolfveilAreaColor(plus===ra?ra:rb),cMinus=wolfveilAreaColor(plus===ra?rb:ra);
    S.layers.forEach((offset,layer)=>{
      const start=pos.length/3;
      let distance=0;
      samples.forEach(([x,z],i)=>{
        if(i>0)distance+=Math.hypot(x-samples[i-1][0],z-samples[i-1][1]);
        const px=x+nx*offset,pz=z+nz*offset,y=heightAt(px,pz);
        for(const top of [0,1]){
          pos.push(px,top?y+S.height:y-6,pz);
          sheet.push(distance/14,layer);base.push(y);side.push(nx,nz);
          colA.push(...cPlus);colB.push(...cMinus);
        }
        if(i>0){const a=start+(i-1)*2,b=start+i*2;index.push(a,b,a+1,b,b+1,a+1);}
      });
    });
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aSheet',new THREE.Float32BufferAttribute(sheet,2));
  g.setAttribute('aBase',new THREE.Float32BufferAttribute(base,1));
  g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,2));
  g.setAttribute('aColA',new THREE.Float32BufferAttribute(colA,3));
  g.setAttribute('aColB',new THREE.Float32BufferAttribute(colB,3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

// One torii per gate, merged by material across every gate.
function buildToriiGeometry(gates){
  const parts={lacquer:[],ink:[],stone:[],glow:[]};
  const frame=new THREE.Object3D();
  const add=(kind,geometry,x,y,z,{bend=0,rotX=0,color=null}={})=>{
    if(bend){
      const p=geometry.attributes.position,half=geometry.parameters.width/2;
      for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+bend*(p.getX(i)/half)**2);
    }
    if(rotX)geometry.rotateX(rotX);
    geometry.translate(x,y,z);
    geometry.applyMatrix4(frame.matrix);
    if(color){
      const c=new Float32Array(geometry.attributes.position.count*3);
      for(let i=0;i<c.length;i+=3)c.set(color,i);
      geometry.setAttribute('color',new THREE.BufferAttribute(c,3));
    }
    for(const name of Object.keys(geometry.attributes))
      if(!['position','normal','color'].includes(name))geometry.deleteAttribute(name);
    parts[kind].push(geometry.toNonIndexed());
  };
  for(const {gate,postBottoms} of gates){
    frame.position.set(gate.x,gate.baseY,gate.z);
    frame.rotation.set(0,gate.yaw,0);
    frame.updateMatrix();
    const H=gate.height,R=gate.postRadius,px=gate.halfWidth+R,span=2*px;
    const a=wolfveilAreaColor(gate.behind),b=wolfveilAreaColor(gate.ahead);
    const glow=a.map((v,i)=>(v+b[i])*.5);
    // wolfveilAreaGatePosts lists the +X (lateral) post first.
    [1,-1].forEach((s,i)=>{
      const bottom=postBottoms[i]-gate.baseY,height=H+.2-bottom;
      add('lacquer',new THREE.CylinderGeometry(R*.82,R,height,14),s*px,bottom+height/2,0);
      add('stone',new THREE.CylinderGeometry(R*1.45,R*1.6,.5,14),s*px,bottom+.2,0);
      for(const y of [1.25,H-1.9])
        add('glow',new THREE.TorusGeometry(R*1.02,.05,6,20),s*px,Math.max(bottom+.6,y),0,{rotX:Math.PI/2,color:glow});
    });
    add('lacquer',new THREE.BoxGeometry(span+1.3,.34,.38),0,H-1.15,0);
    add('lacquer',new THREE.BoxGeometry(.28,.82,.3),0,H-.57,0);
    add('lacquer',new THREE.BoxGeometry(span+1.8,.3,.56,8,1,1),0,H+.32,0,{bend:.12});
    add('ink',new THREE.BoxGeometry(span+2.6,.4,.74,16,1,1),0,H+.66,0,{bend:.34});
  }
  const merged={};
  for(const [kind,list] of Object.entries(parts)){
    merged[kind]=list.length?mergeGeometries(list):null;
    for(const g of list)g.dispose();
  }
  return merged;
}
function buildMembranes(gates){
  const pos=[],uv=[],behind=[],ahead=[],gateAttr=[],aspect=[],index=[];
  for(const {gate} of gates){
    const t=[gate.facing[1],-gate.facing[0]],hw=gate.halfWidth,H=gate.height-.05,start=pos.length/3;
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
      const lateral=(u-.5)*2*hw;
      pos.push(gate.x+t[0]*lateral,gate.baseY+v*H,gate.z+t[1]*lateral);
      uv.push(u,v);behind.push(...wolfveilAreaColor(gate.behind));ahead.push(...wolfveilAreaColor(gate.ahead));
      gateAttr.push(gate.x,gate.z,gate.facing[0],gate.facing[1]);aspect.push(2*hw/H);
    }
    index.push(start,start+1,start+2,start,start+2,start+3);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aPortalUv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('aColBehind',new THREE.Float32BufferAttribute(behind,3));
  g.setAttribute('aColAhead',new THREE.Float32BufferAttribute(ahead,3));
  g.setAttribute('aGate',new THREE.Float32BufferAttribute(gateAttr,4));
  g.setAttribute('aAspect',new THREE.Float32BufferAttribute(aspect,1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
function labelTexture(title,subtitle,color){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');
  const [r,g,b]=color.map(v=>Math.round(Math.min(1,v)*255));
  const grad=ctx.createLinearGradient(0,0,512,0);
  grad.addColorStop(0,'rgba(10,12,22,0)');grad.addColorStop(.18,'rgba(10,12,22,.72)');
  grad.addColorStop(.82,'rgba(10,12,22,.72)');grad.addColorStop(1,'rgba(10,12,22,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,18,512,92);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 38px Georgia, "Times New Roman", serif';
  ctx.fillStyle=`rgb(${r},${g},${b})`;
  ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=6;
  ctx.fillText(title,256,54);
  ctx.font='italic 22px Georgia, "Times New Roman", serif';
  ctx.fillStyle='rgba(235,232,222,.92)';
  ctx.fillText(subtitle,256,92);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function createWolfveilAreaGates(world,{offsetZ=70,heightAt=wolfveilHeight,
  labels=typeof document!=='undefined'}={}){
  if(!world?.group)throw new TypeError('Wolfveil area gates require the authoritative WolfveilBuilder');
  const root=new THREE.Group();
  root.name='WV_Portal_AreaVeilsAndToriiGates';
  root.userData={wolfveilAreaShared:true,decorativeOnly:true};
  world.group.add(root);
  const gates=wolfveilAreaGates().map(gate=>{
    const posts=wolfveilAreaGatePosts(gate);
    // Bridge gates' posts run past the deck down to the ground below.
    const postBottoms=posts.map(([x,z])=>Math.min(heightAt(x,z),gate.baseY)-.6);
    return {gate,posts,postBottoms,labels:[null,null]};
  });
  const uniforms={uTime:{value:0},uCam:{value:new THREE.Vector3(0,1e4,0)},
    uGates:{value:Array.from({length:24},()=>new THREE.Vector4(0,0,0,-1e4))},uGateCount:{value:0}};
  gates.slice(0,24).forEach(({gate},i)=>uniforms.uGates.value[i].set(
    gate.x,gate.z,gate.halfWidth,gate.baseY+gate.height));
  uniforms.uGateCount.value=Math.min(24,gates.length);
  const shaderBase={transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true};
  const makeShader=(name,vertexShader,fragmentShader)=>{
    const material=new THREE.ShaderMaterial({...shaderBase,name,vertexShader,fragmentShader,
      uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{}])});
    Object.assign(material.uniforms,uniforms);
    return material;
  };
  const veilMaterial=makeShader('WV_SpiritVeil',VEIL_VERTEX,VEIL_FRAGMENT);
  const veil=new THREE.Mesh(buildVeilGeometry(heightAt),veilMaterial);
  veil.name='WV_SpiritVeil_AreaBorders';
  veil.frustumCulled=false;veil.renderOrder=3;
  const materials={
    lacquer:new THREE.MeshStandardMaterial({color:0xa63a24,roughness:.48,metalness:0,name:'WV_ToriiGate_Lacquer'}),
    ink:new THREE.MeshStandardMaterial({color:0x1b181d,roughness:.62,metalness:0,name:'WV_ToriiGate_Kasagi'}),
    stone:new THREE.MeshStandardMaterial({color:0x6d6b66,roughness:.92,metalness:0,name:'WV_ToriiGate_Stone'}),
    glow:new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,name:'WV_ToriiGate_Runes'}),
  };
  const meshes=[veil];
  for(const [kind,geometry] of Object.entries(buildToriiGeometry(gates))){
    if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,materials[kind]);
    mesh.name='WV_ToriiGates_'+kind;
    mesh.castShadow=kind!=='glow';mesh.receiveShadow=true;
    meshes.push(mesh);
  }
  const membraneMaterial=makeShader('WV_GateMembrane',MEMBRANE_VERTEX,MEMBRANE_FRAGMENT);
  const membranes=new THREE.Mesh(buildMembranes(gates),membraneMaterial);
  membranes.name='WV_ToriiGate_Membranes';
  membranes.frustumCulled=false;membranes.renderOrder=4;
  meshes.push(membranes);
  for(const mesh of meshes){
    mesh.raycast=()=>{};
    mesh.userData={decorativeOnly:true,nonCollider:true,wolfveilAreaShared:true};
    root.add(mesh);
  }
  // Camera position (local) for the shaders and labels, taken as the veil draws.
  const inverse=new THREE.Matrix4(),camWorld=new THREE.Vector3();
  veil.onBeforeRender=(renderer,scene,camera)=>{
    camWorld.setFromMatrixPosition(camera.matrixWorld);
    inverse.copy(root.matrixWorld).invert();
    uniforms.uCam.value.copy(camWorld).applyMatrix4(inverse);
  };

  let mist=0,elapsed=0,enabled=true,disposed=false,lastPlayer=null,lastArea=null;
  function dropLabel(entry,i){
    const sprite=entry.labels[i];
    if(!sprite)return;
    sprite.removeFromParent();sprite.material.map.dispose();sprite.material.dispose();
    entry.labels[i]=null;
  }
  // Side 0: the camera is behind the gate (label names the area ahead).
  function labelFor(entry,i){
    if(entry.labels[i]||!labels)return entry.labels[i];
    const {gate}=entry,destination=wolfveilAreaGateDestination(gate,i===0?'ahead':'behind');
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:labelTexture(destination.label,gate.label,destination.color),
      transparent:true,depthWrite:false,fog:true}));
    sprite.name='WV_ToriiGateLabel_'+gate.id+'_'+destination.id;
    sprite.scale.set(5.6,1.4,1);
    const s=i===0?-1:1;
    sprite.position.set(gate.x+gate.facing[0]*s*.9,gate.baseY+gate.height+1.9,gate.z+gate.facing[1]*s*.9);
    sprite.raycast=()=>{};
    root.add(sprite);
    entry.labels[i]=sprite;
    return sprite;
  }
  /** position: the player's Game 3D WORLD position; area: the loaded area. */
  function update(dt,position=null,area=null){
    if(disposed)return 0;
    elapsed+=Math.max(0,Math.min(Number(dt)||0,.1));
    uniforms.uTime.value=elapsed;
    mist=0;lastArea=area;
    const px=Number(position?.x),pz=Number(position?.z)-offsetZ;
    lastPlayer=Number.isFinite(px)&&Number.isFinite(pz)?{x:px,z:pz}:null;
    const cam=uniforms.uCam.value;
    for(const entry of gates){
      const {gate}=entry;
      const d=Math.hypot(cam.x-gate.x,cam.z-gate.z);
      const side=(cam.x-gate.x)*gate.facing[0]+(cam.z-gate.z)*gate.facing[1]>0?1:0;
      if(enabled&&d<S.labelRange){
        const show=labelFor(entry,side);
        if(show)show.visible=true;
        if(entry.labels[1-side])entry.labels[1-side].visible=false;
      }else if(!enabled||d>S.labelRange*1.6){dropLabel(entry,0);dropLabel(entry,1);}
      else for(const sprite of entry.labels)if(sprite)sprite.visible=false;
      if(enabled&&lastPlayer){
        const dx=lastPlayer.x-gate.x,dz=lastPlayer.z-gate.z;
        const depth=dx*gate.facing[0]+dz*gate.facing[1],lateral=dx*gate.facing[1]-dz*gate.facing[0];
        if(Math.abs(lateral)<gate.halfWidth+.6&&Math.abs(depth)<S.approach)
          mist=Math.max(mist,.9*Math.pow(1-Math.abs(depth)/S.approach,.8));
      }
    }
    return mist;
  }
  /**
   * Client movement (WORLD coordinates, like resolveBuildingCollision):
   * slides along the veils outside a gate and around the gate posts.
   */
  function resolveCollision(position,previous,radius=.62){
    if(!enabled||disposed||!position||!previous)return false;
    const local={x:Number(position.x),z:Number(position.z)-offsetZ};
    const before={x:Number(previous.x),z:Number(previous.z)-offsetZ};
    if(![local.x,local.z,before.x,before.z].every(Number.isFinite))return false;
    let pushed=resolveWolfveilAreaVeilMovement(local,before).blocked;
    for(const entry of gates){
      if(Math.abs(local.x-entry.gate.x)>12||Math.abs(local.z-entry.gate.z)>12)continue;
      for(const [x,z] of entry.posts){
        const min=entry.gate.postRadius+radius,dx=local.x-x,dz=local.z-z,d=Math.hypot(dx,dz);
        if(d>=min)continue;
        const nx=d>1e-6?dx/d:1,nz=d>1e-6?dz/d:0;
        local.x=x+nx*(min+.002);local.z=z+nz*(min+.002);pushed=true;
      }
    }
    if(pushed){position.x=local.x;position.z=local.z+offsetZ;}
    return pushed;
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    for(const entry of gates){dropLabel(entry,0);dropLabel(entry,1);}
    root.parent?.remove(root);
    for(const mesh of meshes)mesh.geometry.dispose();
    for(const material of [veilMaterial,membraneMaterial,...Object.values(materials)])material.dispose();
  }
  return {
    root,count:gates.length,gates:gates.map(entry=>entry.gate),update,resolveCollision,dispose,
    get mist(){return mist;},
    setEnabled(next){
      enabled=Boolean(next);root.visible=enabled;
      if(!enabled)for(const entry of gates){dropLabel(entry,0);dropLabel(entry,1);}
    },
    /** Gates of the loaded area near the player (as the light arches reported). */
    visibleIds:()=>!enabled||!lastPlayer?[]:gates.filter(({gate})=>(!lastArea||gate.areas.includes(lastArea))&&
      Math.hypot(gate.x-lastPlayer.x,gate.z-lastPlayer.z)<=S.reportRange).map(({gate})=>gate.id),
  };
}
