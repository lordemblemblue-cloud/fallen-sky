// Game 2 selected player GLB visual layer. The existing Game/Fighter/Force
// simulation remains authoritative for input, damage, collision and network.
// Unlike the native G2 rig, these source skins are NOT fully motion-retargeted;
// a deterministic role-based pose adapter supplies locomotion/saber/Force
// cues where the original file has no matching animation. The Base44 models
// are source-authored rigged GLBs; do not present a static GLB as full motion.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {game2RigProfile,matchGame2RigBones} from './game2RigProfiles.js';
import {Game2AvatarMotionRetargeter} from './game2AvatarMotionRetargeter.js';

const V=new THREE.Vector3();
const Q=new THREE.Quaternion();


export function game2VisualAction(fighter){
  if (!fighter)return 'idle';
  if (fighter.status==='dead'||fighter.hp<=0)return 'death';
  if (fighter.status==='down'||fighter.status==='knockdown')return 'fall';
  const name=String(fighter.actor?.torso?.name||'').toLowerCase();
  const leg=String(fighter.actor?.legs?.name||'').toLowerCase();
  if (/force|push|pull|grip|lightning|heal|protect|absorb|rage|levitate|gesture/.test(name))return 'force';
  if (fighter.saber?.isActiveSwing?.() ||
      (/saber|attack|ls_a_|swing|kata|throw|lunge|stab|(?:^|_)a[1-7]_|spinattack/.test(name)&&
       !/stand|idle|stance/.test(name)))return 'attack';
  if (/roll|dodge|flip|cartwheel/.test(leg))return 'roll';
  if (!fighter.onGround||/jump|land|fall/.test(leg))return 'jump';
  if (/crouch|duck/.test(leg)||fighter.ducked)return 'crouch';
  if (/run|walk|sprint/.test(leg)||Math.hypot(fighter.vel?.[0]||0,fighter.vel?.[2]||0)>1.0)return 'move';
  return 'idle';
}
export function roleFromBoneName(value){
  const n=String(value).replace(/(_\d+)+$/,'').toLowerCase();
  if (/facial|twist|helper|socket|attach|end|lookat|cape|hair|weapon|tongue|eyelid/.test(n))return null;
  const side=/(?:^l(?:thigh|shin|upperarm|forearm|hand|foot|clavicle|bicep)|\.l$|_l$|left)/.test(n)?'left'
    :/(?:^r(?:thigh|shin|upperarm|forearm|hand|foot|clavicle|bicep)|\.r$|_r$|right)/.test(n)?'right':null;
  const role=/thigh|upleg/.test(n)?'thigh':/shin|calf|lowerleg/.test(n)?'shin'
    :/upperarm|upper_arm|bicep|arm_?upper|arm\.\d/.test(n)?'upperarm'
    :/forearm|lowerarm/.test(n)?'forearm'
    :/hand/.test(n)?'hand'
    :/spine|torsoupr|torso_g|chest/.test(n)?'spine'
    :/head_g|^head$|^head_/.test(n)?'head'
    :/pelvis|hips/.test(n)?'pelvis':null;
  if(!role)return null;
  if(['thigh','shin','upperarm','forearm','hand'].includes(role)&&!side)return null;
  return role+(side?'_'+side:'');
}

export function resolveRoleJoints(root){
  const result=new Map(),used=new Set();
  root.traverse(node=>{
    if (!node.isBone)return;
    const role=roleFromBoneName(node.name);
    if(!role||used.has(role))return;
    // Prefer primary deform skeleton, not facial/twist/accessory helpers.
    used.add(role);
    result.set(role,{bone:node,rest:node.quaternion.clone()});
  });
  return result;
}

function gesture(roles,role,dx=0,dy=0,dz=0) {
  const entry=roles.get(role);
  if(!entry)return;
  Q.setFromEuler(new THREE.Euler(dx,dy,dz,'XYZ'));
  entry.bone.quaternion.multiply(Q);
}
function pose(roles,action,t,actor){
  for(const entry of roles.values())entry.bone.quaternion.copy(entry.rest);
  const speed=Math.max(.1,Math.min(12,Math.hypot(actor?.vel?.[0]||0,actor?.vel?.[2]||0)));
  const swing=Math.sin(t*(7+speed*.47)), opposite=-swing;
  if(action==='move') {
    gesture(roles,'thigh_left',swing*.38);
    gesture(roles,'thigh_right',opposite*.38);
    gesture(roles,'shin_left',Math.max(0,-swing)*.40);
    gesture(roles,'shin_right',Math.max(0,swing)*.40);
    gesture(roles,'upperarm_left',-swing*.20);
    gesture(roles,'upperarm_right',swing*.20);
    gesture(roles,'spine',.025*Math.sin(t*12));
  } else if(action==='jump'){
    gesture(roles,'thigh_left',-.29);gesture(roles,'thigh_right',-.29);
    gesture(roles,'shin_left',.48);gesture(roles,'shin_right',.48);
    gesture(roles,'upperarm_left',-.18);gesture(roles,'upperarm_right',-.18);
  }else if(action==='crouch'){
    gesture(roles,'thigh_left',-.65);gesture(roles,'thigh_right',-.65);
    gesture(roles,'shin_left',1.0);gesture(roles,'shin_right',1.0);
    gesture(roles,'spine',.22);
  }else if(action==='roll'||action==='fall'){
    gesture(roles,'spine',.65,0,.18);
    gesture(roles,'thigh_left',-.7);gesture(roles,'thigh_right',-.7);
  }else if(action==='attack'){
    const strike=Math.sin(t*15);
    gesture(roles,'spine',.06,strike*.34);
    gesture(roles,'upperarm_right',-.9,strike*.48,-.31);
    gesture(roles,'forearm_right',-.4);
    gesture(roles,'upperarm_left',-.42,0,.16);
  }else if(action==='force'){
    gesture(roles,'upperarm_right',-1.04,0,-.18);
    gesture(roles,'forearm_right',-.08);
    gesture(roles,'hand_right',.12);
    gesture(roles,'spine',.12);
  }else if(action==='death'){
    gesture(roles,'spine',.84,0,.20);
    gesture(roles,'thigh_left',-.5);gesture(roles,'thigh_right',-.6);
  }else{
    gesture(roles,'spine',.012*Math.sin(t*1.8));
    gesture(roles,'head',.014*Math.sin(t*.9));
  }
}
export class Game2SelectedCharacterRenderer {
  constructor(host) {
    this.host=host;
    this.canvas=document.createElement('canvas');
    Object.assign(this.canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0,0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(60,1,.05,700);
    this.scene.add(new THREE.HemisphereLight(0xcbe7ff,0x342329,2.3));
    const sunlight=new THREE.DirectionalLight(0xffe8c0,3.0);
    sunlight.position.set(13,29,17);this.scene.add(sunlight);
    this.root=new THREE.Group();this.scene.add(this.root);
    this.ready=false;this.disposed=false;this.lastTime=0;
    this.nativeRestPose=null;
    this.activeIdle=false;
    this.motion=null;
  }
  async load(character){
    if(!character?.url || !/^https:\/\//.test(character.url) ||
       !character.url.startsWith('https://media.base44.com/files/public/6876751a602125f45f1861b9/'))
      throw Error('Selected Game 2 model URL is not on the configured application host');
    const response=await fetch(character.url,{mode:'cors'});
    if(!response.ok||/text\/html|text\/plain/i.test(response.headers.get('content-type')||''))
      throw Error('Selected Game 2 GLB not served from application assets');
    const buffer=await response.arrayBuffer();
    // Verify optimized originals have not been switched by URL redirection or
    // stale assets. A different model silently rendering would be misleading.
    if(!globalThis.crypto?.subtle)throw Error('Game 2 character integrity verification requires HTTPS Web Crypto');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==character.sha256)throw Error('Selected Game 2 model checksum mismatch');
    const gltf=await new GLTFLoader().parseAsync(buffer,character.url);
    if(this.disposed)return;
    const model=gltf.scene;let skins=0;
    model.traverse(obj=>{if(obj.isSkinnedMesh)skins++;});
    if(!skins)throw Error('Selected character GLB has no real skinned mesh');
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    const height=bounds.max.y-bounds.min.y;
    if(!Number.isFinite(height)||height<.001)throw Error('Selected GLB has invalid rig geometry bounds');
    const center=bounds.getCenter(new THREE.Vector3());
    this.scale=1.80/height;
    model.position.set(-center.x*this.scale,-bounds.min.y*this.scale,-center.z*this.scale);
    model.scale.setScalar(this.scale);
    this.root.add(model);
    this.source=model;
    // Asset-specific skeleton profile: exact 13 original joint names
    // independently verified against each user's GLB, not a generic regex.
    const rig=matchGame2RigBones(model,character.id);
    this.bones=rig.bones;
    this.profile=rig.profile;
    this.motion=new Game2AvatarMotionRetargeter(this.root,this.bones,this.profile);
    this.savedBones=new Map();
    model.traverse(node=>{if(node.isBone)this.savedBones.set(node,{
      position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()
    });});
    this.clips=gltf.animations||[];
    // Authored clip is used when actually present. Every other motion uses
    // skeleton-local procedural gestures, not made-up named motion tracks.
    if(this.clips.length){
      this.mixer=new THREE.AnimationMixer(model);
      const clip=this.clips.find(x=>/idle/i.test(x.name))||this.clips[0];
      this.idleAction=this.mixer.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      this.activeIdle=true;
    }
    this.ready=true;
  }
  sync(game){
    if(!this.ready||this.disposed||!game?.player)return;
    const player=game.player;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);
    this.camera.fov=game.cam.fov*180/Math.PI;
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
    this.camera.position.fromArray(game.cam.eye);
    this.camera.lookAt(V.fromArray(game.cam.target));
    this.root.position.fromArray(player.pos);
    this.root.rotation.y=player.yaw;
    const time=game.t,dt=Math.max(0,Math.min(.06,time-this.lastTime));
    this.lastTime=time;
    const action=game2VisualAction(player);
    // Only Revan ships a real idle clip. It runs *only while idle*; it must
    // not continually overwrite movement, saber or Force poses afterward.
    if(this.mixer&&action==='idle'){
      if(!this.activeIdle){
        for(const [bone,rest]of this.savedBones) {
          bone.position.copy(rest.position);
          bone.quaternion.copy(rest.quaternion);
          bone.scale.copy(rest.scale);
        }
        this.idleAction.reset().play();
        this.activeIdle=true;
      }
      this.mixer.update(dt);
    } else {
      if(this.mixer&&this.activeIdle){
        this.idleAction.stop();
        this.activeIdle=false;
      }
      if(this.savedBones)for(const [bone,rest]of this.savedBones) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
        bone.scale.copy(rest.scale);
      }
      const animated=this.motion?.apply(player.actor,player.yaw)||0;
      // This only runs if source animation data is genuinely unavailable.
      // Normal play uses the original Jedi Outcast/Academy animation bank.
      if(animated<6)pose(this.bones,action,time,player);
    }
    this.root.visible=player.alpha>0 && !player.cut && !player.vaporized;
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    this.disposed=true;this.ready=false;
    this.mixer?.stopAllAction();
    this.source?.traverse(obj=>{
      if(!obj.isMesh)return;
      obj.geometry?.dispose();
      for(const material of [].concat(obj.material||[]))if(material){
        for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'])material[key]?.dispose();
        material.dispose();
      }
    });
    this.root.clear();
    this.renderer.dispose();this.canvas.remove();
  }
}
