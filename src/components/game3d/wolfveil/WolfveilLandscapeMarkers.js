// Directional landscaping props for the 2026-11-16 landscape design.
// Decorative only: instanced low-poly rock (one shared 80-triangle stone,
// textured + vertex-shaded), no colliders, no raycasts, no new floors.
//   - standing stones ring every open fighting ground (gaps where trails enter)
//   - cairns mark the Hunter's Loop every ~55 m
//   - gateway boulders + a rubble rim frame each mob camp's open mouth
//   - half-buried rock spots along both riverbanks
// Unshifted local coordinates (the Wolfveil group already carries +70 m Z).
import * as THREE from 'three';
import {wolfveilHeight,WOLFVEIL_RIVER,wolfveilDistanceToRiver,wolfveilRouteClearance} from './WolfveilLayout.js';
import {
  WOLFVEIL_FIGHTING_GROUNDS,WOLFVEIL_MOB_AREAS,WOLFVEIL_FRONTIER_TRAILS,
  wolfveilFrontierTrailClearance,wolfveilNoise2,
} from './WolfveilLandscapeDesign.mjs';
import {getWolfveilSumiETextures,cloneRepeatedTexture} from './WolfveilSumiETextures.mjs';

const TAU=Math.PI*2;
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;
  let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;};}

// One weathered stone: icosahedron with low-frequency lumps and flattened base.
export function makeWolfveilLandscapeStoneGeometry(){
  const g=new THREE.IcosahedronGeometry(1,1);
  const p=g.getAttribute('position');
  const colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const lump=1+.22*wolfveilNoise2(x*1.7+3.1,z*1.7-y*1.3)+.10*wolfveilNoise2(y*3.3,x*3.1);
    p.setXYZ(i,x*lump,Math.max(-.55,y*lump*.9),z*lump);
    const tone=.82+.18*wolfveilNoise2(x*2.4,z*2.4+y);
    const moss=Math.max(0,y)*.35*(.5+.5*wolfveilNoise2(x*1.9+7,z*1.9));
    colors[i*3]=tone*(1-moss*.45);colors[i*3+1]=tone*(1-moss*.15);colors[i*3+2]=tone*(1-moss*.55);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  return g;
}

function nearestTrailPoint(x,z){
  let best=null,bd=Infinity;
  for(const t of WOLFVEIL_FRONTIER_TRAILS)for(let i=0;i<t.points.length-1;i++){
    const a=t.points[i],b=t.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1;
    const s=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l));
    const px=a[0]+dx*s,pz=a[1]+dz*s,d=Math.hypot(x-px,z-pz);
    if(d<bd){bd=d;best=[px,pz];}
  }
  return best;
}

/** Deterministic placements: [{x,z,yaw,sx,sy,sz,sink,kind}] in local metres. */
export function planWolfveilLandscapeMarkers({riverRocks=360}={}){
  const out=[],rand=rng(0x1a7d5c);
  const add=(x,z,sx,sy,sz,kind,sink=.25)=>out.push({x,z,yaw:rand()*TAU,sx,sy,sz,sink,kind});
  // Standing stones around fighting grounds, leaving gaps where trails enter.
  for(const f of WOLFVEIL_FIGHTING_GROUNDS){
    const count=Math.round(f.radius/5.5);
    for(let i=0;i<count;i++){
      const a=i/count*TAU+.21;
      const r=f.radius+3.2;
      const x=f.x+Math.cos(a)*r,z=f.z+Math.sin(a)*r;
      if(Math.min(wolfveilRouteClearance(x,z),wolfveilFrontierTrailClearance(x,z))<3)continue;
      add(x,z,.55+rand()*.2,1.7+rand()*.9,.42+rand()*.15,'standing',.45);
    }
  }
  // Cairns every ~55 m beside the Hunter's Loop, on alternating sides.
  for(const t of WOLFVEIL_FRONTIER_TRAILS.filter(t=>t.id.startsWith('hunters_loop'))){
    let carry=20,side=1;
    for(let i=0;i<t.points.length-1;i++){
      const a=t.points[i],b=t.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      for(let s=carry;s<len;s+=55){
        const nx=-dz/len*side,nz=dx/len*side;side=-side;
        const x=a[0]+dx*s/len+nx*(t.width/2+2.4),z=a[1]+dz*s/len+nz*(t.width/2+2.4);
        if(wolfveilDistanceToRiver(x,z)<16)continue;
        add(x,z,.62,.42,.58,'cairn',.15);
        out.push({x,z,yaw:rand()*TAU,sx:.44,sy:.34,sz:.40,sink:-.48,kind:'cairn'});
        out.push({x,z,yaw:rand()*TAU,sx:.27,sy:.30,sz:.25,sink:-.92,kind:'cairn'});
      }
      carry=Math.max(0,(carry-len)%55);
    }
  }
  // Mob camps: gateway boulders at the mouth facing their trail + rubble rim.
  for(const m of WOLFVEIL_MOB_AREAS){
    const near=nearestTrailPoint(m.x,m.z);
    const mouth=near?Math.atan2(near[1]-m.z,near[0]-m.x):0;
    const rim=m.radius+(m.shape==='quarry'?16:7);
    for(const off of [-.24,.24]){
      const a=mouth+off;
      add(m.x+Math.cos(a)*rim,m.z+Math.sin(a)*rim,1.7+rand()*.5,1.5+rand()*.6,1.6+rand()*.5,'gate',.55);
    }
    const rubble=m.shape==='quarry'?10:7;
    for(let i=0;i<rubble;i++){
      const a=mouth+.55+i/(rubble-1)*(TAU-1.1)+(rand()-.5)*.25;
      const r=rim+(rand()-.3)*3;
      add(m.x+Math.cos(a)*r,m.z+Math.sin(a)*r,.8+rand()*1.1,.55+rand()*.7,.8+rand()*1.1,'rubble',.35);
    }
  }
  // Riverbank rock spots: small half-buried clusters right at the waterline.
  const pts=WOLFVEIL_RIVER.points,half=WOLFVEIL_RIVER.width/2;
  let placed=0;
  for(let i=0;i<pts.length-1&&placed<riverRocks;i++){
    const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    for(let s=0;s<len&&placed<riverRocks;s+=2.2){
      for(const side of [-1,1]){
        const nx=-dz/len*side,nz=dx/len*side;
        const off=half+.4+rand()*3.6;
        const x=a[0]+dx*s/len+nx*off,z=a[1]+dz*s/len+nz*off;
        // The same "rock spot" noise the bank palette darkens.
        if(wolfveilNoise2(x*.21-9,z*.21+4)<.5)continue;
        if(Math.min(wolfveilRouteClearance(x,z),wolfveilFrontierTrailClearance(x,z))<2)continue;
        if(wolfveilDistanceToRiver(x,z)<half+.2)continue;
        const big=rand()<.18;
        add(x,z,(big?.8:.32)+rand()*.45,(big?.5:.22)+rand()*.25,(big?.7:.3)+rand()*.4,'river',.18);
        placed++;
      }
    }
  }
  return out;
}

export function buildWolfveilLandscapeMarkers(world,{riverRocks=360}={}){
  const plan=planWolfveilLandscapeMarkers({riverRocks});
  const geometry=makeWolfveilLandscapeStoneGeometry();
  const suite=getWolfveilSumiETextures();
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.93,metalness:0,
    map:cloneRepeatedTexture(suite.caveRock.map,1,1),
    bumpMap:cloneRepeatedTexture(suite.caveRock.bumpMap,1,1),bumpScale:.08,
  });
  material.name='SWV_Landscape_Wayfinding_Stone';
  world.ownedMaterials.push(material);
  const mesh=new THREE.InstancedMesh(geometry,material,plan.length);
  const dummy=new THREE.Object3D(),tint=new THREE.Color();
  const tones={standing:[.80,.79,.76],cairn:[.86,.84,.80],gate:[.62,.60,.58],rubble:[.55,.52,.48],river:[.50,.52,.50]};
  plan.forEach((p,i)=>{
    const y=wolfveilHeight(p.x,p.z);
    dummy.position.set(p.x,y+p.sy*.55-p.sink,p.z);
    dummy.rotation.set((Math.sin(i*1.7)*.08),p.yaw,(Math.cos(i*2.3)*.08));
    dummy.scale.set(p.sx,p.sy,p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
    const t=tones[p.kind]||tones.rubble,v=.9+.2*((i*0.618)%1);
    mesh.setColorAt(i,tint.setRGB(t[0]*v,t[1]*v,t[2]*v));
  });
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.name='SWV_Landscape_WayfindingStones';
  mesh.castShadow=false;mesh.receiveShadow=true;
  mesh.raycast=()=>{};
  mesh.userData={decorativeOnly:true,nonCollider:true,landscapeMarkers:true};
  world.mesh(mesh);
  const counts={};for(const p of plan)counts[p.kind]=(counts[p.kind]||0)+1;
  return {mesh,count:plan.length,counts};
}
