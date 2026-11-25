import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {snapshotConduitCollision,auditConduitSpawn,probeConduitWalk,probeConduitPad} from '../src/components/duelist/sim/conduitTraversal.mjs';

// The canvas shim is for procedural textures only; Three.js creates the real
// geometry and applies all the actual scene transforms. No GPU is exercised.
test('assembled Conduit: physical route and spawn release gate',()=>{
  const prev=globalThis.document;
  const ctx=new Proxy({}, {get:(target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):target[key]??(()=>{})});
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>ctx};}};
  let arena;
  try{
    arena=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
    const world=snapshotConduitCollision(arena.world), nodes=arena.navGraph.nodes;
    const report={spawns:[],stairs:[],routes:[],entrances:[],pads:[],untested:[]};
    for(const p of [...arena.spawnCandidates.blue,...arena.spawnCandidates.red])report.spawns.push(auditConduitSpawn(world,p));
    for(const n of nodes.values())for(const e of n.edges){
      if(e.type==='jump_pad')continue;
      if(e.type==='drop'){report.untested.push(n.id+' -> '+e.to+' (drop)');continue;}
      const target=nodes.get(e.to);
      if(!target){report.routes.push({id:n.id+' -> '+e.to,ok:false,reason:'missing destination'});continue;}
      const direct=probeConduitWalk(world,n.pos,target.pos);
      const stair=e.type==='stair_up'||e.type==='stair_down';
      const item={id:n.id+' -> '+e.to,...direct,directOK:direct.ok};
      // Only ordinary walking may be rerouted. Retain every original edge,
      // report its direct failure, and independently sweep each detour segment.
      if(!direct.ok&&!stair&&e.type==='walk'){
        const resolved=arena.navGraph.resolveEdge(n.id,e.to);
        if(resolved.ok&&resolved.detour){
          const legs=resolved.points.slice(1).map((p,i)=>probeConduitWalk(world,resolved.points[i],p));
          const endpoints=resolved.points.length>2&&Math.hypot(resolved.points[0].x-n.pos.x,resolved.points[0].y-n.pos.y,resolved.points[0].z-n.pos.z)<1e-6&&Math.hypot(resolved.points.at(-1).x-target.pos.x,resolved.points.at(-1).y-target.pos.y,resolved.points.at(-1).z-target.pos.z)<1e-6;
          item.ok=endpoints&&legs.every(p=>p.ok);
          item.detour=true;item.points=resolved.points;item.legs=legs.length;
          if(item.ok)item.reason='collision-checked detour';
        }
      }
      (stair?report.stairs:report.routes).push(item);
    }
    // Ground doorways on both sides of each facade, and upper exits.
    for(const b of arena.config.buildings){
      const to=(x,y,z)=>({x:Math.sin(b.angle)*38+x*Math.cos(b.angle)+z*Math.sin(b.angle),y,z:Math.cos(b.angle)*38-x*Math.sin(b.angle)+z*Math.cos(b.angle)});
      for(const [name,p,q] of [
        ['ground-left',to(-4.8,.65,-7.2),to(-4.8,.65,-3.4)],
        ['ground-right',to(4.8,.65,-7.2),to(4.8,.65,-3.4)],
        ['upper',to(0,5,-7.2),to(0,5,-2.5)],
        ['basement',to(0,-5,-9),to(0,-5,-4.9)]
      ])for(const [dir,from,to] of [['in',p,q],['out',q,p]])report.entrances.push({id:b.id+' '+name+' '+dir,...probeConduitWalk(world,from,to)});
    }
    for(const pad of world.jumpPads)for(const [offsetX,offsetZ] of [[0,0],[.2,.2],[-.2,-.2]])report.pads.push({id:pad.id+' '+offsetX+','+offsetZ,...probeConduitPad(world,pad,{offsetX,offsetZ})});
    assert.equal(report.spawns.length,32);
    assert.equal(report.pads.length,12);
    assert.equal(report.entrances.length,32);
    // Four courtyard flights and sixteen building flights, in both directions.
    assert.equal(report.stairs.length,40);
    assert.equal(report.routes.length,296);
    console.log('CONDUIT_ROUTE_REFINEMENT '+JSON.stringify({direct:report.routes.filter(p=>p.directOK).length,detours:report.routes.filter(p=>p.ok&&p.detour).length,remaining:report.routes.filter(p=>!p.ok).length}));
    const failures=Object.entries(report).filter(([key])=>key!=='untested').flatMap(([category,items])=>items.filter(v=>!v.ok).map(v=>({category,...v})));
    console.log('CONDUIT_TRAVERSAL_REPORT '+JSON.stringify(report));
    console.log('CONDUIT_TRAVERSAL_UNTESTED '+JSON.stringify(report.untested));
    // An unsuccessful probe is a real gate, not a PASS. This draft may be red
    // until physical architecture and graph waypoints have been corrected.
    assert.equal(failures.length,0,JSON.stringify(failures,null,2));
  }finally{
    arena?.dispose();
    if(prev===undefined)delete globalThis.document;else globalThis.document=prev;
  }
});
