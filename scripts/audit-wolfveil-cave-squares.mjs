// Review-only, geometry-derived candidate squares for the four Wolfveil cave approaches.
// This does not claim ownership, visual QA, acceptance, or live terrain completion.
import {WOLFVEIL_CAVE_APPROACHES,WOLFVEIL_CAVE_APPROACH_WIDTH,
  WOLFVEIL_CAVE_APRON_HALF_WIDTH} from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_EXPLORABLE_CAVES} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_EXTENTS} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const CELL_SIZE_METRES=5;
export const BLOCK_SIZE_CELLS=20; // 100m review grouping; NOT a LAND ownership claim.
export const PLAY_BOUNDS=Object.freeze({
  minX:WOLFVEIL_EXTENTS.preview[0],maxX:WOLFVEIL_EXTENTS.preview[1],
  minZ:WOLFVEIL_EXTENTS.preview[2]+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z,
  maxZ:WOLFVEIL_EXTENTS.preview[3]+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z,
});
const WIDTH=Math.round((PLAY_BOUNDS.maxX-PLAY_BOUNDS.minX)/CELL_SIZE_METRES);
const HEIGHT=Math.round((PLAY_BOUNDS.maxZ-PLAY_BOUNDS.minZ)/CELL_SIZE_METRES);
const EPS=1e-8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sq=v=>v*v;
const pointRectDistanceSq=(p,r)=>sq(p.x-clamp(p.x,r.minX,r.maxX))+
  sq(p.z-clamp(p.z,r.minZ,r.maxZ));
const pointSegmentDistanceSq=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  const t=len2>EPS?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/len2,0,1):0;
  return sq(p.x-a.x-t*dx)+sq(p.z-a.z-t*dz);
};
function segmentIntersectsRect(a,b,r){
  const dx=b.x-a.x,dz=b.z-a.z;
  const p=[-dx,dx,-dz,dz];
  const q=[a.x-r.minX,r.maxX-a.x,a.z-r.minZ,r.maxZ-a.z];
  let near=0,far=1;
  for(let k=0;k<4;k++){
    if(Math.abs(p[k])<EPS){if(q[k]<0)return false;continue;}
    const t=q[k]/p[k];
    if(p[k]<0)near=Math.max(near,t);
    else far=Math.min(far,t);
    if(near>far)return false;
  }
  return true;
}
function segmentRectDistanceSq(a,b,r){
  if(segmentIntersectsRect(a,b,r))return 0;
  const corners=[
    {x:r.minX,z:r.minZ},{x:r.maxX,z:r.minZ},
    {x:r.maxX,z:r.maxZ},{x:r.minX,z:r.maxZ},
  ];
  // If disjoint, the closest pair lies on a rectangle edge or endpoint.
  return Math.min(pointRectDistanceSq(a,r),pointRectDistanceSq(b,r),
    ...corners.map(c=>pointSegmentDistanceSq(c,a,b)));
}
function circleTouchesRect(x,z,radius,rect){
  return pointRectDistanceSq({x,z},rect)<=sq(radius+EPS);
}
function apronTouchesRect(cave,rect){
  // Separating-axis test: oriented 24m x (2 * apron half-width) cave forecourt
  // against the axis-aligned 5m review cell. Both are in Play coordinates.
  const [dx,dz]=cave.dir,half=WOLFVEIL_CAVE_APRON_HALF_WIDTH;
  const x=cave.mouth[0],z=cave.mouth[1]+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z;
  const cx=(rect.minX+rect.maxX)/2-x,cz=(rect.minZ+rect.maxZ)/2-z;
  const h=CELL_SIZE_METRES/2;
  const boundX=12*Math.abs(dx)+half*Math.abs(dz)+h;
  const boundZ=12*Math.abs(dz)+half*Math.abs(dx)+h;
  const cellProjection=h*(Math.abs(dx)+Math.abs(dz));
  return Math.abs(cx)<=boundX+EPS&&Math.abs(cz)<=boundZ+EPS&&
    Math.abs(cx*dx+cz*dz)<=12+cellProjection+EPS&&
    Math.abs(-cx*dz+cz*dx)<=half+cellProjection+EPS;
}
export function squareAtPlay(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||
     x<PLAY_BOUNDS.minX||x>=PLAY_BOUNDS.maxX||
     z<PLAY_BOUNDS.minZ||z>=PLAY_BOUNDS.maxZ)return null;
  const col=Math.floor((x-PLAY_BOUNDS.minX)/CELL_SIZE_METRES);
  const row=Math.floor((z-PLAY_BOUNDS.minZ)/CELL_SIZE_METRES);
  return Object.freeze({col,row,id:'X'+col+'-Z'+row,
    block:'B'+Math.floor(col/BLOCK_SIZE_CELLS)+'-'+Math.floor(row/BLOCK_SIZE_CELLS)});
}
export function collectWolfveilCaveSquareCandidates(){
  const caves=new Map(WOLFVEIL_EXPLORABLE_CAVES.map(c=>[c.id,c]));
  const results=[],occupied=new Map();
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const cave=caves.get(approach.caveId);
    if(!cave)throw new Error('Unknown cave '+approach.caveId);
    const pts=approach.points.map(p=>({x:p.x,
      z:p.z+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z}));
    const ids=[],blocks=new Set();
    // Geometry-based intersection, not rough bounding-box-only ownership.
    for(let col=0;col<WIDTH;col++)for(let row=0;row<HEIGHT;row++){
      const rect={minX:PLAY_BOUNDS.minX+col*CELL_SIZE_METRES,
        maxX:PLAY_BOUNDS.minX+(col+1)*CELL_SIZE_METRES,
        minZ:PLAY_BOUNDS.minZ+row*CELL_SIZE_METRES,
        maxZ:PLAY_BOUNDS.minZ+(row+1)*CELL_SIZE_METRES};
      let touches=apronTouchesRect(cave,rect);
      if(!touches)for(let i=1;i<pts.length;i++){
        if(segmentRectDistanceSq(pts[i-1],pts[i],rect)<=
           sq(WOLFVEIL_CAVE_APPROACH_WIDTH/2+EPS)){touches=true;break;}
      }
      // Landing fans at each of the two authored bends extend beyond a strip.
      if(!touches)for(let i=1;i<pts.length-1;i++){
        if(circleTouchesRect(pts[i].x,pts[i].z,2.25,rect)){touches=true;break;}
      }
      if(!touches)continue;
      const id='X'+col+'-Z'+row;
      ids.push(id);
      const block='B'+Math.floor(col/BLOCK_SIZE_CELLS)+'-'+
        Math.floor(row/BLOCK_SIZE_CELLS);
      blocks.add(block);
      if(!occupied.has(id))occupied.set(id,[]);
      occupied.get(id).push(approach.caveId);
    }
    results.push({caveId:approach.caveId,approachId:approach.id,
      trailName:approach.trailName,reviewStatus:'UNVERIFIED',
      owner:null,ownerAcceptance:false,
      candidateCells:ids,candidateBlocks:[...blocks].sort()});
  }
  const overlapping=[...occupied].filter(([,owners])=>owners.length>1)
    .map(([cell,approaches])=>({cell,approaches}));
  return {repositoryScope:'CLONE_ONLY',
    coordinateSystem:'Play world metres; local cave Z + offset',
    cellSizeMetres:CELL_SIZE_METRES,blockSizeMetres:100,
    bounds:PLAY_BOUNDS,source:'current Clone main code',
    acceptance:'NONE_INFERRED',
    approaches:results,totalUniqueCandidateCells:occupied.size,
    sharedCells:overlapping};
}
// Audit is read-only: no file writes, no terrain mutations, no acceptance state.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.stdout.write(JSON.stringify(collectWolfveilCaveSquareCandidates(),null,2)+'\n');
}
