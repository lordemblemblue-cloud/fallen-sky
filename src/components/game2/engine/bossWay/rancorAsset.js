// Optional owner-provided Jedi Academy Rancor mesh.
// Raven's original .glm/.gla files are Ghoul2 resources; this WebGL renderer
// loads a lightweight GLB conversion at public/game2/bossway/rancor.glb.
// The connected Drive did not contain models/players/rancor at implementation
// time. A missing GLB is never described as the original model.
import { parseGLB } from '../glb.js';

export const RANCOR_MODEL_URL = 'bossway/rancor.glb';
export const RANCOR_VERTEX_BUDGET = 65000;
export const RANCOR_TRIANGLE_BUDGET = 85000;

// The BSP supplied by the owner is a mission LEVEL, not a creature mesh.
// Do not run a public Boss Way fight with the procedural bear-like test dummy.
// Developer combat tests may still instantiate it directly through BossWay.
export function requireRancorCharacterAsset(asset) {
  if (!asset || asset.source !== 'owner-converted-glb' || !asset.mesh) {
    throw new Error(
      'The actual Jedi Academy Rancor character model is missing. ' +
      't2_rancor.bsp contains level geometry and an NPC spawn, not the Rancor mesh. ' +
      'The previously shown creature was a temporary placeholder and will no longer load as the public boss. ' +
      'Provide models/players/rancor (GLM, GLA, skin and textures) from your Jedi Academy assets0.pk3/assets1.pk3 ' +
      'so the original model can be converted and installed as game2/bossway/rancor.glb.'
    );
  }
  return asset;
}

export function unpackRancorGLB(buffer) {
  const glb=parseGLB(buffer), prim=glb.json?.meshes?.[0]?.primitives?.[0];
  if(!prim||prim.mode!==undefined&&prim.mode!==4)throw new Error('Rancor GLB must have triangle geometry');
  const attr=prim.attributes||{};
  if(attr.POSITION===undefined||attr.NORMAL===undefined)
    throw new Error('Rancor GLB must have vertex positions and normals');
  const pos=glb.accessor(attr.POSITION).data,nrm=glb.accessor(attr.NORMAL).data;
  const count=pos.length/3;
  if(!count||count>RANCOR_VERTEX_BUDGET||count%1)
    throw new Error('Rancor model exceeds the 65k-vertex gameplay budget');
  if(nrm.length!==pos.length||!pos.every(Number.isFinite)||!nrm.every(Number.isFinite))
    throw new Error('Rancor geometry contains invalid normals or positions');
  const index=prim.indices!==undefined?glb.accessor(prim.indices).data:
    Uint32Array.from({length:count},(_,i)=>i);
  if(index.length%3||index.length/3>RANCOR_TRIANGLE_BUDGET)
    throw new Error('Rancor model exceeds the 85k-triangle gameplay budget');
  const idx=Uint32Array.from(index);
  if(idx.some(i=>i>=count))throw new Error('Rancor mesh indexes invalid vertices');
  let col=new Uint8Array(count*4);col.fill(255);
  if(attr.COLOR_0!==undefined) {
    const acc=glb.accessor(attr.COLOR_0),d=acc.data;
    if(acc.size!==3&&acc.size!==4)throw new Error('Rancor vertex colors must be RGB or RGBA');
    for(let i=0;i<count;i++) for(let j=0;j<4;j++) {
      const value=j===3&&acc.size===3?1:d[i*acc.size+j];
      col[i*4+j]=Math.max(0,Math.min(255,Math.round(
        acc.type===5126||acc.normalized?value*255:value)));
    }
  } else for(let i=0;i<count;i++){
    col[i*4]=146;col[i*4+1]=135;col[i*4+2]=117;col[i*4+3]=255;
  }
  return {
    mesh:{pos:new Float32Array(pos),nrm:new Float32Array(nrm),col,idx},
    scale:Number(glb.json?.asset?.extras?.game2Scale)||1,
    source:'owner-converted-glb',triangles:idx.length/3,vertices:count,
  };
}

export async function loadOwnerRancor(base,fetcher=fetch) {
  const url=base+RANCOR_MODEL_URL;
  try {
    const response=await fetcher(url);
    if(!response.ok||response.headers?.get?.('content-type')?.includes('text/html'))return null;
    const len=Number(response.headers?.get?.('content-length'))||0;
    if(len>18*1024*1024)throw new Error('Rancor GLB exceeds 18 MB asset budget');
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength>18*1024*1024)throw new Error('Rancor GLB exceeds 18 MB asset budget');
    return unpackRancorGLB(buffer);
  }catch(error) {
    console.warn('Game 2 Rancor model unavailable; using a clearly identified temporary proxy:',error);
    return null;
  }
}
