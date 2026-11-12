// The original Game 1 Verdant Wilds forest runtime is shared with Game 3D.
// This *Game 3D wrapper only* replaces its visual grass, never the ground or
// tree/forest collision. The same optimized blades come from the user's 2m GLB.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {game1ForestGrassPositions} from './render/forestBiomeData.js';
import {WOLFVEIL_OWNER_GRASS_TILE} from './wolfveil/WolfveilGrassTileReplacement.js';

export function installGame3DForestLongGrass(scene,biome,{loader=new GLTFLoader(),
  maxTiles=1800}={}){
  if(!biome?.meshes?.grass)return null;
  let disposed=false,ready=false,geometry=null,material=null,batch=null;
  const time={value:0},wind={value:new THREE.Vector2(.6,.4)},
    gust={value:.25},player={value:new THREE.Vector2(99999,99999)};
  const originalUpdate=biome.update.bind(biome),originalDispose=biome.dispose.bind(biome);
  const sourceGrass=biome.meshes.grass;
  const status=()=>({ready,tiles:batch?.count||0,sourceGLB:WOLFVEIL_OWNER_GRASS_TILE.original});
  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    sourceGrass.visible=true;
    if(batch){scene.remove(batch);batch.dispose?.();}
    geometry?.dispose();material?.dispose();
  };
  // Preserve the original runtime's status, weather and destruction behavior.
  biome.update=(dt,environment,avatar)=>{
    originalUpdate(dt,environment,avatar);
    if(!ready||disposed)return;
    time.value+=Math.max(0,Math.min(.1,Number(dt)||0));
    gust.value=Math.max(.15,Math.min(1,(Number(environment?.windMph)||8)/32));
    const directions={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
    const angle=(directions[environment?.windDir]??225)*Math.PI/180;
    wind.value.set(-Math.sin(angle),-Math.cos(angle));
    if(Number.isFinite(avatar?.x)&&Number.isFinite(avatar?.z))
      player.value.set(avatar.x,avatar.z);
    else player.value.set(99999,99999);
  };
  biome.dispose=()=>{dispose();originalDispose();};
  biome.ownerLongGrassStatus=status;

  loader.load(WOLFVEIL_OWNER_GRASS_TILE.near,gltf=>{
    const root=gltf.scene||gltf.scenes?.[0];
    if(disposed){root?.traverse(n=>{n.geometry?.dispose?.();n.material?.dispose?.();});return;}
    let source=null;
    root?.updateMatrixWorld(true);
    root?.traverse(n=>{if(n.isMesh&&!source)source=n;});
    if(!source?.geometry?.getAttribute('position'))return;
    geometry=source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    const bb=geometry.boundingBox;
    geometry.translate(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2);
    material=source.material.clone();
    material.vertexColors=true;
    material.side=THREE.DoubleSide;
    material.onBeforeCompile=shader=>{
      shader.uniforms.uForestTileTime=time;
      shader.uniforms.uForestTileWind=wind;
      shader.uniforms.uForestTileGust=gust;
      shader.uniforms.uForestTilePlayer=player;
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>',`#include <common>
uniform float uForestTileTime,uForestTileGust;
uniform vec2 uForestTileWind,uForestTilePlayer;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
vec2 grassTileRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xz;
#else
vec2 grassTileRoot=(modelMatrix*vec4(0.,0.,0.,1.)).xz;
#endif
float tip=smoothstep(.05,1.05,position.y);
float swing=sin(uForestTileTime*1.5+grassTileRoot.x*.11+grassTileRoot.y*.15);
vec2 away=grassTileRoot-uForestTilePlayer;
float stepBend=1.-smoothstep(.3,1.9,length(away));
transformed.xz+=(normalize(uForestTileWind+vec2(.001))*
 swing*(.03+.15*uForestTileGust)+normalize(away+vec2(.001))*stepBend*.10)*tip;`);
    };
    material.customProgramCacheKey=()=> 'game3d-owner-2m-grass-forest-v1';
    const cells=new Map();
    for(const spot of game1ForestGrassPositions(biome.trees,14000)){
      const key=Math.floor(spot.x/2.4)+':'+Math.floor(spot.z/2.4);
      if(!cells.has(key)){
        const gx=Math.floor(spot.x/2.4),gz=Math.floor(spot.z/2.4);
        let hashed=(Math.imul(gx,73856093)^Math.imul(gz,19349663))>>>0;
        hashed=Math.imul(hashed^(hashed>>>16),0x7feb352d);
        hashed=Math.imul(hashed^(hashed>>>15),0x846ca68b);
        const rank=(hashed^(hashed>>>16))>>>0;
        cells.set(key,{...spot,rank});
      }
    }
    const chosen=[...cells.values()].sort((a,b)=>a.rank-b.rank).slice(0,maxTiles);
    if(!chosen.length)return;
    batch=new THREE.InstancedMesh(geometry,material,chosen.length);
    batch.name='Game3D_Owner_LongGrass_2m_Forest_Tiles';
    batch.userData={nonCollider:true,visualOnly:true,ownerGrassTile:true};
    batch.castShadow=false;batch.receiveShadow=true;
    batch.raycast=()=>{};
    const holder=new THREE.Object3D();
    chosen.forEach((spot,i)=>{
      const size=.82+((i*37)%21)*.007;
      holder.position.set(spot.x,spot.y-.02,spot.z);
      holder.rotation.set(0,spot.angle||0,0);
      holder.scale.setScalar(size);
      holder.updateMatrix();
      batch.setMatrixAt(i,holder.matrix);
    });
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    scene.add(batch);
    sourceGrass.visible=false;
    ready=true;
    root.traverse(n=>{n.geometry?.dispose?.();n.material?.dispose?.();});
  },undefined,e=>{
    if(!disposed)console.warn('Game 3D forest grass tile unavailable; keeping original grass',e);
  });
  return {status,dispose};
}
