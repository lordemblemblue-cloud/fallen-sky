// GAME 1 / GAME 3D - Verdant Wilds biome runtime.
// Keeps Three.js, the live weather, day/night sky, vibrant sumi-e ink pass,
// enemy/quest spawns, and the existing authoritative combat untouched.
// Trees, grass and water are batched. The original ground mesh remains the
// game's terrain raycast target, so mounts, enemies and click-to-move use it.
import * as THREE from 'three';
import {createPaintedGroundMaterial} from './paintedGroundMaterial.js';
import {
  game1ForestTrees,GAME1_MUD_BASINS,game1ForestHeight,forestStreamX,
} from './forestBiomeData.js';
import {
  buildGame1Trees,buildGame1Grass,buildGame1GroundGeometry,game1ForestMaterials,
} from './forestBiomeMeshes.js';
import { buildGame1ForestDressing } from './forestBiomeDressing.js';
import { Game1ForestWeather } from './forestBiomeWeather.js';
import { Game1ForestWildlife } from './forestBiomeWildlife.js';
import { installGame1OwnerElms } from './forestOwnerElmAssets.js';

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const makeUniforms=()=>({
  uForestTime:{value:0},uForestWind:{value:new THREE.Vector2(.5,.4)},
  uForestGust:{value:.2},uForestRain:{value:0},
  uForestWetness:{value:0},
  uForestPlayer:{value:new THREE.Vector2(9999,9999)},
});
function wetShader(material,uniforms,mode='soil'){
  material.userData.forestUniforms=uniforms;
  material.customProgramCacheKey=()=> 'game1-forest-'+mode;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float uForestWetness;\nuniform float uForestRain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        // Both terrain and tree bark become darker and less chalky when wet.
        diffuseColor.rgb *= mix(1.0, ${mode==='soil'?'0.58':'0.68'}, uForestWetness);
      `)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        // Thin wet films catch highlights; dry soil keeps a matte ink look.
        roughnessFactor=mix(roughnessFactor,${mode==='soil'?'0.37':'0.62'},
          clamp(uForestWetness*.84,0.0,1.0));
      `);
  };
  return material;
}
function windShader(material,uniforms,mode){
  material.userData.forestUniforms=uniforms;
  const canopy=mode==='canopy';
  material.customProgramCacheKey=()=> 'game1-forest-wind-'+mode;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>
attribute float aFlex;
uniform float uForestTime, uForestGust, uForestRain;
uniform vec2 uForestWind, uForestPlayer;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
float bend=clamp(aFlex,0.0,1.0);
float gust=sin(uForestTime*1.8+position.x*.33+position.z*.47)*.62
          +sin(uForestTime*2.93-position.x*.21+position.z*.39)*.38;
float amplitude=${canopy?'.15':'.39'}*uForestGust*bend;
transformed.xz+=normalize(uForestWind+vec2(.0001))*(gust*.48+.52)*amplitude;
transformed.y-=uForestRain*bend*${canopy?'.042':'.16'};
${canopy?'':`// Nearby footsteps bend blade tops outward without shifting their bases.
vec2 difference=position.xz-uForestPlayer;
float proximity=1.0-smoothstep(.15,1.5,length(difference));
transformed.xz+=normalize(difference+vec2(.0001))*proximity*bend*.16;
transformed.y-=proximity*bend*.10;`}`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float uForestWetness;\nuniform float uForestRain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
diffuseColor.rgb *= mix(1.0, ${canopy?'.77':'.66'}, clamp(uForestWetness*.70+uForestRain*.30,0.0,1.0));`);
  };
  return material;
}
const WATER_VERT=`
uniform float uForestTime,uForestRain;
varying vec3 vWorld; varying vec2 vUV;
void main(){
  vUV=uv;
  vec3 p=position;
  vec4 world;
  #ifdef USE_INSTANCING
    world=modelMatrix*instanceMatrix*vec4(p,1.0);
  #else
    world=modelMatrix*vec4(p,1.0);
  #endif
  p.y+=.021*sin(world.x*1.4+world.z*.72-uForestTime*1.62)
     +.014*sin(world.z*2.0-world.x*.6+uForestTime*2.33);
  #ifdef USE_INSTANCING
    world=modelMatrix*instanceMatrix*vec4(p,1.0);
  #else
    world=modelMatrix*vec4(p,1.0);
  #endif
  vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;
}`;
const WATER_FRAG=`
uniform float uForestTime,uForestRain,uForestWetness,uForestMud,uForestNight;
uniform vec2 uForestWind,uForestFogNearFar;
uniform vec3 uForestSkyColor,uForestFogColor;
uniform vec4 uForestFootstep;
varying vec3 vWorld; varying vec2 vUV;
void main(){
  vec2 p=vWorld.xz+uForestWind*uForestTime*.36;
  float ripple=sin(p.x*1.85+p.y*.74-uForestTime*1.8)*.4
       +sin(p.y*3.2-p.x*1.08+uForestTime*2.4)*.3
       +sin(p.x*2.0+p.y*2.25+uForestTime*1.1)*.3;
  vec3 water=mix(vec3(.065,.27,.27),vec3(.18,.46,.40),.55+.45*ripple);
  vec3 muddy=mix(vec3(.20,.13,.078),vec3(.40,.25,.13),.55+.45*ripple);
  water=mix(water,muddy,mix(clamp(uForestWetness*.52,0.0,.58),1.0,uForestMud));
  vec3 view=normalize(cameraPosition-vWorld);
  float fresnel=pow(1.0-clamp(view.y,0.0,1.0),2.8);
  float clouds=.5+.5*sin(vWorld.x*.016+vWorld.z*.011+uForestTime*.08);
  vec3 sky=mix(uForestSkyColor*.79,uForestSkyColor*1.18,clouds);
  water=mix(water,sky,(.20+.55*fresnel)*(1.0-uForestMud*.44));
  // Turbulent pale waterline follows the actual curved stream-bank UVs;
  // muddy pools retain an earthier tannin rim rather than a blue halo.
  float bank=uForestMud>.5
    ? smoothstep(.73,.99,length((vUV-.5)*2.0))
    : smoothstep(.79,.99,abs(vUV.x*2.0-1.0));
  float edgeWaves=.06+.045*sin(vWorld.x*2.1+vWorld.z*.83-uForestTime*2.5);
  water=mix(water,uForestMud>.5?vec3(.48,.35,.20):vec3(.64,.77,.73),
    bank*edgeWaves);
  float drops=uForestRain*pow(max(.0,sin(length(fract(p*1.8)-.5)*42.0-uForestTime*27.0)),6.0);
  water+=drops*.15+max(0.0,ripple)*.09;
  // Interactive shallow splash waves are triggered only by moving feet, and
  // propagate outward with a short-lived fading ring on both water types.
  float since=uForestTime-uForestFootstep.z;
  if(since>=0.0 && since<1.8){
    float d=length(vWorld.xz-uForestFootstep.xy);
    float ring=sin(d*16.0-since*15.0)*exp(-d*2.6)*exp(-since*2.0);
    water+=vec3(.17,.20,.19)*ring*uForestFootstep.w;
  }
  water*=mix(1.0,.42,uForestNight);
  float mist=smoothstep(uForestFogNearFar.x,uForestFogNearFar.y,
    length(cameraPosition-vWorld));
  water=mix(water,uForestFogColor,mist);
  float rim=1.0-uForestMud*.20;
  gl_FragColor=vec4(water, rim);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function waterMaterial(isPuddle=false){
  const uniforms={
    uForestTime:{value:0},uForestRain:{value:0},uForestWetness:{value:0},
    uForestWind:{value:new THREE.Vector2(.5,.4)},uForestMud:{value:isPuddle?1:0},
    uForestSkyColor:{value:new THREE.Color(.41,.63,.79)},
    uForestFogColor:{value:new THREE.Color(.35,.52,.57)},
    uForestFogNearFar:{value:new THREE.Vector2(350,2200)},
    uForestNight:{value:0},uForestFootstep:{value:new THREE.Vector4(0,0,-10,0)},
  };
  const material=new THREE.ShaderMaterial({
    uniforms,vertexShader:WATER_VERT,fragmentShader:WATER_FRAG,
    side:THREE.DoubleSide,transparent:true,depthWrite:false,
  });
  material.name=isPuddle?'Game 1 muddy rain puddles':'Game 1 reflective flowing stream';
  return material;
}
export function buildGame1ForestStream(){
  const pos=[],uv=[],idx=[],width=4.4,rows=115,cols=8;
  for(let j=0;j<=rows;j++){
    const z=-110+j*220/rows,x0=forestStreamX(z);
    for(let i=0;i<=cols;i++){
      const t=i/cols,x=x0+(t*2-1)*width;
      pos.push(x,-.17+.02*Math.sin(z*.11),z);
      uv.push(t,j/rows);
    }
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;
    idx.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(idx);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
function addGame1Puddles(scene) {
  const geometry=new THREE.CircleGeometry(1,28);
  geometry.rotateX(-Math.PI/2);
  const material=waterMaterial(true);
  const mesh=new THREE.InstancedMesh(geometry,material,GAME1_MUD_BASINS.length);
  mesh.name='Game 1 muddy depressions - filling rain puddles';
  mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=3;
  const dummy=new THREE.Object3D();
  const setFill=(fraction)=>{
    const fill=clamp(fraction,0,1);
    for(let i=0;i<GAME1_MUD_BASINS.length;i++){
      const p=GAME1_MUD_BASINS[i];
      // Author-sculpted basin is deepest at the centre. No water until rain
      // fills it; circles expand from the low point as saturation increases.
      dummy.position.set(p.x,game1ForestHeight(p.x,p.z)+p.depth*(.68+fill*.13),p.z);
      const radius=p.radius*(.38+.53*fill);
      dummy.scale.set(radius,1,radius);dummy.rotation.set(0,0,0);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.visible=fill>.04;
  };
  scene.add(mesh);
  return {mesh,material,setFill,dispose:()=>{scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}};
}
function addForestStream(scene){
  const mesh=new THREE.Mesh(buildGame1ForestStream(),waterMaterial());
  mesh.name='Game 1 flowing river with water shader';
  mesh.renderOrder=2;mesh.frustumCulled=false;scene.add(mesh);
  return mesh;
}
export function createGame1ForestBiome(scene){
  const trees=game1ForestTrees(),meshes=buildGame1Trees(trees),grass=buildGame1Grass(trees);
  const dressing=buildGame1ForestDressing(trees);
  const groundMaterial=wetShader(createPaintedGroundMaterial(),makeUniforms(),'soil');
  // Pigment grain doubles as a subtle real normal perturbation: unlike a
  // smooth green slab, ground highlights respond to soil brush ridges.
  groundMaterial.bumpMap=groundMaterial.map;
  groundMaterial.bumpScale=.095;
  groundMaterial.vertexColors=true;groundMaterial.needsUpdate=true;
  const ground=new THREE.Mesh(buildGame1GroundGeometry(),groundMaterial);
  ground.rotation.set(0,0,0);
  ground.name='Game 1 Verdant Wilds Terrain';
  ground.userData.isTerrain=true;
  ground.receiveShadow=true;
  scene.add(ground);

  const materials=game1ForestMaterials();
  const barkUniforms=makeUniforms(),grassUniforms=makeUniforms(),leafUniforms=makeUniforms();
  wetShader(materials.bark,barkUniforms,'bark');
  windShader(materials.leaves,leafUniforms,'canopy');
  windShader(materials.sprays,leafUniforms,'canopy');
  windShader(materials.grass,grassUniforms,'grass');
  const bark=new THREE.Mesh(meshes.bark,materials.bark);
  const canopy=new THREE.Mesh(meshes.foliage,materials.leaves);
  const leafSprays=new THREE.Mesh(meshes.leafCards,materials.sprays);
  const grassMesh=new THREE.Mesh(grass.geometry,materials.grass);
  bark.name='Game 1 detailed grooved bark and tree branches';
  canopy.name='Game 1 shaded 3D inner canopy';
  leafSprays.name='Game 1 botanical pine needle and oak-birch leaf atlas';
  grassMesh.name='Game 1 wind-bending grass and ferns';
  bark.castShadow=true;canopy.castShadow=false;
  leafSprays.castShadow=false;leafSprays.receiveShadow=true;
  bark.receiveShadow=true;canopy.receiveShadow=true;
  grassMesh.receiveShadow=true;
  scene.add(bark,canopy,leafSprays,grassMesh);
  // Original detailed fern fronds, broken logs, mossy stones, fungi and leaf
  // litter; just two more shared draw batches rather than thousands of Meshes.
  const fernMesh=new THREE.Mesh(dressing.understory,materials.grass);
  const dressingUniforms=makeUniforms();
  const dressingMaterial=wetShader(new THREE.MeshStandardMaterial({vertexColors:true,
    roughness:.94,metalness:0,side:THREE.DoubleSide}),dressingUniforms,'soil');
  const floorDetails=new THREE.Mesh(dressing.ground,dressingMaterial);
  fernMesh.name='Game 1 flexible five-frond fern undergrowth';
  floorDetails.name='Game 1 fallen timber mossy stones mushrooms leaf litter';
  fernMesh.receiveShadow=true;floorDetails.receiveShadow=true;
  scene.add(fernMesh,floorDetails);

  const stream=addForestStream(scene),puddles=addGame1Puddles(scene);
  const animals=new Game1ForestWildlife(scene,trees);
  const weather=new Game1ForestWeather();
  // Display the user's ORIGINAL uploaded high-detail elm meshes when the
  // optimized GLB loads successfully. Procedural tree materials persist as a
  // stable fallback, then we remove only the replaced placeholder trees.
  let disposed=false;
  const originalElms=installGame1OwnerElms(scene,trees,replaced=>{
    if(disposed)return;
    const remaining=buildGame1Trees(trees.filter(t=>!replaced.has(t)));
    for(const [object,geometry] of [[bark,remaining.bark],
      [canopy,remaining.foliage],[leafSprays,remaining.leafCards]]){
      object.geometry.dispose();object.geometry=geometry;
    }
  });
  const groundUniforms=groundMaterial.userData.forestUniforms;
  // Older Game 3D GPU stacks need an existing shader uniform object before
  // the first compilation; bind this explicitly for headless tests too.
  const uniforms=[groundUniforms,barkUniforms,grassUniforms,leafUniforms,dressingUniforms];
  let lastFill=-1,previousHero=null,lastRippleTime=-10;
  const footstep=new THREE.Vector4(0,0,-10,0);
  const api={
    ground,trees,meshes:{bark,canopy,leafSprays,grass:grassMesh,ferns:fernMesh,
      debris:floorDetails,stream,puddles:puddles.mesh},
    dressingCounts:dressing.counts,fallenLogs:dressing.logs,
    botanicalSprays:meshes.sprayCount,animals,weather,
    originalElms,grassBladeGroups:grass.bladeGroups,
    update(dt,env,playerPosition){
      if(disposed)return;
      const frame=weather.update(dt,env);
      originalElms.update(frame);
      for(const u of uniforms){
        if(!u)continue;
        u.uForestTime.value=frame.time;u.uForestRain.value=frame.rain;
        u.uForestWetness.value=frame.wetness;
        u.uForestWind.value.set(...frame.wind);
        u.uForestGust.value=frame.gust;
        u.uForestPlayer.value.set(playerPosition?.x??9999,playerPosition?.z??9999);
      }
      // A ripple is emitted only when the player actually walks in the stream
      // or through a rain-filled terrain depression (not just from animation).
      const px=playerPosition?.x,pz=playerPosition?.z;
      if(Number.isFinite(px)&&Number.isFinite(pz)){
        const walked=previousHero&&Math.hypot(px-previousHero.x,pz-previousHero.z)>.055;
        const nearRiver=Math.abs(px-forestStreamX(pz))<4.4;
        const puddle=frame.puddles>.08&&GAME1_MUD_BASINS.some(b=>
          Math.hypot(px-b.x,pz-b.z)<b.radius*(.35+.5*frame.puddles));
        if(walked&&(nearRiver||puddle)&&frame.time-lastRippleTime>.31){
          footstep.set(px,pz,frame.time,1);
          lastRippleTime=frame.time;
        }
        previousHero={x:px,z:pz};
      }
      for(const mat of [stream.material,puddles.material]){
        const u=mat.uniforms;
        u.uForestTime.value=frame.time;
        u.uForestRain.value=frame.rain;
        u.uForestWetness.value=frame.wetness;
        u.uForestWind.value.set(...frame.wind);
        u.uForestFootstep.value.copy(footstep);
        u.uForestFogColor.value.copy(scene.fog?.color||new THREE.Color(.35,.52,.57));
        u.uForestSkyColor.value.copy(scene.fog?.color||new THREE.Color(.41,.63,.79));
        u.uForestFogNearFar.value.set(scene.fog?.near??350,scene.fog?.far??2200);
        u.uForestNight.value=env?.isNight?1:0;
      }
      if(Math.abs(frame.puddles-lastFill)>.025||frame.puddles<.04 && lastFill>=.04){
        puddles.setFill(frame.puddles);lastFill=frame.puddles;
      }
      animals.update(dt,playerPosition);
    },
    resolveCollision(position,radius=.62){
      if(!position||disposed)return false;
      let pushed=false;
      for(const t of trees){
        if(Math.abs(t.x-position.x)>2||Math.abs(t.z-position.z)>2)continue;
        const dx=position.x-t.x,dz=position.z-t.z,dist=Math.hypot(dx,dz),min=t.radius*.95+radius;
        if(dist>=min)continue;
        const nx=dist>.001?dx/dist:1,nz=dist>.001?dz/dist:0;
        position.x=t.x+nx*min;position.z=t.z+nz*min;pushed=true;
      }
      // Fallen timber cannot be walked through even though all logs share
      // a single rendered mesh. The server remains responsible for online
      // combat authority; this is the same client-side nature collision.
      for(const l of dressing.logs){
        if(Math.abs(position.x-l.x)>l.len*.5+2 || Math.abs(position.z-l.z)>l.len*.5+2)continue;
        const dx=Math.cos(l.angle),dz=Math.sin(l.angle);
        const ux=position.x-l.x,uz=position.z-l.z;
        const along=clamp(ux*dx+uz*dz,-l.len*.5,l.len*.5);
        const cx=l.x+along*dx,cz=l.z+along*dz;
        const x=position.x-cx,z=position.z-cz,d=Math.hypot(x,z),min=l.r+radius;
        if(d>=min)continue;
        position.x=cx+(d>.001?x/d:-dz)*min;
        position.z=cz+(d>.001?z/d:dx)*min;
        pushed=true;
      }
      return pushed;
    },
    dispose(){
      if(disposed)return;disposed=true;
      originalElms.dispose();
      for(const object of [bark,canopy,leafSprays,grassMesh,fernMesh,floorDetails,stream]){
        scene.remove(object);object.geometry.dispose();
      }
      for(const material of [materials.bark,materials.leaves,materials.sprays,materials.grass,
        dressingMaterial,stream.material])material.dispose();
      materials.barkMap.dispose();materials.bump.dispose();materials.leafAtlas.dispose();
      puddles.dispose();animals.dispose();
    },
  };
  ground.userData.forestBiome=api;
  return api;
}
