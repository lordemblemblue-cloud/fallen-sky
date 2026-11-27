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
export const CAMPAIGN_QUESTS=Object.freeze([ROAD_QUEST,WATERFALL_QUEST,CAVE_QUEST]);
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
