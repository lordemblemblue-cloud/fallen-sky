// Deterministic, 8192x8192-capable source-texture baker.
// A tile-based function deliberately avoids allocating a 256 MiB bitmap
// (or locking the game main thread) while encoding original 8K PNG assets.
// The browser loads the baked files by URL; lower-quality presets use the
// existing lightweight generated fallback instead.
export const GAME2_MOUNTAIN_SOURCE_SIZE = 8192;
export const GAME2_MOUNTAIN_BAKE_KINDS = Object.freeze(['rock','moss','dirt']);

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=x=>x*x*(3-2*x);
function hashed(x,y,seed){
  let n=Math.imul(x,0x1f123bb5)^Math.imul(y,0x5f356495)^Math.imul(seed,0x27d4eb2d);
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function periodicNoise(u,v,f,seed){
  const x=u*f,y=v*f;
  const a=Math.floor(x),b=Math.floor(y),tx=smooth(x-a),ty=smooth(y-b);
  const hash=(xx,yy)=>hashed((xx+f)%f,(yy+f)%f,seed);
  const upper=hash(a,b)*(1-tx)+hash(a+1,b)*tx;
  const lower=hash(a,b+1)*(1-tx)+hash(a+1,b+1)*tx;
  return upper*(1-ty)+lower*ty;
}
const colorPalettes={
  rock:[[33,41,46],[95,107,110],[175,167,147]],
  moss:[[18,31,23],[54,88,57],[126,140,94]],
  dirt:[[43,38,35],[105,83,65],[165,142,113]],
};
export function game2BakeMountainRows(kind,size,yStart,rowCount){
  if(!GAME2_MOUNTAIN_BAKE_KINDS.includes(kind))throw new RangeError('Unknown mountain source');
  if(!Number.isInteger(size)||size<32||size>8192||(size&(size-1)))throw new RangeError('Image size must be power of two <= 8192');
  if(!Number.isInteger(yStart)||!Number.isInteger(rowCount)||yStart<0||rowCount<1||yStart+rowCount>size)
    throw new RangeError('Invalid streaming row range');
  const buffer=new Uint8Array(size*rowCount*4);
  const seed=kind==='rock'?17:kind==='moss'?43:71;
  const colors=colorPalettes[kind];
  for(let row=0;row<rowCount;row++){
    const v=(row+yStart)/size;
    for(let x=0;x<size;x++){
      const u=x/size;
      const broad=periodicNoise(u,v,6,seed);
      const mid=periodicNoise(u,v,26,seed+1);
      const fractureNoise=periodicNoise(u,v,112,seed+2);
      const grit=periodicNoise(u,v,512,seed+4);
      // Long crevices and fine stone bedding, not flat random RGB noise.
      const bedding=0.5+0.5*Math.sin((u*68+v*9+mid*1.6)*Math.PI*2);
      const cleavage=Math.pow(1-Math.abs(fractureNoise*2-1),9);
      const pigment=clamp(.18+.43*broad+.26*mid+.16*grit+.07*bedding-.38*cleavage);
      const wash=kind==='rock'?clamp(.30+.42*periodicNoise(u,v,9,seed+5)):0;
      const dryBrush=kind==='rock'
        ?Math.pow(Math.max(0,Math.sin((u*96+v*14+fractureNoise*5)*Math.PI*2)),12)
        :0;
      const level=clamp(pigment-wash*dryBrush*.20);
      const c=level<.5?0:1;
      const a=level<.5?level*2:(level-.5)*2;
      const pos=(row*size+x)*4;
      for(let k=0;k<3;k++)buffer[pos+k]=Math.round(
        colors[c][k]*(1-a)+colors[c+1][k]*a);
      // The existing triplanar shader uses alpha as micro-height, not
      // opacity. Ink washes remain visible within RGB along dry fractures.
      buffer[pos+3]=Math.round(clamp(.2+.59*pigment+.14*bedding-.26*cleavage)*255);
    }
  }
  return buffer;
}
export const GAME2_MOUNTAIN_8K_PATHS = Object.freeze({
  rock:'/game2/mountain8k/rock.webp',
  moss:'/game2/mountain8k/moss.webp',
  dirt:'/game2/mountain8k/dirt.webp',
});
export function chooseMountainGpuResolution(quality,maxSize,deviceMemoryGb=0){
  const maximum=Math.max(0,Number(maxSize)||0);
  // One RGBA8 8192² texture + mipmaps uses ~341 MiB. Restrict that
  // allocation to an explicit opt-in 8K quality tier and strong devices.
  if(quality==='8k'&&maximum>=8192&&Number(deviceMemoryGb)>=8)
    return {rock:8192,moss:2048,dirt:2048};
  if(['8k','4k'].includes(quality)&&maximum>=4096)
    return {rock:4096,moss:2048,dirt:2048};
  if(quality==='high'&&maximum>=2048)
    return {rock:2048,moss:1024,dirt:1024};
  if(quality==='very_low')return {rock:256,moss:256,dirt:256};
  return {rock:512,moss:512,dirt:512};
}
