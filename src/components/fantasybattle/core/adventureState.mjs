// Browser-local guest save/progression service. No privileged Base44 endpoints or cloud claims.
export const SAVE_KEY='fantasyBattle.sapphire.saves.v1';
export const SETTINGS_KEY='fantasyBattle.sapphire.settings.v1';
export const SLOT_IDS=['1','2','3'];
export const STAT_KEYS=['vitality','strength','defense','speed'];
export const DEFAULT_SETTINGS=Object.freeze({quality:'performance',muted:false,reducedMotion:false});
const uniqueStrings=a=>Array.isArray(a)&&a.length<=1000&&a.every(x=>typeof x==='string'&&x.length<=160);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const copy=o=>JSON.parse(JSON.stringify(o));
export const levelFor=xp=>1+Math.floor(xp/100);
export const learnedAt=Object.freeze({quickShot:1,guard:1,volley:2,chargedShot:3});
export const availableActions=level=>Object.keys(learnedAt).filter(k=>level>=learnedAt[k]);
export const pointsFor=p=>Math.max(0,levelFor(p.xp)-1-STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0));
export function createProfile(name){
  const clean=String(name??'').trim().slice(0,40);
  if(!clean)throw Error('Enter a character name.');
  return {version:1,id:crypto.randomUUID(),name:clean,xp:0,attributes:{vitality:0,strength:0,defense:0,speed:0},world:{position:[6,0,0],discoveries:[],completedEncounters:[],visitedRegions:[]},quests:{grove:'available'},createdAt:Date.now()};
}
export function isProfile(p){
  return p?.version===1&&typeof p.id==='string'&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=40&&integer(p.xp,0,100000)&&STAT_KEYS.every(k=>integer(p.attributes?.[k],0,1000))&&STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0)<=levelFor(p.xp)-1&&Array.isArray(p.world?.position)&&p.world.position.length===3&&p.world.position.every(Number.isFinite)&&p.world.position[0]>=1.5&&p.world.position[0]<=218&&p.world.position[2]>=-6.8&&p.world.position[2]<=3.4&&uniqueStrings(p.world.discoveries)&&uniqueStrings(p.world.completedEncounters)&&uniqueStrings(p.world.visitedRegions)&&['available','active','complete','claimed'].includes(p.quests?.grove)&&Number.isFinite(p.createdAt);
}
export function readSlots(storage){
  let raw;try{raw=storage.getItem(SAVE_KEY);}catch(error){return {slots:[],error:String(error?.message||error)};}
  if(!raw)return {slots:[],error:null};
  let data;try{data=JSON.parse(raw);}catch{return {slots:[],error:'Save data is damaged. No save has been removed.'};}
  if(!data||typeof data!=='object'||Array.isArray(data))return {slots:[],error:'Save format is invalid.'};
  return {slots:SLOT_IDS.filter(id=>Object.hasOwn(data,id)).map(id=>{const s=data[id];return isProfile(s?.profile)&&Number.isFinite(s?.savedAt)?{id,status:'valid',savedAt:s.savedAt,profile:s.profile}:{id,status:'corrupt'};}),error:null};
}
export function writeSlot(storage,id,profile,{overwrite=false}={}){
  if(!SLOT_IDS.includes(id)||!isProfile(profile))throw Error('Invalid save slot or profile.');
  const raw=storage.getItem(SAVE_KEY);
  const data=raw?JSON.parse(raw):{};
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Save data is damaged.');
  if(Object.hasOwn(data,id)&&!overwrite)throw Error('Confirm overwrite first.');
  const record={savedAt:Date.now(),profile:copy(profile)};
  storage.setItem(SAVE_KEY,JSON.stringify({...data,[id]:record}));
  return record;
}
export function mostRecent(slots){return slots.filter(s=>s.status==='valid').sort((a,b)=>b.savedAt-a.savedAt)[0]||null;}
export function readSettings(storage){
  try{const p=JSON.parse(storage.getItem(SETTINGS_KEY)||'{}');return {quality:['performance','balanced','high','cinematic'].includes(p.quality)?p.quality:'performance',muted:p.muted===true,reducedMotion:p.reducedMotion===true};}catch{return {...DEFAULT_SETTINGS};}
}
export function updateWorld(p,w){
  if(!p||!w||!Array.isArray(w.position)||w.position.length!==3||!w.position.every(Number.isFinite))return p;
  const region=w.regions?.find(r=>w.position[0]>=r.minX&&w.position[0]<=r.maxX);
  return {...p,world:{...p.world,position:[Math.max(1.5,Math.min(218,w.position[0])),w.position[1],Math.max(-6.8,Math.min(3.4,w.position[2]))],discoveries:uniqueStrings(w.discoveries)?[...new Set([...p.world.discoveries,...w.discoveries])]:p.world.discoveries,visitedRegions:region?[...new Set([...p.world.visitedRegions,region.id])]:p.world.visitedRegions}};
}
export function rewardVictory(p,encounter){
  if(!p||!encounter?.id||p.world.completedEncounters.includes(encounter.id))return {profile:p,xp:0,leveled:false,unlocked:[]};
  // Explicit prototype balancing: one-time 25 XP for normal encounters, 50 elite, 100 boss.
  const xp=encounter.category==='Boss'?100:encounter.category==='Elite'?50:25;
  const oldLevel=levelFor(p.xp),newLevel=levelFor(p.xp+xp);
  const completedEncounters=[...p.world.completedEncounters,encounter.id];
  const quest=p.quests.grove==='active'&&completedEncounters.includes('wilds_grove_01')?'complete':p.quests.grove;
  return {profile:{...p,xp:p.xp+xp,world:{...p.world,completedEncounters},quests:{...p.quests,grove:quest}},xp,leveled:newLevel>oldLevel,unlocked:availableActions(newLevel).filter(x=>!availableActions(oldLevel).includes(x))};
}
export function allocate(p,key){if(!STAT_KEYS.includes(key)||pointsFor(p)<1)return p;return {...p,attributes:{...p.attributes,[key]:p.attributes[key]+1}};}
export function heroStats(p){const a=p?.attributes||{vitality:0,strength:0,defense:0,speed:0};return {maxHp:120+10*a.vitality,atk:12+2*a.strength,def:10+2*a.defense,spd:11+a.speed};}
export function acceptGroveQuest(p){return p.quests.grove!=='available'?p:{...p,quests:{...p.quests,grove:p.world.completedEncounters.includes('wilds_grove_01')?'complete':'active'}};}
export function claimGroveQuest(p){return p.quests.grove!=='complete'?p:{...p,quests:{...p.quests,grove:'claimed'}};}
