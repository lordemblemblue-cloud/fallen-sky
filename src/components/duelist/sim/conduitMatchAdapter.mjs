// Trusted build-time manifest shared by the future server and client prediction.
// Never create a live manifest from a player's request or browser state.
import {snapshotConduitCollision,conduitSupport,conduitBlockers,conduitGrounded,moveConduitBody,conduitLaunchVelocity} from './conduitTraversal.mjs';
import {chooseConduitSpawn,auditConduitPlacement} from './conduitPlacement.mjs';
import {createConduitRouteResolver} from './conduitRouteResolver.mjs';
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const point=p=>({x:p.x,y:p.y,z:p.z});
const deepFreeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(deepFreeze);Object.freeze(o);}return o;};
export const CONDUIT_LAYOUT_ID='the-conduit';
export const CONDUIT_LAYOUT_VERSION=1;
export const CONDUIT_MODE_RULES=Object.freeze({tdm:Object.freeze({teams:true,capacity:8}),ffa:Object.freeze({teams:false,capacity:6})});
export function buildConduitMatchManifest(arena){
  const cfg=arena.config;
  const world=snapshotConduitCollision(arena.world);
  const spawns=JSON.parse(JSON.stringify(arena.spawnCandidates));
  const pickups=arena.pickups.map(p=>({id:p.id,label:p.label,position:p.position.slice(),respawn:p.respawn}));
  const nodes=[...arena.navGraph.nodes.values()].map(n=>({id:n.id,pos:point(n.pos),tier:n.tier,edges:n.edges.map(e=>({...e}))}));
  return deepFreeze({id:CONDUIT_LAYOUT_ID,version:CONDUIT_LAYOUT_VERSION,radius:cfg.foundationR,gravity:cfg.gravity,padTime:cfg.jumpPadFlightTime,world,spawns,pickups,nodes});
}
export function createConduitMatchAdapter(manifest,{mode='tdm',random=null}={}){
  if(!Object.hasOwn(CONDUIT_MODE_RULES,mode))throw new TypeError('Unsupported Conduit match mode');
  if(mode==='ffa'&&typeof random!=='function')throw new TypeError('FFA requires a match-owned random generator');
  if(manifest?.id!==CONDUIT_LAYOUT_ID||manifest.version!==CONDUIT_LAYOUT_VERSION||manifest.radius!==44.8||
    manifest.gravity!==-22||manifest.padTime!==1.45||!Array.isArray(manifest.nodes)||
    !Array.isArray(manifest.spawns?.blue)||!Array.isArray(manifest.spawns?.red)||!Array.isArray(manifest.pickups))throw new TypeError('Invalid trusted Conduit manifest');
  const data=deepFreeze(JSON.parse(JSON.stringify(manifest))),world=snapshotConduitCollision(data.world);
  if(data.nodes.some(n=>!valid(n.pos)||typeof n.id!=='string'||!Array.isArray(n.edges))||
    new Set(data.nodes.map(n=>n.id)).size!==data.nodes.length)throw new TypeError('Invalid navigation data');
  const nodes=new Map(data.nodes.map(n=>[n.id,n]));
  if(data.nodes.some(n=>n.edges.some(e=>!nodes.has(e.to))))throw new TypeError('Missing navigation endpoint');
  const route=createConduitRouteResolver(world,nodes),reserved=new Map();
  // Match-local reservation only. The future authoritative match loop owns
  // request identity, occupancy, expiration and commit/abort on each tick.
  // North and south spawn banks are the same map's existing candidates.
  // FFA uses the union, with no inherited team allegiance.
  const teams=Object.freeze({
    blue:Object.freeze(data.spawns.blue.filter(p=>p.z<0&&auditConduitPlacement(world,p).ok)),
    red:Object.freeze(data.spawns.red.filter(p=>p.z>0&&auditConduitPlacement(world,p).ok))
  });
  // Eight evenly spaced Ring Walk anchors, offset from the four pad axes.
  // No Crown spawns: they would grant immediate power-up/landing control.
  const upper=[];
  for(const i of [2,6,10,14,18,22,26,30]){
    const node=nodes.get('t2_arc_'+i);
    if(!node)continue;
    const p={id:'ffa_upper_'+i,team:null,...point(node.pos)};
    if(p.y===5&&auditConduitPlacement(world,p).ok)upper.push(p);
  }
  const ffa=Object.freeze([...teams.blue,...teams.red,...upper].map(p=>Object.freeze({...p,team:null})));
  function reserveSpawn(playerId,team=null,{enemies=[],occupants=[],recentIds=[],canSee=null,requireUnexposed=false}={}){
    if(typeof playerId!=='string'||!playerId||(mode==='tdm'?!Object.hasOwn(teams,team):team!==null))return null;
    if(reserved.has(playerId)){
      const held=reserved.get(playerId);return held.team===team?held:null;
    }
    const policy={enemies,occupants,reserved:[...reserved.values()],recentIds,canSee,requireUnexposed};
    let result;
    if(mode==='tdm'){
      result=chooseConduitSpawn(world,teams[team],policy);
    }else{
      // Randomize only among fully audited, currently safe candidates.
      // Prefer unused recent positions, and never bypass the danger checks.
      const safe=ffa.map(p=>chooseConduitSpawn(world,[p],policy)).filter(Boolean);
      if(!safe.length)return null;
      const recent=new Set(recentIds),fresh=safe.filter(p=>!recent.has(p.spawn.id));
      const choices=fresh.length?fresh:safe;
      const roll=random();
      if(!Number.isFinite(roll)||roll<0||roll>=1)throw new RangeError('Invalid match random value');
      result=choices[Math.floor(roll*choices.length)];
    }
    if(!result)return null;
    const p=result.spawn;
    const spawn=Object.freeze({...p,yaw:Math.atan2(-p.x,-p.z)});
    reserved.set(playerId,spawn);return spawn;
  }
  function padAt(body,grounded){
    if(!valid(body)||!grounded)return null;
    return world.jumpPads.find(p=>Math.abs(p.y-body.y)<=.45&&Math.hypot(p.x-body.x,p.z-body.z)<=p.triggerRadius)??null;
  }
  return {
    id:data.id,version:data.version,mode,rules:CONDUIT_MODE_RULES[mode],world,pickups:data.pickups,spawnCandidates:data.spawns,modeSpawnCandidates:mode==='tdm'?teams:ffa,
    support(x,z,upper,lower=-Infinity,radius=0){return conduitSupport(world,x,z,upper,lower,radius);},
    blockers(body,radius=.4,height=1.8){return conduitBlockers(world,body,radius,height);},
    grounded(body,radius=.4){return conduitGrounded(world,body,radius);},
    move(body,dx,dz,dy,options){return moveConduitBody(world,body,dx,dz,dy,options);},
    findRoute:route.findRoute,resolveEdge:route.resolveEdge,reserveSpawn,
    releaseSpawn(playerId){return reserved.delete(playerId);},
    padAt,
    launch(body,grounded){const p=padAt(body,grounded);return p?{id:p.id,velocity:conduitLaunchVelocity(p,body,data.gravity,data.padTime)}:null;},
    pickupPositionClear(id){const p=data.pickups.find(v=>v.id===id);if(!p)return false;const [x,y,z]=p.position;return auditConduitPlacement(world,{x,y,z},{radius:.55,height:1.8}).ok;}
  };
}
