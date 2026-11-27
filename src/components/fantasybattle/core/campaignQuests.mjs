// Versioned, bounded Chapter 2 journal state. Victories are derived from the existing world record.
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
const defeated=(p,id)=>p?.world?.completedEncounters?.includes(id)===true;
const unlocked=p=>p?.quests?.grove==='claimed'&&defeated(p,'wilds_grove_01');
export function roadQuest(p){
 const done=ROAD_QUEST.objectives.map(o=>({...o,done:defeated(p,o.id)}));
 const count=done.filter(o=>o.done).length;
 const stored=p?.quests?.campaign?.pilgrimRoad;
 const state=!unlocked(p)?'locked':stored==='claimed'&&count===done.length?'claimed':stored==='active'?(count===done.length?'complete':'active'):'available';
 return {state,count,total:done.length,objectives:done};
}
// Older saves omit campaign. Reject unknown keys, impossible claims and unbounded state.
export function validCampaign(p){
 if(!Object.hasOwn(p.quests||{},'campaign'))return true;
 const c=p.quests.campaign;
 return Boolean(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length===2&&Object.hasOwn(c,'version')&&Object.hasOwn(c,'pilgrimRoad')&&c.version===1&&['active','claimed'].includes(c.pilgrimRoad)&&unlocked(p)&&(c.pilgrimRoad!=='claimed'||ROAD_QUEST.objectives.every(o=>defeated(p,o.id))));
}
export function cleanCampaign(p){
 return Object.hasOwn(p.quests,'campaign')?{campaign:{version:1,pilgrimRoad:p.quests.campaign.pilgrimRoad}}:{};
}
export function changeRoadQuest(p,action){
 if(!validCampaign(p))throw Error('Invalid campaign progress.');
 const state=roadQuest(p).state;
 if(!((action==='accept'&&state==='available')||(action==='claim'&&state==='complete')))throw Error('Quest action is not available.');
 return {...p,quests:{...p.quests,campaign:{version:1,pilgrimRoad:action==='accept'?'active':'claimed'}}};
}
