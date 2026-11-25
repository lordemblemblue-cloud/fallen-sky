// Conduit minimap presentation data. No renderer, network requests, or gameplay
// authority. Build static geometry once from the approved arena registry.
export const CONDUIT_TIERS=Object.freeze(['T0','T1','T2']);
export const CONDUIT_TIER_NAMES=Object.freeze({T0:'Undercroft',T1:'Courtyard',T2:'Ring & Crown'});
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const isTier=t=>CONDUIT_TIERS.includes(t);
export function conduitTier(y){
  return Number.isFinite(y)?y<-2.5?'T0':y<3.2?'T1':'T2':null;
}
// A grounded, authoritative support tier takes precedence. While airborne,
// keep the last floor instead of flashing through levels during jumps.
export function selectConduitTier(self,previous=null){
  if(!valid(self))return isTier(previous)?previous:'T1';
  if(self.grounded===false&&isTier(previous))return previous;
  return isTier(self.supportTier)?self.supportTier:conduitTier(self.y);
}
const boxCorners=b=>[[-b.hx,-b.hz],[b.hx,-b.hz],[b.hx,b.hz],[-b.hx,b.hz]].map(([x,z])=>[b.cx+x*b.cos+z*b.sin,b.cz-x*b.sin+z*b.cos]);
const floorTier=y=>y<-2.5?'T0':y<3.2?'T1':'T2';
const floorLabel=/Floor|Landing|Bridge|Bsmt Conn$|T0 Tun |T0 Bypass|Perimeter|Courtyard|Ring Walk|Crown Platform|Central Chamber/;
function circlePath(x,z,r){
  return 'M '+(x-r)+' '+z+' a '+r+' '+r+' 0 1 0 '+(2*r)+' 0 a '+r+' '+r+' 0 1 0 '+(-2*r)+' 0 Z';
}
const polygonPath=points=>'M '+points.map(p=>p.join(' ')).join(' L ')+' Z';
export function buildConduitMinimap(arena,{certifiedVentRoutes=[]}={}){
  const {config:cfg,world,pickups=[]}=arena;
  const levels=Object.fromEntries(CONDUIT_TIERS.map(t=>[t,{floors:[],stairs:[],pads:[],pickups:[],buildings:[],vents:[]}]));
  for(const b of world.obbs){
    if(!b.walkable||!floorLabel.test(b.label||'')||b.cy+b.hy>cfg.yT2+.15)continue;
    levels[floorTier(b.cy+b.hy)].floors.push({id:b.label,kind:'polygon',path:polygonPath(boxCorners(b))});
  }
  for(const d of world.discs){
    if(!d.walkable)continue;
    levels[floorTier(d.yMax)].floors.push({id:d.label,kind:'cutout',path:circlePath(d.cx,d.cz,d.radius)+(d.cutouts??[]).map(c=>polygonPath(boxCorners(c))).join(' ')});
  }
  for(const a of world.annuli){
    if(!a.walkable)continue;
    levels[floorTier(a.yMax)].floors.push({id:a.label,kind:'ring',path:circlePath(0,0,a.rMax)+circlePath(0,0,a.rMin)});
  }
  // Show the actual stair/ramp flight positions on both connected levels.
  for(const r of world.ramps){
    const a=floorTier(r.yStart),b=floorTier(r.yEnd);
    // Internal split flights can meet halfway; label determines complete route.
    const tiers=/Bsmt|Courtyard Stair/.test(r.label)?['T0','T1']:/Int Stair/.test(r.label)?['T1','T2']:[...new Set([a,b])];
    const item={id:r.label,x:r.cx,z:r.cz,angle:r.rotY*180/Math.PI,kind:/Stair/.test(r.label)?'stair':'ramp'};
    for(const t of tiers)levels[t].stairs.push(item);
  }
  for(const b of cfg.buildings){
    const x=Math.sin(b.angle)*38,z=Math.cos(b.angle)*38;
    for(const t of CONDUIT_TIERS)levels[t].buildings.push({id:b.id,label:b.name,x,z});
  }
  for(const p of world.jumpPads)if(valid(p))levels.T2.pads.push({id:p.id,x:p.x,z:p.z});
  for(const p of pickups){
    if(!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite))continue;
    const [x,y,z]=p.position;
    levels[conduitTier(y)].pickups.push({id:p.id,label:p.label,x,z});
  }
  // Do not draw prototype routes as playable. Only accept explicitly certified
  // mounted routes supplied by the future combined-map host.
  for(const v of certifiedVentRoutes){
    if(v?.mounted!==true||v.certified!==true||!Array.isArray(v.waypoints)||v.waypoints.length<2||!v.waypoints.every(valid))continue;
    if(v.waypoints.some(p=>conduitTier(p.y)!=='T2'||Math.hypot(p.x,p.z)>cfg.foundationR))continue;
    levels.T2.vents.push({id:v.id,points:v.waypoints.map(p=>[p.x,p.z])});
  }
  return {radius:cfg.foundationR,levels};
}
// The caller must provide only presentation-authorized actors, never raw
// server state. Explicit permission is required even for teammate markers.
export function conduitMinimapMarkers({self,actors=[],tier,localTeam}){
  if(!isTier(tier))return [];
  const out=[],seen=new Set();
  if(valid(self)&&self.alive!==false){
    const level=selectConduitTier(self);
    out.push({id:'self',kind:'self',x:self.x,z:self.z,level,relative:CONDUIT_TIERS.indexOf(level)-CONDUIT_TIERS.indexOf(tier),heading:Number.isFinite(self.heading)?self.heading:0});
    if(typeof self.id==='string')seen.add(self.id);
  }
  for(const a of actors){
    if(out.length>=101)break;
    if(!valid(a)||a.alive!==true||a.mapVisible!==true||typeof a.id!=='string'||!a.id||seen.has(a.id)||a.id==='self')continue;
    const ally=(localTeam==='red'||localTeam==='blue')&&a.team===localTeam;
    if(!ally&&a.enemyReveal!==true)continue;
    const level=isTier(a.supportTier)?a.supportTier:conduitTier(a.y);
    if(!ally&&level!==tier)continue;
    seen.add(a.id);
    out.push({id:a.id,kind:ally?'ally':'enemy',x:a.x,z:a.z,level,relative:CONDUIT_TIERS.indexOf(level)-CONDUIT_TIERS.indexOf(tier)});
  }
  return out;
}
export function conduitPickupStatus(id,states){
  const p=states&&Object.hasOwn(states,id)?states[id]:null;
  if(p?.available===true)return {available:true,seconds:null};
  if(p?.available===false)return {available:false,seconds:Number.isFinite(p.remaining)?Math.max(0,Math.ceil(p.remaining)):null};
  return {available:null,seconds:null};
}
