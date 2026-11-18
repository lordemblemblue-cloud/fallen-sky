#!/usr/bin/env node
/* global process, Buffer, console */
// Study pictures of Wolfveil's planted sides, drawn in plain Node: no browser
// and no graphics card. They use the real ground, the real planting plan and
// the real scenery shapes, lit with the game's sun and sky light.
//
// They are for judging layout and shapes before a play test. The game's own
// renderer adds the grass, the textures and the owner's models; here the
// owner's own trees are shown as pale stand-ins and a red figure 1.8 m tall
// gives the scale.
//
// Usage: node scripts/render-wolfveil-planted-sides.mjs [--out dir]
//          [--sides west,north] [--size 1280x720]
// A side that is not built yet is drawn straight from the plan.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {wolfveilHeight,wolfveilDistanceToRiver,wolfveilRouteClearance,WOLFVEIL_RIVER,WOLFVEIL_ROUTES}
  from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {isVortexLakeWetSurface} from '../src/components/game3d/wolfveil/VortexLakeLayout.mjs';
import {wolfveilLandscapeSurface} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {createWolfveilTerrainSurfaceSampler} from '../src/components/game3d/wolfveil/WolfveilTerrainSurfaceSampler.mjs';
import {WOLFVEIL_SIDE_IDS,WOLFVEIL_SIDE_THEMES,planWolfveilSidePlanting}
  from '../src/components/game3d/wolfveil/WolfveilFourSidesPlan.mjs';
import {wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_PLANTED_SIDES} from '../src/components/game3d/wolfveil/WolfveilTrunkColliders.mjs';
import {wolfveilSideSceneryShape,wolfveilSideSceneryInstances,sceneryColor}
  from '../src/components/game3d/wolfveil/WolfveilSideSceneryShapes.mjs';
import {wolfveilTreePlacements} from '../src/components/game3d/wolfveil/WolfveilForestLayout.js';

const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const OUT=path.resolve(option('out','wolfveil-planted-sides'));
const SIDES=option('sides',WOLFVEIL_PLANTED_SIDES.join(',')).split(',').filter(side=>WOLFVEIL_SIDE_IDS.includes(side));
const [WIDTH,HEIGHT]=option('size','1280x720').split('x').map(Number);
const SCALE=2; // every picture pixel is the average of 2x2 samples

// ---- light: the game's own sun and sky (GameWorld3D.jsx) -------------------
const normalize=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const SUN_DIRECTION=normalize([20,30,10]);
const SUN=sceneryColor(0xfff4d6).map(c=>c*2.2/Math.PI);
const SKY_LIGHT=sceneryColor(0xcfe4ff).map(c=>c/Math.PI);
const GROUND_LIGHT=sceneryColor(0x4a3a2a).map(c=>c/Math.PI);
const EXPOSURE=1.1/.6;
const HAZE=sceneryColor(0xc4d6e6),ZENITH=sceneryColor(0x6f9fd6);
const toSrgb=c=>c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055;
const filmic=x=>Math.max(0,Math.min(1,(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14)));

// ---- a small depth-buffered triangle painter -------------------------------
function createPainter({eye,target,fov=60,hazeFrom=260,hazeTo=1500}){
  const W=WIDTH*SCALE,H=HEIGHT*SCALE;
  const color=new Float32Array(W*H*3),depth=new Float32Array(W*H);
  const forward=normalize([target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]]);
  const right=normalize([forward[1]*0-forward[2]*1,forward[2]*0-forward[0]*0,forward[0]*1-forward[1]*0]);
  const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],
    right[0]*forward[1]-right[1]*forward[0]];
  const tan=Math.tan(fov*Math.PI/360),aspect=W/H,NEAR=.4;
  // Sky: haze at the horizon, blue above.
  for(let y=0;y<H;y++){
    const pitch=forward[1]+up[1]*(1-2*(y+.5)/H)*tan;
    const t=Math.max(0,Math.min(1,pitch*2.4));
    for(let x=0;x<W;x++){
      const i=(y*W+x)*3;
      color[i]=HAZE[0]+(ZENITH[0]-HAZE[0])*t;color[i+1]=HAZE[1]+(ZENITH[1]-HAZE[1])*t;
      color[i+2]=HAZE[2]+(ZENITH[2]-HAZE[2])*t;
    }
  }
  const view=p=>{const x=p[0]-eye[0],y=p[1]-eye[1],z=p[2]-eye[2];
    return [x*right[0]+y*right[1]+z*right[2],x*up[0]+y*up[1]+z*up[2],x*forward[0]+y*forward[1]+z*forward[2]];};
  function fill(a,b,c,ca,cb,cc,light){
    // Screen positions; 1/depth and colour/depth are straight lines on screen.
    const ax=(a[0]/(a[2]*tan*aspect)*.5+.5)*W,ay=(.5-a[1]/(a[2]*tan)*.5)*H;
    const bx=(b[0]/(b[2]*tan*aspect)*.5+.5)*W,by=(.5-b[1]/(b[2]*tan)*.5)*H;
    const cx=(c[0]/(c[2]*tan*aspect)*.5+.5)*W,cy=(.5-c[1]/(c[2]*tan)*.5)*H;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<1e-9)return;
    const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx)));
    const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(H-1,Math.ceil(Math.max(ay,by,cy)));
    if(minX>maxX||minY>maxY)return;
    const ia=1/a[2],ib=1/b[2],ic=1/c[2];
    for(let y=minY;y<=maxY;y++){
      const py=y+.5;
      for(let x=minX;x<=maxX;x++){
        const px=x+.5;
        const w0=((bx-px)*(cy-py)-(by-py)*(cx-px))/area;
        const w1=((cx-px)*(ay-py)-(cy-py)*(ax-px))/area;
        const w2=1-w0-w1;
        if(w0<0||w1<0||w2<0)continue;
        const inverse=w0*ia+w1*ib+w2*ic,at=y*W+x;
        if(inverse<=depth[at])continue;
        depth[at]=inverse;
        const k0=w0*ia/inverse,k1=w1*ib/inverse,k2=1-k0-k1;
        const far=1/inverse,haze=Math.max(0,Math.min(1,(far-hazeFrom)/(hazeTo-hazeFrom)))*.92;
        for(let n=0;n<3;n++){
          const lit=(ca[n]*k0+cb[n]*k1+cc[n]*k2)*light[n];
          color[at*3+n]=lit+(HAZE[n]-lit)*haze;
        }
      }
    }
  }
  /** One triangle in the world, with a colour at each corner. */
  function triangle(pa,pb,pc,ca,cb,cc){
    let normal=normalize([(pb[1]-pa[1])*(pc[2]-pa[2])-(pb[2]-pa[2])*(pc[1]-pa[1]),
      (pb[2]-pa[2])*(pc[0]-pa[0])-(pb[0]-pa[0])*(pc[2]-pa[2]),
      (pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0])]);
    // Lit from whichever face is seen, as the game's flat shading does.
    if(normal[0]*(eye[0]-pa[0])+normal[1]*(eye[1]-pa[1])+normal[2]*(eye[2]-pa[2])<0)
      normal=[-normal[0],-normal[1],-normal[2]];
    const sun=Math.max(0,normal[0]*SUN_DIRECTION[0]+normal[1]*SUN_DIRECTION[1]+normal[2]*SUN_DIRECTION[2]);
    const sky=normal[1]*.5+.5;
    const light=[0,1,2].map(n=>SUN[n]*sun+GROUND_LIGHT[n]+(SKY_LIGHT[n]-GROUND_LIGHT[n])*sky);
    const corners=[[view(pa),ca],[view(pb),cb],[view(pc),cc]];
    if(corners.every(corner=>corner[0][2]<NEAR))return;
    // Cut away whatever is behind the eye.
    const kept=[];
    for(let i=0;i<3;i++){
      const from=corners[i],to=corners[(i+1)%3];
      if(from[0][2]>=NEAR)kept.push(from);
      if((from[0][2]>=NEAR)!==(to[0][2]>=NEAR)){
        const t=(NEAR-from[0][2])/(to[0][2]-from[0][2]);
        kept.push([from[0].map((value,n)=>value+(to[0][n]-value)*t),from[1].map((value,n)=>value+(to[1][n]-value)*t)]);
      }
    }
    for(let i=1;i<kept.length-1;i++)fill(kept[0][0],kept[i][0],kept[i+1][0],kept[0][1],kept[i][1],kept[i+1][1],light);
  }
  function png(){
    const raw=Buffer.alloc((WIDTH*3+1)*HEIGHT);
    for(let y=0;y<HEIGHT;y++){
      raw[y*(WIDTH*3+1)]=0;
      for(let x=0;x<WIDTH;x++)for(let n=0;n<3;n++){
        let sum=0;
        for(let sy=0;sy<SCALE;sy++)for(let sx=0;sx<SCALE;sx++)sum+=color[((y*SCALE+sy)*W+x*SCALE+sx)*3+n];
        raw[y*(WIDTH*3+1)+1+x*3+n]=Math.round(255*toSrgb(filmic(sum/(SCALE*SCALE)*EXPOSURE)));
      }
    }
    return encodePng(raw);
  }
  return {triangle,png};
}

// ---- PNG (8-bit RGB, no filter) --------------------------------------------
const CRC=(()=>{const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  return table;})();
function chunk(type,data){
  const body=Buffer.concat([Buffer.from(type,'ascii'),data]);
  let c=0xffffffff;for(const byte of body)c=CRC[(c^byte)&255]^(c>>>8);
  const length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);crc.writeUInt32BE((c^0xffffffff)>>>0);
  return Buffer.concat([length,body,crc]);
}
function encodePng(raw){
  const header=Buffer.alloc(13);
  header.writeUInt32BE(WIDTH,0);header.writeUInt32BE(HEIGHT,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

// ---- the valley: ground, planted pieces, the owner's trees ------------------
const ground=createWolfveilTerrainSurfaceSampler();
const SPAN=1100,SEGMENTS=310,STEP=SPAN/SEGMENTS,HALF=SPAN/2;
function groundTriangles(){
  const colours=new Map();
  const point=(ix,iz)=>{const x=ix*STEP-HALF,z=iz*STEP-HALF;return [x,wolfveilHeight(x,z),z];};
  const colour=(ix,iz)=>{
    const key=iz*(SEGMENTS+1)+ix;
    if(!colours.has(key)){
      const [x,h,z]=point(ix,iz),e=1.6;
      const slope=Math.hypot(wolfveilHeight(x+e,z)-wolfveilHeight(x-e,z),wolfveilHeight(x,z+e)-wolfveilHeight(x,z-e))/(2*e);
      const river=wolfveilDistanceToRiver(x,z);
      colours.set(key,river<WOLFVEIL_RIVER.width*.5-.5||isVortexLakeWetSurface(x,z,0)
        ?[.035,.12,.17]
        :wolfveilLandscapeSurface(x,z,h,slope,{riverDistance:river,routeClearance:wolfveilRouteClearance(x,z),
            west:Math.max(0,Math.min(1,(-x-90)/260))}).color);
    }
    return colours.get(key);
  };
  const list=[];
  // The same two triangles a square as the game's ground mesh.
  for(let iz=0;iz<SEGMENTS;iz++)for(let ix=0;ix<SEGMENTS;ix++){
    list.push([point(ix,iz),point(ix,iz+1),point(ix+1,iz),colour(ix,iz),colour(ix,iz+1),colour(ix+1,iz)]);
    list.push([point(ix,iz+1),point(ix+1,iz+1),point(ix+1,iz),colour(ix,iz+1),colour(ix+1,iz+1),colour(ix+1,iz)]);
  }
  return list;
}
// Rotation in the order the game applies it (tilt, turn, tilt), then scale.
function placed(shape,item,list){
  const a=Math.cos(item.tiltX),b=Math.sin(item.tiltX),c=Math.cos(item.yaw),d=Math.sin(item.yaw);
  const e=Math.cos(item.tiltZ),f=Math.sin(item.tiltZ);
  const m=[c*e,-c*f,d,a*f+b*e*d,a*e-b*f*d,-b*c,b*f-a*e*d,b*e+a*f*d,a*c];
  const corner=i=>{const x=shape.position[i]*item.sx,y=shape.position[i+1]*item.sy,z=shape.position[i+2]*item.sz;
    return [item.x+m[0]*x+m[1]*y+m[2]*z,item.y+m[3]*x+m[4]*y+m[5]*z,item.z+m[6]*x+m[7]*y+m[8]*z];};
  const tone=item.plain?()=>item.plain
    :i=>[shape.color[i]*item.tint[0],shape.color[i+1]*item.tint[1],shape.color[i+2]*item.tint[2]];
  for(let i=0;i<shape.position.length;i+=9)
    list.push([corner(i),corner(i+3),corner(i+6),tone(i),tone(i+3),tone(i+6)]);
}
function box(list,[x,y,z],[w,h,d],colour){
  const p=(i,j,k)=>[x+(i-.5)*w,y+j*h,z+(k-.5)*d];
  const faces=[[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    [[1,0,0],[1,0,1],[1,1,1],[1,1,0]],[[0,1,0],[1,1,0],[1,1,1],[0,1,1]]];
  for(const face of faces){const q=face.map(corner=>p(...corner));
    list.push([q[0],q[1],q[2],colour,colour,colour],[q[0],q[2],q[3],colour,colour,colour]);}
}
// A walker 1.8 m tall, for scale.
function figure(list,x,z){
  const y=ground(x,z),coat=sceneryColor(0xc23b2a),skin=sceneryColor(0xe6c2a0);
  box(list,[x,y,z],[.5,1.5,.3],coat);box(list,[x,y+1.5,z],[.28,.3,.28],skin);
}

const OWNER_STAND_IN=sceneryColor(0xa9b7c9);
const planned=new Map();
const sceneryOf=side=>{
  if(planned.has(side))return planned.get(side);
  const plan=planWolfveilSidePlanting(side);
  planned.set(side,{plan,standing:wolfveilSideSceneryInstances(plan.placements,{heightAt:ground})});
  return planned.get(side);
};
function sceneTriangles(sides){
  const list=groundTriangles();
  for(const side of sides){
    const {standing}=sceneryOf(side);
    for(const [kind,items] of Object.entries(standing))
      for(const item of items)placed(wolfveilSideSceneryShape(kind),item,list);
  }
  // The owner's own trees are real models in the game; here, pale stand-ins.
  for(const tree of wolfveilTreePlacements())
    placed(wolfveilSideSceneryShape('maple'),{x:tree.x,y:ground(tree.x,tree.z),z:tree.z,sx:11,sy:10,sz:11,
      yaw:tree.x*.7,tiltX:0,tiltZ:0,plain:OWNER_STAND_IN},list);
  return list;
}

// ---- where to stand ---------------------------------------------------------
function viewsOf(side){
  const {plan}=sceneryOf(side);
  const trunks=plan.placements.filter(item=>item.trunk||item.kind==='bamboo');
  const all=plan.placements;
  const near=(x,z,reach,list=trunks)=>list.reduce((n,item)=>n+(Math.hypot(item.x-x,item.z-z)<reach?1:0),0);
  const bulky=all.filter(item=>item.trunk||item.kind==='bamboo'||item.kind==='boulder');
  const nearest=(x,z)=>bulky.reduce((d,item)=>Math.min(d,Math.hypot(item.x-x,item.z-z)),Infinity);
  const xs=all.map(item=>item.x),zs=all.map(item=>item.z);
  const centre=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const views=[];
  // From the air, looking across the whole side from above the town.
  const away=normalize([centre[0],0,centre[1]]);
  const reach=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
  const floor=ground(centre[0],centre[1]);
  views.push({name:'from-the-air',fov:50,hazeFrom:500,hazeTo:2600,figureAt:null,
    eye:[centre[0]-away[0]*reach*.66,floor+reach*.62,centre[1]-away[2]*reach*.66],
    target:[centre[0]-away[0]*reach*.1,floor,centre[1]-away[2]*reach*.1]});
  // On a road, where the most trees stand around it.
  let road=null;
  for(const route of WOLFVEIL_ROUTES)for(let i=0;i<route.points.length-1;i++){
    const [x0,z0]=route.points[i],[x1,z1]=route.points[i+1],length=Math.hypot(x1-x0,z1-z0);
    for(let s=0;s<=length;s+=5){
      const x=x0+(x1-x0)*s/length,z=z0+(z1-z0)*s/length;
      if(wolfveilAreaAtLocal(x,z)!==side)continue;
      const score=near(x,z,34);
      if(!road||score>road.score)road={score,x,z,dx:(x1-x0)/length,dz:(z1-z0)/length};
    }
  }
  if(road&&road.score>0){
    const ahead=near(road.x+road.dx*20,road.z+road.dz*20,30),behind=near(road.x-road.dx*20,road.z-road.dz*20,30);
    const sign=ahead>=behind?1:-1,dx=road.dx*sign,dz=road.dz*sign;
    const ex=road.x-dx*7,ez=road.z-dz*7;
    views.push({name:'on-the-road',fov:60,figureAt:[road.x+dx*3,road.z+dz*3],
      eye:[ex,ground(ex,ez)+2.3,ez],target:[road.x+dx*30,ground(road.x+dx*30,road.z+dz*30)+3.5,road.z+dz*30]});
  }
  // Among the trees, where they stand thickest.
  let grove=null;
  for(const item of trunks){const score=near(item.x,item.z,24);if(!grove||score>grove.score)grove={score,x:item.x,z:item.z};}
  if(grove){
    let stand=null;
    for(let k=0;k<16;k++){
      const angle=k*Math.PI/8,x=grove.x+Math.cos(angle)*17,z=grove.z+Math.sin(angle)*17,room=nearest(x,z);
      if(!stand||room>stand.room)stand={room,x,z};
    }
    const fx=stand.x+(grove.x-stand.x)*.45,fz=stand.z+(grove.z-stand.z)*.45;
    views.push({name:'among-the-trees',fov:60,figureAt:[fx,fz],
      eye:[stand.x,ground(stand.x,stand.z)+1.9,stand.z],target:[grove.x,ground(grove.x,grove.z)+5,grove.z]});
  }
  // Low ground: flowers, ferns and boulders up close.
  const small=all.filter(item=>!item.trunk&&item.kind!=='bamboo');
  let patch=null;
  for(const item of small.filter((_,i)=>i%3===0)){
    const score=near(item.x,item.z,9,small)-near(item.x,item.z,5)*2;
    if(!patch||score>patch.score)patch={score,x:item.x,z:item.z};
  }
  if(patch){
    const ex=patch.x+7,ez=patch.z-6;
    views.push({name:'ground-plants',fov:55,figureAt:[patch.x-2.5,patch.z+2.5],
      eye:[ex,ground(ex,ez)+1.6,ez],target:[patch.x,ground(patch.x,patch.z)+.4,patch.z]});
  }
  return views;
}

fs.mkdirSync(OUT,{recursive:true});
const started=Date.now();
const triangles=sceneTriangles(SIDES);
console.log('scene: '+triangles.length.toLocaleString('en-US')+' triangles ('+SIDES.join(', ')+') in '+(Date.now()-started)+' ms');
for(const side of SIDES){
  for(const view of viewsOf(side)){
    const began=Date.now(),painter=createPainter(view),list=triangles.slice();
    if(view.figureAt)figure(list,view.figureAt[0],view.figureAt[1]);
    for(const t of list)painter.triangle(t[0],t[1],t[2],t[3],t[4],t[5]);
    const file=path.join(OUT,WOLFVEIL_SIDE_THEMES[side].theme+'-'+view.name+'.png');
    fs.writeFileSync(file,painter.png());
    console.log(file+'  eye '+view.eye.map(v=>Math.round(v)).join(', ')+'  ('+(Date.now()-began)+' ms)');
  }
}
