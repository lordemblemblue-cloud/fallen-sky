// Dedicated Three.js transparent layer for the Base44-hosted animated dragon FBX/GLB.
// The Game 2 engine remains authoritative for combat and camera. This renderer
// has NO hitbox/damage decisions. Model and texture data are streamed from hosted storage.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const up = new THREE.Vector3(0,1,0);
const VERT = `
varying vec2 vUv;
varying vec3 vLocal;
void main(){
  vUv=uv;
  vLocal=position;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
// Smooth time-varying coherent noise at several scales: no square particle
// sprites, jagged pixel-art flames or raster sprite sheets. Shader only.
const FRAG = `
precision highp float;
uniform float uTime;
uniform float uStrength;
uniform float uSmoke;
varying vec2 vUv;
varying vec3 vLocal;
float hash13(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 x) {
  vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  float n000=hash13(i),n100=hash13(i+vec3(1,0,0)),
        n010=hash13(i+vec3(0,1,0)),n110=hash13(i+vec3(1,1,0)),
        n001=hash13(i+vec3(0,0,1)),n101=hash13(i+vec3(1,0,1)),
        n011=hash13(i+vec3(0,1,1)),n111=hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
float fbm(vec3 p){float n=0.,a=.53;for(int i=0;i<4;i++){n+=noise3(p)*a;p=p*2.05+4.2;a*=.49;}return n;}
void main(){
  float axial=clamp(vUv.y,0.,1.);
  vec3 flow=vec3(vUv.x*8.3,sin(vUv.x*6.283)*1.4,axial*7.2-uTime*4.2);
  float turbulence=fbm(flow)+.24*fbm(flow*1.7+uTime*.6);
  float contour=smoothstep(.14,.68,turbulence);
  float tip=smoothstep(.02,.21,axial)*(1.-smoothstep(.74,.99,axial));
  float flicker=.84+.16*sin(uTime*23.+axial*42.+vUv.x*13.);
  float alpha=tip*contour*flicker*uStrength*.66;
  vec3 white=vec3(1.,.94,.70),yellow=vec3(1.,.61,.14),
       orange=vec3(.95,.18,.022),red=vec3(.29,.025,.015);
  vec3 heat=mix(red,orange,smoothstep(.05,.45,turbulence));
  heat=mix(heat,yellow,smoothstep(.36,.74,turbulence));
  heat=mix(heat,white,smoothstep(.78,1.12,turbulence)*.8);
  if(uSmoke>.5) {heat=mix(vec3(.07,.055,.055),vec3(.25,.21,.19),turbulence);alpha*=.38;}
  if(alpha<.015)discard;
  gl_FragColor=vec4(heat,alpha);
}`;

function flameMaterial(smoke=false) {
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uStrength:{value:0},uSmoke:{value:smoke?1:0}},
    vertexShader:VERT,fragmentShader:FRAG,
    side:THREE.DoubleSide,transparent:true,depthWrite:false,
    blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending,
  });
}
function flameMesh(smoke=false) {
  const mat=flameMaterial(smoke);
  const geo=new THREE.CylinderGeometry(smoke ? 1.8 : 1.13,smoke ? 0.68 : 0.21,1,28,1,true);
  const m=new THREE.Mesh(geo,mat);
  m.frustumCulled=false;m.visible=false;
  return m;
}
function placeFlame(flame,origin,dir,length,scale=1) {
  const v=new THREE.Vector3(...dir).normalize();
  flame.position.set(origin[0],origin[1],origin[2]).addScaledVector(v,length*.5);
  flame.quaternion.setFromUnitVectors(up,v);
  flame.scale.set(scale,length,scale);
  flame.visible=true;
}
function disposeFlame(flame) {flame.geometry.dispose();flame.material.dispose();}
function wingBones(scene){
  const result=[];
  for(const label of ['shoulder_dupli_001_l_081','shoulder_dupli_001_r_090','arm_stretch_dupli_001_l_082','arm_stretch_dupli_001_r_091']){
    const bone=scene.getObjectByName(label);if(bone)result.push({bone,left:label.includes('_l_'),shoulder:label.startsWith('shoulder')});
  }
  return result;
}
export class DragonBossRenderer {
  constructor(host) {
    this.canvas=document.createElement('canvas');
    Object.assign(this.canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0,0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(56,1,.05,450);
    this.scene.add(new THREE.HemisphereLight(0xb2c8ec,0x2d1921,2.0));
    const sun=new THREE.DirectionalLight(0xffe1b6,3.0);
    sun.position.set(16,35,11);this.scene.add(sun);
    this.fireLight=new THREE.PointLight(0xff5b1d,0,27);
    this.scene.add(this.fireLight);
    this.root=new THREE.Group();this.scene.add(this.root);
    this.flames=[flameMesh(),flameMesh(),flameMesh(true)];
    this.flames.forEach(f=>this.scene.add(f));
    this.minionGraphics=new Map();
    this.host=host;host.append(this.canvas);
    this.loaded=false;this.disposed=false;this.lastTime=0;
  }
  async load(url, format='glb') {
    // The admin publishes one FBX or GLB for everyone. Never use browser-local
    // IndexedDB or silently substitute the Rancor creature.
    if(!url || typeof url!=='string')throw new Error('No hosted dragon URL is configured');
    if(!/^https:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('blob:') && !/^game2\//.test(url))
      throw new Error('Unsupported Dragon model URL');
    const isFbx=format==='fbx'||(/\.fbx(?:\?|$)/i.test(url) && format!=='glb');
    // Missing static assets are often replaced by the Base44 SPA index.html.
    // Do not pass that HTML to the model parser or misrepresent it as success.
    if(!/^https:\/\//i.test(url)&&!url.startsWith('blob:')) {
      const response=await fetch(url,{method:'HEAD'});
      const mime=String(response.headers.get('content-type')||'').toLowerCase();
      if(!response.ok||mime.includes('text/html')||mime.includes('text/plain'))
        throw new Error('Dragon model missing from hosted game files');
    }
    const asset=isFbx
      ? await new FBXLoader().loadAsync(url)
      : await new GLTFLoader().loadAsync(url);
    if(this.disposed)return;
    const scene=isFbx?asset:asset.scene;
    const clips=isFbx?asset.animations:asset.animations;
    let skinned=0;
    scene.traverse(obj=>{if(obj.isSkinnedMesh)skinned++;});
    if(!skinned||!clips?.length)
      throw new Error('Hosted Dragon must contain a skinned mesh and authored animation');
    this.source=scene;this.animations=clips;
    // Scale the source FBX or GLB to approximately 6 metres and preserve its rig.
    scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(scene);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(!size.y||!Number.isFinite(size.y))throw new Error('Dragon model has an invalid bounding box');
    this.assetScale=6/size.y;
    scene.position.set(-center.x*this.assetScale,-bounds.min.y*this.assetScale,-center.z*this.assetScale);
    scene.scale.setScalar(this.assetScale);
    this.root.add(scene);
    this.mixer=new THREE.AnimationMixer(scene);
    const idle=clips.find(clip=>/idle|motion|fly|walk/i.test(clip.name))||clips[0];
    this.idleClip=idle;
    this.activeClip=idle;
    this.activeAction=this.mixer.clipAction(idle).setLoop(THREE.LoopRepeat).play();
    this.wings=wingBones(scene);
    this.loaded=true;
  }
  selectMotion(phase,attackId,status) {
    if(!this.loaded || !this.mixer || !this.animations?.length)return;
    const names = status==='dead' ? [/death|die|fall/i]
      : phase==='breathing' ? [/breath|fire|roar/i]
      : phase==='takeoff' ? [/take.?off|launch/i,/fly|flight|wing/i]
      : phase==='airborne' ? [/fly|flight|hover|air/i]
      : phase==='landing' ? [/land|touch.?down/i]
      : phase==='crushing' ? [/grab|crush|bite/i]
      : phase==='windup' ? [attackId==='sweep' ? /wing|sweep/i : /attack|strike|claw/i]
      : phase==='hunt' ? [/walk|run|move/i,/idle|motion/i]
      : [/idle|motion/i];
    const next=names.map(pattern=>this.animations.find(clip=>pattern.test(clip.name))).find(Boolean)||this.idleClip;
    if(!next || next===this.activeClip)return;
    const previous=this.activeAction;
    const action=this.mixer.clipAction(next);
    action.reset().setLoop(status==='dead'?THREE.LoopOnce:THREE.LoopRepeat);
    action.clampWhenFinished=status==='dead';
    action.enabled=true;
    action.play();
    if(previous)previous.crossFadeTo(action,.22,true);
    this.activeClip=next;
    this.activeAction=action;
  }
  addMinion(fighter) {
    const group=new THREE.Group(),model=cloneSkinned(this.source);
    group.add(model);this.scene.add(group);
    const mixer=new THREE.AnimationMixer(model);
    mixer.clipAction(this.animations[0]).play();
    this.minionGraphics.set(fighter,{group,model,mixer,wings:wingBones(model)});
    return group;
  }
  sync(game) {
    if(!this.loaded||this.disposed||!game?.bossWay)return;
    const bw=game.bossWay,b=bw.boss;
    const t=game.t,dt=Math.max(0,Math.min(.065,t-this.lastTime));this.lastTime=t;
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(width,height,false);
    this.camera.fov=game.cam.fov*180/Math.PI;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.camera.position.fromArray(game.cam.eye);
    this.camera.lookAt(new THREE.Vector3(...game.cam.target));
    this.root.visible=true;
    this.root.position.set(...b.pos);
    this.root.rotation.y=b.yaw;
    this.selectMotion(bw.phase,bw.attack?.id,b.status);
    const flying=['takeoff','airborne','landing'].includes(bw.phase);
    if(this.mixer) this.mixer.update(dt*(flying ? 1.45 : bw.phase === 'crushing' ? 0.6 : 1));
    // Additive procedural secondary motion over the imported 21 s track.
    for(const w of this.wings)w.bone.rotation.z+=(w.left?1:-1)*
      ((flying ? 0.22 : 0) + Math.sin(t * (flying ? 8 : 2.5)) * (flying ? 0.22 : 0.028));
    const fire=bw.phase==='breathing',tail=bw.phase==='windup'&&bw.attack?.id==='breath';
    const f= [Math.sin(b.yaw),0,Math.cos(b.yaw)];
    const mouth=[b.pos[0]+f[0]*2.1,b.pos[1]+4.2,b.pos[2]+f[2]*2.1];
    const aim=[f[0],-.11,f[2]];
    for(let i=0;i<this.flames.length;i++){
      const flame=this.flames[i];
      flame.visible=!!(fire||tail);
      flame.material.uniforms.uTime.value=t+(i*.19);
      flame.material.uniforms.uStrength.value=fire?(i===2 ? 0.5 : 1):.22;
      if(flame.visible)placeFlame(flame,
        [mouth[0],mouth[1]+i*.07,mouth[2]],aim,
        (fire?20:3)*(i===2?1.15:1),i===0 ? 0.9 : i===1 ? 1.45 : 1.8);
    }
    this.fireLight.intensity=fire?150:tail?28:0;
    this.fireLight.position.set(...mouth);
    const alive=new Set();
    for(const n of bw.minions||[]) {
      if(n.status==='dead')continue;
      alive.add(n);
      const v=this.minionGraphics.get(n)||{group:this.addMinion(n)};
      const current=this.minionGraphics.get(n);
      if(!current)continue;
      current.group.position.set(...n.pos);current.group.rotation.y=n.yaw;
      current.group.scale.setScalar(.33);
      current.mixer.update(dt*1.3);
      const flameOn=n.flameUntil>game.t;
      // Secondary small flame tongues share the continuous procedural shader.
      if(!current.flame){current.flame=flameMesh();this.scene.add(current.flame);}
      current.flame.visible=flameOn;
      if(flameOn){
        current.flame.material.uniforms.uTime.value=t;
        current.flame.material.uniforms.uStrength.value=.7;
        placeFlame(current.flame,[n.pos[0]+Math.sin(n.yaw),n.pos[1]+1.25,n.pos[2]+Math.cos(n.yaw)],
          [Math.sin(n.yaw),-.05,Math.cos(n.yaw)],8,.38);
      }
    }
    for(const [n,v] of this.minionGraphics)if(!alive.has(n)){
      this.scene.remove(v.group);if(v.flame){this.scene.remove(v.flame);disposeFlame(v.flame);}
      v.mixer.stopAllAction();this.minionGraphics.delete(n);
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.disposed=true;
    for(const flame of this.flames)disposeFlame(flame);
    for(const v of this.minionGraphics.values()){if(v.flame)disposeFlame(v.flame);v.mixer.stopAllAction();}
    this.minionGraphics.clear();
    this.mixer?.stopAllAction();this.root.clear();
    // Disposes shared GLB buffers and textures once, after clearing clones.
    this.source?.traverse(node=>{
      if(node.isMesh){node.geometry?.dispose();for(const mat of [].concat(node.material||[])){
        if(!mat)continue;for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'])mat[k]?.dispose();
        mat.dispose();
      }}
    });
    this.renderer.dispose();this.canvas.remove();
  }
}
