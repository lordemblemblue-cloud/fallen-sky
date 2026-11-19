// Town side-quest spatial contract. Client-side NPC intent/progress ONLY.
// No XP, Silver, rarity, inventory, or server loot is awarded here.
export const WOLFVEIL_CIVIC_TASKS=Object.freeze([
 Object.freeze({id:'civic_mint_for_healer',npcId:'civic_yuki',title:'Mint for the Apothecary',
  sourceId:'civic_willow_mint_cache',sourceLabel:'Mint and Willow',sourceX:11,sourceZ:-37,
  itemId:'civic_mint_willow_bundle',objectiveCount:1,interactRadius:2.3,
  instruction:'A mint and willow bundle grows beside the southern avenue. Find it and return to Yuki.'}),
 Object.freeze({id:'civic_guard_lost_dispatch',npcId:'guard_sera',title:'Lost Patrol Dispatch',
  sourceId:'civic_guard_dispatch_satchel',sourceLabel:'Patrol Dispatch',sourceX:-11,sourceZ:-52,
  itemId:'civic_dispatch_scroll',objectiveCount:1,interactRadius:2.3,
  instruction:'A patrol satchel was dropped on the southern road. Find the marked bundle and return to Sera.'}),
]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
export function prepareWolfveilCivicSources(collision,definitions=WOLFVEIL_CIVIC_TASKS){
 if(typeof collision?.groundAt!=='function'||typeof collision?.isSolid!=='function')throw new TypeError('Real town collision required');
 const sources=[];const ids=new Set();
 for(const task of definitions){
  if(ids.has(task.sourceId))throw new Error('Duplicate source ID');ids.add(task.sourceId);
  const wanted={x:task.sourceX,z:task.sourceZ};let placed=null;
  // Conservatively relocate around an authored anchor if the active town
  // already occupies it; never place inside a house or on the fountain.
  for(const radius of [0,1.3,2.5,3.8,5]){
   const segments=radius===0?1:16;
   for(let i=0;i<segments;i++){
    const angle=i*Math.PI*2/segments;
    const p={x:wanted.x+Math.cos(angle)*radius,z:wanted.z+Math.sin(angle)*radius};
    if(!finite(p)||!Number.isFinite(collision.groundAt(p.x,p.z))||collision.isSolid(p.x,p.z,.75))continue;
    if(sources.some(s=>distance(s,p)<3.5))continue;
    placed=p;break;
   }
   if(placed)break;
  }
  // No source means no valid quest offer: never promise an impossible task.
  if(!placed)continue;
  sources.push(Object.freeze({...task,x:placed.x,z:placed.z,y:collision.groundAt(placed.x,placed.z)}));
 }
 return Object.freeze(sources);
}
export function createWolfveilCivicTaskRuntime(sources){
 const states=new Map(),bySource=new Map(sources.map(s=>[s.sourceId,s]));
 const findTask=npcId=>sources.find(s=>s.npcId===npcId)||null;
 function talk(npcId){
  const task=findTask(npcId);if(!task)return null;
  const status=states.get(task.id)||'available';
  if(status==='available'){
   // E interaction accepts a local world objective with an actually placed
   // visible item. Granting the eventual reward requires server verification.
   states.set(task.id,'accepted');
   return {taskId:task.id,taskStatus:'accepted',questOffer:false,canGrantItems:false,
    text:task.title+': '+task.instruction};
  }
  if(status==='accepted')return {taskId:task.id,taskStatus:'in_progress',questOffer:false,canGrantItems:false,
   text:'Still looking for '+task.sourceLabel+'? It is along the southern road.'};
  if(status==='found'){
   states.set(task.id,'awaiting_server');
   return {taskId:task.id,taskStatus:'awaiting_server',questOffer:false,canGrantItems:false,
    text:'Thank you for finding '+task.sourceLabel+'. The handoff is recorded locally; rewards require verified server completion.'};
  }
  return {taskId:task.id,taskStatus:'awaiting_server',questOffer:false,canGrantItems:false,
   text:'I have your delivery. The town ledger must confirm it before any reward is paid.'};
 }
 function nearestAvailableSource(player,maxDistance=2.3){
  if(!finite(player))return null;
  let best=null,range=maxDistance;
  for(const source of sources){
   if(states.get(source.id)!=='accepted')continue;
   const d=distance(player,source);if(d<=Math.min(range,source.interactRadius)){
    best=source;range=d;
   }
  }
  return best;
 }
 function pickup(player){
  const source=nearestAvailableSource(player);
  if(!source)return null;
  const stored=bySource.get(source.sourceId);
  if(stored!==source||states.get(source.id)!=='accepted')return null;
  states.set(source.id,'found');
  return {taskId:source.id,taskStatus:'found',sourceId:source.sourceId,itemId:source.itemId,
   canGrantItems:false,grantXP:0,grantSilver:0,
   text:'Located '+source.sourceLabel+'. Return to '+(source.npcId==='civic_yuki'?'Yuki':'Sera')+' for verification.'};
 }
 function snapshot(){return Object.fromEntries(sources.map(s=>[s.id,states.get(s.id)||'available']));}
 return {talk,nearestAvailableSource,pickup,snapshot,get sources(){return sources;}};
}
