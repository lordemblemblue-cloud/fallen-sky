// Game 2: seam-free, layered rock / vegetation / soil images.
// Deterministic offline generation: no proprietary textures or CDN calls.
// Alpha stores scalar MICRO HEIGHT for derivative normal perturbation.
// Colors are authored in linear-ish sRGB; the renderer applies scene lighting.
export const MOUNTAIN_MATERIALS = Object.freeze(['rock','moss','dirt']);

const TAU=Math.PI*2;
const clamp=x=>Math.min(1,Math.max(0,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

// Exact world-space texture resolution, not display resolution. Keep mobile
// memory and 4K asset fidelity budgets explicit (3 RGBA maps = ~16MB at 1024).
export const MOUNTAIN_TEXTURE_RESOLUTION=Object.freeze({
  very_low:128,medium:256,high:512,'4k':1024,
});
export function mountainTextureResolution(quality='medium', gpuMaxTextureSize=2048){
  const intended=MOUNTAIN_TEXTURE_RESOLUTION[quality]||256;
  const max=Math.floor(Number(gpuMaxTextureSize)||2048);
  let width=intended;
  while(width>Math.max(32,max))width/=2;
  return Math.max(32,width);
}

// Integer mix is much cheaper than Math.sin hashing a dozen million texels.
function latticeHash(x,y,seed){
  let h=Math.imul(x+seed*113,0x1b873593)^Math.imul(y+seed*29,0x85ebca6b);
  h=Math.imul(h^(h>>>16),0x7feb352d);
  h=Math.imul(h^(h>>>15),0x846ca68b);
  return ((h^(h>>>16))>>>0)/4294967295;
}
function tileNoise(u,v,frequency,seed){
  const x=u*frequency,y=v*frequency;
  const ix=Math.floor(x),iy=Math.floor(y);
  const fx=x-ix,fy=y-iy;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const x0=((ix%frequency)+frequency)%frequency;
  const y0=((iy%frequency)+frequency)%frequency;
  const x1=(x0+1)%frequency,y1=(y0+1)%frequency;
  return mix(mix(latticeHash(x0,y0,seed),latticeHash(x1,y0,seed),sx),
    mix(latticeHash(x0,y1,seed),latticeHash(x1,y1,seed),sx),sy);
}
function mineralSample(kind,u,v){
  const seed=kind==='rock'?11:kind==='moss'?29:47;
  const continent=tileNoise(u,v,4,seed);
  const blocks=tileNoise(u,v,12,seed+1);
  const shards=tileNoise(u,v,38,seed+3);
  const grain=tileNoise(u,v,96,seed+7);
  const pores=tileNoise(u,v,192,seed+11);
  const wave=tileNoise(u,v,8,seed+15);
  const shape=clamp(.12+.31*continent+.25*blocks+.21*shards+.11*grain);
  const bedding=Math.sin(TAU*(v*11+.36*wave+.07*Math.sin(TAU*u*3)));
  // Long oblique mineral faults are thin and black, while surrounding
  // weathered rock edges catch light. Integer-frequency phases tile exactly.
  const fault=Math.abs(Math.sin(TAU*(u*5+v*3+.35*blocks)));
  const crack=1-smooth(.018,.135,fault);
  const grit=(grain-.5)*.22+(pores-.5)*.12;
  if(kind==='rock'){
    const height=clamp(shape*.66+.18*bedding+grit-.27*crack);
    // Slate, granite and iron-oxide veining as three mineral populations,
    // not a single uniform gray tint.
    const granite=smooth(.29,.73,continent*.55+blocks*.45);
    const oxidation=smooth(.62,.86,blocks*.61+shards*.39);
    let color=[
      mix(57,112,granite),mix(61,116,granite),mix(63,117,granite)
    ];
    const warm=[132,100,74];
    const ore=oxidation*.21*(.5+.5*bedding);
    color=color.map((x,i)=>mix(x,warm[i],ore));
    const shade=.65+.63*shape+.12*bedding+.26*grit-.32*crack;
    return {rgba:color.map(x=>Math.round(clamp(x*shade/255)*255)),
      relief:Math.round(height*255)};
  }
  if(kind==='moss'){
    const clump=smooth(.45,.75,blocks*.56+shards*.44);
    const strand=Math.pow(grain,3)*.29;
    const height=clamp(shape*.55+clump*.35+strand+.08*pores);
    const dry=smooth(.68,.91,continent*.58+wave*.42);
    const base=[mix(21,95,clump),mix(49,130,clump),mix(24,62,clump)];
    const ochre=[111,117,61];
    const color=base.map((x,i)=>mix(x,ochre[i],dry*.40));
    const shade=.70+.45*shape+.22*grain;
    return {rgba:color.map(x=>Math.round(clamp(x*shade/255)*255)),
      relief:Math.round(height*255)};
  }
  // Granular earth: reddish clay, dark wet fines and light angular scree.
  const pebble=smooth(.73,.92,shards*.58+pores*.42);
  const sediment=smooth(.38,.65,blocks*.54+continent*.46);
  const height=clamp(.22+shape*.56+pebble*.17+grit);
  const base=[mix(65,146,sediment),mix(49,109,sediment),mix(36,77,sediment)];
  const dust=[177,151,111];
  const color=base.map((x,i)=>mix(x,dust[i],pebble*.65));
  const shade=.78+.36*shape+.24*grit;
  return {rgba:color.map(x=>Math.round(clamp(x*shade/255)*255)),
    relief:Math.round(height*255)};
}
export function buildMountainMaterialPixels(kind,size=256){
  if(!MOUNTAIN_MATERIALS.includes(kind))
    throw new RangeError('Unknown mountain texture');
  if(!Number.isInteger(size)||size<32||size>1024||(size&(size-1)))
    throw new RangeError('Mountain image dimensions must be power of two in [32,1024]');
  const pixels=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    // Identical first/last pixel rows guarantee seamless REPEAT sampling even
    // with strongly fractured high-frequency mineral grain.
    const {rgba,relief}=mineralSample(kind,x/(size-1),y/(size-1));
    const i=(y*size+x)*4;
    pixels[i]=rgba[0]; pixels[i+1]=rgba[1]; pixels[i+2]=rgba[2];
    pixels[i+3]=relief;
  }
  return {width:size,height:size,pixels};
}
export function createMountainMaterialCanvases(size=256){
  if(typeof document==='undefined')return null;
  const result={};
  for(const kind of MOUNTAIN_MATERIALS){
    const img=buildMountainMaterialPixels(kind,size);
    const canvas=document.createElement('canvas');
    canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d');
    if(!context)return null;
    const bitmap=context.createImageData(size,size);
    bitmap.data.set(img.pixels);
    context.putImageData(bitmap,0,0);
    result[kind]=canvas;
  }
  return result;
}
