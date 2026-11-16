// Geometry for the four Wolfveil cave approach trails, entrance aprons and
// guarded edges. Every walking surface is stitched into the same cave floor
// mesh already registered for player foot rays. No second terrain mesh/portal,
// changed LAND square, or fabricated colliders.
import {wolfveilHeight} from './WolfveilLayout.js';
import {
  WOLFVEIL_CAVE_APPROACHES,WOLFVEIL_CAVE_APPROACH_WIDTH,
  WOLFVEIL_CAVE_APRON_HALF_WIDTH,
} from './WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_EXPLORABLE_CAVES,WOLFVEIL_CAVE_CORRIDORS} from './WolfveilCaveLayout.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const COLOR_CENTER=[.60,.57,.50],COLOR_EDGE=[.40,.43,.40],COLOR_APRON=[.53,.54,.49];
const caveById=new Map(WOLFVEIL_EXPLORABLE_CAVES.map(c=>[c.id,c]));

// The renderer creates the real geometry; this function is also usable in
// pure tests with a triangle collector to verify no entrance floor gaps.
export function appendWolfveilCaveAccessFloor(floorTris){
  if(typeof floorTris?.quad!=='function')throw new TypeError('Cave floor triangle collector required');
  const stats={approaches:0,rampAprons:0,walkQuads:0,shoulderQuads:0};
  const lastPoint=(points)=>points[points.length-1];
  const at=(a,b,t)=>({x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),
    y:mix(a.y,b.y,t)});
  const createEdge=(p,tangent,halfWidth,stepLength,blendToThreshold=false)=>{
    const length=Math.hypot(tangent.x,tangent.z)||1;
    const nx=-tangent.z/length,nz=tangent.x/length;
    const pos=(side,scale=1)=>{
      const x=p.x+nx*side*halfWidth*scale,z=p.z+nz*side*halfWidth*scale;
      const terrainY=wolfveilHeight(x,z);
      const anchorWeight=blendToThreshold?clamp(stepLength/5,0,1):1;
      return [x,mix(p.y,terrainY,anchorWeight)+.10,z];
    };
    return {left:pos(1),right:pos(-1),
      outerLeft:pos(1,1.26),outerRight:pos(-1,1.26)};
  };
  // One continuous rough-stone track from each authored valley trail to the
  // original entry ramp. Surfaces are draped over the real hillside; the final
  // 5m eases into exactly the same Y as its existing cave threshold.
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
        // Left forward -> right forward -> right backward -> left backward:
        // winding matches upward-facing ground for +Z, with DoubleSide
        // material kept for arbitrary turns/terrain as with existing floors.
        floorTris.quad(e0.left,e1.left,e1.right,e0.right,COLOR_CENTER,
          [[0,travelled],[0,travelled+distance/steps],[3,travelled+distance/steps],[3,travelled]]);
        stats.walkQuads++;
      }
      travelled+=distance;
    }
    // Each change of direction gets a small, walkable landing so sharp
    // elbows cannot open triangle gaps where separately drawn strips meet.
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i],radius=2.25,slices=12;
      const c=[p.x,wolfveilHeight(p.x,p.z)+.09,p.z];
      for(let k=0;k<slices;k++){
        const ang0=2*Math.PI*k/slices,ang1=2*Math.PI*(k+1)/slices;
        const ring=a=>{
          const x=p.x+radius*Math.cos(a),z=p.z+radius*Math.sin(a);
          return [x,wolfveilHeight(x,z)+.08,z];
        };
        // Fan half-strip with degenerate radial edges: supports an elbow.
        const b0=ring(ang0),b1=ring(ang1);
        floorTris.tri(c,b1,b0,COLOR_CENTER);
        stats.walkQuads++;
      }
    }

    const cave=caveById.get(approach.caveId);
    const corridor=WOLFVEIL_CAVE_CORRIDORS.find(c=>c.id==='entry_'+cave.id);
    if(!corridor)throw Error('Missing cave entry corridor for '+cave.id);
    // The old terrain cutout removes full ~3.55m hillside squares. Some edge
    // holes extend beyond the central entry floor. Bridge ONLY those edges
    // with 2.15m basalt shoulders, tapering into the true hillside.
    const [dx,dz]=cave.dir,nx=-dz,nz=dx;
    // Start inside the actual 3.9m collision corridor (rather than outside
    // its wider rendered floor), so no missing wedge remains between surfaces.
    const half=Math.max(2,corridor.halfWidth-.25);
    const alongAt=(f,side)=>{
      const x=cave.mouth[0]+dx*f,z=cave.mouth[1]+dz*f;
      const seg=f<0?corridor.segments[0]:corridor.segments[1];
      const segmentLength=seg.lenXZ||1;
      const t=f<0?clamp((f+3.5)/3.5,0,1):
        clamp(f/(cave.chamberOffset*.52),0,1);
      const centerY=mix(seg.ay,seg.by,t);
      const atWidth=(w,weight)=>{
        const px=x+nx*side*w,pz=z+nz*side*w;
        const outside=wolfveilHeight(px,pz);
        return [px,mix(centerY,outside,weight)+.07,pz];
      };
      return {inner:atWidth(half,0),outer:atWidth(WOLFVEIL_CAVE_APRON_HALF_WIDTH,
        // Blend to true terrain at the outer lip, but do not form a huge
        // transparent flat ceiling over the underground cave.
        f<-1?.75:f>8?.50:.67)};
    };
    for(const side of [-1,1]){
      // The rendered terrain grid has ~3.55m cells. Full cutout-cell edges
      // project ~2.5m beyond mouth sample points, so seal that entire rim.
      const start=-3.9,end=12.0,steps=14;
      for(let i=0;i<steps;i++){
        const a=alongAt(mix(start,end,i/steps),side),
          b=alongAt(mix(start,end,(i+1)/steps),side);
        if(side>0)floorTris.quad(a.inner,b.inner,b.outer,a.outer,COLOR_APRON);
        else floorTris.quad(a.outer,b.outer,b.inner,a.inner,COLOR_APRON);
        stats.shoulderQuads++;
      }
    }
    stats.rampAprons++;
  }
  return stats;
}

export function appendWolfveilCaveAccessProps({
  addProp,addBrazier,stoneGeo,beamGeo,stoneMat,timberMat,bronzeMat,
}={}){
  if(typeof addProp!=='function')throw new TypeError('Existing cave prop factory required');
  const placements=[];
  // Reuse existing meshes/materials and keep all props cosmetic; the TRUE
  // collision floor comes from appendWolfveilCaveAccessFloor().
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const cave=caveById.get(approach.caveId),[dx,dz]=cave.dir;
    const nx=-dz,nz=dx;
    // Low stone retaining edges and handrails flank the narrow final descent.
    for(const side of [-1,1]){
      for(let j=0;j<5;j++){
        const f=-4+j*2.6;
        const x=cave.mouth[0]+dx*f+nx*side*5.9,
          z=cave.mouth[1]+dz*f+nz*side*5.9;
        // Posts are kept beyond the walkable center line so a player capsule
        // never catches the post while entering/exiting.
        const y= f<0?wolfveilHeight(x,z):cave.mouthY - Math.max(0,f)*.18;
        addProp(stoneGeo,stoneMat,x,y+.56,z,.67,1.04,.67,0,.18*j,0);
        if(j<4){
          const lx=x+dx*1.25,lz=z+dz*1.25;
          addProp(beamGeo,timberMat,lx,y+1.06,lz,.15,.16,2.55,0,
            Math.atan2(dx,dz),0);
        }
      }
      // Height-independent short corner lanterns outside the entry bay.
      if(addBrazier){
        const bx=cave.mouth[0]-dx*7+nx*side*4.0;
        const bz=cave.mouth[1]-dz*7+nz*side*4.0;
        const h=wolfveilHeight(bx,bz);
        addBrazier(bx,h,bz,cave.lightColor,cave.theme==='crystal_geode');
      }
    }
    // Mountain rock shoulders at the top of the path, a visible ground-level
    // opening instead of a doorway hovering in empty terrain.
    const front=approach.points[2];
    for(const side of [-1,1]){
      const px=front.x+nx*side*4.3,pz=front.z+nz*side*4.3;
      const h=wolfveilHeight(px,pz);
      addProp(stoneGeo,stoneMat,px,h+.54,pz,1.3,1.15,1.38,0,side*.23,0);
      const gateX=front.x+nx*side*2.4,gateZ=front.z+nz*side*2.4;
      const groundY=wolfveilHeight(gateX,gateZ);
      addProp(beamGeo,timberMat,gateX,groundY+1.1,gateZ,.2,2.0,.2);
    }
    // A repeated warm waymark at the junction and staging bend. The actual
    // player path is already a continuous stone strip, not floating steps.
    for(const point of [approach.points[0],approach.points[1]]){
      const x=point.x+nx*2.2,z=point.z+nz*2.2,y=wolfveilHeight(x,z);
      addProp(beamGeo,timberMat,x,y+1.1,z,.22,2.2,.22);
      addProp(beamGeo,bronzeMat,x,y+2.15,z,1.0,.17,.28,0,
        Math.atan2(dx,dz),0);
    }
    placements.push({
      id:approach.id,trail:approach.trailName,waymark:approach.waymark,
      propsOnly:true,guardedMouth:true,
    });
  }
  return placements;
}
