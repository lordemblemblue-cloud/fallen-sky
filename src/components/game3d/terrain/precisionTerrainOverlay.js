import {
  PRECISION_TERRAIN,validateProfile,toSceneMeters,
} from './precisionTerrainBlueprint.mjs';

/**
 * Non-invasive, editor-only scene annotations. Existing Game 3D terrain,
 * height physics, quest triggers, water and collision meshes are never edited.
 */
function sampledGroundHeight(THREE,scene){
  const terrain=[];
  scene.traverse(o=>{
    if(o.isMesh && (o.userData?.isTerrain || o.name==='SWV_RealWalkableContouredTerrain'))
      terrain.push(o);
  });
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,2200);
  const cache=new Map();
  return (x,z)=>{
    const key=x+','+z;
    if(cache.has(key))return cache.get(key);
    let y=0;
    if(terrain.length){
      ray.set(new THREE.Vector3(x,1000,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObjects(terrain,false)[0];
      if(hit)y=hit.point.y;
    }
    cache.set(key,y);
    return y;
  };
}
function addGroundFollowingGrid(THREE,group,scene){
  const g=PRECISION_TERRAIN,groundY=sampledGroundHeight(THREE,scene);
  const major=[],minor=[],sampleMm=5000;
  const addSegmented=(constant,alongX,majorLine)=>{
    const buffer=majorLine?major:minor;
    let previous=null;
    for(let v=-250000;v<=250000;v+=sampleMm){
      const x=(alongX?v:constant)/1000,z=(alongX?constant:v)/1000;
      const p=[x,groundY(x,z)+0.095,z];
      if(previous)buffer.push(...previous,...p);
      previous=p;
    }
  };
  for(let i=0;i<=g.columns;i++){
    const axis=g.minXMm+i*g.tileMm;
    addSegmented(axis,false,i%5===0);
  }
  for(let i=0;i<=g.rows;i++){
    const axis=g.minZMm+i*g.tileMm;
    addSegmented(axis,true,i%5===0);
  }
  for(const [positions,color,opacity,name] of [
    [minor,0x8eced8,.42,'Game3DPrecisionMinorTileLines'],
    [major,0x22e8de,.85,'Game3DPrecisionMajorTileLines'],
  ]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const material=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});
    const lines=new THREE.LineSegments(geometry,material);
    lines.name=name;lines.userData.editorOnly=true;lines.raycast=()=>{};
    group.add(lines);
  }
}
function createProfileMesh(THREE,prop){
  if(!prop||!Array.isArray(prop.profile))throw new TypeError('Prop is missing profile rings');
  validateProfile(prop.profile);
  for(const field of ['xMm','yMm','zMm']){
    if(!Number.isSafeInteger(prop[field]))throw new TypeError('Prop '+field+' must be integer millimetres');
  }
  const slices=24,verts=[],indices=[],rings=prop.profile;
  for(const r of rings){
    for(let j=0;j<slices;j++){
      const angle=j*Math.PI*2/slices;
      verts.push(
        (r.centerXMm+r.radiusXMm*Math.cos(angle))/1000,
        r.heightMm/1000,
        (r.centerZMm+r.radiusZMm*Math.sin(angle))/1000,
      );
    }
  }
  for(let i=0;i<rings.length-1;i++){
    for(let j=0;j<slices;j++){
      const a=i*slices+j,b=i*slices+(j+1)%slices;
      const c=(i+1)*slices+j,d=(i+1)*slices+(j+1)%slices;
      indices.push(a,c,b,b,c,d);
    }
  }
  // Cap only when the author supplies a closed, positive-radius end.
  for(const atTop of [false,true]){
    const ring=atTop?rings.at(-1):rings[0];
    if(ring.radiusXMm===0||ring.radiusZMm===0)continue;
    const center=verts.length/3;
    verts.push(ring.centerXMm/1000,ring.heightMm/1000,ring.centerZMm/1000);
    const offset=(atTop?rings.length-1:0)*slices;
    for(let j=0;j<slices;j++){
      const a=offset+j,b=offset+(j+1)%slices;
      if(atTop)indices.push(center,b,a);
      else indices.push(center,a,b);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    color:prop.kind==='tree'?0x78533c:0x87908d,
    transparent:true,opacity:.76,side:THREE.DoubleSide,roughness:.91,
    depthWrite:false,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='PrecisionProfile:'+String(prop.id||'Unnamed');
  mesh.position.set(toSceneMeters(prop.xMm),toSceneMeters(prop.yMm),toSceneMeters(prop.zMm));
  mesh.rotation.y=(Number(prop.yawDeg)||0)*Math.PI/180;
  mesh.userData={editorOnly:true,precisionProfile:true,propId:prop.id};
  mesh.raycast=()=>{};
  return mesh;
}
/**
 * imageUrl must be an object URL or another caller-vetted asset URL; never
 * supplied automatically. A nonsquare image uses CONTAIN (not distortion).
 */
export function createPrecisionTerrainOverlay({THREE,scene,imageUrl=null,imageSize=null,props=[],grid=true}){
  if(!THREE?.Group||!scene?.add)throw new TypeError('A THREE instance and live scene are required');
  const group=new THREE.Group();
  group.name='Game3DPrecisionTerrainBlueprintEditor';
  group.userData.editorOnly=true;
  let disposed=false;
  if(grid)addGroundFollowingGrid(THREE,group,scene);
  const failures=[];
  for(const p of props){
    try{group.add(createProfileMesh(THREE,p));}
    catch(err){failures.push({id:p?.id||null,error:err.message});}
  }
  if(imageUrl){
    const w=Number(imageSize?.width),h=Number(imageSize?.height);
    if(!(w>0&&h>0))throw new RangeError('Reference image needs its real pixel dimensions');
    const scale=Math.min(PRECISION_TERRAIN.widthMm/w,PRECISION_TERRAIN.depthMm/h);
    const width=w*scale/1000,depth=h*scale/1000;
    new THREE.TextureLoader().load(imageUrl,texture=>{
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      const geometry=new THREE.PlaneGeometry(width,depth);
      const material=new THREE.MeshBasicMaterial({
        map:texture,transparent:true,opacity:.28,depthTest:false,
        depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,
      });
      const sheet=new THREE.Mesh(geometry,material);
      sheet.name='Game3DPrecisionReferenceImageProjection';
      sheet.rotation.x=Math.PI/2; // image top (+local Y) = world +Z
      sheet.position.y=.12;
      sheet.renderOrder=995;
      sheet.userData.editorOnly=true;
      sheet.raycast=()=>{};
      group.add(sheet);
    },undefined,err=>{
      if(!disposed)console.warn('[Precision Terrain] Reference image could not load',err);
    });
  }
  scene.add(group);
  return {
    group,failedProps:failures,
    dispose(){
      disposed=true;scene.remove(group);
      group.traverse(o=>{
        o.geometry?.dispose?.();
        if(Array.isArray(o.material))o.material.forEach(m=>{m.map?.dispose?.();m.dispose?.();});
        else{o.material?.map?.dispose?.();o.material?.dispose?.();}
      });
    },
  };
}
