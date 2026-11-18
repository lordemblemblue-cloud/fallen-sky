// Game 2 — Sumi-e Military Stronghold, not Training Grounds.
// Genuine owner-uploaded engineering straight and L-corner GLBs.
// Only selected full-size chamber wall spans are replaced visually;
// all existing collision, doorways and ventilation remain unchanged.
import { loadGLB } from '../glb.js';
import { m4 } from '../math.js';

export const SUMI_OWNER_WALL_ASSETS=Object.freeze({
  straight:'https://media.base44.com/files/public/6876751a602125f45f1861b9/7b6d2e6ac_Engineering_Straight_Wall_From_Owner_Corner.glb',
  corner:'https://media.base44.com/files/public/6876751a602125f45f1861b9/2c9d2a67a_Engineering_L_Corner.glb',
});

// Opt in only the two primary chambers needing new wall relief. Leave
// hangar/ship dock, medical, reactor, ventilation and already-GLB-clad
// corridors alone, respecting the user's "don't touch this room" instructions.
export const SUMI_OWNER_ROOM_IDS=Object.freeze(['command','armory']);
export const SUMI_OWNER_ROOM_CONFIG=Object.freeze({
  command: Object.freeze({box:Object.freeze([-18,-29,18,12]),height:10,openings:Object.freeze({
    s:Object.freeze([[-6,6]]),n:Object.freeze([[-4,4]]),
    w:Object.freeze([[-4,4]]),e:Object.freeze([[-4,4]]),
  })}),
  armory: Object.freeze({box:Object.freeze([-76,-17,-52,17]),height:9,openings:Object.freeze({
    e:Object.freeze([[-4,4]]),
  })}),
});

// Model's local x runs 0..3 along straight walls; its relief points toward
// negative local z. L-corner has local arms -X and -Z: rotate, don't mirror.
export const SUMI_OWNER_CORNER_YAWS=Object.freeze({
  southwest:Math.PI,southeast:Math.PI/2,northeast:0,northwest:-Math.PI/2,
});
const SIDES=Object.freeze(['s','n','w','e']);
function cutIntervals(start,end,gaps,edge=.06) {
  let spans=[[start,end]];
  for(const [l,r] of gaps||[]) spans=spans.flatMap(([a,b])=>
    r<=a||l>=b?[[a,b]]:[[a,Math.max(a,l-edge)],[Math.min(b,r+edge),b]]
      .filter(([x,y])=>y-x>.1));
  return spans;
}
// Every model starts ON the floor and reaches the real room ceiling.
// The source GLB is ~3m wide and 2.06m high. Uniform scaling preserves all
// pipe diameters, relief thickness, rivets, textures and the square L turns.
// Unlike the old 3-row / multi-tile solution this uses EXACTLY one actual
// GLB per corner and one continuous GLB per unobstructed wall span.
export function sumiOwnerWallPlacements(){
  const placements=[];
  for(const id of SUMI_OWNER_ROOM_IDS){
    const {box:[x0,z0,x1,z1],height,openings}=SUMI_OWNER_ROOM_CONFIG[id];
    const scale=height/2.06;
    const reach=3*scale; // true 3m L arm, uniformly enlarged to ceiling height
    const xLength=x1-x0,zLength=z1-z0;
    // Cut the physical L arms at the FIRST actual door opening, or at the
    // halfway meeting point when a room side is shorter than two full arms.
    // This clips real GLB triangles, not an invisible overlay across a door.
    const usable=(side,atStart,spanLength)=>{
      const gaps=(openings[side]||[]).slice().sort((a,b)=>a[0]-b[0]);
      const begin=side==='s'||side==='n'?x0:z0;
      const finish=side==='s'||side==='n'?x1:z1;
      const doorDistance=!gaps.length?Infinity:atStart
        ? gaps[0][0]-begin : finish-gaps[gaps.length-1][1];
      return Math.max(0,Math.min(reach,spanLength/2,doorDistance-.055));
    };
    const s0=usable('s',true,xLength),s1=usable('s',false,xLength);
    const n0=usable('n',true,xLength),n1=usable('n',false,xLength);
    const w0=usable('w',true,zLength),w1=usable('w',false,zLength);
    const e0=usable('e',true,zLength),e1=usable('e',false,zLength);
    const corners=[
      // armX/armZ correspond to the source's two LOCAL negative axes.
      // Rotate the real L 90 degrees, never mirror its surface normals.
      {corner:'southwest',p:[x0,0,z0],armX:s0,armZ:w0},
      {corner:'southeast',p:[x1,0,z0],armX:e0,armZ:s1},
      {corner:'northeast',p:[x1,0,z1],armX:n1,armZ:e1},
      {corner:'northwest',p:[x0,0,z1],armX:w1,armZ:n0},
    ];
    for(const corner of corners){
      placements.push({
        kind:'corner',room:id,corner:corner.corner,side:'both',
        p:corner.p,yaw:SUMI_OWNER_CORNER_YAWS[corner.corner],
        scale:[scale,scale,scale],
        crop:{xMin:-corner.armX/scale,zMin:-corner.armZ/scale},
        height,
      });
    }
    const spans={
      s:[x0+s0,x1-s1],n:[x0+n0,x1-n1],
      w:[z0+w0,z1-w1],e:[z0+e0,z1-e1],
    };
    for(const side of SIDES){
      const [a,b]=spans[side];
      for(const [start,end] of cutIntervals(a,b,openings[side])){
        const length=end-start;
        if(length<.10)continue;
        if(length>3*scale+.002)
          throw Error('Stronghold wall segment exceeds single full-height GLB: '+id+' '+side);
        const yaw={s:Math.PI,n:0,w:-Math.PI/2,e:Math.PI/2}[side];
        const p=side==='s'?[end,0,z0]:
          side==='n'?[start,0,z1]:
          side==='w'?[x0,0,start]:[x1,0,end];
        placements.push({
          kind:'straight',room:id,side,p,yaw,
          // Same uniform scaling in every direction: do not crush pipes,
          // turn a square vent into a rectangle, or tile three GLBs high.
          scale:[scale,scale,scale],height,length,run:[start,end],
          crop:{xMin:0,xMax:length/scale},
        });
      }
    }
  }
  return placements;
}
const WHITE = [1,1,1,1];
const batch = () => ({pos:[],nrm:[],uv:[],col:[],idx:[]});
const byte = x => Math.round(Math.min(1,Math.max(0,x))*255);
function sourcePrimitives(parsed) {
  const out=[];
  for (const mesh of parsed.json.meshes||[]) for (const prim of mesh.primitives||[]) {
    if (prim.mode!==undefined && prim.mode!==4) continue;
    const attr=prim.attributes||{};
    if (attr.POSITION===undefined) continue;
    const pos=parsed.accessor(attr.POSITION).data;
    const indices=prim.indices===undefined
      ? Array.from({length:pos.length/3},(_,i)=>i)
      : Array.from(parsed.accessor(prim.indices).data);
    const normal=attr.NORMAL!==undefined
      ? parsed.accessor(attr.NORMAL).data : new Float32Array(pos.length);
    // Some of the actual metal hardware meshes omit normals. Derive them
    // from genuine triangles once, rather than painting fake raised boxes.
    if (attr.NORMAL===undefined) {
      for(let i=0;i+2<indices.length;i+=3){
        const ai=indices[i]*3,bi=indices[i+1]*3,ci=indices[i+2]*3;
        const ax=pos[bi]-pos[ai],ay=pos[bi+1]-pos[ai+1],az=pos[bi+2]-pos[ai+2];
        const bx=pos[ci]-pos[ai],by=pos[ci+1]-pos[ai+1],bz=pos[ci+2]-pos[ai+2];
        const n=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
        for(const k of [ai,bi,ci])for(let j=0;j<3;j++)normal[k+j]+=n[j];
      }
    }
    const uv=attr.TEXCOORD_0!==undefined
      ? parsed.accessor(attr.TEXCOORD_0).data : null;
    out.push({pos,normal,uv,indices,material:prim.material??0});
  }
  return out;
}
// Clip TRUE triangles to the available physical wall span. Interpolating
// UVs and normals keeps the original model texture aligned to the new end;
// the result is still one uniformly enlarged source model, not stacked
// fragments and not a sheet geometrically stretched across the wall.
export function cropTriangle(triangle, limits) {
  let polygon=triangle;
  for(const [axis,bound,lower] of limits){
    if(!polygon.length)break;
    const next=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const inside=v=>lower?v.p[axis]>=bound-1e-6:v.p[axis]<=bound+1e-6;
      const ai=inside(a),bi=inside(b);
      if(ai)next.push(a);
      if(ai!==bi){
        const delta=b.p[axis]-a.p[axis];
        const t=Math.abs(delta)<1e-12?0:(bound-a.p[axis])/delta;
        const mix=(u,v)=>u.map((q,j)=>q+(v[j]-q)*t);
        const cut={p:mix(a.p,b.p),n:mix(a.n,b.n),uv:mix(a.uv,b.uv)};
        cut.p[axis]=bound;next.push(cut);
      }
    }
    polygon=next;
  }
  return polygon;
}
function materialVertices(src,placement){
  const limits=[];
  if(placement.crop?.xMin!==undefined)limits.push([0,placement.crop.xMin,true]);
  if(placement.crop?.xMax!==undefined)limits.push([0,placement.crop.xMax,false]);
  if(placement.crop?.zMin!==undefined)limits.push([2,placement.crop.zMin,true]);
  if(!limits.length)return src;
  const pos=[],normal=[],uv=[],indices=[];
  const vert=i=>({
    p:Array.from(src.pos.subarray(i*3,i*3+3)),
    n:Array.from(src.normal.subarray(i*3,i*3+3)),
    uv:src.uv?Array.from(src.uv.subarray(i*2,i*2+2)):[0,0],
  });
  for(let i=0;i+2<src.indices.length;i+=3){
    const p=cropTriangle([vert(src.indices[i]),vert(src.indices[i+1]),vert(src.indices[i+2])],limits);
    if(p.length<3)continue;
    const offset=pos.length/3;
    for(const v of p){pos.push(...v.p);normal.push(...v.n);uv.push(...v.uv);}
    for(let j=1;j+1<p.length;j++)indices.push(offset,offset+j,offset+j+1);
  }
  return {pos:Float32Array.from(pos),normal:Float32Array.from(normal),
    uv:Float32Array.from(uv),indices,material:src.material};
}
function appendPrimitive(out, src, placement, color) {
  src=materialVertices(src,placement);
  const off=out.pos.length/3, sx=placement.scale[0],sy=placement.scale[1],
    sz=placement.scale[2], c=Math.cos(placement.yaw), s=Math.sin(placement.yaw);
  const p=placement.p;
  for(let i=0;i<src.pos.length;i+=3){
    const x=src.pos[i]*sx,y=src.pos[i+1]*sy,z=src.pos[i+2]*sz;
    out.pos.push(p[0]+c*x+s*z,p[1]+y,p[2]-s*x+c*z);
    // Proper inverse-transpose normal transform under nonuniform scale.
    const nx=src.normal[i]/sx, ny=src.normal[i+1]/sy,
      nz=src.normal[i+2]/sz;
    const X=c*nx+s*nz,Z=-s*nx+c*nz,L=Math.hypot(X,ny,Z)||1;
    out.nrm.push(X/L,ny/L,Z/L);
    const j=i/3;
    out.uv.push(src.uv?src.uv[j*2]:0,src.uv?src.uv[j*2+1]:0);
    out.col.push(byte(color[0]),byte(color[1]),byte(color[2]),byte(color[3]));
  }
  for (const i of src.indices) out.idx.push(off+i);
}
function bakeAssets(parsed, placements) {
  const materials=parsed.json.materials||[], sources=sourcePrimitives(parsed),
    byMat=new Map();
  for (const inst of placements) for (const src of sources) {
    let out=byMat.get(src.material);
    if (!out) { out=batch();byMat.set(src.material,out); }
    const mat=materials[src.material]||{};
    appendPrimitive(out,src,inst,mat.pbrMetallicRoughness?.baseColorFactor||WHITE);
  }
  return [...byMat].filter(([,b])=>b.idx.length).map(([id,b])=>({
    material: materials[id]||{},
    mesh:{
      pos:new Float32Array(b.pos), nrm:new Float32Array(b.nrm),
      uv:new Float32Array(b.uv), col:new Uint8Array(b.col),
      idx:new Uint32Array(b.idx),
    }
  }));
}
async function textureList(R,parsed) {
  if(typeof createImageBitmap!=='function')throw Error('Embedded GLB texture decoder unavailable');
  const textures=[];
  try {
    for(const entry of parsed.json.images||[]) {
      if(entry.bufferView===undefined){textures.push(null);continue;}
      const view=parsed.json.bufferViews[entry.bufferView],o=view.byteOffset||0;
      const bytes=parsed.bin.slice(o,o+view.byteLength);
      const bitmap=await createImageBitmap(new Blob([bytes],{type:entry.mimeType||'image/png'}));
      try { textures.push(R.uploadTexture(bitmap,{anisotropy:4})); }
      finally { bitmap.close?.(); }
    }
  } catch (error) {
    for(const t of textures) if(t)R.gl?.deleteTexture?.(t);
    throw error;
  }
  return textures;
}
export async function loadSumiOwnerWalls(R, placements) {
  if (!placements?.length) return null;
  const [straight,corner]=await Promise.all([
    loadGLB(SUMI_OWNER_WALL_ASSETS.straight),
    loadGLB(SUMI_OWNER_WALL_ASSETS.corner),
  ]);
  if ((straight.json.meshes||[]).length < 7 || (corner.json.meshes||[]).length < 18)
    throw Error('Unexpected engineering-wall GLB; preserve original hall walls');
  const assets=[
    {kind:'straight', parsed:straight}, {kind:'corner',parsed:corner},
  ];
  const groups=[],textures=[];
  try {
    for(const asset of assets) {
      const tex=await textureList(R,asset.parsed); textures.push(...tex);
      for(const group of bakeAssets(asset.parsed,placements.filter(p=>p.kind===asset.kind))){
        const base=group.material.pbrMetallicRoughness||{};
        const tx=base.baseColorTexture?.index;
        const source=tx===undefined?null:asset.parsed.json.textures?.[tx]?.source;
        groups.push({
          mesh:R.uploadStatic(group.mesh,{spatialCellSize:20}), spec:1-(base.roughnessFactor??.48),
          tex:source===undefined||source===null?null:tex[source],
          emis:group.material.emissiveFactor||[0,0,0],
        });
      }
    }
  } catch(err) {
    for(const tex of textures)if(tex)R.gl?.deleteTexture?.(tex);
    throw err;
  }
  return {groups,textures,placements};
}
export function drawSumiOwnerWalls(R,kit) {
  if(!kit?.groups?.length)return;
  const cam=R.cam||[0,0,-2];
  if(!kit.placements.some(p=>Math.hypot(cam[0]-p.p[0],cam[2]-p.p[2])<95))return;
  const I=m4.ident();
  for(const group of kit.groups) R.drawMesh(group.mesh,I,{
    tex:group.tex,spec:group.spec,emis:group.emis,doubleSided:true,
  });
}
