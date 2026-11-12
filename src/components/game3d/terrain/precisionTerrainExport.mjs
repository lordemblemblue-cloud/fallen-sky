import {toMillimetres,tileAtWorldMm} from './precisionTerrainBlueprint.mjs';

const cells=[
  'object_name','object_uuid','tile_id','world_x_mm','world_y_mm','world_z_mm',
  'bbox_width_mm','bbox_height_mm','bbox_depth_mm','rotation_y_deg',
  'source','geometry_detail_status',
];
const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
/**
 * Snapshot actual named 3D meshes into CSV, preserving the Y-up convention.
 * BBox dimensions measure WORLD-ALIGNED visible geometry, not the original
 * designer's precise curved surface. Curvature needs separate profile rows.
 */
export function collectLiveSceneObjectCsv(scene,THREE,{limit=5000}={}){
  if(!scene?.traverse||!THREE?.Box3)throw new TypeError('Live scene / THREE required');
  scene.updateMatrixWorld(true);
  const rows=[cells],pos=new THREE.Vector3(),box=new THREE.Box3(),size=new THREE.Vector3();
  let count=0,omitted=0;
  scene.traverse(o=>{
    if(!o.isMesh || !o.name || o.userData?.editorOnly || o.userData?.isTerrain ||
      o.userData?.__terrainChunk || o.name==='SWV_RealWalkableContouredTerrain')return;
    let ancestor=o.parent;
    while(ancestor){if(ancestor.userData?.editorOnly)return;ancestor=ancestor.parent;}
    if(count>=limit){omitted++;return;}
    o.getWorldPosition(pos);
    try{box.setFromObject(o);box.getSize(size);}
    catch{return;}
    if(box.isEmpty()||![pos.x,pos.y,pos.z,size.x,size.y,size.z].every(Number.isFinite))return;
    const x=toMillimetres(pos.x),y=toMillimetres(pos.y),z=toMillimetres(pos.z);
    const tile=tileAtWorldMm(x,z);
    rows.push([
      o.name,o.uuid,tile?.id||'OUTSIDE_BLUEPRINT',x,y,z,
      toMillimetres(size.x),toMillimetres(size.y),toMillimetres(size.z),
      Math.round(o.rotation.y*180000/Math.PI)/1000,
      'live_scene_snapshot','bbox_only_profiles_not_measured',
    ]);
    count++;
  });
  return {count,omitted,csv:rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
