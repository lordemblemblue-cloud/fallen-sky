// Browser-local guest save/progression service. No privileged Base44 endpoints or cloud claims.
export const SAVE_KEY='fantasyBattle.sapphire.saves.v1';
export const SETTINGS_KEY='fantasyBattle.sapphire.settings.v1';
export const ITEMS=Object.freeze({
  starterBow:{name:'Silver Archer Bow',kind:'weapon',atk:0,buy:0,sell:0},
  sapphireBow:{name:'Sapphire Longbow',kind:'weapon',atk:4,buy:90,sell:40},
  recoveryTonic:{name:'Recovery Tonic',kind:'consumable',heal:40,buy:20,sell:8},
  sapphireOre:{name:'Sapphire Ore',kind:'material',buy:15,sell:6}
});
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
  return {version:1,id:globalThis.crypto.randomUUID(),name:clean,xp:0,hp:120,gold:0,inventory:{starterBow:1,sapphireBow:0,recoveryTonic:1,sapphireOre:0},equipped:'starterBow',enhancements:{starterBow:0,sapphireBow:0},rewardedDiscoveries:[],attributes:{vitality:0,strength:0,defense:0,speed:0},world:{position:[6,0,0],discoveries:[],completedEncounters:[],visitedRegions:[]},quests:{grove:'available'},createdAt:Date.now()};
}
export function isProfile(p){
  return p?.version===1&&typeof p.id==='string'&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=40&&integer(p.xp,0,100000)&&STAT_KEYS.every(k=>integer(p.attributes?.[k],0,1000))&&STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0)<=levelFor(p.xp)-1&&Array.isArray(p.world?.position)&&p.world.position.length===3&&p.world.position.every(Number.isFinite)&&p.world.position[0]>=1.5&&p.world.position[0]<=218&&p.world.position[2]>=-6.8&&p.world.position[2]<=3.4&&uniqueStrings(p.world.discoveries)&&uniqueStrings(p.world.completedEncounters)&&uniqueStrings(p.world.visitedRegions)&&['available','active','complete','claimed'].includes(p.quests?.grove)&&Number.isFinite(p.createdAt)&&integer(p.hp,1,heroStats(p).maxHp)&&integer(p.gold,0,10000000)&&Object.keys(ITEMS).every(k=>integer(p.inventory?.[k],0,100000))&&['starterBow','sapphireBow'].includes(p.equipped)&&p.inventory[p.equipped]>0&&['starterBow','sapphireBow'].every(k=>integer(p.enhancements?.[k],0,5))&&uniqueStrings(p.rewardedDiscoveries);
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
export function rewardVictory(p,encounter,remainingHp=p?.hp){
  if(!p||!encounter?.id||p.world.completedEncounters.includes(encounter.id))return {profile:p,xp:0,leveled:false,unlocked:[],gold:0,loot:[]};
  // Explicit prototype balancing: one-time 25 XP for normal encounters, 50 elite, 100 boss.
  const xp=encounter.category==='Boss'?100:encounter.category==='Elite'?50:25;
  const gold=encounter.category==='Boss'?80:encounter.category==='Elite'?45:25;
  const ore=encounter.category==='Boss'?3:encounter.category==='Elite'?2:1;
  const oldLevel=levelFor(p.xp),newLevel=levelFor(p.xp+xp);
  const completedEncounters=[...p.world.completedEncounters,encounter.id];
  const quest=p.quests.grove==='active'&&completedEncounters.includes('wilds_grove_01')?'complete':p.quests.grove;
  return {profile:{...p,xp:p.xp+xp,hp:Math.max(1,Math.min(heroStats(p).maxHp,Number.isInteger(remainingHp)?remainingHp:p.hp)),gold:p.gold+gold,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre+ore},world:{...p.world,completedEncounters},quests:{...p.quests,grove:quest}},xp,gold,loot:[{id:'sapphireOre',count:ore}],leveled:newLevel>oldLevel,unlocked:availableActions(newLevel).filter(x=>!availableActions(oldLevel).includes(x))};
}
export function allocate(p,key){if(!STAT_KEYS.includes(key)||pointsFor(p)<1)return p;return {...p,hp:p.hp+(key==='vitality'?10:0),attributes:{...p.attributes,[key]:p.attributes[key]+1}};}
export function heroStats(p){const a=p?.attributes||{vitality:0,strength:0,defense:0,speed:0};return {maxHp:120+10*a.vitality,atk:12+2*a.strength+(ITEMS[p?.equipped]?.atk||0)+(p?.enhancements?.[p?.equipped]||0)*2,def:10+2*a.defense,spd:11+a.speed};}
export function acceptGroveQuest(p){return p.quests.grove!=='available'?p:{...p,quests:{...p.quests,grove:p.world.completedEncounters.includes('wilds_grove_01')?'complete':'active'}};}
export function claimGroveQuest(p){return p.quests.grove!=='complete'?p:{...p,quests:{...p.quests,grove:'claimed'}};}

export function collectLoot(p,id) {
  if(!p.world.discoveries.includes(id)||p.rewardedDiscoveries.includes(id))return {profile:p,loot:[]};
  return {profile:{...p,rewardedDiscoveries:[...p.rewardedDiscoveries,id],inventory:{...p.inventory,recoveryTonic:p.inventory.recoveryTonic+1,sapphireOre:p.inventory.sapphireOre+2}},loot:[{id:'recoveryTonic',count:1},{id:'sapphireOre',count:2}]};
}
export function equipItem(p,id) {
  if(ITEMS[id]?.kind!=='weapon'||!p.inventory[id])throw Error('You do not own that weapon.');
  return {...p,equipped:id};
}
export function buyItem(p,id) {
  const item=ITEMS[id];if(!item?.buy||p.gold<item.buy)throw Error('Insufficient gold or unavailable item.');
  return {...p,gold:p.gold-item.buy,inventory:{...p.inventory,[id]:p.inventory[id]+1}};
}
export function sellItem(p,id) {
  const item=ITEMS[id];if(!item?.sell||!p.inventory[id]||(p.equipped===id&&p.inventory[id]===1))throw Error('Cannot sell this item.');
  return {...p,gold:p.gold+item.sell,inventory:{...p.inventory,[id]:p.inventory[id]-1}};
}
export function enhanceWeapon(p) {
  const id=p.equipped,lv=p.enhancements[id],cost=15+lv*10;
  if(lv>=5||p.gold<cost||p.inventory.sapphireOre<1)throw Error('Enhancement requires gold, ore and a weapon below +5.');
  return {...p,gold:p.gold-cost,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-1},enhancements:{...p.enhancements,[id]:lv+1}};
}
export function craftTonic(p) {
  if(p.inventory.sapphireOre<2)throw Error('Requires two Sapphire Ore.');
  return {...p,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-2,recoveryTonic:p.inventory.recoveryTonic+1}};
}
export function heal(p,{sanctuary=false}={}) {
  const max=heroStats(p).maxHp;if(p.hp>=max)throw Error('Health is already full.');
  if(sanctuary)return {...p,hp:max};
  if(!p.inventory.recoveryTonic)throw Error('No Recovery Tonics available.');
  return {...p,hp:Math.min(max,p.hp+ITEMS.recoveryTonic.heal),inventory:{...p.inventory,recoveryTonic:p.inventory.recoveryTonic-1}};
}
export function travelTo(p,region) {
  if(!region||!p.world.visitedRegions.includes(region.id)||!Number.isFinite(region.minX)||!Number.isFinite(region.maxX))throw Error('Discover this region before travelling.');
  const x=Math.min(218,Math.max(1.5,Math.min(region.minX+6,region.maxX-1)));
  return {...p,world:{...p.world,position:[x,0,0]}};
}
export function comparison(p,id) {
  if(!p.inventory[id]||ITEMS[id]?.kind!=='weapon')return null;
  const candidate={...p,equipped:id};return {current:heroStats(p),candidate:heroStats(candidate)};
}
