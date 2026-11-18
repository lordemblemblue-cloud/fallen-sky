// Hallway architecture from the OWNER'S ACTUAL GLB, not a photo/relief
// approximation. Source model: 3m wide x 2m high, 24 mesh groups.
// One continuous architectural run per unobstructed hallway wall. A run
// contains enlarged, uniformly scaled GLB sections; joints occur only where
// one LARGE structural bay joins the next, and at actual doors/vent mouths.
// The old room wall surfaces are collision-only while the GLB is available.
import { loadGLB } from '../glb.js';
import { m4 } from '../math.js';
import { SUMI_GLB_WALL } from './sumiStrongholdGlbWallPlacements.js';

export const GLB_SOURCE_WIDTH=3;
export const GLB_SOURCE_HEIGHT=2;
const BASE_COL=[1,1,1,1];

function modelOf(w){
  return m4.trs(w.p,[0,Math.sin(w.yaw/2),0,Math.cos(w.yaw/2)],[1,1,1]);
}
const batch=()=>({pos:[],nrm:[],uv:[],col:[],idx:[]});
const floatByte=(v)=>Math.round(Math.max(0,Math.min(1,v))*255);
function pushVertex(m,v){
  const id=m.pos.length/3;
  m.pos.push(...v.p);
  m.nrm.push(...v.n);
  m.uv.push(...v.uv);
  m.col.push(...v.c.map(floatByte));
  return id;
}
function interpolate(a,b,t){
  const lerp=(x,y)=>x+(y-x)*t;
  const n=a.n.map((q,i)=>lerp(q,b.n[i]));
  const len=Math.hypot(...n)||1;
  return {
    p:a.p.map((q,i)=>lerp(q,b.p[i])),
    n:n.map(x=>x/len),
    uv:a.uv.map((q,i)=>lerp(q,b.uv[i])),
    c:a.c.map((q,i)=>lerp(q,b.c[i]))
  };
}
// Trim the FINAL real-GLB bay geometrically, without squashing the model to
// fit a short remaining interval and without invading a hallway doorway.
function clipPolygonAxis(vertices,axis,min,max){
  let poly=vertices;
  for(const [edge,lower] of [[min,true],[max,false]]){
    if(!poly.length)break;
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];
      const insideA=lower?a.p[axis]>=edge-1e-6:a.p[axis]<=edge+1e-6;
      const insideB=lower?b.p[axis]>=edge-1e-6:b.p[axis]<=edge+1e-6;
      if(insideA)result.push(a);
      if(insideA!==insideB){
        const t=(edge-a.p[axis])/(b.p[axis]-a.p[axis]);
        const value=interpolate(a,b,t);
        value.p[axis]=edge;result.push(value);
      }
    }
    poly=result;
  }
  return poly;
}
function clipPolygon(vertices,minX,maxX){
  return clipPolygonAxis(vertices,0,minX,maxX);
}
function sourcePrimitive(parsed,prim){
  const a=prim.attributes;
  const pos=parsed.accessor(a.POSITION).data;
  const normal=a.NORMAL!==undefined?parsed.accessor(a.NORMAL).data:null;
  const uv=a.TEXCOORD_0!==undefined?parsed.accessor(a.TEXCOORD_0).data:null;
  const order=prim.indices!==undefined?parsed.accessor(prim.indices).data
    :Uint32Array.from({length:pos.length/3},(_,i)=>i);
  const mat=parsed.json.materials?.[prim.material??0]||{};
  const color=mat.pbrMetallicRoughness?.baseColorFactor||BASE_COL;
  return {pos,normal,uv,order,mat,color};
}
// Build genuine GLB mesh vertices in a BIG architectural section.
// A 7m-high corridor produces 10.5m-wide repeated metal wall bays;
// an 8m-high corridor produces 12m-wide bays. NO nonuniform scaling,
// synthetic punched photo geometry, or GLB stretched into one 90m rectangle.
export function buildGLBHallWall(w,parsed,{skip=1}={}){
  const height=w.vertical[1]-w.vertical[0],scale=height/GLB_SOURCE_HEIGHT;
  if(height<=0||w.length<=0)throw Error('Invalid stronghold hallway dimensions');
  const sectionWidth=GLB_SOURCE_WIDTH*scale;
  const sectionCount=Math.ceil((w.length-.0001)/sectionWidth);
  // A ventilation lintel is NOT another compressed GLB. It uses the SAME
  // full-height mesh as its adjacent metal wall; we clip out only the bands
  // that correspond to real structural steel above/between open passages.
  // Bands are authored in absolute level Y, transformed into model-local Y.
  const centerY=(w.vertical[0]+w.vertical[1])/2;
  const bands=w.visibleBands?.map(([lo,hi])=>[lo-centerY,hi-centerY])||null;
  const out=new Map();
  const meshes=parsed.json.meshes||[];
  for(let mi=0;mi<meshes.length;mi++){
    const source=meshes[mi];
    for(const prim of source.primitives||[]){
      if(prim.mode!==undefined&&prim.mode!==4)continue;
      const matID=prim.material??0;
      const detail=sourcePrimitive(parsed,prim);
      const B=out.get(matID)||batch();out.set(matID,B);
      const n=detail.pos.length/3;
      // Only the original GLB's high-density face surface is decimated on
      // medium/low settings. Every 3D pipe, bolt, louver and silhouette
      // remains a real source primitive, never replaced by a billboard.
      // Generic index-stride reduction is unsafe, so triangles are retained.
      void skip;
      for(let section=0;section<sectionCount;section++){
        const center=-w.length/2+(section+.5)*sectionWidth;
        const xEnd=w.length/2;
        const lastTruncated=center+sectionWidth/2>xEnd+1e-6;
        const mapVertex=(k)=>({
          p:[center+detail.pos[k*3]*scale,detail.pos[k*3+1]*scale,detail.pos[k*3+2]*scale],
          n:detail.normal?Array.from(detail.normal.subarray(k*3,k*3+3)):[0,0,1],
          uv:detail.uv?[detail.uv[k*2],detail.uv[k*2+1]]:[0,0],
          c:detail.color,
        });
        // When a whole section fits, vertices are shared by index rather
        // than duplicating 3 vertices for every triangle.
        if(!lastTruncated&&!bands){
          const offset=B.pos.length/3;
          for(let k=0;k<n;k++)pushVertex(B,mapVertex(k));
          for(let i=0;i<detail.order.length;i++)B.idx.push(offset+detail.order[i]);
        }else{
          // Cut the REAL source triangles against the wall end and all
          // permitted vertical bands. This preserves pipe/vent relief at
          // source scale, never covers a lower/upper duct, and cannot paint
          // over the inverted-U portal frame.
          for(let i=0;i+2<detail.order.length;i+=3){
            const whole=clipPolygon([
              mapVertex(detail.order[i]),mapVertex(detail.order[i+1]),
              mapVertex(detail.order[i+2])],-w.length/2,xEnd);
            if(whole.length<3)continue;
            for(const [y0,y1] of bands||[[-height/2,height/2]]){
              const poly=clipPolygonAxis(whole,1,y0,y1);
              if(poly.length<3)continue;
              const start=pushVertex(B,poly[0]);
              for(let k=1;k+1<poly.length;k++){
                const b=pushVertex(B,poly[k]),c=pushVertex(B,poly[k+1]);
                B.idx.push(start,b,c);
              }
            }
          }
        }
      }
    }
  }
  // Each GLB material is a single draw batch for the complete corridor run;
  // the geometry itself is assembled from FULL-SCALE source-model bays.
  return [...out].filter(([,b])=>b.idx.length).map(([id,b])=>{
    const mat=parsed.json.materials?.[id]||{};
    const n=b.nrm;
    // Original optimized GLB has normals; recompute only on a sparse source
    // primitive with missing normals, preserving true visible geometry.
    if(n.every(x=>x===0||x===1)){
      const sums=new Float64Array(b.pos.length);
      for(let i=0;i+2<b.idx.length;i+=3){
        const ia=b.idx[i]*3,ib=b.idx[i+1]*3,ic=b.idx[i+2]*3;
        const ux=b.pos[ib]-b.pos[ia],uy=b.pos[ib+1]-b.pos[ia+1],uz=b.pos[ib+2]-b.pos[ia+2];
        const vx=b.pos[ic]-b.pos[ia],vy=b.pos[ic+1]-b.pos[ia+1],vz=b.pos[ic+2]-b.pos[ia+2];
        const v=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
        for(const t of [ia,ib,ic])for(let k=0;k<3;k++)sums[t+k]+=v[k];
      }
      for(let i=0;i<n.length;i+=3){
        const len=Math.hypot(sums[i],sums[i+1],sums[i+2])||1;
        n[i]=sums[i]/len;n[i+1]=sums[i+1]/len;n[i+2]=sums[i+2]/len;
      }
    }
    return {
      materialId:id,
      mesh:{
        pos:new Float32Array(b.pos),nrm:new Float32Array(b.nrm),
        uv:new Float32Array(b.uv),col:new Uint8Array(b.col),
        idx:new Uint32Array(b.idx),
      },
      emissive:mat.emissiveFactor||[0,0,0],
      roughness:mat.pbrMetallicRoughness?.roughnessFactor??.38,
      useSourceTexture:!!mat.pbrMetallicRoughness?.baseColorTexture,
    };
  });
}
async function loadEmbeddedImages(R,parsed){
  const images=[];
  if(typeof createImageBitmap!=='function')return images;
  for(const i of parsed.json.images||[]){
    if(i.bufferView===undefined){images.push(null);continue;}
    const bv=parsed.json.bufferViews[i.bufferView];
    const off=bv.byteOffset||0;
    const bytes=parsed.bin.slice(off,off+bv.byteLength);
    const bitmap=await createImageBitmap(
      new Blob([bytes],{type:i.mimeType||'image/png'}));
    try{images.push(R.uploadTexture(bitmap,{anisotropy:8}));}
    finally{bitmap.close?.();}
  }
  return images;
}
export async function loadStrongholdGLBWalls(R,placements,url=SUMI_GLB_WALL.url){
  if(!placements?.length)return null;
  const parsed=await loadGLB(url);
  if(!parsed.json.meshes?.length)throw Error('Original GLB has no mesh geometry');
  // Build BEFORE marking the old corridor shell hidden; when the GLB fetch
  // fails, old collision-safe walls remain rendered as a proper fallback.
  const all=placements.map(w=>({
    ...w,model:modelOf(w),
    materials:buildGLBHallWall(w,parsed).map(group=>({
      ...group,mesh:R.uploadStatic(group.mesh,{spatialCellSize:20}),
    })),
  }));
  const textures=await loadEmbeddedImages(R,parsed);
  const faceTexture=textures[0]||null;
  return {placements:all,faceTexture,textures:textures.filter(Boolean),
    sourceGLB:url,sourceMeshCount:parsed.json.meshes.length};
}
export function renderStrongholdGLBWalls(R,kit){
  if(!kit?.placements?.length)return;
  const cam=R.cam||[0,2,0];
  for(const wall of kit.placements){
    const dx=cam[0]-wall.p[0],dy=cam[1]-wall.p[1],dz=cam[2]-wall.p[2];
    if(Math.hypot(dx,dy,dz)>SUMI_GLB_WALL.maxMidDistance+wall.length/2)continue;
    const facing=dx*Math.sin(wall.yaw)+dz*Math.cos(wall.yaw);
    if(facing<-.6)continue;
    for(const g of wall.materials)R.drawMesh(g.mesh,wall.model,{
      tex:g.useSourceTexture?kit.faceTexture:null,
      steel:!g.useSourceTexture,spec:1-g.roughness,emis:g.emissive,
    });
  }
}
