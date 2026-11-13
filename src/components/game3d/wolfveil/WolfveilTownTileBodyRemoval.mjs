// Clone Game 3D assembled town: keep the actual walkable paver TOPS, remove
// Blender's deep square-tile box sides and undersides. No alternate visual
// floor, physics mesh or imported asset rewrite.
import * as THREE from 'three';

// glTF often delivers attributes as interleaved views, which have no .array of
// their own. Reading them as flat buffers used to throw and abandon the whole
// town cleanup, so every read goes through this helper.
const readComponent = (attribute, index, component) => (
  attribute.isInterleavedBufferAttribute
    ? attribute.data.array[index * attribute.data.stride + attribute.offset + component]
    : attribute.array[index * attribute.itemSize + component]
);
const arrayTypeOf = (attribute) => attribute.array?.constructor
  || attribute.data?.array?.constructor || Float32Array;
export const WOLFVEIL_TOWN_TILE_CLEANUP = Object.freeze({
  // Raw tile top is about 0.36m above the buried bottom face. A 0.40m band
  // accidentally kept BOTH horizontal faces; keep only the highest skin.
  topBandMeters: 0.06,
  minFlatness: 0.72,
});
const EPS = 1e-10;
const HOUSE_ARCHITECTURE = /(^|[_ .])(roof|cream|plaster|house|building|walls?)([_ .]|$)/i;

function worldVertex(position, i, matrix) {
  const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  const m = matrix?.elements;
  if (!m) return { x, y, z };
  const w = m[3]*x + m[7]*y + m[11]*z + m[15] || 1;
  return {
    x: (m[0]*x + m[4]*y + m[8]*z + m[12]) / w,
    y: (m[1]*x + m[5]*y + m[9]*z + m[13]) / w,
    z: (m[2]*x + m[6]*y + m[10]*z + m[14]) / w,
  };
}

function faceFlatness(a, b, c) {
  const ux=b.x-a.x, uy=b.y-a.y, uz=b.z-a.z;
  const vx=c.x-a.x, vy=c.y-a.y, vz=c.z-a.z;
  const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const length=Math.hypot(nx,ny,nz);
  // Some original Blender tile tops have reversed winding. The highest
  // horizontal face is still the walkable one, independent of that winding.
  return length > EPS ? Math.abs(ny)/length : 0;
}

/** Find every tile's high horizontal paving triangles, never its extruded box walls. */
export function planWolfveilTownTileTop(geometry, matrixWorld, rules = WOLFVEIL_TOWN_TILE_CLEANUP) {
  const positions=geometry?.attributes?.position;
  if (!positions) return { indices: [], groups: [], topY: null, removedFaces: 0, keptFaces: 0 };
  const rawIndex=geometry.index?.array ?? Array.from({length:positions.count},(_,i)=>i);
  const originalGroups=geometry.groups?.length
    ?geometry.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex}))
    :[{start:0,count:rawIndex.length,materialIndex:0}];
  const all=[];
  for (let start=0; start+2<rawIndex.length; start+=3) {
    const ia=rawIndex[start],ib=rawIndex[start+1],ic=rawIndex[start+2];
    if ([ia,ib,ic].some(i=>!Number.isInteger(i)||i<0||i>=positions.count)) continue;
    const a=worldVertex(positions,ia,matrixWorld),b=worldVertex(positions,ib,matrixWorld),
      c=worldVertex(positions,ic,matrixWorld);
    const y=(a.y+b.y+c.y)/3;
    if (![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite)) continue;
    all.push({start,ia,ib,ic,y,flatness:faceFlatness(a,b,c)});
  }
  const flat=all.filter(t=>t.flatness >= rules.minFlatness);
  if (!flat.length) return {indices:[],groups:[],topY:null,
    removedFaces:all.length,keptFaces:0};
  // Avoid a large argument spread on meshes with many paving triangles.
  let topY=-Infinity;
  for(const face of flat)if(face.y>topY)topY=face.y;
  const top=flat.filter(t=>t.y >= topY-rules.topBandMeters-EPS);
  const indices=[],groups=[];
  for(const g of originalGroups) {
    const start=indices.length;
    for(const face of top)if(face.start >= g.start && face.start+2 < g.start+g.count)
      indices.push(face.ia,face.ib,face.ic);
    if(indices.length>start)groups.push({start,count:indices.length-start,materialIndex:g.materialIndex});
  }
  return {indices,groups,topY,removedFaces:all.length-indices.length/3,
    keptFaces:indices.length/3};
}

/**
 * Tile_ meshes in the 80-piece town are NOT needed as raised solid boxes:
 * the paved triangles remain, but all vertical skins and buried triangles
 * disappear from BOTH rendering and subsequently baked collision.
 */
export function removeWolfveilTownRaisedTileBodies(mesh) {
  if(!mesh?.isMesh || !/^Tile_/i.test(mesh.name) || !mesh.geometry)
    return {changed:false,removedFaces:0,keptFaces:0};
  const geometry=mesh.geometry;
  const plan=planWolfveilTownTileTop(geometry,mesh.matrixWorld);
  if(!plan.indices.length){
    // A body with no walkable top is decorative clutter that only ever showed
    // its walls; drop it entirely instead of leaving them standing.
    geometry.setIndex?.([]);
    if(geometry.index)geometry.index.array=[];
    geometry.clearGroups?.();
    mesh.userData.tileFacesKept=0;
    return {changed:true,removedFaces:plan.removedFaces,keptFaces:0};
  }
  // Rebuild the buffer from the surviving top vertices only. Dropping the
  // index alone left every skirt/wall vertex in the file: the model kept a
  // phantom 6m-deep silhouette (wrong bounds, and loose vertices the collision
  // pass could see), while the renderer only had the flat top.
  const keep=[],remap=new Map();
  for(const index of plan.indices){
    if(!remap.has(index)){remap.set(index,keep.length);keep.push(index);}
  }
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const size=attribute.itemSize;
    const ArrayType=arrayTypeOf(attribute);
    const out=new ArrayType(keep.length*size);
    for(let i=0;i<keep.length;i++)
      for(let c=0;c<size;c++)out[i*size+c]=readComponent(attribute,keep[i],c);
    if(typeof geometry.setAttribute==='function')
      geometry.setAttribute(name,
        new THREE.BufferAttribute(out,size,attribute.normalized));
    else{attribute.array=out;attribute.count=keep.length;attribute.needsUpdate=true;}
  }
  geometry.setIndex(plan.indices.map(index=>remap.get(index)));
  geometry.clearGroups();
  for(const group of plan.groups)
    geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.userData.tileBoxBodyRemoved=true;
  mesh.userData.tileTopY=plan.topY;
  mesh.userData.tileFacesKept=plan.keptFaces;
  return {changed:true,...plan};
}

function pointSegmentDistanceSq(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return (x-a.x-u*dx)**2+(z-a.z-u*dz)**2;
}
function triangleTouchesCircleXZ(x,z,radiusSq,a,b,c) {
  if (Math.min(pointSegmentDistanceSq(x,z,a,b),
    pointSegmentDistanceSq(x,z,b,c),pointSegmentDistanceSq(x,z,c,a))<=radiusSq)
    return true;
  const denom=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  if(Math.abs(denom)<EPS)return false;
  const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/denom;
  const v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/denom;
  return u>=0&&v>=0&&u+v<=1; // trunk inside a broad roof triangle
}

/**
 * Examine the loaded, actual Blender walls/roofs before deciding whether
 * the plaza tree's trunk and root clearance intersects an imported house.
 * This is deliberately based on mesh vertices rather than invented houses.
 */
export function wolfveilImportedTownHouseOverlapsTree(townRoot, tree, clearance=0.75) {
  if(!townRoot?.traverse || !tree || ![tree.x,tree.z,tree.radius].every(Number.isFinite))
    return false;
  const radius=tree.radius+clearance, radius2=radius*radius;
  let overlaps=false;
  townRoot.traverse(node=>{
    if(overlaps || !node?.isMesh || !HOUSE_ARCHITECTURE.test(node.name))return;
    const pos=node.geometry?.attributes?.position;
    if(!pos)return;
    const vertices=[];
    for(let i=0;i<pos.count;i++){
      const v=worldVertex(pos,i,node.matrixWorld);
      vertices.push(v);
      if((v.x-tree.x)**2+(v.z-tree.z)**2<radius2){overlaps=true;break;}
    }
    if(overlaps)return;
    // A large roof or wall face can span the tree even if all its vertices
    // are farther away. Include the face interior, not only its corners.
    const index=node.geometry.index?.array??Array.from({length:pos.count},(_,i)=>i);
    for(let i=0;i+2<index.length;i+=3){
      const a=vertices[index[i]],b=vertices[index[i+1]],c=vertices[index[i+2]];
      if(a&&b&&c&&triangleTouchesCircleXZ(tree.x,tree.z,radius2,a,b,c)){
        overlaps=true;break;
      }
    }
  });
  return overlaps;
}