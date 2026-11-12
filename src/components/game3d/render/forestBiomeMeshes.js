// Original high-detail, batched meshes for the Game 1 / Game 3D forest.
// Trunk ridges are geometry, leaf tips are individual irregular surfaces,
// and grass has an actual root/hinge/tip structure (not ground pigment).
import * as THREE from 'three';
import {createGame1LeafAtlas,leafAtlasUV} from './forestFoliageAtlas.js';
import {
  game1ForestHeight, game1ForestPatches, game1ForestTrees,
  game1ForestGrassPositions,seededRandom,GAME1_FOREST_SPAN,
} from './forestBiomeData.js';
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const point=(x,y,z)=>[x,y,z];
const tint=(rgb,m=1)=>rgb.map(c=>Math.min(1,Math.max(0,c*m)));
export class ForestMeshWriter {
  constructor(){this.pos=[];this.uv=[];this.colors=[];this.flex=[];this.indices=[];}
  vertex(p,c=[1,1,1],uv=[0,0],flex=0){
    const index=this.pos.length/3;this.pos.push(...p);
    this.colors.push(...c);this.uv.push(...uv);this.flex.push(flex);
    return index;
  }
  tri(a,b,c,color=[1,1,1],flex=[0,0,0],uv=[[0,0],[1,0],[.5,1]]){
    const ia=this.vertex(a,color,uv[0],flex[0]),ib=this.vertex(b,color,uv[1],flex[1]),ic=this.vertex(c,color,uv[2],flex[2]);
    this.indices.push(ia,ib,ic);
  }
  quad(a,b,c,d,color=[1,1,1],flex=[0,0,0,0],uv=[[0,0],[1,0],[1,1],[0,1]]){
    const ia=this.vertex(a,color,uv[0],flex[0]),ib=this.vertex(b,color,uv[1],flex[1]);
    const ic=this.vertex(c,color,uv[2],flex[2]),id=this.vertex(d,color,uv[3],flex[3]);
    this.indices.push(ia,ib,ic,ia,ic,id);
  }
  geometry(){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    geometry.setAttribute('aFlex',new THREE.Float32BufferAttribute(this.flex,1));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    return geometry;
  }
}

function addTrunk(builder,t,random){
  const bark=t.species==='birch'?[.72,.70,.59]:t.species==='pine'?[.44,.29,.18]:[.48,.36,.24];
  const sides=10,height=t.height*.78,bottom=t.radius*1.38;
  for(let h=0;h<6;h++)for(let k=0;k<sides;k++){
    const a=k/sides*TAU,b=(k+1)/sides*TAU,low=h/6,high=(h+1)/6;
    const ring=(f,angle)=>{
      const r=bottom*(1-.82*f)*(1+.09*Math.sin(angle*7+f*32+t.seed*.001));
      const ridge=.07*Math.sin(angle*13+f*35)*Math.sin(f*17+angle*4);
      return point(t.x+Math.cos(angle)*(r+ridge),t.y+height*f,
        t.z+Math.sin(angle)*(r+ridge));
    };
    builder.quad(ring(low,a),ring(low,b),ring(high,b),ring(high,a),
      tint(bark,.89+.23*random()),[0,0,0,0],
      [[k/sides,low*7],[(k+1)/sides,low*7],[(k+1)/sides,high*7],[k/sides,high*7]]);
  }
  // Protruding, irregular bark plates and healed knots have depth and cast
  // an observable contour even without the normal/bump texture.
  for(let n=0;n<(t.near?19:9);n++){
    const ang=random()*TAU,f=.06+random()*.74;
    const w=.12+random()*.15,len=.31+random()*.76;
    const offset=.06+random()*.12,rad=(a,h)=>{
      const yf=Math.min(.95,f+h/height);
      const rr=bottom*(1-.82*yf)+offset;
      return point(t.x+Math.cos(a)*rr,t.y+height*yf,t.z+Math.sin(a)*rr);
    };
    builder.quad(rad(ang-w,0),rad(ang+w,0),rad(ang+w,len),rad(ang-w,len),
      tint(bark,.49+.38*random()),[0,0,0,0],
      [[0,f*9],[.4,f*9],[.4,f*9+len],[0,f*9+len]]);
  }
  for(let k=0;k<5;k++){
    const a=k/5*TAU+random()*.2,dx=Math.cos(a),dz=Math.sin(a),y=t.y+.04;
    builder.quad(point(t.x-dz*.12,y,t.z+dx*.12),
      point(t.x+dz*.12,y,t.z-dx*.12),
      point(t.x+dx*t.radius*2+dz*.14,y+.13,t.z+dz*t.radius*2-dx*.14),
      point(t.x+dx*t.radius*2-dz*.14,y+.13,t.z+dz*t.radius*2+dx*.14),
      tint(bark,.65),[0,0,0,0]);
  }
  // Tapered solid branches, attached at different heights, not sticks
  // pasted flat on the canopy. More branches on close trees.
  const branches=t.species==='pine'?6:t.near?7:4;
  for(let j=0;j<branches;j++){
    const ang=j/branches*TAU+(random()-.5)*.8;
    const h=t.height*(.40+random()*.36),len=t.canopy*(.46+random()*.38);
    const dx=Math.cos(ang),dz=Math.sin(ang);
    const start=point(t.x,t.y+h,t.z);
    const end=point(t.x+dx*len,t.y+h+len*(t.species==='pine'?-.17:.31),t.z+dz*len);
    const orth=point(-dz*.16,0,dx*.16),rise=point(0,.14,0);
    const a0=point(start[0]+orth[0],start[1],start[2]+orth[2]);
    const b0=point(start[0]-orth[0],start[1],start[2]-orth[2]);
    const a1=point(end[0]+orth[0]*.19,end[1],end[2]+orth[2]*.19);
    const b1=point(end[0]-orth[0]*.19,end[1],end[2]-orth[2]*.19);
    builder.quad(a0,b0,b1,a1,tint(bark,.75),[0,0,0,0]);
    builder.quad(a0,a1,point(end[0]+rise[0],end[1]+rise[1],end[2]+rise[2]),
      point(start[0]+rise[0],start[1]+rise[1],start[2]+rise[2]),
      tint(bark,.96),[0,0,0,0]);
  }
}
function foliageCluster(builder,random,x,y,z,rx,ry,rz,color,detail=1){
  // Soft rounded interior foliage, not the former giant flat-topped 9-sided
  // green polygon. Small dark lobes between branches give leaves depth and
  // stop the botanical cutouts from looking like disconnected particles.
  const N=10;
  const layers=[[-.92,.17],[-.59,.70],[.07,.99],[.73,.40]];
  const rings=layers.map(([h,r],layer)=>Array.from({length:N},(_,i)=>{
    const a=i/N*TAU,w=r*(.88+.17*Math.sin(a*5+layer*2.3)+.065*random());
    return point(x+Math.cos(a)*rx*w,y+h*ry+Math.sin(i*1.23+layer)*ry*.025,
      z+Math.sin(a)*rz*w);
  }));
  for(let j=0;j<layers.length-1;j++)for(let i=0;i<N;i++){
    const n=(i+1)%N;
    builder.quad(rings[j][i],rings[j][n],rings[j+1][n],rings[j+1][i],
      tint(color,.61+.07*j+random()*.22),[.28,.34,.81,.83]);
  }
  const top=point(x,y+ry*.95,z);
  for(let i=0;i<N;i++)builder.tri(rings[3][i],rings[3][(i+1)%N],top,
    tint(color,.76+random()*.27),[.78,.73,1]);
  // Distinct tapered individual leaves/needles break up the cloud outline.
  for(let i=0;i<detail;i++){
    const angle=random()*TAU,dy=(random()-.45)*ry*.87;
    const a=point(x+Math.cos(angle)*rx*.82,y+dy,z+Math.sin(angle)*rz*.82);
    const b=point(a[0]+Math.cos(angle+1.1)*.22,a[1]+.13,a[2]+Math.sin(angle+1.1)*.22);
    const c=point(a[0]+Math.cos(angle)*(.42+random()*.23),
      a[1]+.20+random()*.24,a[2]+Math.sin(angle)*(.42+random()*.23));
    const d=point(a[0]+Math.cos(angle-1.1)*.22,a[1]+.11,a[2]+Math.sin(angle-1.1)*.22);
    builder.quad(a,b,c,d,tint(color,.83+random()*.35),[.34,.79,1,.79]);
  }
}
// Each volumetric crown is supported by many small botanical leaf/needle
// sprays, distributed in 3D around the branch tips. The transparent cutouts
// make organic broken outlines at every viewing angle rather than a green
// nine-sided polygon. Four vertices per spray, all batched into one GPU draw.
function addBotanicalSprays(mesh,random,t,x,y,z,rx,ry,rz,color,qty){
  const uv=leafAtlasUV(t.species);
  for(let j=0;j<qty;j++){
    const az=random()*TAU,radial=.29+random()*.64;
    const latitude=(random()-.50)*1.45;
    const sx=x+Math.cos(az)*rx*radial;
    const sy=y+latitude*ry*.87;
    const sz=z+Math.sin(az)*rz*radial;
    // Sprays face semi-random directions while projecting away from their
    // supporting branches; distant cards do not look like repeated billboards.
    const heading=az+(random()-.5)*1.7;
    const across=[-Math.sin(heading),0,Math.cos(heading)];
    const forward=[Math.cos(heading),0,Math.sin(heading)];
    const pine=t.species==='pine';
    const width=(pine?.78:.81)*(.73+random()*.62);
    const height=(pine?.82:.94)*(.70+random()*.65);
    const lift=pine?-(.04+random()*.22):(random()-.42)*.36;
    // Pine branch fans lie almost horizontally, like real outward-growing
    // needles, rather than upright floating green confetti.
    const stem=pine?[sx-forward[0]*.30,sy-.07,sz-forward[2]*.30]
      :[sx,sy-height*.46,sz];
    const l=[stem[0]-across[0]*width*.52,stem[1],stem[2]-across[2]*width*.52];
    const r=[stem[0]+across[0]*width*.52,stem[1],stem[2]+across[2]*width*.52];
    const tip=[sx+forward[0]*(pine?height*.73:.27),
      pine?sy+lift:sy+height*.54+lift,sz+forward[2]*(pine?height*.73:.27)];
    const tl=[tip[0]-across[0]*width*.52,tip[1],tip[2]-across[2]*width*.52];
    const tr=[tip[0]+across[0]*width*.52,tip[1],tip[2]+across[2]*width*.52];
    const shade=tint(color,.96+random()*.49);
    mesh.quad(l,r,tr,tl,shade,[.25,.25,.91,.91],uv);
  }
}
export function buildGame1Trees(trees=game1ForestTrees()){
  const bark=new ForestMeshWriter(),foliage=new ForestMeshWriter(),leafCards=new ForestMeshWriter();
  let totalSprays=0;
  for(const t of trees){
    const rand=seededRandom(t.seed);
    addTrunk(bark,t,rand);
    const color=t.species==='pine'?[.18,.40,.25]:t.species==='oak'?[.34,.57,.19]:[.39,.61,.25];
    if(t.species==='pine'){
      // Pine crowns taper upward in seven separated real branch whorls,
      // unlike the old single umbrella-shaped green cap.
      for(let tier=0;tier<7;tier++){
        const f=tier/6,r=t.canopy*(.20+.80*Math.pow(1-f,1.12));
        const x=t.x,y=t.y+t.height*(.32+f*.65),z=t.z;
        foliageCluster(foliage,rand,x,y,z,r*.61,.66+(1-f)*.29,r*.61,
          tint(color,.58+.16*f),t.near?3:1);
        const count=t.near?42:13;
        addBotanicalSprays(leafCards,rand,t,x,y,z,r,1.13,r,color,count);
        totalSprays+=count;
      }
    }else{
      const N=t.near?5:3;
      for(let i=0;i<N;i++){
        const ang=i/N*TAU+rand()*.4,rr=t.canopy*(.32+rand()*.24);
        const cx=t.x+Math.cos(ang)*rr,cy=t.y+t.height*(.73+rand()*.13),cz=t.z+Math.sin(ang)*rr;
        foliageCluster(foliage,rand,cx,cy,cz,t.canopy*.32,t.height*.095,t.canopy*.32,
          tint(color,.59+rand()*.16),t.near?5:1);
        const count=t.near?57:18;
        addBotanicalSprays(leafCards,rand,t,cx,cy,cz,t.canopy*.55,t.height*.18,t.canopy*.55,
          color,count);
        totalSprays+=count;
      }
      foliageCluster(foliage,rand,t.x,t.y+t.height*.88,t.z,
        t.canopy*.38,t.height*.11,t.canopy*.38,tint(color,.67),t.near?7:2);
      const count=t.near?67:23;
      addBotanicalSprays(leafCards,rand,t,t.x,t.y+t.height*.88,t.z,
        t.canopy*.71,t.height*.19,t.canopy*.71,color,count);
      totalSprays+=count;
    }
  }
  return {bark:bark.geometry(),foliage:foliage.geometry(),
    leafCards:leafCards.geometry(),count:trees.length,sprayCount:totalSprays};
}

export function buildGame1Grass(trees=game1ForestTrees(),count=14000){
  const blades=new ForestMeshWriter(),rand=seededRandom(0xbca409);
  const positions=game1ForestGrassPositions(trees,count);
  for(const loc of positions){
    const n=rand()<.66?3:2;
    for(let j=0;j<n;j++){
      const dir=loc.angle+j*TAU/n+(rand()-.5)*.35;
      const sx=Math.cos(dir),sz=Math.sin(dir),across=point(-sz,0,sx);
      const root=point(loc.x+sx*.037,loc.y-.022,loc.z+sz*.037);
      const h=loc.h*(.76+rand()*.45),w=.025+rand()*.026;
      const curve=.09+rand()*.20;
      const l=point(root[0]-across[0]*w,root[1],root[2]-across[2]*w);
      const r=point(root[0]+across[0]*w,root[1],root[2]+across[2]*w);
      const middle=point(root[0]+sx*curve*.4,root[1]+h*.65,root[2]+sz*curve*.4);
      const ml=point(middle[0]-across[0]*w*.58,middle[1],middle[2]-across[2]*w*.58);
      const mr=point(middle[0]+across[0]*w*.58,middle[1],middle[2]+across[2]*w*.58);
      const tip=point(root[0]+sx*curve,root[1]+h,root[2]+sz*curve);
      const color=tint(loc.color<.3?[.39,.61,.18]:loc.color<.72?[.33,.54,.21]:[.57,.67,.28],.85+rand()*.28);
      blades.quad(l,r,mr,ml,color,[0,0,.58,.58]);
      blades.tri(ml,mr,tip,tint(color,1.13),[.58,.58,1]);
    }
  }
  return {geometry:blades.geometry(),bladeGroups:positions.length};
}
function makeBarkTexture(kind='color'){
  const width=128,height=256,data=new Uint8Array(width*height*4);
  const rand=seededRandom(0x56e140);
  const marks=Array.from({length:width},(_,i)=>.5+.26*Math.sin(i*.27+Math.sin(i*.09))
    +.08*(rand()-.5));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const ridge=Math.sin(x*.45+Math.sin(y*.04)*2.2);
    const grooves=Math.pow(1-Math.abs(ridge),5);
    const fleck=.15*Math.sin(y*.78+x*.22)*Math.sin(x*.62-y*.13);
    const shade=Math.max(.18,Math.min(1,marks[x]-grooves*.32+fleck));
    const i=(y*width+x)*4;
    const rgb=kind==='bump'?[shade,shade,shade]:[shade*.93,shade*.87,shade*.72];
    for(let c=0;c<3;c++)data[i+c]=Math.round(rgb[c]*255);
    data[i+3]=255;
  }
  const tex=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;
  if(kind==='color')tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;tex.name='Game 1 grooved bark '+kind;
  return tex;
}
export function game1ForestMaterials(){
  const barkMap=makeBarkTexture(),bump=makeBarkTexture('bump');
  const bark=new THREE.MeshStandardMaterial({map:barkMap,bumpMap:bump,bumpScale:.12,
    vertexColors:true,roughness:.91,metalness:0,side:THREE.DoubleSide});
  const leaves=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,
    metalness:0,side:THREE.DoubleSide,flatShading:false});
  const leafAtlas=createGame1LeafAtlas();
  const sprays=new THREE.MeshStandardMaterial({map:leafAtlas,alphaTest:.30,
    transparent:false,depthWrite:true,vertexColors:true,roughness:.89,
    metalness:0,side:THREE.DoubleSide,emissive:0x18300b,emissiveIntensity:.33});
  const grass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,
    side:THREE.DoubleSide,metalness:0});
  bark.name='Game 1 raised bark + grooved pigment';
  leaves.name='Game 1 shaded inner canopy volume';
  sprays.name='Game 1 cutout pine needles and lobed oak-birch leaves';
  grass.name='Game 1 root-anchored wind grass';
  return {bark,leaves,sprays,grass,barkMap,bump,leafAtlas};
}
export function buildGame1GroundGeometry(span=GAME1_FOREST_SPAN,segments=192) {
  const geo=new THREE.PlaneGeometry(span,span,segments,segments);
  geo.rotateX(-Math.PI/2);
  const position=geo.getAttribute('position'),colors=[];
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i);
    position.setY(i,game1ForestHeight(x,z));
    const {dryTrail,bank,wetBasin,shade}=game1ForestPatches(x,z);
    // Ground pigment is spatially varied, not a single flat neon-green mat.
    // Distinct meadow, canopy shade, beaten earth, sandy bank and wet basins
    // use the same surface in both the walking mesh and raycast collisions.
    const grass=[.74,.88,.67],mud=[.78,.65,.48],waterbank=[.62,.74,.61];
    const a=Math.max(dryTrail*.92,wetBasin*.82);
    const patchy=.88+.22*shade+.045*Math.sin(x*.67-z*.49);
    const shaded=Math.max(0,.5+.5*Math.sin(x*.06+Math.sin(z*.075))*Math.cos(z*.045));
    colors.push(...[0,1,2].map(ch=>lerp(lerp(grass[ch],mud[ch],a),
      waterbank[ch],bank*.63)*patchy*(.81+.19*shaded)));
  }
  position.needsUpdate=true;
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();geo.computeBoundingSphere();
  return geo;
}
