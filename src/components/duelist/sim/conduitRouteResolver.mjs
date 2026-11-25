// Opt-in CPU route refinement for Conduit. No renderer, frame loop, or mutation
// of scene geometry. All returned walking segments pass the candidate sweep.
import {conduitSupport,conduitBlockers,probeConduitWalk,probeConduitPad} from './conduitTraversal.mjs';

const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=p=>({x:p.x,y:p.y,z:p.z});
const STEP=.5, MAX_VISITS=4500;
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

export function createConduitRouteResolver(world,nodes){
  const routeCache=new Map(), clearCache=new Map();
  function clear(p){
    const key=p.x.toFixed(4)+'|'+p.y.toFixed(4)+'|'+p.z.toFixed(4);
    if(clearCache.has(key))return clearCache.get(key);
    const y=conduitSupport(world,p.x,p.z,p.y+.035,p.y-.035,.4);
    const valid=Number.isFinite(y)&&conduitBlockers(world,p).length===0;
    if(clearCache.size>=50000)clearCache.clear();
    clearCache.set(key,valid);return valid;
  }
  function approximateSegment(a,b){
    const n=Math.max(1,Math.ceil(horizontal(a,b)/.20));
    for(let i=0;i<=n;i++){
      const t=i/n;
      if(!clear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}))return false;
    }
    return true;
  }
  // Search only the original floor. Never create a teleport, leap, drop or
  // shortcut through a wall to make a failed walking edge look connected.
  function detour(from,to,margin,blocked){
    if(Math.abs(from.y-to.y)>.035||!clear(from)||!clear(to))return null;
    const y=from.y;
    const xmin=Math.floor((Math.min(from.x,to.x)-margin)/STEP),xmax=Math.ceil((Math.max(from.x,to.x)+margin)/STEP);
    const zmin=Math.floor((Math.min(from.z,to.z)-margin)/STEP),zmax=Math.ceil((Math.max(from.z,to.z)+margin)/STEP);
    const key=(x,z)=>x+','+z;
    const start='start',goal='goal';
    const positions=new Map([[start,from],[goal,to]]);
    const open=new Set([start]),closed=new Set(),cost=new Map([[start,0]]),parents=new Map();
    const get=(x,z)=>{const id=key(x,z);if(!positions.has(id))positions.set(id,{x:x*STEP,y,z:z*STEP});return id;};
    const forbidden=(a,b)=>blocked.has(a+'>'+b);
    let visits=0;
    while(open.size&&visits++<MAX_VISITS){
      let cur=null,best=Infinity;
      for(const id of open){
        const score=cost.get(id)+horizontal(positions.get(id),to);
        if(score<best){best=score;cur=id;}
      }
      if(cur===goal){
        const ids=[goal];while(parents.has(ids[0]))ids.unshift(parents.get(ids[0]));
        return {ids,points:ids.map(id=>positions.get(id))};
      }
      open.delete(cur);closed.add(cur);
      const p=positions.get(cur), candidates=[];
      if(horizontal(p,to)<=1.05)candidates.push(goal);
      if(cur===start){
        const gx=Math.round(p.x/STEP),gz=Math.round(p.z/STEP);
        for(let x=gx-1;x<=gx+1;x++)for(let z=gz-1;z<=gz+1;z++)if(x>=xmin&&x<=xmax&&z>=zmin&&z<=zmax)candidates.push(get(x,z));
      }else{
        const [gx,gz]=cur.split(',').map(Number);
        for(const [dx,dz] of directions){
          const x=gx+dx,z=gz+dz;
          if(x>=xmin&&x<=xmax&&z>=zmin&&z<=zmax)candidates.push(get(x,z));
        }
      }
      for(const id of candidates){
        if(closed.has(id)||forbidden(cur,id))continue;
        const q=positions.get(id),g=cost.get(cur)+horizontal(p,q);
        if(g>=(cost.get(id)??Infinity)||!approximateSegment(p,q))continue;
        cost.set(id,g);parents.set(id,cur);open.add(id);
      }
    }
    return null;
  }
  function refine(from,to){
    const blocked=new Set();
    for(const margin of [4,8]){
      for(let attempt=0;attempt<4;attempt++){
        const route=detour(from,to,margin,blocked);
        if(!route)break;
        let failed=false;
        for(let i=1;i<route.points.length;i++){
          if(!probeConduitWalk(world,route.points[i-1],route.points[i]).ok){
            blocked.add(route.ids[i-1]+'>'+route.ids[i]);failed=true;break;
          }
        }
        if(!failed)return route.points;
      }
    }
    return null;
  }
  function resolveEdge(fromId,toId){
    const id=fromId+'>'+toId;
    if(routeCache.has(id))return routeCache.get(id);
    const from=nodes.get(fromId),to=nodes.get(toId),edge=from?.edges.find(e=>e.to===toId);
    if(!from||!to||!edge)return {ok:false,reason:'unknown edge',points:[]};
    const a=point(from.pos),b=point(to.pos);
    let result;
    if(edge.type==='drop')result={ok:false,reason:'drop not certified',points:[]};
    else if(edge.type==='jump_pad'){
      const pad=world.jumpPads.find(p=>horizontal(a,p)<.1&&Math.abs(a.y-p.y)<.1&&Math.hypot(b.x-p.targetX,b.z-p.targetZ)<.1&&Math.abs(b.y-p.targetY)<.1);
      const check=pad&&probeConduitPad(world,pad);
      result=check?.ok?{ok:true,type:edge.type,points:[a,b],detour:false}:{ok:false,reason:check?.reason??'missing pad',points:[]};
    }else{
      const direct=probeConduitWalk(world,a,b);
      if(direct.ok)result={ok:true,type:edge.type,points:[a,b],detour:false};
      else{
        const path=edge.type==='walk'?refine(a,b):null;
        result=path?{ok:true,type:edge.type,points:path,detour:true,directFailure:direct.reason}:{ok:false,reason:direct.reason,end:direct.end,points:[]};
      }
    }
    // Prevent callers from mutating cached paths.
    result=Object.freeze({...result,points:Object.freeze(result.points.map(p=>Object.freeze(point(p))))});
    routeCache.set(id,result);return result;
  }
  // Deliberately separate from legacy A*: the future bot/controller must
  // consume each returned action and waypoint, not merely the node IDs.
  function findRoute(start,goal){
    if(!nodes.has(start)||!nodes.has(goal))return null;
    const open=new Set([start]),cost=new Map([[start,0]]),previous=new Map(),closed=new Set();
    while(open.size){
      let cur=null,best=Infinity;
      for(const id of open)if(cost.get(id)<best){cur=id;best=cost.get(id);}
      if(cur===goal){
        const segments=[];let at=goal;
        while(previous.has(at)){const p=previous.get(at);segments.unshift({from:p.from,to:at,...p.route});at=p.from;}
        return {segments,cost:best};
      }
      open.delete(cur);closed.add(cur);
      for(const edge of nodes.get(cur).edges){
        if(closed.has(edge.to))continue;
        const route=resolveEdge(cur,edge.to);
        if(!route.ok)continue;
        let length=0;for(let i=1;i<route.points.length;i++)length+=Math.hypot(route.points[i].x-route.points[i-1].x,route.points[i].y-route.points[i-1].y,route.points[i].z-route.points[i-1].z);
        const next=best+length;
        if(next<(cost.get(edge.to)??Infinity)){cost.set(edge.to,next);previous.set(edge.to,{from:cur,route});open.add(edge.to);}
      }
    }
    return null;
  }
  return {resolveEdge,findRoute};
}
