// Deterministic 4K source-image + procedural fine-relief atlas for Kejim
// Mission 1. The underlying licensed repository stone remains the albedo
// reference; the additional strata, crevice and moss breakup are authored
// at native output resolution. 2048 fallback for smaller WebGL devices.
// One texture upload; the metal/gloss/roughness behavior is shader-based.
import { mulberry32 } from '../level/kit.js';

export const KEJIM_MATERIAL_RESOLUTION = 4096;
export function makeKejimStoneAtlas(photo,{
  maxTextureSize=4096,
  canvasFactory=()=>document.createElement('canvas'),
}={}){
  if(!photo)throw new TypeError('Kejim source material image required');
  const size=Math.min(KEJIM_MATERIAL_RESOLUTION,Math.max(256,maxTextureSize));
  // WebGL2 requires power-of-two here for our standard mipmapping path.
  const resolution=2**Math.floor(Math.log2(size));
  const canvas=canvasFactory();
  canvas.width=resolution;canvas.height=resolution;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Kejim texture atlas canvas unavailable');
  const rng=mulberry32(20261024);
  // Seamless repeat of the original rock image keeps scale coherent on
  // three-axis projections even when sampled from a very tall cliff.
  ctx.drawImage(photo,0,0,resolution,resolution);
  const scale=resolution/4096;
  ctx.save();
  // Larger striation ledges: every band breaks into multiple rough layers
  // instead of smooth flat beige slabs.
  for(let j=0;j<1400;j++){
    const y=rng()*resolution,x=rng()*resolution,
      length=(55+rng()*480)*scale,angle=(rng()-.5)*.36;
    ctx.strokeStyle=rng()>.52?'rgba(25,27,27,0.17)':'rgba(231,219,187,0.12)';
    ctx.lineWidth=Math.max(.7,(.8+rng()*4.2)*scale);
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+length,y+Math.tan(angle)*length);
    ctx.stroke();
  }
  // Hairline fractures are not uniform grid squares. Many tiny mineral
  // chips create honest 4K texel detail when the player approaches rocks.
  for(let j=0;j<15500;j++){
    const x=rng()*resolution,y=rng()*resolution,
      length=(2+rng()*28)*scale;
    ctx.strokeStyle=rng()>.65?
      'rgba(247,228,197,0.24)':'rgba(19,23,24,0.19)';
    ctx.lineWidth=Math.max(.5,(.6+rng()*1.6)*scale);
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+length*(.5+rng()),y+length*(rng()-.40));
    ctx.stroke();
  }
  // Moss clumps concentrate around fractured troughs, not a green veil
  // painted uniformly over the entire wall.
  for(let p=0;p<2350;p++){
    const cx=rng()*resolution,cy=rng()*resolution;
    if(rng()<.23)continue;
    const radius=(2+rng()*9)*scale;
    ctx.fillStyle=rng()>.45?'rgba(52,77,35,0.22)':'rgba(28,52,26,0.34)';
    ctx.beginPath();ctx.ellipse(cx,cy,radius*1.8,radius,0,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
  return canvas;
}
