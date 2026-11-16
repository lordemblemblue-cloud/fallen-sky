// Game 3D trail surface (2026-11-16 landscaping): a real packed-dirt texture
// with grit and pebbles mapped in WORLD space (never stretched along a strip)
// and a feathered alpha edge, so trails blend into their graded shoulders.
// Standard MeshStandardMaterial only (map / bumpMap / alphaMap channels): no
// custom shader on a walkable surface.
import * as THREE from 'three';

const SIZE=256;
const TAU=Math.PI*2;
function hash2(x,y,salt){
  let n=(Math.imul(x|0,0x45d9f3b)^Math.imul(y|0,0x27d4eb2d)^salt)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d)>>>0;
  n=Math.imul(n^(n>>>15),0x846ca68b)>>>0;
  return ((n^(n>>>16))>>>0)/4294967296;
}
// Seamless (periodic) value noise on a P x P lattice.
function periodicNoise(u,v,period,salt){
  const x=u*period,y=v*period,xi=Math.floor(x),yi=Math.floor(y);
  const fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const w=(i)=>((i%period)+period)%period;
  const a=hash2(w(xi),w(yi),salt),b=hash2(w(xi+1),w(yi),salt);
  const c=hash2(w(xi),w(yi+1),salt),d=hash2(w(xi+1),w(yi+1),salt);
  return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
}
function fbm(u,v,salt){
  return periodicNoise(u,v,4,salt)*.45+periodicNoise(u,v,9,salt+1)*.27+
    periodicNoise(u,v,23,salt+2)*.17+periodicNoise(u,v,61,salt+3)*.11;
}

/** Albedo + height (bump) for compacted trail dirt, 256 px, seamless. */
export function makeWolfveilTrailDirtTextures(){
  const albedo=new Uint8Array(SIZE*SIZE*4),height=new Float32Array(SIZE*SIZE);
  // Pebbles: deterministic scattered discs with soft shoulders (wrapping).
  const pebbles=[];
  for(let i=0;i<260;i++){
    pebbles.push({x:hash2(i,1,0x51)*SIZE,y:hash2(i,2,0x52)*SIZE,
      r:.8+Math.pow(hash2(i,3,0x53),2.6)*3.6,tone:hash2(i,4,0x54),
      squash:.55+.45*hash2(i,5,0x55),turn:hash2(i,6,0x56)*TAU});
  }
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const u=x/SIZE,v=y/SIZE,i=y*SIZE+x;
    const soil=fbm(u,v,11);
    const damp=periodicNoise(u,v,3,77);
    const grit=hash2(x,y,0x9e3)*.6+periodicNoise(u,v,97,5)*.4;
    // Faint foot-worn lanes along the trail (texture V follows world Z/X, so
    // these read as random wear, never as a repeating ladder).
    const wear=.5+.5*Math.sin(TAU*(u*2+.35*Math.sin(TAU*v*2)));
    height[i]=soil*.55+grit*.25+wear*.08;
    albedo[i*4]=clampByte(118+60*(soil-.5)+22*(grit-.5)-26*smooth(.55,.8,damp));
    albedo[i*4+1]=clampByte(94+48*(soil-.5)+18*(grit-.5)-22*smooth(.55,.8,damp));
    albedo[i*4+2]=clampByte(70+34*(soil-.5)+14*(grit-.5)-16*smooth(.55,.8,damp));
    albedo[i*4+3]=255;
  }
  // Pebbles stamped over their own wrapped bounding boxes.
  for(const p of pebbles){
    const reach=Math.ceil(p.r+1.6);
    for(let oy=-reach;oy<=reach;oy++)for(let ox=-reach;ox<=reach;ox++){
      const lx=ox+(p.x-Math.floor(p.x)),ly=oy+(p.y-Math.floor(p.y));
      const ca=Math.cos(p.turn),sa=Math.sin(p.turn);
      const d=Math.hypot(lx*ca+ly*sa,(-lx*sa+ly*ca)/p.squash);
      if(d>p.r+1.6)continue;
      const x=((Math.floor(p.x)+ox)%SIZE+SIZE)%SIZE,y=((Math.floor(p.y)+oy)%SIZE+SIZE)%SIZE;
      const i=y*SIZE+x;
      const top=1-smooth(p.r*.55,p.r,d);
      const shadow=smooth(p.r,p.r+1.6,d)*(1-smooth(p.r+.6,p.r+1.6,d));
      const stone=84+62*p.tone;
      albedo[i*4]=clampByte(albedo[i*4]*(1-top)+(stone+8)*top-26*shadow);
      albedo[i*4+1]=clampByte(albedo[i*4+1]*(1-top)+(stone+2)*top-24*shadow);
      albedo[i*4+2]=clampByte(albedo[i*4+2]*(1-top)+(stone-6)*top-20*shadow);
      height[i]=Math.max(height[i],.7+.3*top);
    }
  }
  const bump=new Uint8Array(SIZE*SIZE*4);
  for(let i=0;i<SIZE*SIZE;i++){
    const v=clampByte(height[i]*255);
    bump[i*4]=bump[i*4+1]=bump[i*4+2]=v;bump[i*4+3]=255;
  }
  const map=texture(albedo,'Wolfveil_Trail_PackedDirt_Pebbles',true);
  const bumpMap=texture(bump,'Wolfveil_Trail_PackedDirt_Height',false);
  return {map,bumpMap};
}
function smooth(a,b,t){const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);}
function clampByte(v){return Math.max(0,Math.min(255,Math.round(v)));}
function texture(data,name,srgb){
  const t=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
  t.name=name;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true;
  t.anisotropy=8;
  if(srgb)t.colorSpace=THREE.SRGBColorSpace;
  t.needsUpdate=true;
  return t;
}

/**
 * Edge feather (alphaMap, green channel). U = across the tread (0..1, centre
 * .5), V = along the trail in metres / 9: ragged, natural verges.
 */
export function makeWolfveilTrailEdgeAlpha(){
  const w=128,h=128,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/(w-1),v=y/h;
    const edge=Math.abs(u-.5)*2; // 0 centre .. 1 edge
    const ragged=.10*(periodicNoise(0,v,7,201)-.5)+.06*(periodicNoise(0,v,23,202)-.5);
    const a=1-smooth(.62+ragged,1,edge);
    const i=(y*w+x)*4;
    data[i]=data[i+1]=data[i+2]=clampByte(a*255);data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  t.name='Wolfveil_Trail_FeatheredVerge';
  t.wrapS=THREE.ClampToEdgeWrapping;t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}

/**
 * Re-maps a finished trail geometry: world-planar UVs for the dirt (uv) and
 * across/along coordinates for the feathered verge (uv1). `acrossOf(i)` gives
 * the existing 0..1 across coordinate of vertex i.
 */
export function applyWolfveilTrailUVs(geometry,acrossOf,{metresPerRepeat=4.5}={}){
  const pos=geometry.getAttribute('position');
  const planar=new Float32Array(pos.count*2),verge=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);
    planar[i*2]=x/metresPerRepeat;planar[i*2+1]=z/metresPerRepeat;
    verge[i*2]=Math.max(0,Math.min(1,acrossOf(i)));
    verge[i*2+1]=(x*.61+z*.79)/9;
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(planar,2));
  geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(verge,2));
  return geometry;
}
