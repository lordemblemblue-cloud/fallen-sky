// Game 3D far proxy: a low-detail outline baked from real scenery.
//
// When an area is unloaded its tall scenery (buildings, big trees, rock
// faces) would vanish from the horizon. This module bakes those objects into
// ONE small mesh per area: every vertex is snapped to a coarse grid and
// vertices that land in the same cell are merged ("vertex clustering").
// Small detail collapses and disappears; the outline that matters from a
// hundred metres away survives. The result is drawn with one flat-coloured
// material, one draw call, and replaces thousands of triangles with a few.
//
// Pure arithmetic on typed arrays: no Three.js import.

// Cells per axis either side of the origin. Three of these multiply into one
// key, which must stay an exact integer: 2^17 cubed is 2^51, under 2^53.
const OFFSET=1<<16,SPAN=1<<17;

/**
 * @param {Array<{positions:ArrayLike<number>,index?:ArrayLike<number>|null,
 *   matrices:ArrayLike<number>[],color:number[]}>} sources
 *   positions: xyz triples; matrices: column-major 4x4, one per placement;
 *   color: linear RGB 0..1.
 * @param {object} [options]
 * @param {number} [options.cellMeters=0.75] starting grid size
 * @param {number} [options.maxTriangles=30000] coarsen until at or under this
 * @param {number} [options.maxCellMeters=8] never coarser than this
 */
export function bakeFarProxy(sources,{cellMeters=.75,maxTriangles=30000,maxCellMeters=8}={}){
  let sourceTriangles=0;
  for(const source of sources||[]){
    const corners=source.index?source.index.length:source.positions.length/3;
    sourceTriangles+=Math.floor(corners/3)*(source.matrices?.length||0);
  }
  let cell=Math.max(.05,Number(cellMeters)||.75),result=null;
  for(;;){
    result=cluster(sources||[],cell);
    if(result.triangles<=maxTriangles||cell>=maxCellMeters)break;
    // Triangle count falls roughly with the square of the cell size.
    cell=Math.min(maxCellMeters,cell*Math.max(1.25,Math.sqrt(result.triangles/maxTriangles)));
  }
  return {...result,cellMeters:cell,sourceTriangles};
}

function cluster(sources,cell){
  const ids=new Map();      // cell key -> vertex number
  const sums=[];            // per vertex: x,y,z,r,g,b,count
  let corners=[];
  const inverse=1/cell;
  const vertexOf=(x,y,z,color)=>{
    const ix=Math.floor(x*inverse)+OFFSET,iy=Math.floor(y*inverse)+OFFSET,iz=Math.floor(z*inverse)+OFFSET;
    if(!(ix>=0&&ix<SPAN&&iy>=0&&iy<SPAN&&iz>=0&&iz<SPAN))return -1; // not finite or absurdly far
    const key=(ix*SPAN+iy)*SPAN+iz;
    let id=ids.get(key);
    if(id===undefined){id=sums.length/7;ids.set(key,id);sums.push(0,0,0,0,0,0,0);}
    const o=id*7;
    sums[o]+=x;sums[o+1]+=y;sums[o+2]+=z;
    sums[o+3]+=color[0];sums[o+4]+=color[1];sums[o+5]+=color[2];sums[o+6]++;
    return id;
  };
  for(const source of sources){
    const p=source.positions,index=source.index||null;
    const color=source.color||[.5,.5,.5];
    const count=index?index.length:p.length/3;
    for(const m of source.matrices||[]){
      for(let i=0;i+2<count;i+=3){
        const tri=[0,0,0];
        for(let k=0;k<3;k++){
          const v=(index?index[i+k]:i+k)*3,x=p[v],y=p[v+1],z=p[v+2];
          tri[k]=vertexOf(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],
            m[2]*x+m[6]*y+m[10]*z+m[14],color);
        }
        const [a,b,c]=tri;
        // Collapsed to a point or a line: this detail is too small to matter.
        if(a<0||b<0||c<0||a===b||b===c||a===c)continue;
        corners.push(a,b,c);
      }
    }
  }
  // Front and back of a thin wall, or two overlapping objects, land on the
  // same three cells: keep each such triangle once, whichever way it faces.
  const total=sums.length/7,exact=total<200000;
  const seen=new Set(),unique=[];
  for(let i=0;i<corners.length;i+=3){
    const a=corners[i],b=corners[i+1],c=corners[i+2];
    const low=Math.min(a,b,c),high=Math.max(a,b,c),middle=a+b+c-low-high;
    const key=exact?(low*total+middle)*total+high:low+'_'+middle+'_'+high;
    if(seen.has(key))continue;
    seen.add(key);unique.push(a,b,c);
  }
  corners=unique;
  // Keep only vertices that a surviving triangle uses.
  const remap=new Int32Array(sums.length/7).fill(-1);
  let used=0;
  for(const id of corners)if(remap[id]<0)remap[id]=used++;
  const positions=new Float32Array(used*3),colors=new Float32Array(used*3);
  for(let id=0;id<remap.length;id++){
    const to=remap[id];
    if(to<0)continue;
    const o=id*7,n=sums[o+6];
    positions[to*3]=sums[o]/n;positions[to*3+1]=sums[o+1]/n;positions[to*3+2]=sums[o+2]/n;
    colors[to*3]=sums[o+3]/n;colors[to*3+1]=sums[o+4]/n;colors[to*3+2]=sums[o+5]/n;
  }
  const index=used>65535?new Uint32Array(corners.length):new Uint16Array(corners.length);
  for(let i=0;i<corners.length;i++)index[i]=remap[corners[i]];
  return {positions,colors,index,vertices:used,triangles:corners.length/3};
}
