// Forest-floor forms for Game 1/Game 3D. A few material batches instead of
// a separate Three.js Mesh per stone, fern, log, flower or mushroom.
// Shape variation is physical geometry, not a flat decal on the ground.
import {ForestMeshWriter} from './forestBiomeMeshes.js';
import {
  seededRandom,game1ForestHeight,game1ForestTrees,
  GAME1_FOREST_CLEARINGS,forestTrailDistance,forestStreamDistance,
  game1ForestTrailVergePoint,
} from './forestBiomeData.js';

const TAU=Math.PI*2;
const pt=(x,y,z)=>[x,y,z];
const mul=(c,k)=>c.map(v=>Math.max(0,Math.min(1,v*k)));
const clear=(x,z,margin=0)=>!GAME1_FOREST_CLEARINGS.some(c=>
  Math.hypot(x-c.x,z-c.z)<c.r+margin);
function fern(geo,x,z,rand){
  const base=game1ForestHeight(x,z),height=.26+rand()*.48;
  const green=rand()<.72?[.26,.48,.24]:[.34,.53,.28];
  for(let fr=0;fr<5;fr++){
    const angle=fr/5*TAU+rand()*.18,dx=Math.cos(angle),dz=Math.sin(angle);
    const sx=-dz,sz=dx,spread=.20+rand()*.24;
    for(let i=0;i<5;i++){
      const t=i/5,tNext=(i+1)/5;
      const a=pt(x+dx*spread*t,base+height*t*.87,z+dz*spread*t);
      const next=pt(x+dx*spread*tNext,base+height*tNext*.87,z+dz*spread*tNext);
      const width=(1-t)*(.11+rand()*.035);
      const left=pt(a[0]+sx*width,a[1]-.045,a[2]+sz*width);
      const right=pt(a[0]-sx*width,a[1]-.045,a[2]-sz*width);
      const tint=mul(green,.78+rand()*.30);
      geo.tri(a,left,next,tint,[t,t+.13,tNext]);
      geo.tri(a,next,right,mul(tint,.85),[t,tNext,t+.13]);
    }
  }
}
function stone(geo,x,z,r,rand){
  const base=game1ForestHeight(x,z),sides=8;
  const root=[],ridge=[];
  for(let k=0;k<sides;k++){
    const a=k/sides*TAU,stretch=.76+rand()*.50;
    root.push(pt(x+Math.cos(a)*r*stretch,base-.04,z+Math.sin(a)*r*stretch));
    ridge.push(pt(x+Math.cos(a)*r*.58*stretch,base+r*(.45+.32*rand()),
      z+Math.sin(a)*r*.58*stretch));
  }
  const height=base+r*(.58+.34*rand());
  const moss=rand()<.55;
  for(let k=0;k<sides;k++){
    const n=(k+1)%sides,c=mul(moss?[.33,.46,.32]:[.42,.44,.39],.78+rand()*.42);
    geo.quad(root[k],root[n],ridge[n],ridge[k],c);
    geo.tri(ridge[k],ridge[n],pt(x,height,z),
      mul(moss?[.26,.43,.25]:[.50,.49,.41],.77+rand()*.38));
  }
}
function mushroom(geo,x,z,rand){
  const base=game1ForestHeight(x,z),h=.12+rand()*.24,r=.08+rand()*.075;
  const pale=[.66,.62,.48],cap=rand()<.5?[.43,.33,.25]:[.48,.43,.27];
  for(let k=0;k<6;k++){
    const a=k/6*TAU,b=(k+1)/6*TAU;
    const stalk=c=>pt(x+Math.cos(c)*.025,base,z+Math.sin(c)*.025);
    const top=c=>pt(x+Math.cos(c)*.019,base+h,z+Math.sin(c)*.019);
    geo.quad(stalk(a),stalk(b),top(b),top(a),pale);
    geo.tri(top(a),top(b),pt(x,base+h+r*.66,z),cap);
    geo.tri(pt(x+Math.cos(a)*r,base+h-.02,z+Math.sin(a)*r),
      pt(x+Math.cos(b)*r,base+h-.02,z+Math.sin(b)*r),
      pt(x,base+h+r*.66,z),mul(cap,1.11));
  }
}
function fallenLog(geo,site,rand){
  const {x,z,len,r,angle}=site;
  const dx=Math.cos(angle),dz=Math.sin(angle),nx=-dz,nz=dx;
  const ax=x-dx*len*.5,az=z-dz*len*.5,bx=x+dx*len*.5,bz=z+dz*len*.5;
  const y0=game1ForestHeight(ax,az)+r*.77,y1=game1ForestHeight(bx,bz)+r*.77;
  const bark=[.38,.26,.17],sides=10;
  const slice=(end,i,phase=0)=>{
    const a=i/sides*TAU,cy=end?y1:y0,cx=end?bx:ax,cz=end?bz:az;
    const rr=r*(end?.89:1)+.025*Math.sin(a*6+phase);
    return pt(cx+nx*Math.cos(a)*rr,cy+Math.sin(a)*rr,cz+nz*Math.cos(a)*rr);
  };
  for(let i=0;i<sides;i++){
    const c=mul(bark,.54+.46*rand());
    geo.quad(slice(false,i),slice(false,(i+1)%sides),
      slice(true,(i+1)%sides),slice(true,i),c,
      [0,0,0,0],[[0,0],[.25,0],[.25,len],[0,len]]);
    geo.tri(pt(ax,y0,az),slice(false,(i+1)%sides),slice(false,i),[.52,.38,.23]);
    geo.tri(pt(bx,y1,bz),slice(true,i),slice(true,(i+1)%sides),[.49,.36,.23]);
  }
}
function leaf(geo,x,z,r,angle,color){
  const base=game1ForestHeight(x,z)+.025,dx=Math.cos(angle),dz=Math.sin(angle);
  const sx=-dz,sz=dx;
  const root=pt(x,base,z),mid=pt(x+dx*r*.50,base+.018,z+dz*r*.50);
  const tip=pt(x+dx*r,base+.008,z+dz*r);
  const left=pt(mid[0]+sx*r*.24,mid[1],mid[2]+sz*r*.24);
  const right=pt(mid[0]-sx*r*.24,mid[1],mid[2]-sz*r*.24);
  geo.quad(root,left,tip,right,color);
}
export function buildGame1ForestDressing(trees=game1ForestTrees()){
  const ground=new ForestMeshWriter(),understory=new ForestMeshWriter(),rand=seededRandom(0x20f1cd);
  const logs=[];let rocks=0,ferns=0,leaves=0,mushrooms=0;
  const nearTrunk=(x,z,margin=.4)=>trees.some(t=>Math.abs(t.x-x)<3+margin&&
    Math.abs(t.z-z)<3+margin&&Math.hypot(t.x-x,t.z-z)<t.radius+margin);
  const nearTreeFloor=()=>{
    const t=trees[Math.floor(rand()*trees.length)],a=rand()*TAU;
    const r=t.radius+.9+rand()*4.5;
    return [t.x+Math.cos(a)*r,t.z+Math.sin(a)*r];
  };
  const logClipsTree=(site)=>trees.some(t=>{
    if(Math.hypot(t.x-site.x,t.z-site.z)>site.len*.5+t.radius+site.r+.3)return false;
    const dx=Math.cos(site.angle),dz=Math.sin(site.angle);
    const ux=t.x-site.x,uz=t.z-site.z;
    const along=Math.max(-site.len*.5,Math.min(site.len*.5,ux*dx+uz*dz));
    return Math.hypot(ux-dx*along,uz-dz*along)<t.radius+site.r+.3;
  });
  for(let tries=0;tries<1300&&logs.length<26;tries++){
    const x=(rand()-.5)*215,z=(rand()-.5)*215;
    if(forestStreamDistance(x,z)<8.5||forestTrailDistance(x,z)<4.8||!clear(x,z,3))continue;
    if(Math.hypot(x,z)>108)continue;
    const site={x,z,len:1.6+rand()*3,r:.25+rand()*.18,angle:rand()*TAU};
    if(logClipsTree(site)||logs.some(p=>Math.hypot(p.x-x,p.z-z)<p.len+site.len))continue;
    logs.push(site);fallenLog(ground,site,rand);
  }
  for(let i=0;i<270;i++){
    // Natural verge stones live amongst grass rather than only in unrelated
    // forest-floor positions; collision-safe quest clearings stay unobstructed.
    const verge=rand()<.52;
    const location=verge
      ?game1ForestTrailVergePoint(rand(),rand()<.5?-1:1,2+rand()*3.6)
      :{x:(rand()-.5)*225,z:(rand()-.5)*225};
    const {x,z}=location;
    if(!clear(x,z,3)||Math.hypot(x,z)>112||forestStreamDistance(x,z)<4.8)continue;
    if(forestTrailDistance(x,z)<1.5||nearTrunk(x,z,.45))continue;
    stone(ground,x,z,.16+rand()*.72,rand);rocks++;
  }
  for(let i=0;i<880;i++){
    const [x,z]=rand()<.68?nearTreeFloor():[(rand()-.5)*210,(rand()-.5)*210];
    if(!clear(x,z,2)||Math.hypot(x,z)>109||forestStreamDistance(x,z)<4.6||nearTrunk(x,z,.35))continue;
    fern(understory,x,z,rand);ferns++;
  }
  for(let i=0;i<1380;i++){
    const [x,z]=rand()<.62?nearTreeFloor():[(rand()-.5)*210,(rand()-.5)*210];
    if(!clear(x,z,1)||forestStreamDistance(x,z)<4.4||nearTrunk(x,z,.22))continue;
    const c=rand()<.48?[.43,.32,.18]:rand()<.8?[.42,.53,.24]:[.69,.46,.21];
    leaf(ground,x,z,.09+rand()*.22,rand()*TAU,c);leaves++;
  }
  for(let i=0;i<160;i++){
    const [x,z]=rand()<.68?nearTreeFloor():[(rand()-.5)*208,(rand()-.5)*208];
    if(!clear(x,z,2)||forestStreamDistance(x,z)<5||nearTrunk(x,z,.3))continue;
    mushroom(ground,x,z,rand);mushrooms++;
  }
  return {ground:ground.geometry(),understory:understory.geometry(),logs,
    counts:{fallenLogs:logs.length,rocks,ferns,leaves,mushrooms}};
}
