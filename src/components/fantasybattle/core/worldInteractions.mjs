// Runtime services retain existing positions and IDs. Planned anchors are not spawn instructions.
const service=(id,label,x,z,role)=>Object.freeze({id,label,x,z,role,radius:2.4,verticalRadius:2});
export const WORLD_SERVICES=Object.freeze([
 service('grove_service','Grove rest point',9,-1.4,'Trail attendant'),
 service('sanctuary_service','Sanctuary services',191,-1.4,'Sanctuary attendant'),
 service('moonveil_service','Moonveil rest point',226,-1.4,'Garden attendant')
]);
export const serviceFor=id=>WORLD_SERVICES.find(s=>s.id===id)||null;
export function withinService(position,service,groundY){
 return Boolean(service&&Array.isArray(position)&&position.length===3&&position.every(Number.isFinite)&&Number.isFinite(groundY)&&Math.hypot(position[0]-service.x,position[2]-service.z)<=service.radius&&Math.abs(position[1]-groundY)<service.verticalRadius);
}
export function nearestService(position,groundAt){
 return WORLD_SERVICES.filter(s=>withinService(position,s,groundAt(s.x,s.z))).sort((a,b)=>Math.hypot(position[0]-a.x,position[2]-a.z)-Math.hypot(position[0]-b.x,position[2]-b.z))[0]||null;
}
// Host independently checks the registered ID and horizontal position. World validates height.
export function liveService(world,id){
 const s=serviceFor(id),p=world?.position;
 return Boolean(s&&world?.mode==='wilds'&&world.nearbyService===id&&Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&Math.hypot(p[0]-s.x,p[2]-s.z)<=s.radius);
}
const anchor=(id,kind,region,existingId=null)=>Object.freeze({id,kind,region,existingId,transform:null,status:'awaiting-approved-map'});
export const PLANNED_ANCHORS=Object.freeze([
 anchor('fb.trail.keeper','npc',0,'grove_service'),
 anchor('fb.grove.approach','warning',0),
 anchor('fb.grove.recruit','npc',0),
 anchor('fb.pilgrim.warning','warning',1),
 anchor('fb.pilgrim.recruit','npc',1),
 anchor('fb.pilgrim.ledger','treasure',1,'disc_pilgrimage'),
 anchor('fb.pilgrim.escort_return','npc',1,'grove_service'),
 anchor('fb.waterfall.lookout','warning',2),
 anchor('fb.waterfall.recruit','npc',2),
 anchor('fb.cave.echo','lore',3,'disc_cave'),
 anchor('fb.heights.relay','lore',4),
 anchor('fb.heights.relay_upper','lore',4),
 anchor('fb.heights.trial_warning','warning',4),
 anchor('fb.heights.rest_approach','warning',4),
 anchor('fb.heights.sanctuary_view','lore',4),
 anchor('fb.sanctuary.outer_warning','warning',5),
 anchor('fb.sanctuary.prepare','service',5,'sanctuary_service'),
 anchor('fb.sanctuary.gatekeeper_intro','warning',5),
 anchor('fb.sanctuary.epilogue','lore',5),
 anchor('fb.moonveil.archive','treasure',6,'disc_moonveil'),
 anchor('fb.moonveil.keeper_warning','warning',6),
 anchor('fb.astral.signal_echo','lore',7),
 anchor('fb.astral.observatory','warning',7),
 anchor('fb.astral.epilogue','lore',7)
]);
// Validate candidate transforms for review only; approval, walkability, collision and art are separate.
const RANGES=Object.freeze([[1.5,35],[35,75],[75,110],[110,140],[140,185],[185,220],[220,260],[260,300]]);
export function validAnchorTransform(id,t){
 const a=PLANNED_ANCHORS.find(a=>a.id===id);
 if(!a||!t||typeof t!=='object'||Array.isArray(t))return false;
 const {position,facing,radius}=t,[min,max]=RANGES[a.region];
 return Array.isArray(position)&&position.length===3&&position.every(Number.isFinite)&&position[0]>=min&&position[0]<max&&position[2]>=-6.8&&position[2]<=3.4&&Math.abs(position[1])<=100&&Number.isFinite(facing)&&Math.abs(facing)<=Math.PI*2&&Number.isFinite(radius)&&radius>=1&&radius<=3;
}
