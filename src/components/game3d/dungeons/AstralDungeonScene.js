import * as THREE from 'three';
import {
  ASTRAL_DUNGEON_ENTRANCE,ASTRAL_PADS,ASTRAL_BRIDGES,
  ASTRAL_PAD_RADIUS,ASTRAL_BRIDGE_HALF_WIDTH,ASTRAL_RETURN_PORTAL,
  isInsideAstralDungeon,
} from './AstralDungeonLayout.mjs';
const TAU=2*Math.PI,SPACE_COLOR=0x030713;
const standard=(color,metalness=.65,roughness=.35)=>
  new THREE.MeshStandardMaterial({color,metalness,roughness,side:THREE.DoubleSide});
function disposeGroup(root){
  root.parent?.remove(root);
  const geo=new Set(),mats=new Set();
  root.traverse(o=>{if(o.isMesh||o.isPoints){
    geo.add(o.geometry);
    for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)mats.add(m);
  }});
  geo.forEach(g=>g?.dispose());mats.forEach(m=>m.dispose());
}
function glowingRing(root,x,y,z,r,tube,color){
  const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,tube,8,96),
    new THREE.MeshBasicMaterial({color}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);root.add(mesh);
  return mesh;
}
function createPortal(root,x,y,z,scale=1){
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);root.add(g);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(3.3,72),
    new THREE.MeshBasicMaterial({color:0x171064,side:THREE.DoubleSide}));
  g.add(disc);
  const arc=new THREE.Mesh(new THREE.TorusGeometry(3.45,.14,10,80),
    new THREE.MeshBasicMaterial({color:0x88a6ff}));g.add(arc);
  const swirl=new THREE.Mesh(new THREE.TorusGeometry(2.25,.26,12,80),
    new THREE.MeshBasicMaterial({color:0x6958dd,transparent:true,opacity:.9}));
  g.add(swirl);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(1.1,.14,8,64),
    new THREE.MeshBasicMaterial({color:0x7db6ff}));g.add(inner);
  const lamp=new THREE.PointLight(0x8d82ff,38,32,1.5);
  lamp.position.z=1.2;g.add(lamp);
  return t=>{swirl.rotation.z=t*.36;inner.rotation.z=-t*.42;arc.rotation.z=t*.05;};
}
// A second simple U-shaped mountain portal; no cluttered pillar or bell.
export function createAstralMountainGate(scene,{sampleGroundY}={}){
  const site=ASTRAL_DUNGEON_ENTRANCE;
  const sampled=sampleGroundY?.(site.x,site.z);
  const y=Number.isFinite(sampled)?sampled:0;
  const root=new THREE.Group();root.name='AXE_MoonfallEntranceGate';
  root.position.set(site.x,y,site.z);scene.add(root);
  const stone=standard(0x596576,.05,.91); // match the first cave gate's natural stone palette
  for(const [x,cy,z,w,h,d] of [
    [-4.65,4.3,0,1.4,8.6,2],[4.65,4.3,0,1.4,8.6,2],
    [0,9.15,0,10.8,1.25,2.3],
  ]){
    const piece=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stone);
    piece.position.set(x,cy,z);piece.castShadow=piece.receiveShadow=true;root.add(piece);
  }
  for(const x of [-5.8,5.8]){
    const lens=new THREE.Mesh(new THREE.BoxGeometry(.55,1.3,.5),
      new THREE.MeshStandardMaterial({color:0xb8d9ff,emissive:0x537dff,
        emissiveIntensity:3.4}));
    lens.position.set(x,4.8,-.5);root.add(lens);
    const l=new THREE.PointLight(0x95a9ff,35,24,1.4);l.position.set(x,5,1);root.add(l);
  }
  const animatePortal=createPortal(root,0,4.2,site.portalZ-site.z);
  let last=null,t=0,triggered=false;
  return {
    root,
    // Structural side jambs are solid; the centre remains freely walkable.
    resolveCollision(pos,previous,radius=.62){
      const dx=pos.x-site.x,dz=pos.z-site.z;
      const hitting=Math.abs(dz)<1.15+radius &&
        (Math.abs(dx-4.65)<.72+radius||Math.abs(dx+4.65)<.72+radius);
      if(!hitting)return false;
      if(previous){pos.x=previous.x;pos.z=previous.z;}
      return true;
    },
    update(dt,pos){
      t+=Math.min(.1,Math.max(0,dt||0));animatePortal(t);
      if(!pos){last=null;return false;}
      const crossed=last&&last.z<site.portalZ&&pos.z>=site.portalZ;
      const inside=Math.abs(pos.x-site.x)<3.1&&Math.abs(pos.z-site.portalZ)<2.5;
      last={x:pos.x,z:pos.z};
      if(!triggered&&crossed&&inside){triggered=true;return true;}
      return false;
    },
    dispose(){disposeGroup(root);},
  };
}
// Game 2 Sumi stronghold landing pad motif: concentric taxi rings, engraved
// gunmetal disk, inner deck and repeated yellow hazard segments.
function addPlatform(ground,root,pad){
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(ASTRAL_PAD_RADIUS,
    ASTRAL_PAD_RADIUS,.86,96),standard(0x485569,.79,.31));
  disc.position.set(pad.x,-.43,pad.z);
  disc.receiveShadow=true;ground.add(disc);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(ASTRAL_PAD_RADIUS-3.2,
    ASTRAL_PAD_RADIUS-3.2,.08,96),standard(0x79899b,.75,.34));
  inner.position.set(pad.x,.045,pad.z);inner.receiveShadow=true;ground.add(inner);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(ASTRAL_PAD_RADIUS-5,
    ASTRAL_PAD_RADIUS-5,.1,96),standard(0x38465a,.78,.29));
  core.position.set(pad.x,.095,pad.z);core.receiveShadow=true;ground.add(core);
  glowingRing(root,pad.x,.18,pad.z,ASTRAL_PAD_RADIUS-1.35,.15,0xf9cc83);
  glowingRing(root,pad.x,.19,pad.z,ASTRAL_PAD_RADIUS-3.8,.11,0x86c5ff);
  glowingRing(root,pad.x,.2,pad.z,10,.1,0x638bbc);
  const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(1.05,.05,.28),
    new THREE.MeshBasicMaterial({color:0xf3c779}),48);
  const dummy=new THREE.Object3D();
  for(let i=0;i<48;i++){
    const a=i*TAU/48;
    dummy.position.set(pad.x+Math.cos(a)*(ASTRAL_PAD_RADIUS-1.2),
      .16,pad.z+Math.sin(a)*(ASTRAL_PAD_RADIUS-1.2));
    dummy.rotation.y=-a;dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix);
  }
  marks.instanceMatrix.needsUpdate=true;root.add(marks);
  const l=new THREE.PointLight(0xcbdcff,115,80,1.4);
  l.position.set(pad.x,16,pad.z);root.add(l);
  for(const offset of [-15,15]){
    const a=new THREE.PointLight(pad.index===4?0xc69bff:0x9bd9ff,48,44,1.45);
    a.position.set(pad.x+offset,5.5,pad.z);root.add(a);
  }
}
// Light only ever occupies the open run between two landing pads: it starts at
// one circle's rim and stops at the next one, never crossing onto a deck.
const openSpan=len=>Math.max(0,len-2*ASTRAL_PAD_RADIUS);
function addBridge(ground,root,b){
  const dx=b.bx-b.ax,dz=b.bz-b.az,len=Math.hypot(dx,dz);
  const angle=Math.atan2(dx,dz),x=(b.ax+b.bx)/2,z=(b.az+b.bz)/2;
  const span=openSpan(len);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(ASTRAL_BRIDGE_HALF_WIDTH*2,
    .7,len+.4),standard(0x56677d,.77,.3));
  deck.position.set(x,-.35,z);deck.rotation.y=angle;deck.receiveShadow=true;
  ground.add(deck);
  const accent=new THREE.MeshBasicMaterial({color:0x9bdaff});
  if(span>0.01)for(const side of [-1,1]){
    const strip=new THREE.Mesh(new THREE.BoxGeometry(.16,.085,span),accent);
    strip.rotation.y=angle;
    strip.position.set(x+side*Math.cos(angle)*(ASTRAL_BRIDGE_HALF_WIDTH-.45),
      .09,z-side*Math.sin(angle)*(ASTRAL_BRIDGE_HALF_WIDTH-.45));
    root.add(strip);
  }
  for(let i=1;i<=4;i++){
    const t=i/5;
    const l=new THREE.PointLight(0xafd9ff,27,32,1.5);
    l.position.set(b.ax+dx*t,7,b.az+dz*t);root.add(l);
  }
}
// A non-colliding, animated energy skin marks only the actual invisible
// boundaries. Circular walls have gaps at bridge mouths; bridge-side ribbons
// leave the full deck unobstructed. Layout authority still handles collision.
const ENERGY_WALL_HEIGHT=8.2;
function createBoundaryEnergy(root){
  const skin=new THREE.Group();skin.name='AXE_Moonfall_FlowingEnergyBoundaries';
  root.add(skin);
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}},
    vertexShader:`
      varying vec2 vUvEnergy;
      void main(){
        vUvEnergy=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform float uTime;
      varying vec2 vUvEnergy;
      void main(){
        float u=vUvEnergy.x,v=vUvEnergy.y;
        float flowing=pow(max(0.0,sin(u*63.0+v*24.0-uTime*4.5)),12.0);
        float wave=0.5+0.5*sin(v*23.0+u*16.0-uTime*2.7);
        float sparks=pow(max(0.0,sin(v*48.0-u*32.0+uTime*6.0)),18.0);
        float fade=0.42+0.58*pow(1.0-v,1.25);
        float alpha=(0.075+0.18*wave+0.32*flowing+0.19*sparks)*fade;
        vec3 blue=mix(vec3(0.12,0.31,0.95),vec3(0.56,0.90,1.0),
          min(1.0,flowing*0.8+sparks*0.5+wave*0.25));
        gl_FragColor=vec4(blue,alpha);
      }
    `,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,fog:false,
  });
  const halfGap=Math.asin(Math.min(0.95,
    (ASTRAL_BRIDGE_HALF_WIDTH+1.6)/ASTRAL_PAD_RADIUS));
  for(const pad of ASTRAL_PADS){
    const cuts=[];
    for(const bridge of ASTRAL_BRIDGES){
      const isA=bridge.from===pad.id,isB=bridge.to===pad.id;
      if(!isA&&!isB)continue;
      const other=isA?{x:bridge.bx,z:bridge.bz}:{x:bridge.ax,z:bridge.az};
      const angle=(Math.atan2(other.x-pad.x,other.z-pad.z)+TAU)%TAU;
      for(const shift of [-1,0,1]){
        const lo=Math.max(0,angle-halfGap+TAU*shift);
        const hi=Math.min(TAU,angle+halfGap+TAU*shift);
        if(hi>lo)cuts.push([lo,hi]);
      }
    }
    cuts.sort((a,b)=>a[0]-b[0]);
    let from=0;
    const addArc=(start,sweep)=>{
      if(sweep<=.025)return;
      const arc=new THREE.Mesh(new THREE.CylinderGeometry(
        ASTRAL_PAD_RADIUS+.10,ASTRAL_PAD_RADIUS+.10,
        ENERGY_WALL_HEIGHT,Math.max(8,Math.ceil(sweep*32)),1,true,start,sweep),
        material);
      arc.position.set(pad.x,ENERGY_WALL_HEIGHT/2,pad.z);
      skin.add(arc);
    };
    for(const [lo,hi] of cuts){
      if(lo>from)addArc(from,lo-from);
      from=Math.max(from,hi);
    }
    addArc(from,TAU-from);
  }
  for(const bridge of ASTRAL_BRIDGES){
    const dx=bridge.bx-bridge.ax,dz=bridge.bz-bridge.az;
    const len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;
    const cx=(bridge.ax+bridge.bx)/2,cz=(bridge.az+bridge.bz)/2;
    // The ribbons bridge the two wall gaps and stop at each rim, so the energy
    // outline reads as circle, bridge, circle instead of lying across the decks.
    const span=openSpan(len);
    if(span<=0.01)continue;
    for(const side of [-1,1]){
      const ribbon=new THREE.Mesh(new THREE.PlaneGeometry(span,ENERGY_WALL_HEIGHT),
        material);
      ribbon.rotation.y=Math.atan2(-dz,dx);
      ribbon.position.set(cx+side*nx*(ASTRAL_BRIDGE_HALF_WIDTH+.12),
        ENERGY_WALL_HEIGHT/2,cz+side*nz*(ASTRAL_BRIDGE_HALF_WIDTH+.12));
      skin.add(ribbon);
    }
  }
  return elapsed=>{material.uniforms.uTime.value=elapsed;};
}
function createSpaceSky(root){
  const sky=new THREE.Group();sky.name='AXE_Moonfall_AlwaysStarrySky';
  root.add(sky);
  const n=1500,coords=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const u=(i*.61803398875)%1,v=(i*.754877666)%1;
    const a=TAU*u,h=2*v-1,r=1100,side=Math.sqrt(1-h*h);
    coords[i*3]=r*side*Math.cos(a);
    coords[i*3+1]=r*h;
    coords[i*3+2]=r*side*Math.sin(a);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(coords,3));
  const stars=new THREE.Points(geometry,new THREE.PointsMaterial({
    color:0xedf0ff,size:3.1,sizeAttenuation:false,
    transparent:true,opacity:.94,depthWrite:false,fog:false,
  }));
  stars.frustumCulled=false;sky.add(stars);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(76,32,24),
    new THREE.MeshBasicMaterial({color:0xecf0ff,fog:false}));
  moon.position.set(275,470,790);sky.add(moon);
  const moonAura=new THREE.Mesh(new THREE.SphereGeometry(89,32,24),
    new THREE.MeshBasicMaterial({color:0x90a7ef,transparent:true,opacity:.18,
      side:THREE.BackSide,depthWrite:false,fog:false}));
  moonAura.position.copy(moon.position);sky.add(moonAura);
  return sky;
}
export function createAstralDungeon(scene){
  const root=new THREE.Group();root.name='AXE_MoonfallConnectedRingDungeon';scene.add(root);
  const ground=new THREE.Group();ground.name='AXE_MoonfallPlatformTerrain';
  ground.userData.isTerrain=true;root.add(ground);
  for(const pad of ASTRAL_PADS)addPlatform(ground,root,pad);
  for(const b of ASTRAL_BRIDGES)addBridge(ground,root,b);
  const animateBoundaryEnergy=createBoundaryEnergy(root);
  const sky=createSpaceSky(root);
  root.add(new THREE.HemisphereLight(0xd9e5ff,0x72799a,2.8));
  root.add(new THREE.AmbientLight(0xcedcff,1.3));
  const key=new THREE.DirectionalLight(0xfaf7ec,1.8);
  key.position.set(80,180,-75);root.add(key);
  const portalFx=createPortal(root,ASTRAL_RETURN_PORTAL.x,4.3,ASTRAL_RETURN_PORTAL.z,.9);
  const night=new THREE.Color(SPACE_COLOR);
  let t=0,last=null,triggered=false;
  let lastSafe={x:0,z:0};
  return {
    root,ground,entry:{x:0,y:0,z:0},pads:ASTRAL_PADS,
    isWalkable:isInsideAstralDungeon,
    resolveCollision(pos,previous,radius=.62){
      if(isInsideAstralDungeon(pos.x,pos.z,radius))return false;
      if(previous&&isInsideAstralDungeon(previous.x,previous.z,radius)){
        pos.x=previous.x;pos.z=previous.z;
      }else{pos.x=0;pos.z=0;}
      return true;
    },
    update(dt,pos){
      t+=Math.min(.09,Math.max(0,dt||0));portalFx(t);
      animateBoundaryEnergy(t);
      // Catch scripted knockback/dashes as well as WASD/click movement:
      // no actor can leave a bridge/platform and fall into the space void.
      if(pos){
        if(isInsideAstralDungeon(pos.x,pos.z,.62))
          lastSafe={x:pos.x,z:pos.z};
        else {pos.x=lastSafe.x;pos.z=lastSafe.z;}
      }
      sky.position.set(pos?.x||0,0,pos?.z||0);
      scene.background=night;scene.fog=null;
      if(!pos){last=null;return false;}
      const near=Math.hypot(pos.x-ASTRAL_RETURN_PORTAL.x,
        pos.z-ASTRAL_RETURN_PORTAL.z)<2.3;
      const wasNear=last&&Math.hypot(last.x-ASTRAL_RETURN_PORTAL.x,
        last.z-ASTRAL_RETURN_PORTAL.z)<2.3;
      last={x:pos.x,z:pos.z};
      if(!triggered&&near&&!wasNear){triggered=true;return true;}
      return false;
    },
    dispose(){disposeGroup(root);},
  };
}