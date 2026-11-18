// Game 2 training-wall moss: deterministic 2D image + shallow 3D relief cards.
// Replaces unsupported bare green polygons. All geometry is VISUAL ONLY.
// No moss card overlaps either 6m-high doorway, including its frame buffer.

export const WALL_MOSS_PORTALS = Object.freeze([
  Object.freeze({ id: 'handbook_gate', x: [26.7, 28.1], z: [32, 38], y: [0, 6] }),
  Object.freeze({ id: 'abyss_gate', x: [48.9, 49.8], z: [34, 40], y: [0, 6] }),
]);
export const WALL_MOSS_RUNS = Object.freeze([
  Object.freeze({x:26.84, facing:-1, spans:[[13.3,31.45],[38.55,62.4]]}),
  Object.freeze({x:-26.84, facing:1, spans:[[13.3,62.4]]}),
  Object.freeze({x:49.70, facing:1, spans:[[25.4,33.45],[40.55,48.6]]}),
]);
const rng=(seed)=>()=>{seed=(seed+0x6D2B79F5)|0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const sat=n=>Math.max(0,Math.min(1,n));
function noise(x,y,seed){
  const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const h=(a,b)=>{
    const t=Math.sin(a*127.1+b*311.7+seed*29.13)*43758.5453123;
    return t-Math.floor(t);
  };
  const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
  return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
}

/** RGBA raster of phototextured, porous moss with alpha-cut organic edges.
 * A small procedural image is authored locally so there is no external asset,
 * cross-origin dependency, or rectangular sprite background.
 */
export function buildWallMossPixels(size=256){
  if(!Number.isInteger(size)||size<32||size>1024)throw new RangeError('Invalid moss image size');
  const pixels=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size, v=(y+.5)/size;
    const bulk=noise(u*5.5,v*5.5,11);
    const clumps=noise(u*15.0,v*15.0,17);
    const fine=noise(u*48.0,v*48.0,31);
    const speck=noise(u*106,v*106,29);
    const dx=(u-.5)/(.41+.10*(bulk-.5)),dy=(v-.5)/(.34+.12*(clumps-.5));
    const cellular=(1-Math.sqrt(dx*dx+dy*dy));
    // Connected irregular clusters, holes and tiny fuzzy filaments.
    const cover=cellular*.87+(bulk-.5)*.57+(clumps-.5)*.29+(fine-.5)*.11;
    const alpha=sat((cover-.055)*6.5);
    const fiber=.72+.43*fine+.24*speck;
    const shade=sat(.70+.55*bulk-.33*clumps+.10*fine);
    const i=(y*size+x)*4;
    pixels[i]=Math.round((47+54*shade+12*speck)*fiber);
    pixels[i+1]=Math.round((61+90*shade+15*speck)*fiber);
    pixels[i+2]=Math.round((21+29*shade+8*fine)*fiber);
    pixels[i+3]=Math.round(255*alpha);
  }
  return {width:size,height:size,pixels};
}

export function createWallMossCanvas(size=256){
  if(typeof document==='undefined')return null;
  const image=buildWallMossPixels(size);
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  const bitmap=ctx.createImageData(size,size);bitmap.data.set(image.pixels);
  ctx.putImageData(bitmap,0,0);
  return canvas;
}

// A textured visual mesh with proper UVs and normals, unlike the generic
// meshBuilder, whose colored quads have no texture coordinates.
export function buildTrainingWallMoss(){
  const pos=[],nrm=[],col=[],uv=[],idx=[],patches=[];
  const random=rng(20261024);
  for(const run of WALL_MOSS_RUNS)for(const [start,end] of run.spans){
    const span=end-start;
    const total=Math.max(8,Math.floor(span*2.05));
    for(let i=0;i<total;i++){
      const z=start+.42+random()*(span-.84);
      const height=.40+Math.pow(random(),1.6)*6.2;
      const radius=(.33+random()*.58)*(height>4.8?.64:1);
      const patchH=.40+random()*.83;
      const low=Math.max(.10,height-patchH*.5);
      const high=Math.min(7.65,height+patchH*.5);
      const near=Math.max(start+.035,z-radius),far=Math.min(end-.035,z+radius);
      if(far-near<.17 || high-low<.17)continue;
      // Volumetric impression from three separate shallow relief surfaces.
      for(let depth=0;depth<3;depth++){
        const cardWidth=(far-near)*(1-depth*.16), mid=(near+far)*.5;
        const z0=mid-cardWidth*.5,z1=mid+cardWidth*.5;
        const y0=low+(high-low)*depth*.08, y1=high-(high-low)*depth*.09;
        const x=run.x+run.facing*(.012+.021*depth);
        const base=pos.length/3,cr=.73+random()*.26;
        const tips=[[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0]];
        for(const p of tips){
          pos.push(...p);nrm.push(run.facing,0,0);
          col.push(Math.round(222*cr),Math.round(240*cr),Math.round(211*cr),255);
        }
        // UV orientation: U across width (z), V up (y).
        uv.push(0,1, 1,1, 1,0, 0,0);
        if(run.facing<0)idx.push(base,base+1,base+2,base,base+2,base+3);
        else idx.push(base,base+2,base+1,base,base+3,base+2);
        patches.push({x,z0,z1,y0,y1,depth,facing:run.facing});
      }
    }
  }
  return {pos:new Float32Array(pos),nrm:new Float32Array(nrm),
    col:new Uint8Array(col),uv:new Float32Array(uv),
    idx:new Uint32Array(idx),patches};
}
