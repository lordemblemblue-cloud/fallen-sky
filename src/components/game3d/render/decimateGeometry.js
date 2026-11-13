// Triangle budget for imported scenery. Foliage made of many small pieces
// (blades, leaves) is thinned piece by piece, with the survivors widened so
// the plant keeps its fullness. Solid shapes (trunks, stones) have nearby
// corners merged on a grid, which keeps the silhouette. Materials, UVs and
// material groups are preserved. Returns the input when already in budget.
import * as THREE from 'three';

const SMALL_PIECE=64; // triangles; anything larger is treated as a solid shape

function weldedPieces(position,index,triangles){
  const box=new THREE.Box3().setFromBufferAttribute(position);
  const size=box.getSize(new THREE.Vector3()),q=1e4/Math.max(size.x,size.y,size.z,1e-6);
  const welded=new Map(),parent=[],vertexNode=new Int32Array(position.count);
  for(let i=0;i<position.count;i++){
    const key=Math.round(position.getX(i)*q)+','+Math.round(position.getY(i)*q)+','+Math.round(position.getZ(i)*q);
    if(!welded.has(key)){welded.set(key,parent.length);parent.push(parent.length);}
    vertexNode[i]=welded.get(key);
  }
  const find=n=>{while(parent[n]!==n){parent[n]=parent[parent[n]];n=parent[n];}return n;};
  for(let t=0;t<triangles;t++){
    const a=find(vertexNode[index(t*3)]);
    parent[find(vertexNode[index(t*3+1)])]=a;parent[find(vertexNode[index(t*3+2)])]=a;
  }
  const pieces=new Map();
  for(let t=0;t<triangles;t++){
    const root=find(vertexNode[index(t*3)]);
    if(!pieces.has(root))pieces.set(root,[]);
    pieces.get(root).push(t);
  }
  return [...pieces.values()];
}

export function decimateGeometry(geometry,maxTriangles){
  const position=geometry.attributes.position,source=geometry.index;
  const index=source?i=>source.getX(i):i=>i;
  const triangles=Math.floor((source?source.count:position.count)/3);
  if(!(maxTriangles>0)||triangles<=maxTriangles)return geometry;
  const ratio=maxTriangles/triangles,pieces=weldedPieces(position,index,triangles);
  const groups=geometry.groups.length?geometry.groups:[{start:0,count:triangles*3,materialIndex:0}];
  const groupOf=t=>{const at=t*3;return Math.max(0,groups.findIndex(g=>at>=g.start&&at<g.start+g.count));};
  const names=Object.keys(geometry.attributes).filter(n=>n!=='normal');
  const out=Object.fromEntries(names.map(n=>[n,[]]));
  const kept=groups.map(()=>[]);let vertices=0;
  const copy=(from,moved)=>{
    for(const n of names){
      const a=geometry.attributes[n];
      for(let k=0;k<a.itemSize;k++)out[n].push(n==='position'&&moved?moved[k]:a.getComponent(from,k));
    }
    return vertices++;
  };
  const box=new THREE.Box3().setFromBufferAttribute(position),extent=box.getSize(new THREE.Vector3());
  const widen=Math.min(1.35,1/Math.sqrt(ratio));
  let thinned=0;
  for(const piece of pieces){
    if(piece.length<=SMALL_PIECE){
      // Keep an even share of small pieces, slightly widened around their centre.
      const keep=Math.floor((thinned+1)*ratio)>Math.floor(thinned*ratio);thinned++;
      if(!keep)continue;
      let cx=0,cz=0,n=0;
      for(const t of piece)for(let k=0;k<3;k++){const v=index(t*3+k);cx+=position.getX(v);cz+=position.getZ(v);n++;}
      cx/=n;cz/=n;
      for(const t of piece){
        const g=groupOf(t);
        for(let k=0;k<3;k++){
          const v=index(t*3+k);
          kept[g].push(copy(v,[cx+(position.getX(v)-cx)*widen,position.getY(v),cz+(position.getZ(v)-cz)*widen]));
        }
      }
      continue;
    }
    // Solid shape: merge corners that share a grid cell; pick the finest grid in budget.
    const target=Math.max(4,Math.floor(piece.length*ratio));
    const cluster=cells=>{
      const step=Math.max(extent.x,extent.y,extent.z,1e-6)/cells,seen=new Map(),result=[];
      let group=0; // corners never merge across two materials
      const cellOf=v=>group+':'+Math.floor((position.getX(v)-box.min.x)/step)+','+
        Math.floor((position.getY(v)-box.min.y)/step)+','+Math.floor((position.getZ(v)-box.min.z)/step);
      for(const t of piece){
        group=groupOf(t);
        const keys=[0,1,2].map(k=>cellOf(index(t*3+k)));
        if(keys[0]===keys[1]||keys[1]===keys[2]||keys[0]===keys[2])continue;
        const id=[...keys].sort().join('|');
        if(seen.has(id))continue;
        seen.set(id,true);result.push([t,keys]);
      }
      return result;
    };
    let low=2,high=192,best=cluster(2);
    while(low<=high){
      const mid=(low+high)>>1,attempt=cluster(mid);
      if(attempt.length<=target){best=attempt;low=mid+1;}else high=mid-1;
    }
    const merged=new Map();
    for(const [t,keys] of best){
      const g=groupOf(t);
      for(let k=0;k<3;k++){
        if(!merged.has(keys[k]))merged.set(keys[k],copy(index(t*3+k)));
        kept[g].push(merged.get(keys[k]));
      }
    }
  }
  const result=new THREE.BufferGeometry();
  for(const n of names){
    const a=geometry.attributes[n];
    result.setAttribute(n,new THREE.Float32BufferAttribute(out[n],a.itemSize));
  }
  const indices=[];
  kept.forEach((list,g)=>{
    if(geometry.groups.length)result.addGroup(indices.length,list.length,groups[g].materialIndex);
    for(const v of list)indices.push(v);
  });
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();result.computeBoundingSphere();
  return result;
}