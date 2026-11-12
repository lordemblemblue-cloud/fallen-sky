// Original painterly botanical cutout atlas for the Game 1 / Game 3D canopy.
// 3 horizontal tiles: pine needle sprays, lobed oak leaves, and slender
// serrated birch foliage. Alpha comes from actual leaf silhouettes rather
// than rectangular planes; no borrowed game artwork or texture downloads.
import * as THREE from 'three';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const segmentDistance=(x,y,ax,ay,bx,by)=>{
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  const t=clamp(((x-ax)*dx+(y-ay)*dy)/(len||1));
  return Math.hypot(x-(ax+t*dx),y-(ay+t*dy));
};
function lobe(x,y,cx,cy,rx,ry,angle=0,serrated=false){
  const s=Math.sin(angle),c=Math.cos(angle);
  const dx=x-cx,dy=y-cy;
  const u=(dx*c+dy*s)/rx,v=(-dx*s+dy*c)/ry;
  const r=Math.hypot(u,v),phi=Math.atan2(v,u);
  const outline=serrated? .96+.052*Math.cos(phi*13)+.035*Math.cos(phi*19)
    : .84+.13*Math.cos(phi*5)+.060*Math.sin(phi*9);
  const alpha=1-smooth(outline-.08,outline+.03,r);
  // Bright pigment central veins and small shadow at leaf edges.
  const vein=(1-smooth(.04,.23,Math.abs(u)))*(1-smooth(.67,.98,Math.abs(v)));
  return [alpha,vein];
}
function tileSample(type,x,y){
  let alpha=0,vein=0;
  if(type===0){
    // Pine: actual thin needles sprouting from a slender central twig.
    alpha=Math.max(alpha,1-smooth(.020,.052,Math.abs(x+.07*y)));
    for(let n=0;n<11;n++){
      const yy=-.86+n*.17;
      const extent=.24+.39*Math.sin((n+1)/12*Math.PI);
      for(const sign of [-1,1]){
        const tx=sign*extent,ty=yy+.12;
        const d=segmentDistance(x,y,0,yy,tx,ty);
        alpha=Math.max(alpha,1-smooth(.018,.060,d));
      }
    }
    vein=1-smooth(.012,.10,Math.abs(x));
  }else if(type===1){
    // Oak leaves: lobed, ragged fan-shaped outlines on branched petioles.
    const spots=[[-.30,-.40,.36,.39,-.34],[.34,-.26,.34,.44,.46],
      [-.39,.10,.38,.37,-.49],[.40,.23,.34,.36,.42],
      [-.17,.52,.37,.39,-.19],[.15,.71,.28,.29,.20]];
    for(const [cx,cy,rx,ry,ang] of spots){
      const [a,v]=lobe(x,y,cx,cy,rx,ry,ang);
      alpha=Math.max(alpha,a);vein=Math.max(vein,v*a);
      alpha=Math.max(alpha,1-smooth(.009,.034,
        segmentDistance(x,y,0,cy*.70,cx,cy)));
    }
    alpha=Math.max(alpha,1-smooth(.014,.037,Math.abs(x+.09*y))*(1-smooth(.84,.98,Math.abs(y))));
  }else{
    // Birch: smaller serrated pointed leaves with tiny open gaps.
    for(let n=0;n<8;n++){
      const side=n%2?1:-1;
      const cx=side*(.28+.11*Math.sin(n*3.7)),cy=-.70+n*.195;
      const rx=.24,ry=.29;
      const [a,v]=lobe(x,y,cx,cy,rx,ry,side*.27,true);
      alpha=Math.max(alpha,a);vein=Math.max(vein,v*a);
      alpha=Math.max(alpha,1-smooth(.009,.030,
        segmentDistance(x,y,-.06,cy-.07,cx,cy)));
    }
    alpha=Math.max(alpha,1-smooth(.014,.035,Math.abs(x+.08*y))*(1-smooth(.90,.99,Math.abs(y))));
  }
  return [clamp(alpha),clamp(vein)];
}
export function createGame1LeafAtlas(){
  const tileWidth=128,height=256,width=tileWidth*3,pixels=new Uint8Array(width*height*4);
  for(let kind=0;kind<3;kind++){
    for(let y=0;y<height;y++)for(let x=0;x<tileWidth;x++){
      const fx=(x+.5)/tileWidth*2-1,fy=(y+.5)/height*2-1;
      const [alpha,vein]=tileSample(kind,fx,fy);
      const stipple=Math.sin(fx*37.3+fy*29.1)*Math.sin(fy*53.7-fx*18.9);
      const mottled=.83+.13*Math.sin(fx*11+fy*8)+.055*stipple;
      const pigment=clamp(mottled+vein*.14);
      const base=kind===0?[.73,.91,.80]:kind===1?[.83,.95,.66]:[.90,.99,.75];
      const at=((height-1-y)*width+kind*tileWidth+x)*4;
      pixels[at]=Math.round(base[0]*pigment*255);
      pixels[at+1]=Math.round(base[1]*pigment*255);
      pixels[at+2]=Math.round(base[2]*pigment*255);
      pixels[at+3]=Math.round(alpha*255);
    }
  }
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
  texture.flipY=false;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;texture.needsUpdate=true;
  texture.name='Game 1 hand-procedural oak birch pine foliage atlas';
  return texture;
}
export function leafAtlasUV(species){
  const k=species==='pine'?0:species==='oak'?1:2;
  // Inset the UVs by half a texel to prevent neighbouring tile colour bleed.
  const a=k/3+.002,b=(k+1)/3-.002;
  return [[a,0],[b,0],[b,1],[a,1]];
}
