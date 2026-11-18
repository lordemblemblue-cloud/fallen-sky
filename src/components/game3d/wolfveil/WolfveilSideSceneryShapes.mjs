// Light scenery for Wolfveil's four sides: one shape per kind, drawn hundreds
// of times as one instanced batch. Pure numbers (no renderer), so the shapes
// and where they stand can be tested without a browser.
//
// Every shape is built in "unit" space: the ground is y=0 and the piece is
// 1 tall, so a planted height in metres is simply the vertical scale. Trunks
// and bases reach below y=0 so nothing floats on a slope. Colours are baked
// per corner (linear RGB); each planted piece multiplies them by its own tint.
const TAU=Math.PI*2;
const toLinear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
/** 0xRRGGBB as the eye sees it -> linear RGB the renderer multiplies with. */
export const sceneryColor=hex=>[toLinear((hex>>16&255)/255),toLinear((hex>>8&255)/255),toLinear((hex&255)/255)];
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const shade=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
// The same 0..1 for the same two numbers, every time.
const hash=(a,b=0)=>{const s=Math.sin(a*127.1+b*311.7+1.3)*43758.5453;return s-Math.floor(s);};

function builder(){
  const position=[],color=[];
  const tri=(a,b,c,ca,cb=ca,cc=ca)=>{
    position.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);
    color.push(ca[0],ca[1],ca[2],cb[0],cb[1],cb[2],cc[0],cc[1],cc[2]);
  };
  // A tapered tube through rings {y,r,x,z,color}; open at both ends.
  const tube=(rings,sides,phase=0)=>{
    const at=(ring,k)=>{const a=phase+k*TAU/sides;
      return [(ring.x||0)+Math.cos(a)*ring.r,ring.y,(ring.z||0)+Math.sin(a)*ring.r];};
    for(let i=0;i<rings.length-1;i++){
      const low=rings[i],high=rings[i+1];
      for(let k=0;k<sides;k++){
        const next=(k+1)%sides; // the last side closes on the first exactly
        tri(at(low,k),at(high,k),at(low,next),low.color,high.color,low.color);
        tri(at(low,next),at(high,k),at(high,next),low.color,high.color,high.color);
      }
    }
  };
  const done=extra=>{
    let top=-Infinity,foot=Infinity,reach=0;
    for(let i=0;i<position.length;i+=3){
      top=Math.max(top,position[i+1]);foot=Math.min(foot,position[i+1]);
      reach=Math.max(reach,Math.hypot(position[i],position[i+2]));
    }
    return Object.freeze({position:Float32Array.from(position),color:Float32Array.from(color),
      triangles:position.length/9,top,foot,reach,...extra});
  };
  return {tri,tube,done};
}

// Twelve corners and twenty faces: the roundest shape twenty triangles make.
const ICO_CORNERS=(()=>{
  const t=(1+Math.sqrt(5))/2;
  return [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
    [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p=>{const l=Math.hypot(p[0],p[1],p[2]);return [p[0]/l,p[1]/l,p[2]/l];});
})();
const ICO_FACES=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const midpoint=(a,b)=>{const p=[a[0]+b[0],a[1]+b[1],a[2]+b[2]],l=Math.hypot(p[0],p[1],p[2]);return [p[0]/l,p[1]/l,p[2]/l];};
// Faces of a ball as triples of unit directions: 20, or 80 when split once.
function ballFaces(split){
  const faces=ICO_FACES.map(f=>f.map(i=>ICO_CORNERS[i]));
  if(!split)return faces;
  return faces.flatMap(([a,b,c])=>{
    const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]];
  });
}
// A corner shared by several faces must move the same way in each of them.
const cornerNoise=(v,salt)=>hash(Math.round(v[0]*40)+Math.round(v[1]*40)*31,Math.round(v[2]*40)+salt*7.3);

// Japanese cedar: a straight bare trunk with a root flare, then four tiers
// of drooping boughs. Walk under it and look up into the tiers.
function cedar(){
  const b=builder();
  const bark=sceneryColor(0x5b4433),root=sceneryColor(0x3b2d23);
  b.tube([{y:-.05,r:.052,color:root},{y:.05,r:.034,color:bark},{y:.94,r:.007,color:shade(bark,.8)}],6,.3);
  const deep=sceneryColor(0x21412b),leaf=sceneryColor(0x2f5f3c),tip=sceneryColor(0x4a8350);
  const tiers=[[.60,.33,.205],[.75,.49,.170],[.89,.65,.126],[1,.80,.078]];
  tiers.forEach(([top,foot,radius],t)=>{
    const sides=7,light=.86+t*.06; // higher boughs catch more light
    const apex=[0,top,0];
    const mid=k=>{const a=t*.9+k*TAU/sides,r=radius*(.46+.1*hash(k,t+1));
      return [Math.cos(a)*r,top-(top-foot)*(.4+.08*hash(k+9,t)),Math.sin(a)*r];};
    const rim=k=>{const a=t*.9+(k+.5)*TAU/sides,r=radius*(.84+.3*hash(k+3,t+5));
      return [Math.cos(a)*r,foot-radius*.22*hash(k+7,t+2),Math.sin(a)*r];};
    const dark=shade(deep,light),green=shade(leaf,light),bright=shade(tip,light);
    for(let k=0;k<sides;k++){
      const m0=mid(k),m1=mid((k+1)%sides),r0=rim(k),r1=rim((k+1)%sides);
      b.tri(apex,m0,m1,dark,green,green);
      b.tri(m0,r0,m1,green,bright,green);
      b.tri(m1,r0,r1,green,bright,bright);
    }
  });
  return b.done({doubleSided:true});
}

// Pine: a shorter, broader conifer with three open tiers and a leaning top.
function pine(){
  const b=builder();
  const bark=sceneryColor(0x5a4a3c),root=sceneryColor(0x3a3028);
  b.tube([{y:-.07,r:.06,color:root},{y:.06,r:.04,color:bark},{y:.9,r:.01,x:.02,color:shade(bark,.8)}],6,.7);
  const deep=sceneryColor(0x263f2c),leaf=sceneryColor(0x36603f),tip=sceneryColor(0x55864f);
  const tiers=[[.62,.36,.30],[.82,.56,.23],[1,.76,.15]];
  tiers.forEach(([top,foot,radius],t)=>{
    const sides=6,light=.84+t*.08,lean=.02*t/2;
    const apex=[lean,top,0];
    const mid=k=>{const a=t*1.3+k*TAU/sides,r=radius*(.42+.12*hash(k+2,t+3));
      return [lean+Math.cos(a)*r,top-(top-foot)*(.42+.1*hash(k+5,t)),Math.sin(a)*r];};
    const rim=k=>{const a=t*1.3+(k+.5)*TAU/sides,r=radius*(.78+.38*hash(k+1,t+8));
      return [lean+Math.cos(a)*r,foot-radius*.16*hash(k+4,t+6),Math.sin(a)*r];};
    const dark=shade(deep,light),green=shade(leaf,light),bright=shade(tip,light);
    for(let k=0;k<sides;k++){
      const m0=mid(k),m1=mid((k+1)%sides),r0=rim(k),r1=rim((k+1)%sides);
      b.tri(apex,m0,m1,dark,green,green);
      b.tri(m0,r0,m1,green,bright,green);
      b.tri(m1,r0,r1,green,bright,bright);
    }
  });
  return b.done({doubleSided:true});
}

// Maple: a short leaning trunk under three rounded crowns.
function maple(){
  const b=builder();
  const bark=sceneryColor(0x54463a),root=sceneryColor(0x372d26);
  b.tube([{y:-.06,r:.05,color:root},{y:.08,r:.034,color:bark},{y:.56,r:.02,x:.03,z:.01,color:bark}],5,.2);
  const low=sceneryColor(0x355c30),high=sceneryColor(0x6c9c4e);
  const crowns=[[[.03,.76,.01],[.33,.25,.33],1],[[.24,.62,.12],[.24,.18,.24],2],[[-.2,.65,-.11],[.26,.19,.26],3]];
  for(const [centre,size,salt] of crowns)for(const face of ballFaces(false)){
    const corner=v=>{const k=.86+.28*cornerNoise(v,salt);
      return [centre[0]+v[0]*size[0]*k,centre[1]+v[1]*size[1]*k,centre[2]+v[2]*size[2]*k];};
    const tone=v=>mix(low,high,Math.max(0,Math.min(1,(v[1]+1)/2)));
    b.tri(corner(face[0]),corner(face[1]),corner(face[2]),tone(face[0]),tone(face[1]),tone(face[2]));
  }
  return b.done({doubleSided:true});
}

// Bamboo: three leaning canes with drooping leaf sprays near the top.
function bamboo(){
  const b=builder();
  const base=sceneryColor(0x5d7a39),cane=sceneryColor(0x8ba650);
  const leaf=sceneryColor(0x5a8a3b),leafTip=sceneryColor(0x8cb85a);
  for(let c=0;c<3;c++){
    const a=c*TAU/3+.4,dx=Math.cos(a),dz=Math.sin(a),tall=[1,.84,.92][c];
    const footX=dx*.04,footZ=dz*.04,lean=.05+.03*c;
    const along=t=>[footX+dx*lean*t*t,-.03+(tall+.03)*t,footZ+dz*lean*t*t];
    const midAt=along(.5),topAt=along(1);
    b.tube([{y:-.03,r:.012,x:footX,z:footZ,color:base},{y:midAt[1],r:.01,x:midAt[0],z:midAt[2],color:cane},
      {y:topAt[1],r:.005,x:topAt[0],z:topAt[2],color:cane}],4,a);
    for(let s=0;s<3;s++){
      const from=along(.58+s*.17),turn=a+1.1+s*2.1,lx=Math.cos(turn),lz=Math.sin(turn);
      const reach=.17-.02*s,px=-lz,pz=lx;
      const tip=[from[0]+lx*reach,from[1]-.06,from[2]+lz*reach];
      const left=[from[0]+lx*reach*.5+px*.045,from[1]+.015,from[2]+lz*reach*.5+pz*.045];
      const right=[from[0]+lx*reach*.5-px*.045,from[1]+.015,from[2]+lz*reach*.5-pz*.045];
      b.tri(from,left,right,leaf,leaf,leaf);
      b.tri(left,tip,right,leaf,leafTip,leaf);
    }
  }
  return b.done({doubleSided:true});
}

// Fern: seven arching fronds around four upright ones.
function shrub(){
  const b=builder();
  const root=sceneryColor(0x2c5329),green=sceneryColor(0x47793a),tip=sceneryColor(0x73a44d);
  const frond=(a,reach,rise,droop,width)=>{
    const dx=Math.cos(a),dz=Math.sin(a),px=-dz,pz=dx;
    const from=[dx*.04,-.04,dz*.04],end=[dx*reach,droop,dz*reach];
    const left=[dx*reach*.55+px*width,rise,dz*reach*.55+pz*width];
    const right=[dx*reach*.55-px*width,rise,dz*reach*.55-pz*width];
    b.tri(from,left,right,root,green,green);
    b.tri(left,end,right,green,tip,green);
  };
  for(let k=0;k<7;k++)frond(k*TAU/7+.2*hash(k,3),.78+.2*hash(k,5),.72+.2*hash(k,7),.3+.2*hash(k,9),.17);
  for(let k=0;k<4;k++)frond(k*TAU/4+.6,.34+.1*hash(k,11),.8+.15*hash(k,13),1,.1);
  return b.done({doubleSided:true});
}

// A drift of six small flowers: thin stems, a leaf, an open cup of petals.
function flowers(){
  const b=builder();
  const stem=sceneryColor(0x4f7d3a),stemDark=sceneryColor(0x35592b);
  const petals=[0xf3efe4,0xbba8de,0xf3efe4,0xe7ca5c,0xbba8de,0xf3efe4].map(sceneryColor);
  const heart=sceneryColor(0xd9a93a);
  for(let f=0;f<6;f++){
    const a=f*TAU/6+.5*hash(f,1),r=.25+.6*hash(f,2),x=Math.cos(a)*r,z=Math.sin(a)*r;
    const tall=.72+.28*hash(f,3),turn=a+1.3,sx=Math.cos(turn)*.035,sz=Math.sin(turn)*.035;
    const head=[x+.04*Math.cos(a),tall,z+.04*Math.sin(a)];
    b.tri([x-sx,-.05,z-sz],[x+sx,-.05,z+sz],head,stemDark,stemDark,stem);
    b.tri([x,tall*.3,z],[x+sx*5,tall*.5,z+sz*5],[x+sx*3,tall*.28,z+sz*3],stemDark,stem,stem);
    const cup=k=>{const p=turn+k*TAU/4;return [head[0]+Math.cos(p)*.1,tall+.06,head[2]+Math.sin(p)*.1];};
    for(let k=0;k<4;k++)b.tri(head,cup(k),cup((k+1)%4),heart,petals[f],petals[f]);
  }
  return b.done({doubleSided:true});
}

// Boulder: eighty facets, lumpy, flat underneath, moss where rain collects.
function boulder(){
  const b=builder();
  const stone=sceneryColor(0x7d7b70),dark=sceneryColor(0x57564f),moss=sceneryColor(0x566a41);
  const corner=v=>{const k=.8+.38*cornerNoise(v,5);return [v[0]*k,Math.max(-.3,v[1]*k*.84),v[2]*k];};
  const tone=v=>{
    const grey=mix(dark,stone,Math.max(0,Math.min(1,(v[1]+.6)/1.2)));
    return mix(shade(grey,.88+.2*cornerNoise(v,9)),moss,Math.max(0,v[1])*.5*cornerNoise(v,13));
  };
  for(const face of ballFaces(true))
    b.tri(corner(face[0]),corner(face[1]),corner(face[2]),tone(face[0]),tone(face[1]),tone(face[2]));
  return b.done({doubleSided:false});
}

const MAKERS={cedar,pine,maple,bamboo,shrub,flowers,boulder};
const made=new Map();
export const WOLFVEIL_SIDE_SCENERY_KINDS=Object.freeze(Object.keys(MAKERS));
/** What each kind is called in the scene ("SWV_<side>_<label>"). */
export const WOLFVEIL_SIDE_SCENERY_LABELS=Object.freeze({cedar:'Cedars',pine:'Pines',maple:'Maples',
  bamboo:'Bamboo',shrub:'Ferns',flowers:'Flowers',boulder:'Boulders'});
/**
 * The shape of one kind: {position, color, triangles, top, foot, reach,
 * doubleSided}. `position` and `color` hold three corners per triangle.
 */
export function wolfveilSideSceneryShape(kind){
  if(!MAKERS[kind])throw new RangeError('Unknown Wolfveil scenery kind: '+kind);
  if(!made.has(kind))made.set(kind,MAKERS[kind]());
  return made.get(kind);
}

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
/**
 * Where and how each planted piece stands on the drawn ground.
 * @param placements the plan's list ({kind,x,z,height,yaw})
 * @param heightAt the visible ground: (x,z) -> metres
 * @returns {Record<string,Array<{x,y,z,sx,sy,sz,yaw,tiltX,tiltZ,tint:number[]}>>}
 */
export function wolfveilSideSceneryInstances(placements,{heightAt}){
  const kinds={};
  for(const item of placements){
    if(!MAKERS[item.kind])continue;
    const ground=heightAt(item.x,item.z);
    if(!Number.isFinite(ground))continue;
    const h1=hash(item.x,item.z),h2=hash(item.z+11.3,item.x-4.7),h3=hash(item.x*.37+5,item.z*.53-9);
    const tall=item.height;
    let sx=tall,sz=tall,y=ground,tiltX=0,tiltZ=0,tint=[1,1,1];
    if(item.kind==='cedar'||item.kind==='pine'){
      sx=sz=tall*(.9+.3*h1);tiltX=(h2-.5)*.06;tiltZ=(h3-.5)*.06;
      const light=.84+.26*h2;tint=[light*(1+.07*(h3-.5)),light,light*(1-.09*(h3-.5))];
    }else if(item.kind==='maple'){
      sx=sz=tall*(.95+.25*h1);tiltX=(h2-.5)*.1;tiltZ=(h3-.5)*.1;
      const light=.88+.22*h2;tint=[light*(1+.12*h3),light,light*(1-.1*h3)];
    }else if(item.kind==='bamboo'){
      sx=sz=tall*(.9+.3*h1);tiltX=(h2-.5)*.08;tiltZ=(h3-.5)*.08;
      const light=.9+.2*h2;tint=[light,light,light*(.94+.06*h3)];
    }else if(item.kind==='shrub'){
      sx=sz=tall*(.9+.4*h1);y=ground-.02;
      const light=.8+.34*h2;tint=[light*(1+.08*h3),light,light];
    }else if(item.kind==='flowers'){
      sx=sz=.7+.5*h1;
      tint=[.92+.08*h2,.9+.1*h3,.92+.08*h1];
    }else if(item.kind==='boulder'){
      sx=tall*(1+.6*h1);sz=tall*(.9+.5*h3);tiltX=(h2-.5)*.3;tiltZ=(h1-.5)*.3;
      // Bed it: deeper on a slope, so the downhill edge never hangs in the air.
      const slope=Math.hypot(heightAt(item.x+1,item.z)-heightAt(item.x-1,item.z),
        heightAt(item.x,item.z+1)-heightAt(item.x,item.z-1))/2;
      const hang=Number.isFinite(slope)?Math.max(sx,sz)*slope-.3*tall:0;
      y=ground-.05*tall-clamp(hang,0,.45*tall);
      const light=.8+.3*h2;tint=[light*(1+.04*h3),light,light*(1-.05*h3)];
    }
    (kinds[item.kind]||(kinds[item.kind]=[])).push({x:item.x,y,z:item.z,sx,sy:tall,sz,
      yaw:item.yaw,tiltX,tiltZ,tint});
  }
  return kinds;
}
