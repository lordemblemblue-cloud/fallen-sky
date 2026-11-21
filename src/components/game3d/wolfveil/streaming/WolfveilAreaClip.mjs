// Cuts what reaches past the loaded Wolfveil area off at its border.
//
// In portal-scene play only one area is loaded (GameWorld3D `mode:'single'`).
// The area loader hides scenery that lies wholly in other areas, but anything
// that straddles a border stays whole: the trail network, the paved roads, the
// river, the far half of each bridge, and the ground's sawtooth edge (whole
// terrain triangles picked by their centre). Seen from inside the area, those
// pieces hang over the void beyond the border, which a white veil used to hide.
// Clipping them to the area's rectangle leaves a straight, clean edge: what is
// past a gate is simply not there until the player goes through.
//
// Geometry only: no materials, collision rules or saved data change. Positions
// are tested in WORLD x/z (Wolfveil local z + offsetZ); every vertex attribute
// (normals, uvs, colours, splat weights, river flow...) is interpolated on cut
// edges, so a clipped surface looks exactly like the uncut one up to the line.
import * as THREE from 'three';
import {wolfveilAreaRect,WOLFVEIL_AREA_IDS} from './WolfveilFiveAreaPlan.mjs';

const EPS=1e-7;

/** The four half-planes of `area` in WORLD x/z (unbounded sides dropped). */
export function wolfveilAreaClipPlanes(area,{offsetZ=70}={}){
  const rect=wolfveilAreaRect(area);
  if(!rect)return null;
  const planes=[];
  if(Number.isFinite(rect.minX))planes.push({axis:0,sign:1,value:rect.minX});
  if(Number.isFinite(rect.maxX))planes.push({axis:0,sign:-1,value:rect.maxX});
  if(Number.isFinite(rect.minZ))planes.push({axis:1,sign:1,value:rect.minZ+offsetZ});
  if(Number.isFinite(rect.maxZ))planes.push({axis:1,sign:-1,value:rect.maxZ+offsetZ});
  return planes;
}

/**
 * A copy of `geometry` cut to `area`'s rectangle: {geometry, kept, cut,
 * dropped} (triangle counts), or null when nothing lies outside it (keep the
 * original). `matrixWorld` places the geometry in the world (null: already
 * world); the result stays in the geometry's own space, non-indexed, with
 * the same attributes and groups.
 */
export function clipGeometryToWolfveilArea(geometry,area,{matrixWorld=null,offsetZ=70,planes=null}={}){
  const position=geometry?.attributes?.position;
  if(!position)return null;
  planes=planes||wolfveilAreaClipPlanes(area,{offsetZ});
  if(!planes)return null;
  const e=matrixWorld?.elements||null;
  const index=geometry.index;
  const count=index?index.count:position.count;
  const vertexOf=k=>index?index.getX(k):k;
  const worldX=new Float64Array(position.count),worldZ=new Float64Array(position.count);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    worldX[i]=e?e[0]*x+e[4]*y+e[8]*z+e[12]:x;
    worldZ[i]=e?e[2]*x+e[6]*y+e[10]*z+e[14]:z;
  }
  const side=(plane,x,z)=>plane.sign*((plane.axis===0?x:z)-plane.value);
  // Nothing outside: keep the original geometry untouched.
  let outside=false;
  for(let i=0;i<position.count&&!outside;i++)
    for(const plane of planes)if(side(plane,worldX[i],worldZ[i])< -EPS){outside=true;break;}
  if(!outside)return null;

  const names=Object.keys(geometry.attributes);
  const sources=names.map(name=>geometry.attributes[name]);
  const out=names.map(()=>[]);
  let kept=0,cut=0,dropped=0;
  // A polygon vertex is a blend of the triangle's three corners: [wa,wb,wc,x,z].
  const emit=(ids,w)=>{
    for(let n=0;n<names.length;n++){
      const attribute=sources[n],size=attribute.itemSize,list=out[n];
      const start=list.length;
      for(let s=0;s<size;s++){
        let value=0;
        for(let c=0;c<3;c++)if(w[c])value+=w[c]*attribute.getComponent(ids[c],s);
        list.push(value);
      }
      if(names[n]==='normal'&&size===3){
        const l=Math.hypot(list[start],list[start+1],list[start+2])||1;
        list[start]/=l;list[start+1]/=l;list[start+2]/=l;
      }
    }
  };
  const groups=geometry.groups?.length?geometry.groups:[{start:0,count,materialIndex:0}];
  const outGroups=[];
  for(const group of groups){
    const startVertex=out[0].length/sources[0].itemSize;
    const end=Math.min(count,group.start+group.count);
    for(let k=group.start;k+2<end;k+=3){
      const ids=[vertexOf(k),vertexOf(k+1),vertexOf(k+2)];
      let polygon=ids.map((id,c)=>[c===0?1:0,c===1?1:0,c===2?1:0,worldX[id],worldZ[id]]);
      let clipped=false;
      for(const plane of planes){
        const next=[];
        for(let i=0;i<polygon.length;i++){
          const a=polygon[i],b=polygon[(i+1)%polygon.length];
          const da=side(plane,a[3],a[4]),db=side(plane,b[3],b[4]);
          if(da>=-EPS)next.push(a);
          if((da>=-EPS)!==(db>=-EPS)){
            const t=da/(da-db);
            next.push(a.map((v,j)=>v+(b[j]-v)*t));
            clipped=true;
          }
        }
        if(next.length!==polygon.length)clipped=true;
        polygon=next;
        if(polygon.length<3)break;
      }
      if(polygon.length<3){dropped++;continue;}
      if(!clipped){kept++;for(const v of polygon)emit(ids,v);continue;}
      cut++;
      for(let i=1;i+1<polygon.length;i++){emit(ids,polygon[0]);emit(ids,polygon[i]);emit(ids,polygon[i+1]);}
    }
    const vertices=out[0].length/sources[0].itemSize-startVertex;
    if(vertices)outGroups.push({start:startVertex,count:vertices,materialIndex:group.materialIndex??0});
  }
  const result=new THREE.BufferGeometry();
  names.forEach((name,n)=>result.setAttribute(name,
    new THREE.Float32BufferAttribute(out[n],sources[n].itemSize)));
  if(geometry.groups?.length)for(const g of outGroups)result.addGroup(g.start,g.count,g.materialIndex);
  result.computeBoundingBox();result.computeBoundingSphere();
  result.name=(geometry.name||'')+'_area';
  return {geometry:result,kept,cut,dropped};
}

/**
 * Cuts every plain mesh under `root` that reaches past `area` off at its
 * border, in place. Skips instanced and skinned meshes (the area loader
 * handles instances one by one), the subtrees in `exclude` (torii gates,
 * the streamed ground) and objects marked `userData.wolfveilAreaKeepWhole`.
 * `rebuildBoundsTree(geometry)` re-creates a raycast tree where one existed.
 */
export function clipWolfveilSceneToArea(root,area,{offsetZ=70,exclude=[],rebuildBoundsTree=null,
  report={area,clipped:[],emptied:[],skipped:0}}={}){
  if(!root?.traverse||!WOLFVEIL_AREA_IDS.includes(area))return report;
  const planes=wolfveilAreaClipPlanes(area,{offsetZ});
  const rect=wolfveilAreaRect(area);
  const excluded=new Set(exclude.filter(Boolean));
  root.updateMatrixWorld?.(true);
  const meshes=[],users=new Map(),box=new THREE.Box3();
  const walk=object=>{
    if(excluded.has(object)||object.userData?.wolfveilAreaKeepWhole)return;
    if(object.isMesh&&!object.isInstancedMesh&&!object.isSkinnedMesh&&object.geometry){
      // Every user counts, so a geometry another mesh still draws is never disposed.
      users.set(object.geometry,(users.get(object.geometry)||0)+1);
      if(object.userData?.wolfveilAreaChecked!==object.geometry.uuid)meshes.push(object);
    }
    for(const child of object.children||[])walk(child);
  };
  walk(root);
  const done=new Map(); // shared geometry with the same placement is cut once
  for(const mesh of meshes){
    const geometry=mesh.geometry;
    // Cheap first look: a bounding box wholly inside needs no vertex pass.
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if(box.min.x>=rect.minX&&box.max.x<=rect.maxX&&box.min.z-offsetZ>=rect.minZ&&box.max.z-offsetZ<=rect.maxZ){
      mesh.userData.wolfveilAreaChecked=geometry.uuid;report.skipped++;continue;
    }
    const key=geometry.uuid+':'+mesh.matrixWorld.elements.join(',');
    let result=done.get(key);
    if(result===undefined){
      result=clipGeometryToWolfveilArea(geometry,area,{matrixWorld:mesh.matrixWorld,planes});
      done.set(key,result);
    }
    if(!result){mesh.userData.wolfveilAreaChecked=geometry.uuid;report.skipped++;continue;}
    const hadTree=Boolean(geometry.boundsTree);
    mesh.geometry=result.geometry;
    if(hadTree&&rebuildBoundsTree&&result.geometry.attributes.position.count)rebuildBoundsTree(result.geometry);
    mesh.userData.wolfveilClippedToArea=area;
    mesh.userData.wolfveilAreaChecked=result.geometry.uuid;
    if(!result.geometry.attributes.position.count){mesh.visible=false;report.emptied.push(mesh.name);}
    else report.clipped.push({name:mesh.name,kept:result.kept,cut:result.cut,dropped:result.dropped});
    if(users.get(geometry)===1)geometry.dispose?.();
    else users.set(geometry,users.get(geometry)-1);
  }
  return report;
}

/**
 * Keeps a portal scene to its area while the world fills in: plain meshes
 * under `roots()` are cut at the border (once, again if their geometry is
 * swapped), and instances of instanced meshes (grass, flower and fern cards,
 * rock fields, the streaming meadow) that stand outside the area are hidden
 * (scaled to nothing) whenever their owner rewrites them. Call update(nowMs)
 * every frame, after the scenery has moved; it rescans every `rescanMs`.
 */
export function createWolfveilAreaScope({roots,area,offsetZ=70,exclude=()=>[],rebuildBoundsTree=null,
  rescanMs=2000}={}){
  const rect=wolfveilAreaRect(area);
  if(!rect||typeof roots!=='function')return null;
  const report={area,clipped:[],emptied:[],skipped:0,instancesHidden:0};
  const inside=(x,z)=>x>=rect.minX&&x<=rect.maxX&&z-offsetZ>=rect.minZ&&z-offsetZ<=rect.maxZ;
  let instanced=[],lastScan=-Infinity;
  const seen=new WeakMap(),m=new THREE.Matrix4(),hidden=new THREE.Matrix4(),world=new THREE.Vector3();
  const scan=()=>{
    const excluded=new Set((exclude()||[]).filter(Boolean));
    instanced=[];
    for(const root of roots()||[]){
      if(!root)continue;
      clipWolfveilSceneToArea(root,area,{offsetZ,exclude:[...excluded],rebuildBoundsTree,report});
      root.traverse(object=>{if(object.isInstancedMesh&&!excluded.has(object))instanced.push(object);});
    }
  };
  const filter=mesh=>{
    const e=mesh.matrixWorld.elements;let changed=false;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,m);
      const x=m.elements[12],y=m.elements[13],z=m.elements[14];
      world.set(e[0]*x+e[4]*y+e[8]*z+e[12],0,e[2]*x+e[6]*y+e[10]*z+e[14]);
      if(inside(world.x,world.z))continue;
      if(m.elements[0]===0&&m.elements[5]===0&&m.elements[10]===0)continue;
      hidden.makeScale(0,0,0).setPosition(x,y,z);
      mesh.setMatrixAt(i,hidden);changed=true;report.instancesHidden++;
    }
    if(changed)mesh.instanceMatrix.needsUpdate=true;
    seen.set(mesh,mesh.instanceMatrix.version);
  };
  const scope={
    report,
    update(now=globalThis.performance?.now?.()??Date.now()){
      if(now-lastScan>=rescanMs){lastScan=now;scan();}
      for(const mesh of instanced){
        if(!mesh.parent||seen.get(mesh)===mesh.instanceMatrix.version)continue;
        mesh.updateWorldMatrix(true,false);
        filter(mesh);
      }
      return report;
    },
  };
  scope.update();
  return scope;
}
