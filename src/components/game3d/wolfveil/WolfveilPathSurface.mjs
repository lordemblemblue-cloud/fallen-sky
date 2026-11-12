// Clip a dirt ribbon to the ORIGINAL core terrain triangles, rather than
// adding a second approximate ground surface. No THREE, collider or assets.
export function createWolfveilPathSurface({heightAt,span=1100,segments=310,lift=.10}={}){
  if(typeof heightAt!=='function'||!Number.isFinite(span)||span<=0||
    !Number.isInteger(segments)||segments<2||!Number.isFinite(lift)||lift<0)
    throw new TypeError('Valid canonical path surface inputs required');
  const half=span*.5,step=span/segments,cache=new Map();
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function vertex(ix,iz){
    const key=iz*(segments+1)+ix;
    if(!cache.has(key)){
      // Match buildWolfveilTerrain's Float32 position buffer, including Y.
      const x=(ix/segments-.5)*span,z=(iz/segments-.5)*span;
      cache.set(key,[Math.fround(x),Math.fround(z),Math.fround(heightAt(x,z))]);
    }
    return cache.get(key);
  }
  function clip(subject,triangle){
    let polygon=subject;
    const sign=Math.sign(cross(...triangle));
    for(let edge=0;edge<3&&polygon.length;edge++){
      const a=triangle[edge],b=triangle[(edge+1)%3],output=[];
      let previous=polygon.at(-1),dp=sign*cross(a,b,previous);
      for(const current of polygon){
        const dc=sign*cross(a,b,current),inside=dc>=-1e-9,wasInside=dp>=-1e-9;
        if(inside!==wasInside){
          const t=dp/(dp-dc);
          output.push([previous[0]+(current[0]-previous[0])*t,
            previous[1]+(current[1]-previous[1])*t]);
        }
        if(inside)output.push(current);
        previous=current;dp=dc;
      }
      polygon=output;
    }
    return polygon;
  }
  return function project(quad){
    if(!Array.isArray(quad)||(quad.length!==3&&quad.length!==4)||quad.some(p=>
      !Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))
      throw new TypeError('Three or four finite X/Z path corners required');
    // Outside the canonical core the existing meadow has separate geometry.
    // Let the caller retain its existing outer-path representation there.
    if(quad.some(([x,z])=>Math.abs(x)>half||Math.abs(z)>half))return null;
    const minX=Math.min(...quad.map(p=>p[0])),maxX=Math.max(...quad.map(p=>p[0]));
    const minZ=Math.min(...quad.map(p=>p[1])),maxZ=Math.max(...quad.map(p=>p[1]));
    const index=v=>Math.max(0,Math.min(segments-1,Math.floor((v+half)/step)));
    const out=[];
    for(let iz=index(minZ);iz<=index(maxZ);iz++)for(let ix=index(minX);ix<=index(maxX);ix++){
      const a=vertex(ix,iz),b=vertex(ix,iz+1),c=vertex(ix+1,iz),d=vertex(ix+1,iz+1);
      for(const triangle of [[a,b,c],[b,d,c]]){
        const polygon=clip(quad,triangle);
        if(polygon.length<3)continue;
        const [u,v,w]=triangle,area=cross(u,v,w);
        const point=p=>{
          const bWeight=cross(u,p,w)/area,cWeight=cross(u,v,p)/area;
          return [p[0],u[2]+bWeight*(v[2]-u[2])+cWeight*(w[2]-u[2])+lift,p[1]];
        };
        for(let i=1;i<polygon.length-1;i++){
          const area2=cross(polygon[0],polygon[i],polygon[i+1]);
          if(Math.abs(area2)<1e-9)continue;
          const vertices=[point(polygon[0]),point(polygon[i]),point(polygon[i+1])];
          if(area2>0)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
          out.push(vertices);
        }
      }
    }
    return out;
  };
}
