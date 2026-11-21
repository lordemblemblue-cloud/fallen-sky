// Wolfveil forests, courtyard trees, waterfalls and sacred effects.
//
// Locally procedural vegetation provides the broader mountains; the owner's
// original textured elm GLB supplies foreground deciduous trees.
import * as THREE from 'three';
import {NodeMaterial} from 'three/webgpu';
import {Fn,If,Discard,uv,vec2,vec3,vec4,float,fract,sin,dot,floor,mix,abs,smoothstep,clamp,exp,pow,length,atan2,
  normalize,positionGeometry} from 'three/tsl';
import {setNodeTwin} from '../../../lib/webgpuMaterialTwins.js';
import {uniformOf,attachNodes,instanceRootWorld,offsetBeforeInstancing} from '../../../lib/webgpuNodeKit.js';
import {WOLFVEIL_BUILDINGS,WOLFVEIL_HOUSING_PLOTS,
  WOLFVEIL_ROUTES,WOLFVEIL_PALETTE,wolfveilHeight,wolfveilDistanceToRiver,
  WOLFVEIL_SITES,WOLFVEIL_RIVER} from './WolfveilLayout.js';
import {material} from './WolfveilGeometry.js';
import {wolfveilTreePlacements,wolfveilNativeElmPlacements} from './WolfveilForestLayout.js';
import {isWolfveilWestHillsideForest} from './WolfveilWestHillside.mjs';
import {wolfveilR06C02TreeTint} from './WolfveilSquareR06C02.mjs';
import {installGame1OwnerElms} from '../render/forestOwnerElmAssets.js';
// Placements are shared with the server; never maintain a separate renderer seed.
export {wolfveilTreePlacements};
const inst=(geometry,mat,specs,world,name,shadows=false,artFamily=null)=>{
  if(!specs.length)return null;
  const mesh=new THREE.InstancedMesh(geometry,mat,specs.length),dummy=new THREE.Object3D();
  const tint=artFamily?new THREE.Color():null;
  for(let i=0;i<specs.length;i++){
    const p=specs[i];dummy.position.set(p.x,p.y,p.z);
    dummy.rotation.set(p.rx||0,p.rot||0,p.rz||0);
    dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    if(tint){
      const rgb=wolfveilR06C02TreeTint(p.rootX??p.x,p.rootZ??p.z,artFamily);
      tint.setRGB(rgb[0],rgb[1],rgb[2]);
      mesh.setColorAt(i,tint); // Outside the claimed square = pure white (no change).
    }
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.name=name;mesh.frustumCulled=false;
  mesh.castShadow=shadows;mesh.receiveShadow=true;
  world.mesh(mesh);return mesh;
};
export function buildWolfveilVegetation(world,{blueCanopy=false}={}){
  const trees=wolfveilTreePlacements(),trunks=[],branches=[],crowns=[],shrubs=[],bamboo=[];
  // Real owner FBX swaps these temporary boughs off only after it loads.
  // If media fails the authoritative western tree trunks remain visible.
  const ancientTrunks=[],ancientCrowns=[],ancientBranches=[];
  const originalElm=[];
  for(const t of trees){
    if(t.kind==='bamboo'){
      for(let k=0;k<4;k++){
        const angle=t.rot+k*Math.PI/2;
        bamboo.push({x:t.x+Math.sin(angle)*.3,y:t.y+t.height*.5,
          z:t.z+Math.cos(angle)*.3,sx:.05,sy:t.height,sz:.05});
      }
      continue;
    }
    const ownerFallback=t.kind==='ancient';
    (ownerFallback?ancientTrunks:trunks).push({x:t.x,y:t.y+t.height*.44,z:t.z,
      sx:t.kind==='maple'?.45:.37,sy:t.height*.88,sz:t.kind==='maple'?.45:.37,rot:t.rot,
      rootX:t.x,rootZ:t.z});
    if(t.kind==='maple'){
      for(let i=0;i<6;i++){
        const angle=(i/6)*Math.PI*2+t.rot;
        const r=t.height*.16;
        crowns.push({x:t.x+Math.cos(angle)*r,y:t.y+t.height*(.70+(i%3)*.09),
          z:t.z+Math.sin(angle)*r,sx:3.8+i%2,sy:3.1,sz:3.5,kind:'maple',
          rootX:t.x,rootZ:t.z});
      }
    }else{
      const levels=t.kind==='pine'?6:7;
      for(let j=0;j<levels;j++){
        const f=j/(levels-1);
        const r=(3.9+(t.height-15)*.07)*(1-f*.81);
        (ownerFallback?ancientCrowns:crowns).push({x:t.x,y:t.y+t.height*(.26+f*.69),z:t.z,
          sx:r,sy:2.3+(1-f)*1.6,sz:r,rot:t.rot+j*.37,kind:'conifer',
          rootX:t.x,rootZ:t.z});
        if(j%2===0)
          (ownerFallback?ancientBranches:branches).push({x:t.x+r*.30,y:t.y+t.height*(.26+f*.69)-.5,z:t.z,
            sx:r*.85,sy:.14,sz:.14,rot:t.rot+j*.88,
            rootX:t.x,rootZ:t.z});
      }
    }
  }
  // The GLB instance list is identical to the worker's immutable trunk
  // colliders; no generated pines/maples are reintroduced by this renderer.
  originalElm.push(...wolfveilNativeElmPlacements());
  const trunkGeometry=new THREE.CylinderGeometry(.53,.95,1,9,4);
  const boughGeometry=new THREE.CylinderGeometry(0,1,1,9,1);
  // The foliage is multi-layered branch boughs, not single flat cuboids.
  const crownGeometry=new THREE.IcosahedronGeometry(1,1);
  const bark=material(0x514031,.94,{flatShading:true});
  // Only the Game 3D opt-in takes the owner's blue/cyan canopy palette.
  // The shared Game 1 scene retains its original greens and autumn maples.
  const needle=material(blueCanopy?0x28506d:0x356a42,.89,{flatShading:true});
  const maple=material(blueCanopy?0x58a3cf:0x4f7a43,.84,{
    flatShading:true,side:THREE.DoubleSide,
    emissive:blueCanopy?0x0e2c46:0x000000,
    emissiveIntensity:blueCanopy?.12:0,
  });
  // Shared canopy weather follows the same authored wind frame as grass.
  // This applies only to the Game 3D cyan color variant: the default Game 1
  // forest shaders are unchanged and no tree colliders or positions move.
  const canopyTime={value:0},canopyGust={value:.2};
  const canopyWind={value:new THREE.Vector2(.6,.8)};
  if(blueCanopy)for(const canopyMat of [needle,maple]){
    canopyMat.customProgramCacheKey=()=> 'wolfveil-cyan-canopy-wind-v1';
    canopyMat.onBeforeCompile=shader=>{
      if(!shader.vertexShader.includes('#include <common>')||
         !shader.vertexShader.includes('#include <begin_vertex>'))return;
      shader.uniforms.uCanopyTime=canopyTime;
      shader.uniforms.uCanopyGust=canopyGust;
      shader.uniforms.uCanopyWind=canopyWind;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>',`#include <common>
uniform float uCanopyTime,uCanopyGust;
uniform vec2 uCanopyWind;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 canopyRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
#else
vec3 canopyRoot=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
#endif
float canopyTip=smoothstep(-.45,.85,position.y);
float canopySway=sin(uCanopyTime*.73+canopyRoot.x*.08+canopyRoot.z*.12);
transformed.xz+=normalize(uCanopyWind+vec2(.001))*
 canopySway*(.015+.11*uCanopyGust)*canopyTip;`);
    };
  }
  if(blueCanopy){
    // WebGPURenderer: the same sway in TSL, shared by both canopy materials.
    const root=instanceRootWorld();
    const tip=smoothstep(-.45,.85,positionGeometry.y);
    const sway=sin(uniformOf(canopyTime,'float').mul(.73).add(root.x.mul(.08)).add(root.z.mul(.12)));
    const push=normalize(uniformOf(canopyWind,'vec2').add(vec2(.001))).mul(sway).mul(uniformOf(canopyGust,'float').mul(.11).add(.015)).mul(tip);
    const positionNode=offsetBeforeInstancing(vec3(push.x,0,push.y));
    for(const canopyMat of [needle,maple])attachNodes(canopyMat,{positionNode});
  }
  const bambooMat=material(0x426d3a,.91);
  world.ownedMaterials.push(bark,needle,maple,bambooMat);
  inst(trunkGeometry,bark,trunks,world,'SWV_CedarPineMaple_Trunks',false,
    blueCanopy?'bark':null);
  // Each plant kind gets its own palette but only one GPU draw per family.
  const needleSpecs=crowns.filter(o=>o.kind==='conifer');
  const mapleSpecs=crowns.filter(o=>o.kind==='maple');
  inst(crownGeometry,needle,needleSpecs,world,'SWV_Pine_Cedar_RealLayeredBoughs',
    false,blueCanopy?'foliage':null);
  inst(crownGeometry,maple,mapleSpecs,world,'SWV_Autumn_Coral_CourtyardMapleLeaves',
    false,blueCanopy?'foliage':null);
  inst(boughGeometry,bark,branches,world,'SWV_VisibleCedarBranches',
    false,blueCanopy?'bark':null);
  const westernFallback=[
    inst(trunkGeometry,bark,ancientTrunks,world,'SWV_West_OwnerTreeLoading_FallbackTrunks',
      false,blueCanopy?'bark':null),
    inst(crownGeometry,needle,ancientCrowns,world,'SWV_West_OwnerTreeLoading_FallbackCrowns',
      false,blueCanopy?'foliage':null),
    inst(boughGeometry,bark,ancientBranches,world,'SWV_West_OwnerTreeLoading_FallbackBranches',
      false,blueCanopy?'bark':null),
  ].filter(Boolean);
  inst(new THREE.CylinderGeometry(.08,.12,1,7),bambooMat,bamboo,world,'SWV_FlexibleBambooStems');
  for(let i=0;i<20;i++){
    const site=trees[(i*7)%trees.length];
    if(!site)continue;
    shrubs.push({x:site.x+2,y:site.y+.65,z:site.z+1,sx:1.4,sy:1.5,sz:1.4});
  }
  inst(crownGeometry,needle,shrubs,world,'SWV_FernAndShrub_Patches');
  // Imported elm GLB load is asynchronous. Its *existing* server/client
  // trunk collision must not appear as an invisible wall on network failure.
  // These neutral bark/green fallback shapes are visible only while loading
  // or on import error, never alongside a successfully loaded owner GLB.
  const elmBark=material(0x5b4b39,.94);
  const elmLeaf=material(0x537746,.91,{flatShading:true});
  world.ownedMaterials.push(elmBark,elmLeaf);
  const elmTrunkFallback=inst(
    new THREE.CylinderGeometry(.18,.57,1,9),elmBark,
    originalElm.map(p=>({x:p.x,y:p.y+p.height*.36,z:p.z,
      sy:p.height*.72,sx:1,sz:1})),
    world,'SWV_OwnerElm_OnlyIfGLBUnavailable_BarkTrunks');
  const elmCrownFallback=inst(
    new THREE.IcosahedronGeometry(1,1),elmLeaf,
    originalElm.map(p=>({x:p.x,y:p.y+p.height*.77,z:p.z,
      sx:2.4+(p.seed%4)*.3,sy:2.7,sz:2.6+(p.seed%3)*.2})),
    world,'SWV_OwnerElm_OnlyIfGLBUnavailable_GreenFoliage');
  for(const mesh of [elmTrunkFallback,elmCrownFallback]){
    if(!mesh)continue;
    mesh.raycast=()=>{};
    mesh.userData={decorativeOnly:true,ownerGLBLoadingFallback:true};
  }
  const native=installGame1OwnerElms(world.group,originalElm,null,(list)=>list);
  return {trees,native,elmTargets:originalElm.length,
    westTreeFallbackMeshes:westernFallback.length,
    setOwnerWestTreeReady(ready){
      for(const mesh of westernFallback)mesh.visible=!ready;
    },
    update(frame){
      native.update(frame);
      for(const mesh of [elmTrunkFallback,elmCrownFallback])
        if(mesh)mesh.visible=native.status!=='ready';
      if(!blueCanopy)return;
      if(Number.isFinite(frame?.time))canopyTime.value=frame.time;
      if(Number.isFinite(frame?.gust))canopyGust.value=Math.max(0,Math.min(1,frame.gust));
      if(Array.isArray(frame?.wind)&&frame.wind.length===2&&
         frame.wind.every(Number.isFinite))canopyWind.value.set(...frame.wind);
    },
    dispose(){native.dispose();},
  };
}
// WebGPURenderer: TSL twins of the waterfall sheet and its landing foam (same noise, colours and alpha).
const wfHash=Fn(([p])=>fract(sin(dot(p,vec2(127.1,311.7))).mul(43758.5453)));
const wfNoise=Fn(([p])=>{
  const i=floor(p).toVar();const f=fract(p).toVar();f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(wfHash(i),wfHash(i.add(vec2(1,0))),f.x),mix(wfHash(i.add(vec2(0,1))),wfHash(i.add(vec2(1,1))),f.x),f.y);
});
function waterfallSheetTwin(classic){
  const time=uniformOf(classic.uniforms.uTime,'float'),storm=uniformOf(classic.uniforms.uStorm,'float');
  const m=new NodeMaterial();
  m.fragmentNode=Fn(()=>{
    const v=uv().toVar();
    const edge=float(1).sub(smoothstep(.36,.5,abs(v.x.sub(.5))));
    const streamA=wfNoise(vec2(v.x.mul(16),v.y.mul(7).sub(time.mul(4.2)))).toVar();
    const streamB=wfNoise(vec2(v.x.mul(38).add(sin(v.y.mul(6)).mul(.4)),v.y.mul(13).sub(time.mul(6.8))));
    const crest=smoothstep(0,.14,v.y).mul(float(1).sub(smoothstep(0,.06,v.y))).mul(.35);
    const plungeMist=smoothstep(.76,1,v.y).toVar();
    const threads=smoothstep(.42,.88,streamA.mul(.55).add(streamB.mul(.52))).toVar();
    const col=mix(vec3(.07,.31,.42),vec3(.22,.58,.68),streamA.mul(.55).add(.35)).toVar();
    col.assign(mix(col,vec3(.92,.97,.99),clamp(threads.mul(storm.mul(.18).add(.58)).add(plungeMist.mul(.55)).add(crest),0,.96)));
    const opacity=clamp(threads.mul(.36).add(.58).add(plungeMist.mul(.22)).mul(edge.mul(.45).add(.55)),0,.95);
    return vec4(col,opacity);
  })();
  return m;
}
function waterfallFoamTwin(classic){
  const time=uniformOf(classic.uniforms.uTime,'float');
  const m=new NodeMaterial();
  m.fragmentNode=Fn(()=>{
    const p=uv().mul(2).sub(1).toVar();
    const r=length(p).toVar();
    If(r.greaterThan(1),()=>{Discard();});
    const ang=atan2(p.y,p.x);
    const ringA=exp(pow(r.sub(fract(time.mul(.35)).mul(.18).add(.42)).div(.16),2).negate());
    const ringB=exp(pow(r.sub(fract(time.mul(.35).add(.5)).mul(.22).add(.62)).div(.18),2).negate());
    const swirl=sin(ang.mul(7).sub(time.mul(2.4)).add(r.mul(9))).mul(.35).add(.65);
    const alpha=clamp(float(1).sub(r).mul(.38).add(ringA.add(ringB).mul(.34)).mul(swirl),0,.72);
    return vec4(vec3(.88,.95,.98),alpha);
  })();
  return m;
}

export function buildWolfveilWaterfall(world){
  const waterMat=new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,
    uniforms:{uTime:{value:0},uStorm:{value:0}},
    vertexShader:`varying vec2 vUV;varying vec3 vWorld;
      void main(){
        vUV=uv;
        vec4 p=modelMatrix*vec4(position,1.);
        vWorld=p.xyz;
        gl_Position=projectionMatrix*viewMatrix*p;
      }`,
    fragmentShader:`precision highp float;
      varying vec2 vUV;varying vec3 vWorld;
      uniform float uTime,uStorm;
      float wfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float wfNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(wfHash(i),wfHash(i+vec2(1.,0.)),f.x),
                   mix(wfHash(i+vec2(0.,1.)),wfHash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main(){
        float edge=1.-smoothstep(.36,.50,abs(vUV.x-.5));
        float streamA=wfNoise(vec2(vUV.x*16.,vUV.y*7.-uTime*4.2));
        float streamB=wfNoise(vec2(vUV.x*38.+sin(vUV.y*6.)*.4,vUV.y*13.-uTime*6.8));
        float crest=smoothstep(.0,.14,vUV.y)*(1.-smoothstep(.0,.06,vUV.y))*.35;
        float plungeMist=smoothstep(.76,1.0,vUV.y);
        float threads=smoothstep(.42,.88,streamA*.55+streamB*.52);
        vec3 deepJade=vec3(.07,.31,.42);
        vec3 cyanCore=vec3(.22,.58,.68);
        vec3 whiteSpray=vec3(.92,.97,.99);
        vec3 col=mix(deepJade,cyanCore,.35+.55*streamA);
        col=mix(col,whiteSpray,clamp(threads*(.58+.18*uStorm)+plungeMist*.55+crest,0.,.96));
        float opacity=clamp((.58+.36*threads+plungeMist*.22)*(.55+.45*edge),0.,.95);
        gl_FragColor=vec4(col,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mistMat=new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,
    uniforms:{uTime:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float;varying vec2 vUv;uniform float uTime;
      void main(){
        vec2 p=vUv*2.-1.;
        float r=length(p);
        if(r>1.)discard;
        float ang=atan(p.y,p.x);
        float ringA=exp(-pow((r-(.42+.18*fract(uTime*.35)))/.16,2.));
        float ringB=exp(-pow((r-(.62+.22*fract(uTime*.35+.5)))/.18,2.));
        float swirl=.65+.35*sin(ang*7.-uTime*2.4+r*9.);
        float alpha=clamp(((1.-r)*.38+(ringA+ringB)*.34)*swirl,0.,.72);
        gl_FragColor=vec4(vec3(.88,.95,.98),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  setNodeTwin(waterMat,waterfallSheetTwin);setNodeTwin(mistMat,waterfallFoamTwin);
  world.ownedMaterials.push(waterMat,mistMat);
  const {waterfallRange}=WOLFVEIL_RIVER;
  const pts=WOLFVEIL_RIVER.points.filter(p=>p[1]>=waterfallRange[0]-1&&p[1]<=waterfallRange[1]+1);
  const top=pts.find(p=>p[1]>180)||[142,184,45];
  const bottom=pts.find(p=>p[1]<171)||[132,166,19];
  const width=17.6,dx=bottom[0]-top[0],dz=bottom[1]-top[1];
  const h=top[2]-bottom[2],steps=26,cols=10;
  const v=[],uv=[],ids=[];
  for(let j=0;j<=steps;j++){
    const t=j/steps;
    // Slight parabolic lip curve + mid-cliff rock ledge bulge so it reads in 3D
    const lipArc=Math.sin(t*Math.PI)*1.35+Math.sin(t*Math.PI*3)*.28;
    for(let c=0;c<=cols;c++){
      const u=c/cols,side=u*2-1;
      const x=top[0]+dx*t+side*width*.5*(1+.08*t)+Math.sin(t*14+u*5)*.18;
      const z=top[1]+dz*t-lipArc*.45;
      const y=top[2]-h*Math.pow(t,1.08)+Math.cos(u*Math.PI)*.32*(1-t);
      v.push(x,y,z);uv.push(u,t);
    }
  }
  const stride=cols+1;
  for(let j=0;j<steps;j++)for(let c=0;c<cols;c++){
    const a=j*stride+c,b=a+stride;
    ids.push(a,b,a+1,a+1,b,b+1);
  }
  const g=new THREE.BufferGeometry();
  g.setIndex(ids);
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();
  const obj=world.mesh(new THREE.Mesh(g,waterMat));
  obj.name='SWV_Waterfall_ContinuousSource_FallingSheet_Outlet';
  obj.raycast=()=>{};
  const bubbles=new THREE.Mesh(new THREE.PlaneGeometry(21,21),mistMat);
  bubbles.rotation.x=-Math.PI/2;
  bubbles.position.set(bottom[0],bottom[2]+.14,bottom[1]);
  bubbles.renderOrder=3;
  bubbles.raycast=()=>{};
  bubbles.name='SWV_Waterfall_LandingFoam';world.mesh(bubbles);
  return {
    object:obj,segments:steps,
    update(frame){
      waterMat.uniforms.uTime.value=frame.time;
      waterMat.uniforms.uStorm.value=frame.rain;
      mistMat.uniforms.uTime.value=frame.time;
    },
  };
}