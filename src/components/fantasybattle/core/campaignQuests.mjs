// Versioned, bounded campaign journal state. Victories are derived from the existing world record.
export const ROAD_QUEST=Object.freeze({
 id:'pilgrimRoad',title:'The Road of Unfinished Promises',
 offer:'The sentinels have turned against travelers. Clear both road encounters and reopen the pilgrimage route.',
 description:'The watch was ordered to protect the road. Now it protects the road from the people on it.',
 completion:'The road is open. The Warden can travel with us, if we choose to ask.',
 objectives:Object.freeze([
  Object.freeze({id:'wilds_pilgrimage_01',label:'Clear the first pilgrimage encounter'}),
  Object.freeze({id:'wilds_pilgrimage_02',label:'Clear the second pilgrimage encounter'})
 ])
});
export const WATERFALL_QUEST=Object.freeze({
 id:'waterfall',title:'The Waterfall That Speaks',prerequisite:'pilgrimRoad',
 offer:'A voice travels upstream against the falling water. Find its source and clear the shade blocking the passage.',
 description:'The Mist Scout believes the echo is a signal from a shrine further up the mountain.',
 completion:'The passage is safe. The signal leads uphill; the Mist Scout may join us.',
 objectives:Object.freeze([Object.freeze({id:'wilds_waterfall_01',label:'Defeat the Waterfall Mist Spirit'})])
});
export const CAVE_QUEST=Object.freeze({
 id:'caveEcho',title:'Echoes Beneath the Falls',prerequisite:'waterfall',optional:true,
 offer:'An old message echoes from the nearby cave. Investigate the spirit within.',
 description:'The cave spirit repeats a signal out of sequence. Clear the encounter to investigate the echo.',
 completion:'The shrine network repeats old messages out of order. That explains the bell heard before it rang.',
 objectives:Object.freeze([Object.freeze({id:'wilds_cave_01',label:'Defeat the cave spirit'})])
});
export const HEIGHTS_QUEST=Object.freeze({
 id:'heights',title:'The Heights',prerequisite:'waterfall',
 offer:'The shrine relays are repeating old warnings. Clear the two encounters guarding the upper path.',
 description:'A warning repeated long enough becomes a command. The relay stations point toward the sanctuary.',
 completion:'The upper path is clear. The sanctuary is still broadcasting the emergency signal.',
 objectives:Object.freeze([
  Object.freeze({id:'wilds_heights_01',label:'Clear the first Heights encounter'}),
  Object.freeze({id:'wilds_heights_02',label:'Clear the second Heights encounter'})
 ])
});
export const ELITE_TRIAL=Object.freeze({
 id:'heightsTrial',title:'Trial of the Silent Watch',prerequisite:'waterfall',optional:true,
 offer:'An elite guardian remains at the Heights. Challenge it only when your party is ready.',
 description:'The guardian was trained to test those approaching the sanctuary. Its trial is not required to reach the shrine.',
 completion:'The guardian has fallen silent. The watch once tested resolve, not obedience.',
 objectives:Object.freeze([Object.freeze({id:'wilds_heights_elite',label:'Defeat the Heights elite guardian'})])
});
export const SANCTUARY_QUEST=Object.freeze({
 id:'sanctuary',title:'Sapphire Sanctuary',prerequisite:'heights',
 offer:'The sanctuary is still broadcasting the emergency signal. Defeat its outer guard and the Gatekeeper to end the lockdown.',
 description:'The Gatekeeper defends a network overloaded with memories. Opening the sanctuary is the first step toward discovering the original signal.',
 completion:'The sanctuary is open. Its oldest signal came from beyond these walls; follow it toward Moonveil.',
 objectives:Object.freeze([
  Object.freeze({id:'wilds_sanctuary_guard',label:'Defeat the sanctuary guard'}),
  Object.freeze({id:'wilds_sanctuary_boss',label:'Defeat the sanctuary Gatekeeper'})
 ])
});
export const CAMPAIGN_QUESTS=Object.freeze([ROAD_QUEST,WATERFALL_QUEST,CAVE_QUEST,HEIGHTS_QUEST,ELITE_TRIAL,SANCTUARY_QUEST]);
const defeated=(p,id)=>p?.world?.completedEncounters?.includes(id)===true;
const discovered=(p,id)=>p?.world?.discoveries?.includes(id)===true;
// Only catalogued objective IDs are used; no dialogue or asset can grant progress.
const objectiveDone=(p,o)=>o.kind==='discovery'?discovered(p,o.id):defeated(p,o.id);
const allDone=(p,q)=>q.objectives.every(o=>objectiveDone(p,o));
const groveUnlocked=p=>p?.quests?.grove==='claimed'&&defeated(p,'wilds_grove_01');
const unlocked=(p,q)=>groveUnlocked(p)&&(!q.prerequisite||p?.quests?.campaign?.[q.prerequisite]==='claimed'&&allDone(p,CAMPAIGN_QUESTS.find(x=>x.id===q.prerequisite)));
export function campaignQuest(p,id){
 const q=CAMPAIGN_QUESTS.find(x=>x.id===id);
 if(!q)return null;
 const objectives=q.objectives.map(o=>({...o,done:objectiveDone(p,o)}));
 const count=objectives.filter(o=>o.done).length,total=objectives.length;
 const stored=p?.quests?.campaign?.[id];
 const state=!unlocked(p,q)?'locked':stored==='claimed'&&count===total?'claimed':stored==='active'?(count===total?'complete':'active'):'available';
 return {state,count,total,objectives};
}
export const roadQuest=p=>campaignQuest(p,ROAD_QUEST.id);
// Optional field on older saves. Only known quest keys and states can be preserved.
export function validCampaign(p){
 if(!Object.hasOwn(p.quests||{},'campaign'))return true;
 const c=p.quests.campaign;
 if(!c||typeof c!=='object'||Array.isArray(c)||!Object.hasOwn(c,'version')||c.version!==1)return false;
 const ids=Object.keys(c).filter(k=>k!=='version');
 if(!ids.length||ids.length>CAMPAIGN_QUESTS.length)return false;
 return ids.every(id=>{
  const q=CAMPAIGN_QUESTS.find(x=>x.id===id);
  return q&&['active','claimed'].includes(c[id])&&unlocked(p,q)&&(c[id]!=='claimed'||allDone(p,q));
 });
}
export function cleanCampaign(p){
 if(!Object.hasOwn(p.quests,'campaign'))return {};
 return {campaign:{version:1,...Object.fromEntries(CAMPAIGN_QUESTS.filter(q=>Object.hasOwn(p.quests.campaign,q.id)).map(q=>[q.id,p.quests.campaign[q.id]]))}};
}
export function changeCampaignQuest(p,id,action){
 if(!validCampaign(p))throw Error('Invalid campaign progress.');
 const state=campaignQuest(p,id)?.state;
 if(!((action==='accept'&&state==='available')||(action==='claim'&&state==='complete')))throw Error('Quest action is not available.');
 return {...p,quests:{...p.quests,campaign:{...p.quests.campaign,version:1,[id]:action==='accept'?'active':'claimed'}}};
}
export const changeRoadQuest=(p,action)=>changeCampaignQuest(p,ROAD_QUEST.id,action);

// Main story always takes priority over optional trials in the exploration HUD.
export function trackedCampaign(p){
 if(!p)return null;
 const entries=CAMPAIGN_QUESTS.map(q=>({q,progress:campaignQuest(p,q.id)}));
 return entries.find(e=>!e.q.optional&&['active','complete'].includes(e.progress.state))
  ||entries.find(e=>!e.q.optional&&e.progress.state==='available')
  ||entries.find(e=>e.q.optional&&['active','complete'].includes(e.progress.state))
  ||null;
}
export function campaignPrompt(p){
 const entry=trackedCampaign(p);
 if(!entry)return null;
 const {q,progress}=entry;
 if(progress.state==='available')return 'New quest: '+q.title;
 if(progress.state==='complete')return 'Complete in journal: '+q.title;
 return q.title+' · '+(progress.objectives.find(o=>!o.done)?.label||'Review journal');
}
export function campaignServiceNote(p){
 const entry=trackedCampaign(p);
 if(!entry)return null;
 return entry.progress.state==='complete'?'Return to the journal to record your progress.':entry.q.offer;
}
