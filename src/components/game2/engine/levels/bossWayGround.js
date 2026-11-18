// Boss Way environment dressing using the same real owner-supplied forest
// floor / grass / fern materials, deterministic foliage batching, and
// bevelled masonry mesh approach as the Training Garden. None of this is
// fictitious image retrieval or an unrelated procedural fallback.
import { meshBuilder } from '../level/builder.js';
import { mulberry32 } from '../level/kit.js';
import { trainingGroundNoise } from './trainingGround.js';
import {
  BOSS_WAY_BOUNDS, BOSS_WAY_ARENA, BOSS_WAY_COLUMNS, BOSS_WAY_RUINS,
} from './bossWayArena.js';

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const rectDistance=(x,z,cx,cz,hx,hz)=>{
  const dx=Math.abs(x-cx)-hx,dz=Math.abs(z-cz)-hz;
  return Math.hypot(Math.max(0,dx),Math.max(0,dz))+Math.min(0,Math.max(dx,dz));
};
export function bossWayPavingDistance(x,z) {
  return Math.min(
    rectDistance(x,z,0,-40,8.8,9),
    rectDistance(x,z,0,-17,3.8,15),
    rectDistance(x,z,0,57.8,11.25,5.5),
  );
}
export function bossWayGroundHeight(x,z) {
  const B=BOSS_WAY_BOUNDS;
  if(x<B.innerX0||x>B.innerX1||z<B.innerZ0||z>B.innerZ1)return 0;
  const away=smooth(.07,2.0,bossWayPavingDistance(x,z));
  const edge=smooth(0,2.4,Math.min(x-B.innerX0,B.innerX1-x,z-B.innerZ0,B.innerZ1-z));
  // Same two-octave shallow relief as Training Ground: walkable underfoot,
  // with stronger organic undulations beyond the main sparring floor.
  let h=.025+.095*trainingGroundNoise(x*.19+51,z*.19-13)
    +.037*trainingGroundNoise(x*.70-19,z*.70+7);
  for(const {x:cx,z:cz} of BOSS_WAY_COLUMNS) {
    const d=(x-cx)**2+(z-cz)**2;
    h+=.026*Math.exp(-d/12);
  }
  return .006+h*edge*(.25+.75*away);
}
function terrainColor(x,z) {
  const n=trainingGroundNoise(x*.37+8,z*.37-28);
  const distance=Math.hypot(x-BOSS_WAY_ARENA.rancor[0],z-BOSS_WAY_ARENA.rancor[2]);
  const grass=smooth(5,25,Math.abs(x))*smooth(.3,.8,n)*smooth(6,12,distance);
  const path=1-smooth(.3,3.2,bossWayPavingDistance(x,z));
  // Shader multiplies a REAL dirt albedo texture by these tones; centre
  // remains trampled warm soil while the perimeter has green meadow edges.
  const moss=smooth(.34,.8,n)*(1-path)*grass;
  const dust=1-smooth(0,17,distance);
  return [
    clamp((.89-moss*.27+dust*.085)*(.91+n*.13)),
    clamp((.82+moss*.09+dust*.025)*(.91+n*.13)),
    clamp((.70-moss*.18)*(.91+n*.13)),
  ];
}
export function buildBossWayTerrain() {
  const B=BOSS_WAY_BOUNDS,step=1,nx=B.innerX1-B.innerX0,nz=B.innerZ1-B.innerZ0;
  const pos=[],nrm=[],col=[],uv=[],idx=[],tris=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) {
    const x=B.innerX0+i*step,z=B.innerZ0+j*step,y=bossWayGroundHeight(x,z);
    const gx=(bossWayGroundHeight(x+.15,z)-bossWayGroundHeight(x-.15,z))/.3;
    const gz=(bossWayGroundHeight(x,z+.15)-bossWayGroundHeight(x,z-.15))/.3;
    const len=Math.hypot(gx,1,gz),c=terrainColor(x,z);
    pos.push(x,y,z);nrm.push(-gx/len,1/len,-gz/len);
    col.push(Math.round(c[0]*255),Math.round(c[1]*255),Math.round(c[2]*255),255);
    uv.push(x*.18,z*.18);
  }
  // Single indexed GPU mesh. Collision triangles use the exact same vertices,
  // so boots and boss both follow dirt ridges rather than clipping the floor.
  const row=nx+1,point=i=>pos.slice(i*3,i*3+3);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++) {
    const a=j*row+i,b=a+1,c=a+row,d=c+1;
    for(const [i0,i1,i2] of [[a,c,b],[b,c,d]]) {
      idx.push(i0,i1,i2);
      tris.push({a:point(i0),b:point(i1),c:point(i2),normal:[0,1,0]});
    }
  }
  return {
    mesh:{pos:new Float32Array(pos),nrm:new Float32Array(nrm),
      col:new Uint8Array(col),uv:new Float32Array(uv),idx:new Uint32Array(idx)},
    tris,
  };
}

function stoneRgb(rand,light=1) {
  const shade=(.88+rand()*.21)*light;
  return [.39*shade,.37*shade,.31*shade];
}
export function buildBossWayStoneDetail() {
  const m=meshBuilder(),rand=mulberry32(773120);
  // Thin inset rectangular masonry faces are pushed in front of the physical
  // wall so the seams stay visible. Blocks are batched into ONE static draw.
  const bricks=(axis,fixed,from,to,h,sign=1)=>{
    const height=.68,length=1.7,depth=.15;
    for(let y=.10;y<h-.3;y+=height)for(let u=from-((Math.floor(y/height)%2)*length/2);u<to;u+=length){
      const a=Math.max(from,u),b=Math.min(to,u+length);
      if(b-a<.18)continue;
      const c=stoneRgb(rand,1);
      if(axis==='x'){
        const x=fixed+sign*.06;
        const mn=[Math.min(x,x+sign*depth),y+0.018,a+.045];
        const mx=[Math.max(x,x+sign*depth),y+height-.045,b-.045];
        m.box(mn,mx,c,{foot:.82});
      } else {
        const z=fixed+sign*.06;
        const mn=[a+.045,y+.018,Math.min(z,z+sign*depth)];
        const mx=[b-.045,y+height-.045,Math.max(z,z+sign*depth)];
        m.box(mn,mx,c,{foot:.82});
      }
    }
  };
  bricks('x',-53.35,-57.4,67.4,11,1);
  bricks('x',53.35,-57.4,67.4,11,-1);
  bricks('z',-57.35,-53.3,53.3,10.5,1);
  bricks('z',67.35,-53.3,53.3,11,-1);

  // Individual coping stones and cornice silhouettes break the otherwise
  // flat rectangular wall profile; deterministic offset creates wear.
  for(const x of [-53.7,53.0])for(let z=-56;z<67;z+=2.15){
    const c=stoneRgb(rand,1.13);
    m.box([x,11.4,z],[x+.7,11.72,z+2.02],c);
  }
  for(const z of [-57.6,67.0])for(let x=-52.5;x<53;x+=2.15){
    const c=stoneRgb(rand,1.10);
    m.box([x,11.3,z],[x+2.02,11.63,z+.7],c);
  }

  // Masonry cladding on every real fighting-cover pillar. Cladding is
  // non-physical and never blocks dodges beyond the column's collider.
  for(const {x,z,h,r} of BOSS_WAY_COLUMNS) {
    for(const sign of [-1,1]) {
      bricks('x',x+sign*r,x-r,x+r,h,sign<0?-1:1);
      bricks('z',z+sign*r,x-r,x+r,h,sign<0?-1:1);
    }
    for(const [y,width,ht] of [[.11,r+.26,.27],[h-.28,r+.24,.31]]){
      const c=stoneRgb(rand,1.15);
      m.box([x-width,y,z-width],[x+width,y+ht,z+width],c);
    }
    // A few fragmented blocks on the ground make the cover read as a ruin,
    // without hiding huge untextured cubes on an open battle route.
    for(let i=0;i<3;i++){
      const angle=rand()*Math.PI*2,rr=r+(.4+rand()*1.15),sx=.35+rand()*.65;
      const px=x+Math.cos(angle)*rr,pz=z+Math.sin(angle)*rr;
      m.box([px,0.02,pz],[px+sx,.16+rand()*.19,pz+sx*.8],stoneRgb(rand,.85));
    }
  }
  for(const {x,z,w,d,h} of BOSS_WAY_RUINS){
    bricks('z',z-.02,x,x+w,h,1);
    bricks('z',z+d+.02,x,x+w,h,-1);
    bricks('x',x-.02,z,z+d,h,1);
    bricks('x',x+w+.02,z,z+d,h,-1);
    m.box([x-.10,h-.05,z-.1],[x+w+.10,h+.20,z+d+.1],stoneRgb(rand,1.15));
  }
  // Distinct paving stones show the player's staging ground, broken path and
  // altar beyond the Rancor; the centre fight area stays dirt and grass.
  const pave=(x0,z0,x1,z1,unit,top,skip=0)=>{
    for(let x=x0;x<x1;x+=unit)for(let z=z0;z<z1;z+=unit){
      if(rand()<skip)continue;
      const xend=Math.min(x1,x+unit-.10),zend=Math.min(z1,z+unit-.10);
      m.box([x+.045,top-.045,z+.04],[xend,top,zend],stoneRgb(rand,1.10));
    }
  };
  pave(-8.8,-48.5,8.8,-31.0,1.4,.055,.035);
  pave(-3.75,-30.5,3.75,-5.0,1.55,.055,.20);
  pave(-11.0,54.0,11.0,62.0,1.50,.23,.06);
  // Curving ring of fractured flagstones outside the boss' strike radius.
  for(let i=0;i<48;i++){
    const ang=(i/48)*Math.PI*2,rr=13.4+rand()*1.6;
    const x=Math.cos(ang)*rr,z=BOSS_WAY_ARENA.rancor[2]+Math.sin(ang)*rr;
    const w=.75+rand()*.7,h=.032+rand()*.025;
    m.box([x-w/2,.012,z-.62],[x+w/2,.012+h,z+.62],stoneRgb(rand,1.08));
  }
  // Small rubble beds around the outer edges (not the centre fighting lane).
  for(let i=0;i<95;i++){
    const side=rand()<.5?-1:1,x=side*(40+rand()*7.3),z=-51+rand()*111;
    if(BOSS_WAY_COLUMNS.some(p=>Math.hypot(x-p.x,z-p.z)<3.8))continue;
    const w=.4+rand()*.85,h=.07+rand()*.32;
    m.box([x,h*.05,z],[x+w,h,z+w*.76],stoneRgb(rand,.84));
  }
  return {stone:m.build()};
}
function onStructure(x,z) {
  if(Math.abs(x)>49||z<-53||z>63)return true;
  if(BOSS_WAY_COLUMNS.some(c=>Math.abs(x-c.x)<c.r+1.3&&Math.abs(z-c.z)<c.r+1.3))return true;
  if(BOSS_WAY_RUINS.some(c=>x>c.x-1.3&&x<c.x+c.w+1.3&&z>c.z-1.3&&z<c.z+c.d+1.3))return true;
  return false;
}
export function buildBossWayFoliage(models) {
  // Exactly the Training Garden's source models, groups and texture bindings.
  // Geometry is transformed and merged by texture, not one draw per plant.
  const rand=mulberry32(980127),batches=new Map(),placements=[];
  const add=(model,x,z,scale,angle)=>{
    const ca=Math.cos(angle),sa=Math.sin(angle),shade=.81+rand()*.19;
    for(const group of model.groups) {
      if(!batches.has(group.texture))batches.set(group.texture,{
        pos:[],nrm:[],col:[],uv:[],idx:[],
      });
      const out=batches.get(group.texture),base=out.pos.length/3;
      for(let i=0;i<group.pos.length;i+=3){
        const px=group.pos[i]*scale,pz=group.pos[i+2]*scale;
        const wx=x+px*ca+pz*sa,wz=z-px*sa+pz*ca;
        out.pos.push(wx,bossWayGroundHeight(wx,wz)-.005+group.pos[i+1]*scale,wz);
        const nx=group.nrm[i],nz=group.nrm[i+2],rx=(nx*ca+nz*sa)*.45;
        const rz=(-nx*sa+nz*ca)*.45,ry=.8+Math.abs(group.nrm[i+1])*.2;
        const nl=Math.hypot(rx,ry,rz);
        out.nrm.push(rx/nl,ry/nl,rz/nl);
        const root=smooth(0,.22,group.pos[i+1]);
        const tint=(.60+root*.40)*shade;
        out.col.push(Math.round(255*tint),Math.round(255*tint),Math.round(235*tint),255);
      }
      for(const uv of group.uv)out.uv.push(uv);
      for(const idx of group.idx)out.idx.push(base+idx);
    }
  };
  // More spacious arena needs less foliage density per square metre to stay
  // GPU-friendly. Every plant root follows the precise terrain height.
  for(let tries=0;tries<23000&&placements.length<4700;tries++){
    const x=-49+rand()*98,z=-53+rand()*116;
    if(onStructure(x,z))continue;
    const path=bossWayPavingDistance(x,z);
    if(path<.12)continue; // exposed stone and entrances stay clean
    const fromBoss=Math.hypot(x-BOSS_WAY_ARENA.rancor[0],z-BOSS_WAY_ARENA.rancor[2]);
    const patch=trainingGroundNoise(x*.17+31,z*.17-8);
    const density=smooth(.12,1.8,path)*smooth(.22,.79,patch)
      *(fromBoss<11?.13:1)*(.72+.28*smooth(12,34,Math.abs(x)));
    if(rand()>density)continue;
    const tuft=rand()<.76,scale=tuft?.20+rand()*.23:.30+rand()*.28;
    const model=tuft?models.tufts[rand()<.80?0:1]:
      models.grass[Math.floor(rand()*models.grass.length)];
    add(model,x,z,scale,rand()*Math.PI*2);
    placements.push({x,z,height:bossWayGroundHeight(x,z),scale});
  }
  for(let i=0;i<110;i++){
    const side=i%2?1:-1,x=side*(43+rand()*4),z=-50+rand()*110;
    if(onStructure(x,z))continue;
    add(models.ferns[i%models.ferns.length],x,z,.23+rand()*.23,rand()*Math.PI*2);
  }
  const meshes=Array.from(batches,([texture,b])=>({
    texture,
    mesh:{pos:new Float32Array(b.pos),nrm:new Float32Array(b.nrm),
      col:new Uint8Array(b.col),uv:new Float32Array(b.uv),idx:new Uint32Array(b.idx)},
  }));
  return {meshes,placements};
}
