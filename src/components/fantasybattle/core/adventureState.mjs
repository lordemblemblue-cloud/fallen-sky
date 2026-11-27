import {WORLD_MAX_X} from './worldExpansion.mjs';
// Browser-local guest save/progression service. No privileged Base44 endpoints or cloud claims.
import {GEAR,GEAR_IDS,gearCount,gearFor,validGear,setGear,addGearStats} from './equipmentCatalog.mjs';
export const SAVE_KEY='fantasyBattle.sapphire.saves.v1';
export const SETTINGS_KEY='fantasyBattle.sapphire.settings.v1';
export const ITEMS=Object.freeze({
  starterBow:{name:'Silver Archer Bow',kind:'weapon',atk:0,buy:0,sell:0},
  sapphireBow:{name:'Sapphire Longbow',kind:'weapon',atk:4,buy:90,sell:40},
  recoveryTonic:{name:'Recovery Tonic',kind:'consumable',heal:40,buy:20,sell:8},
  sapphireOre:{name:'Sapphire Ore',kind:'material',buy:15,sell:6},...GEAR
});
// Cosmetic palette multiplies the existing rig's texture colors; no stat bonuses.
export const APPEARANCES=Object.freeze({
  silver:Object.freeze({name:'Silver Archer',tint:0xffffff,swatch:'#e3edf9'}),
  sapphire:Object.freeze({name:'Sapphire Mist',tint:0x98c8ff,swatch:'#80b9f4'}),
  rose:Object.freeze({name:'Rosewater',tint:0xffc9dc,swatch:'#ecc0d5'}),
  dusk:Object.freeze({name:'Amethyst Dusk',tint:0xc8b5ff,swatch:'#b4a2e4'})
});
export const appearanceFor=p=>Object.hasOwn(APPEARANCES,p?.appearance)?APPEARANCES[p.appearance]:APPEARANCES.silver;
export function selectAppearance(p,id){
  if(!isProfile(p)||!Object.hasOwn(APPEARANCES,id))throw Error('Unknown appearance.');
  return {...p,appearance:id};
}
// Recruit IDs and saved progress are stable; visual definitions are maintained separately.
// All values below are prototype balancing, not a new character class or story canon.
export const COMPANION=Object.freeze({id:'groveArcher',name:'Grove Archer',tint:0x9fe8ce,role:'Archer',maxHp:85,atk:9,def:9,spd:9,requiredEncounter:'wilds_grove_01'});
export const ROSTER=Object.freeze([
 COMPANION,
 Object.freeze({id:'pilgrimWarden',name:'Pilgrim Warden',role:'Sword & shield tank',combatClass:'warden',tint:0xf1d4a0,maxHp:135,atk:8,def:16,spd:7,requiredEncounter:'wilds_pilgrimage_02'}),
 Object.freeze({id:'mistScout',name:'Mist Scout',role:'Dual dagger skirmisher',combatClass:'scout',tint:0xc7a8fa,maxHp:75,atk:11,def:8,spd:16,requiredEncounter:'wilds_waterfall_01'})
]);
const blankMember=m=>({recruited:false,active:false,hp:m.maxHp,bond:0});
export const partyFor=p=>p?.party||{...blankMember(COMPANION),front:'hero'};
export function memberFor(p,id){const a=partyFor(p);return id===COMPANION.id?a:a.extra?.[id]||blankMember(ROSTER.find(m=>m.id===id)||COMPANION);}
export const activeRoster=p=>ROSTER.filter(m=>memberFor(p,m.id).active);
export const partyNeedsRest=p=>ROSTER.some(m=>memberFor(p,m.id).recruited&&memberFor(p,m.id).hp<m.maxHp);
function validMember(p,m,a){return Boolean(a&&typeof a.recruited==='boolean'&&typeof a.active==='boolean'&&(!a.active||a.recruited)&&integer(a.hp,1,m.maxHp)&&integer(a.bond,0,100)&&(!a.recruited?(!a.active&&a.bond===0&&a.hp===m.maxHp):p.world.completedEncounters.includes(m.requiredEncounter)));}
export function validParty(p){
 if(p.party===undefined)return true;
 const a=p.party;if(!a||!validMember(p,COMPANION,a))return false;
 if(a.extra!==undefined&&(!a.extra||Array.isArray(a.extra)||typeof a.extra!=='object'||Object.keys(a.extra).some(id=>!ROSTER.slice(1).some(m=>m.id===id))||ROSTER.slice(1).some(m=>Object.hasOwn(a.extra,m.id)&&!validMember(p,m,a.extra[m.id]))))return false;
 return a.front==='hero'||activeRoster(p).some(m=>m.id===a.front);
}
function withMember(p,id,state){const a=partyFor(p);return {...p,party:id===COMPANION.id?{...a,...state}:{...a,extra:{...a.extra,[id]:state}}};}
export function recruitCompanion(p,id=COMPANION.id){
 const m=ROSTER.find(m=>m.id===id);if(!m)throw Error('Unknown companion.');
 const a=memberFor(p,id);if(a.recruited)throw Error('Companion already recruited.');
 if(!p.world.completedEncounters.includes(m.requiredEncounter))throw Error('Complete the required encounter first.');
 return withMember(p,id,{...blankMember(m),recruited:true,active:true});
}
export function configureParty(p,{id=COMPANION.id,active,front}={}){
 const a=partyFor(p),m=ROSTER.find(m=>m.id===id);if(!m)throw Error('Unknown companion.');
 let next=p;
 if(active!==undefined){const state=memberFor(p,id);if(!state.recruited||typeof active!=='boolean')throw Error('Invalid party formation.');next=withMember(p,id,{recruited:state.recruited,active,hp:state.hp,bond:state.bond});}
 const target=front??(a.front===id&&active===false?'hero':a.front);
 if(target!=='hero'&&!activeRoster(next).some(m=>m.id===target))throw Error('Frontline must be an active member.');
 return {...next,party:{...partyFor(next),front:target}};
}
export function companionProgress(p,encounter,units){
 if(encounter?.practice||p.world.completedEncounters.includes(encounter?.id))return partyFor(p);
 let next=p;
 for(const m of activeRoster(p)){const u=units?.find(x=>x.id===m.id),a=memberFor(p,m.id);if(!u||!Number.isInteger(u.hp))continue;next=withMember(next,m.id,{recruited:true,active:true,hp:Math.max(1,Math.min(m.maxHp,u.hp)),bond:Math.min(100,a.bond+5)});}
 return partyFor(next);
}
export function recoverParty(p){
 let next=p;for(const m of ROSTER){const a=memberFor(next,m.id);if(a.recruited)next=withMember(next,m.id,{recruited:true,active:a.active,hp:m.maxHp,bond:a.bond});}return next;
}
export function cleanParty(p){const a=partyFor(p);const result={recruited:a.recruited,active:a.active,front:a.front,hp:a.hp,bond:a.bond};if(a.extra){result.extra={};for(const m of ROSTER.slice(1)){if(Object.hasOwn(a.extra,m.id)){const s=memberFor(p,m.id);result.extra[m.id]={recruited:s.recruited,active:s.active,hp:s.hp,bond:s.bond};}}}return result;}

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
  return {version:1,id:globalThis.crypto.randomUUID(),name:clean,appearance:'silver',party:partyFor(null),xp:0,hp:120,gold:0,inventory:{starterBow:1,sapphireBow:0,recoveryTonic:1,sapphireOre:0},equipped:'starterBow',enhancements:{starterBow:0,sapphireBow:0},rewardedDiscoveries:[],attributes:{vitality:0,strength:0,defense:0,speed:0},world:{position:[6,0,0],discoveries:[],completedEncounters:[],visitedRegions:[]},quests:{grove:'available'},createdAt:Date.now()};
}
export function isProfile(p){
  return p?.version===1&&typeof p.id==='string'&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=40&&integer(p.xp,0,100000)&&STAT_KEYS.every(k=>integer(p.attributes?.[k],0,1000))&&STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0)<=levelFor(p.xp)-1&&Array.isArray(p.world?.position)&&p.world.position.length===3&&p.world.position.every(Number.isFinite)&&p.world.position[0]>=1.5&&p.world.position[0]<=WORLD_MAX_X&&p.world.position[2]>=-6.8&&p.world.position[2]<=3.4&&uniqueStrings(p.world.discoveries)&&uniqueStrings(p.world.completedEncounters)&&uniqueStrings(p.world.visitedRegions)&&['available','active','complete','claimed'].includes(p.quests?.grove)&&Number.isFinite(p.createdAt)&&integer(p.hp,1,heroStats(p).maxHp)&&integer(p.gold,0,10000000)&&Object.keys(ITEMS).every(k=>integer(GEAR_IDS.includes(k)&&!Object.hasOwn(p.inventory||{},k)?0:p.inventory?.[k],0,100000))&&['starterBow','sapphireBow'].includes(p.equipped)&&p.inventory[p.equipped]>0&&['starterBow','sapphireBow'].every(k=>integer(p.enhancements?.[k],0,5))&&uniqueStrings(p.rewardedDiscoveries)&&(p.appearance===undefined||Object.hasOwn(APPEARANCES,p.appearance))&&validParty(p)&&validGear(p,id=>memberFor(p,id).recruited);
}
// Legacy records have no revision. A complete serialized record also catches same-time edits.
export const slotStamp=record=>record===undefined?null:JSON.stringify(record);
export function readSlots(storage){
  let raw;try{raw=storage.getItem(SAVE_KEY);}catch(error){return {slots:[],error:String(error?.message||error)};}
  if(!raw)return {slots:[],error:null};
  if(raw.length>3*MAX_BACKUP_BYTES*2)return {slots:[],error:'Save data exceeds the local size limit. No save has been removed.'};
  let data;try{data=JSON.parse(raw);}catch{return {slots:[],error:'Save data is damaged. No save has been removed.'};}
  if(!data||typeof data!=='object'||Array.isArray(data))return {slots:[],error:'Save format is invalid.'};
  return {slots:SLOT_IDS.filter(id=>Object.hasOwn(data,id)).map(id=>{const s=data[id];return isProfile(s?.profile)&&Number.isFinite(s?.savedAt)?{id,status:'valid',savedAt:s.savedAt,profile:s.profile,stamp:slotStamp(s)}:{id,status:'corrupt',stamp:slotStamp(s)};}),error:null};
}
export function writeSlot(storage,id,profile,{overwrite=false,expectedStamp}={}){
  if(!SLOT_IDS.includes(id)||!isProfile(profile))throw Error('Invalid save slot or profile.');
  const raw=storage.getItem(SAVE_KEY);
  if(raw&&raw.length>3*MAX_BACKUP_BYTES*2)throw Error('Save data exceeds the local size limit.');
  const data=raw?JSON.parse(raw):{};
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Save data is damaged.');
  if(expectedStamp!==undefined&&slotStamp(Object.hasOwn(data,id)?data[id]:undefined)!==expectedStamp)throw Error('Save conflict: this slot changed. Reload or choose a different slot.');
  if(Object.hasOwn(data,id)&&!overwrite)throw Error('Confirm overwrite first.');
  const prior=Object.hasOwn(data,id)?data[id]:null;
  const previousTime=Number.isFinite(prior?.savedAt)?prior.savedAt:0;
  const record={savedAt:Math.max(Date.now(),previousTime+1),profile:copy(profile)};
  const next=JSON.stringify({...data,[id]:record});
  if(next.length>3*MAX_BACKUP_BYTES*2)throw Error('Save data exceeds the local size limit.');
  storage.setItem(SAVE_KEY,next);
  return record;
}
export function mostRecent(slots){return slots.filter(s=>s.status==='valid').sort((a,b)=>b.savedAt-a.savedAt)[0]||null;}
export function readSettings(storage){
  try{const p=JSON.parse(storage.getItem(SETTINGS_KEY)||'{}');return {quality:['performance','balanced','high','cinematic'].includes(p.quality)?p.quality:'performance',muted:p.muted===true,reducedMotion:p.reducedMotion===true};}catch{return {...DEFAULT_SETTINGS};}
}
export function updateWorld(p,w){
  if(!p||!w||!Array.isArray(w.position)||w.position.length!==3||!w.position.every(Number.isFinite))return p;
  const region=w.regions?.find(r=>w.position[0]>=r.minX&&w.position[0]<=r.maxX);
  return {...p,world:{...p.world,position:[Math.max(1.5,Math.min(WORLD_MAX_X,w.position[0])),w.position[1],Math.max(-6.8,Math.min(3.4,w.position[2]))],discoveries:uniqueStrings(w.discoveries)?[...new Set([...p.world.discoveries,...w.discoveries])]:p.world.discoveries,visitedRegions:region?[...new Set([...p.world.visitedRegions,region.id])]:p.world.visitedRegions}};
}
export function rewardVictory(p,encounter,remainingHp=p?.hp,units=[]){
  if(!p||!encounter?.id||p.world.completedEncounters.includes(encounter.id))return {profile:p,xp:0,leveled:false,unlocked:[],gold:0,loot:[]};
  // Explicit prototype balancing: one-time 25 XP for normal encounters, 50 elite, 100 boss.
  const xp=encounter.category==='Boss'?100:encounter.category==='Elite'?50:25;
  const gold=encounter.category==='Boss'?80:encounter.category==='Elite'?45:25;
  const ore=encounter.category==='Boss'?3:encounter.category==='Elite'?2:1;
  const oldLevel=levelFor(p.xp),newLevel=levelFor(p.xp+xp);
  const completedEncounters=[...p.world.completedEncounters,encounter.id];
  const quest=p.quests.grove==='active'&&completedEncounters.includes('wilds_grove_01')?'complete':p.quests.grove;
  return {profile:{...p,party:companionProgress(p,encounter,units),xp:p.xp+xp,hp:Math.max(1,Math.min(heroStats(p).maxHp,Number.isInteger(remainingHp)?remainingHp:p.hp)),gold:p.gold+gold,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre+ore},world:{...p.world,completedEncounters},quests:{...p.quests,grove:quest}},xp,gold,loot:[{id:'sapphireOre',count:ore}],leveled:newLevel>oldLevel,unlocked:availableActions(newLevel).filter(x=>!availableActions(oldLevel).includes(x))};
}
export function allocate(p,key){if(!STAT_KEYS.includes(key)||pointsFor(p)<1)return p;return {...p,hp:p.hp+(key==='vitality'?10:0),attributes:{...p.attributes,[key]:p.attributes[key]+1}};}
export function heroStats(p){const a=p?.attributes||{vitality:0,strength:0,defense:0,speed:0};return addGearStats({maxHp:120+10*a.vitality,atk:12+2*a.strength+(ITEMS[p?.equipped]?.atk||0)+(p?.enhancements?.[p?.equipped]||0)*2,def:10+2*a.defense,spd:11+a.speed},p,'hero');}
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
export function equipGear(p,wearer,slot,id){if(!isProfile(p))throw Error('Invalid profile.');const next=setGear(p,wearer,slot,id,k=>memberFor(p,k).recruited);if(!isProfile(next))throw Error('Invalid equipment allocation.');return next;}
export function memberStats(p,id){if(id==='hero')return heroStats(p);const m=ROSTER.find(x=>x.id===id);if(!m)throw Error('Unknown party member.');return addGearStats({maxHp:m.maxHp,atk:m.atk,def:m.def,spd:m.spd},p,id);}
export function gearComparison(p,wearer,id){if(!Object.hasOwn(GEAR,id))return null;try{return {current:memberStats(p,wearer),candidate:memberStats(equipGear(p,wearer,GEAR[id].slot,id),wearer)};}catch{return null;}}
export function buyItem(p,id) {
  const item=Object.hasOwn(ITEMS,id)?ITEMS[id]:null;if(!item?.buy||p.gold<item.buy||(p.inventory[id]??0)>=100000)throw Error('Insufficient gold or unavailable item.');
  return {...p,gold:p.gold-item.buy,inventory:{...p.inventory,[id]:(p.inventory[id]??0)+1}};
}
export function sellItem(p,id) {
  const item=Object.hasOwn(ITEMS,id)?ITEMS[id]:null;if(!item?.sell||!p.inventory[id]||(p.equipped===id&&p.inventory[id]===1)||(item.kind==='gear'&&p.inventory[id]<=gearCount(p,id)))throw Error('Cannot sell this item.');
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
  const max=heroStats(p).maxHp;if(sanctuary){if(p.hp>=max&&!partyNeedsRest(p))throw Error('Health is already full.');return recoverParty({...p,hp:max});}
  if(p.hp>=max)throw Error('Health is already full.');
  if(!p.inventory.recoveryTonic)throw Error('No Recovery Tonics available.');
  return {...p,hp:Math.min(max,p.hp+ITEMS.recoveryTonic.heal),inventory:{...p.inventory,recoveryTonic:p.inventory.recoveryTonic-1}};
}
export function travelTo(p,region) {
  if(!region||!p.world.visitedRegions.includes(region.id)||!Number.isFinite(region.minX)||!Number.isFinite(region.maxX))throw Error('Discover this region before travelling.');
  const x=Math.min(WORLD_MAX_X,Math.max(1.5,Math.min(region.minX+6,region.maxX-1)));
  return {...p,world:{...p.world,position:[x,0,0]}};
}
export function comparison(p,id) {
  if(!p.inventory[id]||ITEMS[id]?.kind!=='weapon')return null;
  const candidate={...p,equipped:id};return {current:heroStats(p),candidate:heroStats(candidate)};
}

// Portable guest saves are user-controlled backups, not authenticated cloud saves.
// Import is deliberately bounded, strictly validated and never writes by itself.
export const MAX_BACKUP_BYTES=512*1024;
export function exportBackup(profile){
  if(!isProfile(profile))throw Error('No valid profile to export.');
  return JSON.stringify({format:'fantasy-battle-guest-save',version:1,profile},null,2);
}
export function parseBackup(raw){
  if(typeof raw!=='string'||raw.length>MAX_BACKUP_BYTES||new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES)throw Error('Save backup is too large.');
  let data;try{data=JSON.parse(raw);}catch{throw Error('Save backup is not valid JSON.');}
  if(data?.format!=='fantasy-battle-guest-save'||data.version!==1||!isProfile(data.profile))throw Error('This is not a valid Fantasy Battle save backup.');
  // Pick supported fields to avoid preserving unknown or injected properties.
  const p=data.profile,w=p.world;
  return {version:1,id:p.id,name:p.name,appearance:p.appearance||'silver',party:cleanParty(p),xp:p.xp,hp:p.hp,gold:p.gold,
    inventory:Object.fromEntries(Object.keys(ITEMS).filter(k=>Object.hasOwn(p.inventory,k)).map(k=>[k,p.inventory[k]])),equipped:p.equipped,
    ...(p.gear===undefined?{}:{gear:Object.fromEntries(Object.keys(p.gear).map(id=>[id,{...gearFor(p,id)}]))}),
    enhancements:{starterBow:p.enhancements.starterBow,sapphireBow:p.enhancements.sapphireBow},
    rewardedDiscoveries:[...p.rewardedDiscoveries],attributes:Object.fromEntries(STAT_KEYS.map(k=>[k,p.attributes[k]])),
    world:{position:[...w.position],discoveries:[...w.discoveries],completedEncounters:[...w.completedEncounters],visitedRegions:[...w.visitedRegions]},
    quests:{grove:p.quests.grove},createdAt:p.createdAt};
}
