// Original procedural preview surfaces for Atom X Eve's isolated Game 3D capital.
// Tileable low-resolution color maps; not scanned/copyrighted textures or final art.
// No renderer, DOM, canvas, network request, or gameplay state required.
export const CAPITAL_SURFACE_STYLES = Object.freeze({
  plateau:   Object.freeze({color:0x8d8981, roughness:.97, repeat:[8,8], pattern:'stone'}),
  wall:      Object.freeze({color:0x827a6e, roughness:.96, repeat:[5,3], pattern:'stone'}),
  structure: Object.freeze({color:0xc6b8a4, roughness:.94, repeat:[4,3], pattern:'plaster'}),
  roof:      Object.freeze({color:0x56606a, roughness:.86, repeat:[6,4], pattern:'roof'}),
  road:      Object.freeze({color:0x99938b, roughness:.97, repeat:[12,2], pattern:'paver'}),
  column:    Object.freeze({color:0xd9d0be, roughness:.93, repeat:[3,4], pattern:'stone'}),
  plaza:     Object.freeze({color:0xa79e91, roughness:.96, repeat:[6,6], pattern:'paver'}),
  water:     Object.freeze({color:0x456879, roughness:.32, repeat:[4,8], pattern:'water'}),
  plots:     Object.freeze({color:0x6d8665, roughness:.99, repeat:[5,4], pattern:'vegetation'}),
});

function noise(x,y,seed) {
  let n=(Math.imul(x+seed*31,374761393)^Math.imul(y+seed*71,668265263))|0;
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)%256;
}

export function generateCapitalSurfaceRGBA(kind,size=64) {
  const style=CAPITAL_SURFACE_STYLES[kind];
  if(!style)throw Error('Unknown capital surface: '+kind);
  if(!Number.isInteger(size)||size<32||size>256||(size&(size-1))!==0)
    throw Error('Capital surface resolution must be a power of two from 32 to 256');
  const data=new Uint8Array(size*size*4);
  const seed=Object.keys(CAPITAL_SURFACE_STYLES).indexOf(kind)+1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const n=noise(x,y,seed);
    let brightness=221+(n%28);
    const row=Math.floor(y/16);
    const shiftedX=(x+(row%2)*8)%16;
    if(style.pattern==='stone'&&(shiftedX<2||y%16<2))brightness-=49;
    else if(style.pattern==='paver'&&((x+(Math.floor(y/8)%2)*8)%16<2||y%8<2))brightness-=59;
    else if(style.pattern==='roof'&&((x+(Math.floor(y/12)%2)*8)%16<2||y%12<2))brightness-=64;
    else if(style.pattern==='plaster')brightness-=n%13;
    else if(style.pattern==='water')brightness=210+Math.round(16*Math.sin(x*.31+y*.77))+(n%19);
    else if(style.pattern==='vegetation')brightness=196+(n%58);
    const i=(y*size+x)*4;
    const v=Math.min(255,Math.max(0,brightness));
    data[i]=v;
    data[i+1]=style.pattern==='water'?Math.max(0,v-5):v;
    data[i+2]=style.pattern==='vegetation'?Math.max(0,v-12):v;
    data[i+3]=255;
  }
  return data;
}

export function makeCapitalSurfaceMaterials(THREE,{textureSize=64}={}) {
  if(!THREE?.DataTexture||!THREE?.MeshStandardMaterial)throw Error('Three.js material constructors required');
  const textures=[];
  const materials={};
  try {
    for(const [kind,style] of Object.entries(CAPITAL_SURFACE_STYLES)) {
      const tex=new THREE.DataTexture(generateCapitalSurfaceRGBA(kind,textureSize),textureSize,textureSize,THREE.RGBAFormat);
      textures.push(tex);
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
      tex.repeat.set(...style.repeat);
      tex.colorSpace=THREE.SRGBColorSpace;
      tex.generateMipmaps=true;
      tex.needsUpdate=true;
      materials[kind]=new THREE.MeshStandardMaterial({color:style.color,roughness:style.roughness,metalness:0,map:tex});
    }
  } catch(error) {
    Object.values(materials).forEach(m=>m.dispose());
    textures.forEach(t=>t.dispose());
    throw error;
  }
  let disposed=false;
  return {materials,dispose(){
    if(disposed)return;
    disposed=true;
    Object.values(materials).forEach(m=>m.dispose());
    textures.forEach(t=>t.dispose());
  }};
}
