// Game 3D paved roads (2026-11-16 landscaping, round 2).
//
// The main public road gets granite setts and the residential lanes get
// herringbone brick, both baked from real high-poly scatter in Blender
// (tools/landscape-bake/bake_materials.py), with kerbstones along both edges.
// The packed-dirt trail network underneath stays as the verge/shoulder.
//
// addWolfveilPaths() hands every finished dirt strip (after its palace-stair,
// imported-town and river exclusions) to the collector, which narrows it to
// the road's real width and drapes it on the SAME terrain triangles 3 cm
// above the dirt. Decorative only: the walkable floor stays the terrain BVH,
// nothing here raycasts or collides.
import * as THREE from 'three';
import {createWolfveilPathSurface} from './WolfveilPathSurface.mjs';
import {wolfveilHeight} from './WolfveilLayout.js';

export const WOLFVEIL_PAVING=Object.freeze({
  primary:Object.freeze({surface:'cobble',meters:2.34,fallback:0x8b8781,roughness:.74}),
  residential:Object.freeze({surface:'brick',meters:2.1,fallback:0x8e5a45,roughness:.82}),
});
export const WOLFVEIL_KERB=Object.freeze({length:.62,height:.28,width:.15,reveal:.10,gap:.015});
const ROOT='/game3d/landscape/';

/** Paving for a route, or null when the route stays packed dirt. */
export function wolfveilPavingFor(route){
  return WOLFVEIL_PAVING[route?.kind]||null;
}

/**
 * Narrows one dirt strip (corners [startL,startR,endR,endL]) to `k` of its
 * width about its own centre line. Works on palace-clipped corners too.
 */
export function narrowWolfveilStrip(corners,k){
  const s=[(corners[0][0]+corners[1][0])/2,(corners[0][1]+corners[1][1])/2];
  const e=[(corners[2][0]+corners[3][0])/2,(corners[2][1]+corners[3][1])/2];
  const pull=(p,c)=>[c[0]+(p[0]-c[0])*k,c[1]+(p[1]-c[1])*k];
  return [pull(corners[0],s),pull(corners[1],s),pull(corners[2],e),pull(corners[3],e)];
}

/**
 * Kerbstones along both edges of a narrowed strip: whole stones fitted to
 * each edge (no overlap on straights), set just outside the paving.
 */
export function wolfveilKerbsForStrip(paved,{length=WOLFVEIL_KERB.length,width=WOLFVEIL_KERB.width}={}){
  const out=[];
  const edges=[[paved[0],paved[3],paved[1]],[paved[1],paved[2],paved[0]]];
  for(const [a,b,other] of edges){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<.2)continue;
    // Outward = away from the opposite edge.
    let ox=a[0]-other[0],oz=a[1]-other[1];
    const ol=Math.hypot(ox,oz)||1;ox/=ol;oz/=ol;
    const n=Math.max(1,Math.round(len/length)),piece=len/n;
    for(let i=0;i<n;i++){
      const t=(i+.5)/n;
      out.push({x:a[0]+dx*t+ox*(width/2+.015),z:a[1]+dz*t+oz*(width/2+.015),
        yaw:Math.atan2(-dz,dx),length:piece-WOLFVEIL_KERB.gap});
    }
  }
  return out;
}

/** Kerbs {x,z,strip} not standing inside any OTHER paved strip quad. */
export function wolfveilKerbsOutsidePaving(kerbs,strips){
  const boxes=strips.map(q=>({q,minX:Math.min(...q.map(p=>p[0])),maxX:Math.max(...q.map(p=>p[0])),
    minZ:Math.min(...q.map(p=>p[1])),maxZ:Math.max(...q.map(p=>p[1]))}));
  const inside=(q,x,z)=>{
    let sign=0;
    for(let i=0;i<4;i++){
      const a=q[i],b=q[(i+1)%4],c=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
      if(Math.abs(c)<1e-12)continue;
      const s=Math.sign(c);
      if(sign===0)sign=s;else if(s!==sign)return false;
    }
    return true;
  };
  return kerbs.filter(k=>!boxes.some((b,i)=>i!==k.strip&&k.x>=b.minX&&k.x<=b.maxX&&
    k.z>=b.minZ&&k.z<=b.maxZ&&inside(b.q,k.x,k.z)));
}

function loadSurfaceMaps(material,id,meters,loader){
  if(!loader)return;
  const maps={};
  for(const [key,suffix,srgb] of [['map','_albedo',true],['normalMap','_normal',false]]){
    loader.load(ROOT+'wv_'+id+suffix+'.webp',t=>{
      t.wrapS=t.wrapT=THREE.RepeatWrapping;
      t.anisotropy=8;
      if(srgb)t.colorSpace=THREE.SRGBColorSpace;
      t.needsUpdate=true;
      maps[key]=t;
      if(maps.map&&maps.normalMap){
        material.map=maps.map;material.normalMap=maps.normalMap;
        material.color.set(0xffffff);material.needsUpdate=true;
      }
    },undefined,()=>{});
  }
  return maps;
}

export function createWolfveilPavingCollector({terrainSpan=1100,terrainSegments=310,surfaceAt=null}={}){
  const project=createWolfveilPathSurface({heightAt:wolfveilHeight,span:terrainSpan,
    segments:terrainSegments,lift:.13});
  const positions={cobble:[],brick:[]},kerbs=[],strips=[];
  return {
    /** corners: the finished dirt strip; route: its route (kind, width). */
    add(route,corners,verge){
      const paving=wolfveilPavingFor(route);
      if(!paving)return false;
      const paved=narrowWolfveilStrip(corners,route.width/(route.width+verge));
      const tris=project(paved);
      if(!tris)return false;
      const list=positions[paving.surface];
      for(const tri of tris)for(const p of tri)list.push(p[0],p[1],p[2]);
      const id=strips.length;
      strips.push(paved);
      for(const k of wolfveilKerbsForStrip(paved))kerbs.push({...k,strip:id});
      return true;
    },
    /**
     * Fills the outer wedge of a bend (the dirt network's bevel [bend point,
     * end of the previous strip, start of the next]) narrowed to the road
     * width, so the paving turns the corner instead of showing dirt.
     */
    addBevel(route,bevel,verge){
      const paving=wolfveilPavingFor(route);
      if(!paving)return false;
      const k=route.width/(route.width+verge),[b,p1,p2]=bevel;
      const pull=p=>[b[0]+(p[0]-b[0])*k,b[1]+(p[1]-b[1])*k];
      const tris=project([b,pull(p1),pull(p2)]);
      if(!tris)return false;
      const list=positions[paving.surface];
      for(const tri of tris)for(const p of tri)list.push(p[0],p[1],p[2]);
      return true;
    },
    get kerbCount(){return kerbs.length;},
    build(world,{textures=typeof document!=='undefined',loader=null}={}){
      const tl=textures?(loader||new THREE.TextureLoader()):null;
      const meshes={};
      for(const [kind,paving] of Object.entries(WOLFVEIL_PAVING)){
        const list=positions[paving.surface];
        if(!list.length)continue;
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.Float32BufferAttribute(list,3));
        // World-planar UVs at the baked tile size: never stretched along a strip.
        const uv=new Float32Array(list.length/3*2);
        for(let i=0;i<list.length/3;i++){uv[i*2]=list[i*3]/paving.meters;uv[i*2+1]=list[i*3+2]/paving.meters;}
        g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
        g.computeVertexNormals();
        const mat=new THREE.MeshStandardMaterial({color:paving.fallback,roughness:paving.roughness,
          metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
        mat.name='SWV_Paved_'+paving.surface;
        world.ownedMaterials.push(mat);
        loadSurfaceMaps(mat,paving.surface,paving.meters,tl);
        const mesh=world.mesh(new THREE.Mesh(g,mat));
        mesh.name='SWV_PavedRoad_'+paving.surface;
        mesh.receiveShadow=true;mesh.renderOrder=3;
        mesh.raycast=()=>{};
        mesh.userData={decorativeOnly:true,nonCollider:true,paving:kind};
        meshes[paving.surface]=mesh;
      }
      // Junctions: a kerb that would stand on another road's paving is dropped.
      const kept=wolfveilKerbsOutsidePaving(kerbs,strips);
      kerbs.length=0;kerbs.push(...kept);
      let kerbMesh=null;
      if(kerbs.length){
        const K=WOLFVEIL_KERB;
        const geometry=new THREE.BoxGeometry(1,K.height,K.width).translate(0,K.height/2,0);
        const mat=new THREE.MeshStandardMaterial({color:0x8d8a84,roughness:.86,metalness:0});
        mat.name='SWV_Paved_Kerbstone';
        world.ownedMaterials.push(mat);
        // Dressed granite: a small window of the baked cliff-rock maps.
        if(tl)for(const [key,suffix,srgb] of [['map','_albedo',true],['normalMap','_normal',false]]){
          tl.load(ROOT+'wv_rock'+suffix+'.webp',t=>{
            t.wrapS=t.wrapT=THREE.RepeatWrapping;
            t.repeat.set(.07,.035);
            if(srgb)t.colorSpace=THREE.SRGBColorSpace;
            t.needsUpdate=true;
            mat[key]=t;
            if(mat.map&&mat.normalMap)mat.color.set(0xffffff);
            mat.needsUpdate=true;
          },undefined,()=>{});
        }
        kerbMesh=new THREE.InstancedMesh(geometry,mat,kerbs.length);
        const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
        const up=new THREE.Vector3(0,1,0),c=new THREE.Color();
        const ground=surfaceAt||wolfveilHeight;
        kerbs.forEach((k,i)=>{
          // Paving sits 13 cm above the terrain; each kerb shows a 10 cm reveal.
          const y=ground(k.x,k.z)+.13+K.reveal-K.height;
          m.compose(p.set(k.x,y,k.z),q.setFromAxisAngle(up,k.yaw),s.set(k.length,1,1));
          kerbMesh.setMatrixAt(i,m);
          const v=1.15+.3*((Math.imul(i+7,2654435761)>>>0)%1000)/1000;
          kerbMesh.setColorAt(i,c.setRGB(v,v*.98,v*.95));
        });
        kerbMesh.instanceMatrix.needsUpdate=true;
        kerbMesh.instanceColor.needsUpdate=true;
        kerbMesh.computeBoundingSphere();
        kerbMesh.name='SWV_PavedRoad_Kerbstones';
        kerbMesh.receiveShadow=true;kerbMesh.castShadow=false;
        kerbMesh.raycast=()=>{};
        kerbMesh.userData={decorativeOnly:true,nonCollider:true};
        world.mesh(kerbMesh);
      }
      return {meshes,kerbs:kerbMesh,kerbCount:kerbs.length};
    },
  };
}

/**
 * Swaps the dirt network's procedural texture for the Blender-baked dirt
 * (pebbles, grit, straw) once loaded; the procedural map + bump stay as the
 * placeholder (and in Node). UVs are world-planar at `metresPerRepeat`.
 */
export function upgradeWolfveilTrailDirt(material,{metresPerRepeat=4.5,loader=null,
  textures=typeof document!=='undefined'}={}){
  if(!textures)return false;
  const tl=loader||new THREE.TextureLoader(),maps={};
  const repeat=metresPerRepeat/3.4;
  for(const [key,suffix,srgb] of [['map','_albedo',true],['normalMap','_normal',false]]){
    tl.load(ROOT+'wv_dirt'+suffix+'.webp',t=>{
      t.wrapS=t.wrapT=THREE.RepeatWrapping;
      t.repeat.set(repeat,repeat);
      t.anisotropy=8;
      if(srgb)t.colorSpace=THREE.SRGBColorSpace;
      t.needsUpdate=true;
      maps[key]=t;
      if(maps.map&&maps.normalMap){
        material.map=maps.map;material.normalMap=maps.normalMap;material.bumpMap=null;
        material.needsUpdate=true;
      }
    },undefined,()=>{});
  }
  return true;
}
