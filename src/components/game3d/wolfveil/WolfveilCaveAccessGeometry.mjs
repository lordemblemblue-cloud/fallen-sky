// Walkable exterior cave approaches and guarded E-arch thresholds.
// Four stone trails share the existing Wolfveil cave floor raycast geometry.
// All overworld mountain/roof terrain cells stay completely sealed.
import {wolfveilHeight} from './WolfveilLayout.js';
import {
  WOLFVEIL_CAVE_APPROACHES,WOLFVEIL_CAVE_APPROACH_WIDTH,
} from './WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_EXPLORABLE_CAVES} from './WolfveilCaveLayout.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const COLOR_CENTER=[.60,.57,.50];
const caveById=new Map(WOLFVEIL_EXPLORABLE_CAVES.map(c=>[c.id,c]));

// The renderer creates the real geometry; this function is also usable in
// pure tests with a triangle collector to verify no entrance floor gaps.
export function appendWolfveilCaveAccessFloor(floorTris){
  if(typeof floorTris?.quad!=='function')throw new TypeError('Cave floor triangle collector required');
  const stats={approaches:0,surfaceRoofIntact:true,walkQuads:0,shoulderQuads:0,curbQuads:0,mouthQuads:0};
  const at=(a,b,t)=>({x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),
    y:mix(a.y,b.y,t)});
  const createEdge=(p,tangent,halfWidth,stepLength,blendToThreshold=false)=>{
    const length=Math.hypot(tangent.x,tangent.z)||1;
    const nx=-tangent.z/length,nz=tangent.x/length;
    const pos=(side)=>{
      const x=p.x+nx*side*halfWidth,z=p.z+nz*side*halfWidth;
      // The walk uses the graded path height. Raw hillside cliffs are not
      // the floor, or the trail stops being something you can walk.
      return [x,p.y+0.16,z];
    };
    return {left:pos(1),right:pos(-1)};
  };
  // Dressed ashlar. The center is the walk; the shoulders are the darker
  // courses a mason would lay so the path reads as built, not painted on.
  const mix3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const layPavement=(e0,e1,v0,v1)=>{
    const bands=[[0,.32],[.32,.68],[.68,1]];
    const colors=[[.40,.42,.36],COLOR_CENTER,[.40,.42,.36]];
    for(let b=0;b<3;b++){
      const [s0,s1]=bands[b];
      const a=mix3(e0.left,e0.right,s0);
      const d=mix3(e1.left,e1.right,s0);
      const c=mix3(e1.left,e1.right,s1);
      const bp=mix3(e0.left,e0.right,s1);
      floorTris.quad(a,d,c,bp,colors[b],[
        [s0*4.2,v0],[s0*4.2,v1],[s1*4.2,v1],[s1*4.2,v0],
      ]);
      stats.walkQuads++;
    }
    const lip=(edge,side)=>{
      const src=edge[side];
      const other=edge[side==='left'?'right':'left'];
      let ox=src[0]-other[0],oz=src[2]-other[2];
      const len=Math.hypot(ox,oz)||1;
      ox/=len;oz/=len;
      return [src[0]+ox*.34,src[1]+.2,src[2]+oz*.34];
    };
    for(const side of ['left','right']){
      const s0=e0[side],s1=e1[side],o0=lip(e0,side),o1=lip(e1,side);
      const raised=[s0[0],s0[1]+.04,s0[2]],raised1=[s1[0],s1[1]+.04,s1[2]];
      floorTris.quad(raised,raised1,o1,o0,[.36,.34,.31],[
        [0,v0],[0,v1],[.4,v1],[.4,v0],
      ]);
      const drop0=[o0[0],o0[1]-.2,o0[2]],drop1=[o1[0],o1[1]-.2,o1[2]];
      floorTris.quad(o0,o1,drop1,drop0,[.32,.30,.28],[
        [0,v0],[0,v1],[.2,v1],[.2,v0],
      ]);
      stats.curbQuads+=2;
    }
  };
  // One continuous rough-stone track from each authored valley trail to the
  // existing stone arch. Surfaces are draped over the real hillside; the
  // last 5m meets the threshold's actual surface height.
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const pts=approach.points;
    stats.approaches++;
    let travelled=0;
    for(let k=0;k<pts.length-1;k++){
      const a=pts[k],b=pts[k+1];
      const dx=b.x-a.x,dz=b.z-a.z,distance=Math.hypot(dx,dz);
      const steps=Math.max(2,Math.ceil(distance/1.25));
      const tangent={x:dx,z:dz};
      for(let i=0;i<steps;i++){
        const t0=i/steps,t1=(i+1)/steps;
        const p0=at(a,b,t0),p1=at(a,b,t1);
        // Widen smoothly near the enclosed cave entrance rather than forcing
        // a narrow track into the existing 8.9m cave mouth floor.
        const remaining=(1-t0)*distance;
        const w0=(WOLFVEIL_CAVE_APPROACH_WIDTH+
          2*clamp(1-remaining/7,0,1)*2.75)/2;
        const remaining1=(1-t1)*distance;
        const w1=(WOLFVEIL_CAVE_APPROACH_WIDTH+
          2*clamp(1-remaining1/7,0,1)*2.75)/2;
        const e0=createEdge(p0,tangent,w0,
          k===pts.length-2?remaining:Infinity,k===pts.length-2);
        const e1=createEdge(p1,tangent,w1,
          k===pts.length-2?remaining1:Infinity,k===pts.length-2);
        // Three laid courses: dark rock shoulders and a lighter flagstone
        // walk. UVs are in metres so the ashlar texture stays stone-sized
        // when the path widens at the cave.
        const v0=travelled*0.92,v1=(travelled+distance/steps)*0.92;
        layPavement(e0,e1,v0,v1);
      }
      travelled+=distance;
    }
    // Each change of direction gets a small, walkable landing so sharp
    // elbows cannot open triangle gaps where separately drawn strips meet.
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i],radius=2.25,slices=12;
      const c=[p.x,p.y+.09,p.z];
      for(let k=0;k<slices;k++){
        const ang0=2*Math.PI*k/slices,ang1=2*Math.PI*(k+1)/slices;
        const ring=a=>{
          const x=p.x+radius*Math.cos(a),z=p.z+radius*Math.sin(a);
          return [x,p.y+.08,z];
        };
        // Fan half-strip with degenerate radial edges: supports an elbow.
        const b0=ring(ang0),b1=ring(ang1);
        floorTris.tri(c,b1,b0,COLOR_CENTER);
        stats.walkQuads++;
      }
    }

    // The authored trail ends at the threshold. Continue the same flagstone
    // to the arch so the walk actually arrives at the cave mouth.
    const cave=caveById.get(approach.caveId);
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    const nx=-dz,nz=dx;
    const end=pts[pts.length-1];
    const spanLen=Math.hypot(mx-end.x,mz-end.z);
    const mouthSteps=Math.max(2,Math.ceil(spanLen/1.1));
    let prevEdge=null,along=0;
    for(let i=0;i<=mouthSteps;i++){
      const t=i/mouthSteps;
      const x=end.x+(mx-end.x)*t,z=end.z+(mz-end.z)*t;
      const rise=wolfveilHeight(mx,mz)-end.y;
      const capped=Math.sign(rise)*Math.min(Math.abs(rise),spanLen*0.3);
      const y=end.y+capped*t;
      const half=2.35;
      const edge={
        left:[x+nx*half,y,z+nz*half],
        right:[x-nx*half,y,z-nz*half],
      };
      if(prevEdge){
        layPavement(prevEdge,edge,along*.92,(along+spanLen/mouthSteps)*.92);
        stats.mouthQuads++;
      }
      prevEdge=edge;
      along+=spanLen/mouthSteps;
    }

    // The newer Wolfveil main restores ALL surface terrain triangles. Do
    // not add an underground cutout apron/false roof floor here: players walk
    // to the real stone arch, press E, and the existing authenticated cave
    // entry places them on the descending interior path.

  }
  return stats;
}

export function appendWolfveilCaveAccessProps({
  addProp,addBrazier,stoneGeo,beamGeo,stoneMat,timberMat,bronzeMat,
}={}){
  if(typeof addProp!=='function')throw new TypeError('Existing cave prop factory required');
  const placements=[];
  // Reuse existing meshes/materials; exterior rails collide through the
  // pure threshold safety resolver, not by disabling the sealed roof.
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const cave=caveById.get(approach.caveId),[dx,dz]=cave.dir;
    const nx=-dz,nz=dx;
    // Stones along the cut, not a fence. Sizes vary so the bank is not a row.
    for(let i=1;i<approach.points.length-1;i++){
      const p=approach.points[i];
      const prev=approach.points[i-1];
      if(Math.hypot(p.x-cave.mouth[0],p.z-cave.mouth[1])<10)continue;
      const n=Math.abs(Math.sin(p.x*0.17+p.z*0.11));
      if(n<0.28&&i%2===0)continue;
      const tx=p.x-prev.x,tz=p.z-prev.z;
      const len=Math.hypot(tx,tz)||1;
      const sx=-tz/len,sz=tx/len;
      const side=Math.sin(p.x*0.07+i)>0?1:-1;
      const lat=2.7+n*2.1;
      const x=p.x+sx*side*lat,z=p.z+sz*side*lat;
      const y=wolfveilHeight(x,z);
      const wide=n>0.72;
      const h=wide?0.42+n*0.35:0.7+n*1.05;
      addProp(stoneGeo,stoneMat,x,y+h*0.42,z,
        wide?1.35:0.62+n*0.45,h,wide?0.7:0.55+n*0.4,n,side*0.5,n*0.2);
      if(n>0.8){
        const x2=p.x-sx*side*(lat+1.3),z2=p.z-sz*side*(lat+1.3);
        const y2=wolfveilHeight(x2,z2);
        addProp(stoneGeo,stoneMat,x2,y2+0.28,z2,0.85,0.38,0.55,0,n,0);
      }
    }
    // A few rocks settle the arch. They stay outside the walk.
    for(const side of [-1,1]){
      for(let j=0;j<3;j++){
        const f=-11+j*2.4;
        const x=cave.mouth[0]+dx*f+nx*side*(5.6+j*0.15),
          z=cave.mouth[1]+dz*f+nz*side*(5.6+j*0.15);
        const y=wolfveilHeight(x,z);
        addProp(stoneGeo,stoneMat,x,y+.42,z,.9,.7,.8,0,.2*j,0);
      }
      if(addBrazier){
        const bx=cave.mouth[0]-dx*7+nx*side*4.0;
        const bz=cave.mouth[1]-dz*7+nz*side*4.0;
        const h=wolfveilHeight(bx,bz);
        addBrazier(bx,h,bz,cave.lightColor,cave.theme==='crystal_geode');
      }
    }
    const front=approach.points.find(p=>p.kind==='staging')||approach.points[2];
    for(const side of [-1,1]){
      const px=front.x+nx*side*3.6,pz=front.z+nz*side*3.6;
      const h=wolfveilHeight(px,pz);
      addProp(stoneGeo,stoneMat,px,h+.5,pz,1.15,0.85,1.2,0,side*.3,0);
    }
    const start=approach.points[0];
    const x=start.x+nx*2.4,z=start.z+nz*2.4,y=wolfveilHeight(x,z);
    addProp(beamGeo,timberMat,x,y+1.05,z,.18,1.7,.18);
    addProp(beamGeo,bronzeMat,x,y+1.85,z,.85,.14,.24,0,Math.atan2(dx,dz),0);
    placements.push({
      id:approach.id,trail:approach.trailName,waymark:approach.waymark,
      propsOnly:true,guardedMouth:true,
    });
  }
  return placements;
}
