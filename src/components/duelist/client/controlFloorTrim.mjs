// Flat decorative meshes, clipped to the exact triangulated A foundation.
import * as THREE from 'three';

const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const signedArea=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;
function clipToTriangle(polygon, triangle) {
  let points=polygon;
  const sign=Math.sign(signedArea(triangle));
  for(let i=0;i<3 && points.length;i++){
    const a=triangle[i],b=triangle[(i+1)%3],next=[];
    for(let j=0;j<points.length;j++){
      const p=points[j],q=points[(j+1)%points.length];
      const dp=sign*cross(a,b,p),dq=sign*cross(a,b,q);
      if(dp>=-1e-8)next.push(p);
      if((dp>=-1e-8)!==(dq>=-1e-8)){
        const t=dp/(dp-dq);
        next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
      }
    }
    points=next;
  }
  return points;
}
const rect=(a,b,width)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  const nx=-dz/length*width/2,nz=dx/length*width/2;
  return [[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]];
};
export function controlFloorPatterns(footprint) {
  const trim=[],inlay=[],motifs=[];
  const rings=[footprint.outer,...footprint.holes];
  for(const [index,ring] of rings.entries()){
    const side=Math.sign(signedArea(ring))*(index===0?1:-1);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      const tx=dx/length,tz=dz/length,nx=-tz*side,nz=tx*side;
      const at=(along,depth)=>[a[0]+tx*along+nx*depth,a[1]+tz*along+nz*depth];
      trim.push(rect(a,b,1.5));
      // Corner patches close seams in the darker band and are clipped to the floor.
      trim.push([[a[0]-.75,a[1]-.75],[a[0]+.75,a[1]-.75],[a[0]+.75,a[1]+.75],[a[0]-.75,a[1]+.75]]);
      const count=Math.max(1,Math.round(length/4));
      const pitch=length/count;
      for(let k=0;k<count;k++){
        const start=k*pitch+0.25,end=(k+1)*pitch-0.25;
        if(end-start<0.6)continue;
        // Inner run -> ninety degrees outward -> straight -> ninety degrees inward.
        const left=start+(end-start)*.25,right=start+(end-start)*.75;
        const points=[at(start,.59),at(left,.59),at(left,.22),at(right,.22),at(right,.59),at(end,.59)];
        for(let j=1;j<points.length;j++)inlay.push(rect(points[j-1],points[j],.085));
      }
    }
  }
  // Discrete circuit/diamond motifs, not objective markers. Symmetric along the A.
  for(const [x,z] of [[0,-14],[0,0],[0,5],[-11,9],[11,9]]){
    const p=[[x,z-1.0],[x+.72,z],[x,z+1.0],[x-.72,z],[x,z-1.0]];
    for(let i=1;i<p.length;i++)motifs.push(rect(p[i-1],p[i],.085));
    for(const side of [-1,1])motifs.push(rect([x+side*.9,z],[x+side*1.35,z],.07));
  }
  return {trim,inlay,motifs};
}
export function clippedPatternGeometry(floorGeometry, polygons) {
  // The source ShapeGeometry lives in XY (Y=-world Z), before its floor rotation.
  const positions=floorGeometry.attributes.position,index=floorGeometry.index;
  const triangles=[];
  for(let i=0;i<(index?index.count:positions.count);i+=3){
    const triangle=[0,1,2].map(j=>{const k=index?index.getX(i+j):i+j;return [positions.getX(k),-positions.getY(k)];});
    if(Math.abs(signedArea(triangle))>1e-9)triangles.push(triangle);
  }
  const xyz=[];
  for(const polygon of polygons)for(const triangle of triangles){
    const p=clipToTriangle(polygon,triangle);
    for(let i=1;i+1<p.length;i++){
      const tri=[p[0],p[i],p[i+1]];
      if(Math.abs(signedArea(tri))<1e-8)continue;
      if(signedArea(tri)>0)tri.reverse(); // upward normal in world XZ
      for(const v of tri)xyz.push(v[0],0,v[1]);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geometry.computeVertexNormals();
  return geometry;
}
