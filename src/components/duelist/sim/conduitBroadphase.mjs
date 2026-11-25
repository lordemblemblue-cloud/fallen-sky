// Conservative XZ broadphase for immutable Conduit collision snapshots.
// One lookup per shape kind, no allocations/sorting per query. Exact narrow
// phase remains in conduitTraversal; candidate ordering matches registry order.
const CELL=4, PAD=1, MAX_CELLS=1024;
const EMPTY=Object.freeze([]);
const indexes=new WeakMap();
const kinds=['obbs','ramps','cylinders'];
function bounds(s,kind){
  if(kind==='cylinders')return [s.cx-s.radius,s.cz-s.radius,s.cx+s.radius,s.cz+s.radius];
  const hx=kind==='ramps'?s.width/2:s.hx,hz=kind==='ramps'?s.length/2:s.hz;
  const ex=Math.abs(s.cos)*hx+Math.abs(s.sin)*hz,ez=Math.abs(s.sin)*hx+Math.abs(s.cos)*hz;
  return [s.cx-ex,s.cz-ez,s.cx+ex,s.cz+ez];
}
const key=(x,z)=>x+','+z;
function makeGrid(list,kind){
  const cells=new Map();
  for(const s of list){
    const b=bounds(s,kind);
    if(!b.every(Number.isFinite)||b[0]>b[2]||b[1]>b[3])return null;
    // Ramp support uses its center; OBB/cylinder queries support up to PAD.
    const x0=Math.floor((b[0]-PAD-1e-6)/CELL),z0=Math.floor((b[1]-PAD-1e-6)/CELL);
    const x1=Math.floor((b[2]+PAD+1e-6)/CELL),z1=Math.floor((b[3]+PAD+1e-6)/CELL);
    if(![x0,z0,x1,z1].every(Number.isSafeInteger)||(x1-x0+1)*(z1-z0+1)>MAX_CELLS)return null;
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const k=key(x,z);let bucket=cells.get(k);
      if(!bucket){bucket=[];cells.set(k,bucket);}
      bucket.push(s);
    }
  }
  for(const b of cells.values())Object.freeze(b);
  return cells;
}
// Called only by the snapshot factory after a deep freeze. Never attach an
// index to a mutable scene registry or player-provided object.
export function registerConduitBroadphase(snapshot){
  if(indexes.has(snapshot))return;
  if(!Object.isFrozen(snapshot)||!kinds.every(k=>Object.isFrozen(snapshot[k])&&snapshot[k].every(Object.isFrozen)))throw new TypeError('Immutable collision snapshot required');
  indexes.set(snapshot,Object.fromEntries(kinds.map(k=>[k,makeGrid(snapshot[k],k)])));
}
export function conduitCandidates(world,kind,x,z,r=0){
  const grid=indexes.get(world)?.[kind];
  if(!grid||!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(r)||r<0||r>PAD)return world[kind];
  return grid.get(key(Math.floor(x/CELL),Math.floor(z/CELL)))??EMPTY;
}
// Diagnostic count is candidate work, not elapsed CPU time or frame rate.
export function conduitBroadphaseStats(world,x,z,r=.4){
  const total=kinds.reduce((n,k)=>n+world[k].length,0);
  const candidates=kinds.reduce((n,k)=>n+conduitCandidates(world,k,x,z,r).length,0);
  return {total,candidates,indexed:indexes.has(world)};
}
