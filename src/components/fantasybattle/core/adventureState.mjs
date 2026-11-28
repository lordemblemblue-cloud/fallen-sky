import {WORLD_MAX_X} from './worldExpansion.mjs';
import {validCampaign,cleanCampaign} from './campaignQuests.mjs';
import {treasureFor} from './treasureCatalog.mjs';
import {BOND_GIFT} from './companionBonds.mjs';
import {learnedPassives,applyPassives} from './passiveSkills.mjs';
import {ULTIMATE_ID,ULTIMATE_LEVEL} from './battleRules.mjs';
import {ENCOUNTER_REWARDS,encounterReward,encounterRecoverySupply} from './encounterRewards.mjs';
import {WEAPONS,WEAPON_IDS,LEGACY_WEAPONS,validWeapons,cleanEnhancements,weaponEligible,enhancementLevel} from './weaponCatalog.mjs';
// Browser-local guest save/progression service. No privileged Base44 endpoints or cloud claims.
import {GEAR,GEAR_IDS,gearCount,gearFor,validGear,setGear,addGearStats,activeGearSetId,ascensionLevel,scaledSet,validAscensions,cleanAscensions,MAX_ASCENSION,SOCKET_GEMS,MAX_SOCKET_RANK,equippedSocketItems,socketFor,validSockets,cleanSockets,MAX_ENCHANT_RANK,enchantRank,enchantBonus,validEnchants,cleanEnchants} from './equipmentCatalog.mjs';
export const SAVE_KEY='fantasyBattle.sapphire.saves.v1';
export const SETTINGS_KEY='fantasyBattle.sapphire.settings.v1';
export const ITEMS=Object.freeze({
  ...WEAPONS,
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
export function companionGiftQuote(p,id){
 const m=ROSTER.find(m=>m.id===id),state=m&&p?memberFor(p,id):null;
 if(!state?.recruited)return {ok:false,reason:'Recruit this companion first.'};
 if(state.bond>=100)return {ok:false,reason:'Maximum bond reached.'};
 if((p.inventory?.[BOND_GIFT.item]??0)<BOND_GIFT.cost)return {ok:false,reason:'Requires '+BOND_GIFT.cost+' Sapphire Ore.'};
 return {ok:true,reason:null,cost:BOND_GIFT.cost,gain:Math.min(100-state.bond,BOND_GIFT.gain),bond:state.bond};
}
export function giveCompanionGift(p,id){
 if(!isProfile(p))throw Error('Invalid profile.');
 const q=companionGiftQuote(p,id);if(!q.ok)throw Error(q.reason);
 const state=memberFor(p,id);
 return withMember({...p,inventory:{...p.inventory,[BOND_GIFT.item]:p.inventory[BOND_GIFT.item]-q.cost}},id,{...state,bond:state.bond+q.gain});
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
export const learnedAt=Object.freeze({quickShot:1,guard:1,volley:2,chargedShot:3,[ULTIMATE_ID]:ULTIMATE_LEVEL});
export const availableActions=level=>Object.keys(learnedAt).filter(k=>level>=learnedAt[k]);
export const learnedSkills=level=>[...availableActions(level),...learnedPassives(level)];
export const pointsFor=p=>Math.max(0,levelFor(p.xp)-1-STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0));
export function createProfile(name){
  const clean=String(name??'').trim().slice(0,40);
  if(!clean)throw Error('Enter a character name.');
  return {version:1,id:globalThis.crypto.randomUUID(),name:clean,appearance:'silver',party:partyFor(null),xp:0,hp:120,gold:0,inventory:{starterBow:1,sapphireBow:0,recoveryTonic:1,sapphireOre:0},equipped:'starterBow',enhancements:{starterBow:0,sapphireBow:0},rewardedDiscoveries:[],attributes:{vitality:0,strength:0,defense:0,speed:0},world:{position:[6,0,0],discoveries:[],completedEncounters:[],visitedRegions:[]},quests:{grove:'available'},createdAt:Date.now()};
}
export function isProfile(p){
  try{return p?.version===1&&typeof p.id==='string'&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=40&&integer(p.xp,0,100000)&&STAT_KEYS.every(k=>integer(p.attributes?.[k],0,1000))&&STAT_KEYS.reduce((n,k)=>n+p.attributes[k],0)<=levelFor(p.xp)-1&&Array.isArray(p.world?.position)&&p.world.position.length===3&&p.world.position.every(Number.isFinite)&&p.world.position[0]>=1.5&&p.world.position[0]<=WORLD_MAX_X&&p.world.position[2]>=-6.8&&p.world.position[2]<=3.4&&uniqueStrings(p.world.discoveries)&&uniqueStrings(p.world.completedEncounters)&&uniqueStrings(p.world.visitedRegions)&&['available','active','complete','claimed'].includes(p.quests?.grove)&&Number.isFinite(p.createdAt)&&integer(p.hp,1,heroStats(p).maxHp)&&integer(p.gold,0,10000000)&&Object.keys(ITEMS).every(k=>integer((GEAR_IDS.includes(k)||(WEAPON_IDS.includes(k)&&!LEGACY_WEAPONS.includes(k)))&&!Object.hasOwn(p.inventory||{},k)?0:p.inventory?.[k],0,100000))&&validWeapons(p)&&uniqueStrings(p.rewardedDiscoveries)&&(p.appearance===undefined||Object.hasOwn(APPEARANCES,p.appearance))&&validCampaign(p)&&validParty(p)&&validGear(p,id=>memberFor(p,id).recruited)&&validAscensions(p,id=>memberFor(p,id).recruited)&&validSockets(p,id=>memberFor(p,id).recruited)&&validEnchants(p,id=>memberFor(p,id).recruited);}catch{return false;}
}
// Legacy records have no revision. A complete serialized record also catches same-time edits.
export const slotStamp=record=>record===undefined?null:JSON.stringify(record);
const validSaveRecord=s=>Boolean(s&&Number.isFinite(s.savedAt)&&isProfile(s.profile));
const checkpoint=s=>({savedAt:s.savedAt,profile:copy(s.profile)});
export const POSITION_SAVE_INTERVAL=10000;
export function positionSaveDue(last,position,now){
 return Boolean(last&&Number.isFinite(now)&&now-last.at>=POSITION_SAVE_INTERVAL&&Array.isArray(position)&&position.length===3&&position.every(Number.isFinite)&&Math.hypot(position[0]-last.position[0],position[2]-last.position[2])>=1);
}
export function readSlots(storage){
  let raw;try{raw=storage.getItem(SAVE_KEY);}catch(error){return {slots:[],error:String(error?.message||error)};}
  if(!raw)return {slots:[],error:null};
  if(raw.length>3*MAX_BACKUP_BYTES*2)return {slots:[],error:'Save data exceeds the local size limit. No save has been removed.'};
  let data;try{data=JSON.parse(raw);}catch{return {slots:[],error:'Save data is damaged. No save has been removed.'};}
  if(!data||typeof data!=='object'||Array.isArray(data))return {slots:[],error:'Save format is invalid.'};
  return {slots:SLOT_IDS.filter(id=>Object.hasOwn(data,id)).map(id=>{const s=data[id],recovery=validSaveRecord(s?.previous)?checkpoint(s.previous):null;return validSaveRecord(s)?{id,status:'valid',savedAt:s.savedAt,profile:s.profile,stamp:slotStamp(s),recovery}:{id,status:'corrupt',stamp:slotStamp(s),recovery};}),error:null};
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
  const previous=validSaveRecord(prior)?checkpoint(prior):validSaveRecord(prior?.previous)?checkpoint(prior.previous):null;
  const record={savedAt:Math.max(Date.now(),previousTime+1),profile:copy(profile),...(previous?{previous}:{})};
  const next=JSON.stringify({...data,[id]:record});
  if(next.length>3*MAX_BACKUP_BYTES*2)throw Error('Save data exceeds the local size limit.');
  storage.setItem(SAVE_KEY,next);
  return record;
}
// Recovery is explicit, revision-checked and never automatically replaces a save.
export function recoverSlot(storage,id,expectedStamp){
 if(typeof expectedStamp!=='string')throw Error('Select a recovery checkpoint first.');
 const state=readSlots(storage);
 if(state.error)throw Error(state.error);
 const slot=state.slots.find(s=>s.id===id);
 if(!slot?.recovery||slot.stamp!==expectedStamp)throw Error('Recovery checkpoint changed or is unavailable.');
 return writeSlot(storage,id,slot.recovery.profile,{overwrite:true,expectedStamp});
}
export function mostRecent(slots){return slots.filter(s=>s.status==='valid').sort((a,b)=>b.savedAt-a.savedAt)[0]||null;}
export function readSettings(storage){
  try{const p=JSON.parse(storage.getItem(SETTINGS_KEY)||'{}');return {quality:['performance','balanced','high','cinematic'].includes(p.quality)?p.quality:'performance',muted:p.muted===true,reducedMotion:p.reducedMotion===true};}catch{return {...DEFAULT_SETTINGS};}
}
// Preserve existing references when no actual progress changes. Bounded merge cannot invalidate a legacy save.
function mergeWorldIds(previous,incoming){
 if(!uniqueStrings(incoming))return previous;
 const known=new Set(previous),added=[];
 for(const id of incoming){if(!known.has(id)&&previous.length+added.length<1000){known.add(id);added.push(id);}}
 return added.length?[...previous,...added]:previous;
}
export function updateWorld(p,w){
 if(!p||!w||!Array.isArray(w.position)||w.position.length!==3||!w.position.every(Number.isFinite))return p;
 const old=p.world;
 const position=[Math.max(1.5,Math.min(WORLD_MAX_X,w.position[0])),w.position[1],Math.max(-6.8,Math.min(3.4,w.position[2]))];
 const region=Array.isArray(w.regions)&&w.regions.length<=32?w.regions.find(r=>r&&typeof r.id==='string'&&r.id.length<=160&&Number.isFinite(r.minX)&&Number.isFinite(r.maxX)&&r.minX<r.maxX&&position[0]>=r.minX&&position[0]<r.maxX):null;
 const discoveries=mergeWorldIds(old.discoveries,w.discoveries);
 const visitedRegions=region?mergeWorldIds(old.visitedRegions,[region.id]):old.visitedRegions;
 if(position.every((value,i)=>value===old.position[i])&&discoveries===old.discoveries&&visitedRegions===old.visitedRegions)return p;
 return {...p,world:{...old,position,discoveries,visitedRegions}};
}
// One guaranteed equipment drop per registered first victory. Values are prototype tuning.
export const ENCOUNTER_GEAR_REWARDS=Object.freeze({
 wilds_grove_01:'groveRing',
 wilds_pilgrimage_01:'pilgrimCloak',
 wilds_pilgrimage_02:'pilgrimPendant',
 wilds_waterfall_01:'mistJacket',
 wilds_cave_01:'pilgrimBow',
 wilds_heights_01:'pilgrimCuirass',
 wilds_heights_02:'moonveilVeil',
 wilds_heights_elite:'moonveilRing',
 wilds_sanctuary_guard:'moonveilRaiment',
 wilds_sanctuary_boss:'astralCarapace',
 wilds_moonveil_01:'moonveilPendant',
 wilds_moonveil_elite:'moonveilBow',
 wilds_astral_01:'astralMantle',
 wilds_astral_elite:'astralBow'
});
// Award only items that fit the existing save bounds; report exactly what was added.
function grantLoot(p,requested){
 const inventory={...p.inventory},loot=[];
 for(const {id,count} of requested){
  if(!Object.hasOwn(ITEMS,id))continue;
  const awarded=Math.min(count,100000-(inventory[id]??0));
  if(awarded>0){inventory[id]=(inventory[id]??0)+awarded;loot.push({id,count:awarded});}
 }
 return {inventory,loot};
}
// Limited field recovery on a registered first victory, never on practice or repeat battles.
export const VICTORY_RECOVERY_RATE=.4;
function fieldRecovery(p,units){
 let next=p;const recovery=[];
 const restore=(id,hp,max)=>{
  const amount=Math.min(max-hp,Math.floor(max*VICTORY_RECOVERY_RATE));
  if(amount>0)recovery.push({id,amount,hp:hp+amount,maxHp:max});
  return hp+Math.max(0,amount);
 };
 next={...next,hp:restore('hero',next.hp,heroStats(next).maxHp)};
 for(const m of activeRoster(next)){
  if(!units.some(u=>u.id===m.id&&Number.isInteger(u.hp)))continue;
  const state=memberFor(next,m.id);
  next=withMember(next,m.id,{...state,hp:restore(m.id,state.hp,m.maxHp)});
 }
 return {profile:next,recovery};
}
export function rewardVictory(p,encounter,remainingHp=p?.hp,units=[]){
  if(!p||!encounter?.id||encounter.practice||p.world.completedEncounters.includes(encounter.id))return {profile:p,xp:0,leveled:false,unlocked:[],gold:0,loot:[],firstVictory:false,recovery:[]};
  const reward=encounterReward(encounter);
  const xp=Math.min(100000-p.xp,reward.xp),gold=Math.min(10000000-p.gold,reward.gold),ore=reward.ore;
  const oldLevel=levelFor(p.xp),newLevel=levelFor(p.xp+xp);
  const gearId=Object.hasOwn(ENCOUNTER_GEAR_REWARDS,encounter.id)?ENCOUNTER_GEAR_REWARDS[encounter.id]:null;
  const {inventory,loot}=grantLoot(p,[{id:'sapphireOre',count:ore},...(gearId?[{id:gearId,count:1}]:[]),...(encounterRecoverySupply(encounter)?[{id:'recoveryTonic',count:encounterRecoverySupply(encounter)}]:[])]);
  const completedEncounters=[...p.world.completedEncounters,encounter.id];
  const quest=p.quests.grove==='active'&&completedEncounters.includes('wilds_grove_01')?'complete':p.quests.grove;
  const won={...p,party:companionProgress(p,encounter,units),xp:p.xp+xp,hp:Math.max(1,Math.min(heroStats(p).maxHp,Number.isInteger(remainingHp)?remainingHp:p.hp)),gold:p.gold+gold,inventory,world:{...p.world,completedEncounters},quests:{...p.quests,grove:quest}};
  const settled=Object.hasOwn(ENCOUNTER_REWARDS,encounter.id)?fieldRecovery(won,units):{profile:won,recovery:[]};
  return {...settled,xp,gold,loot,firstVictory:true,leveled:newLevel>oldLevel,unlocked:learnedSkills(newLevel).filter(x=>!learnedSkills(oldLevel).includes(x))};
}
export function allocate(p,key){if(!STAT_KEYS.includes(key)||pointsFor(p)<1)return p;return {...p,hp:p.hp+(key==='vitality'?10:0),attributes:{...p.attributes,[key]:p.attributes[key]+1}};}
export function heroStats(p){const a=p?.attributes||{vitality:0,strength:0,defense:0,speed:0};return applyPassives(addGearStats({maxHp:120+10*a.vitality,atk:12+2*a.strength+(ITEMS[p?.equipped]?.atk||0)+enhancementLevel(p,p?.equipped)*2,def:10+2*a.defense,spd:11+a.speed},p,'hero'),p?levelFor(p.xp):0);}
export function acceptGroveQuest(p){return p.quests.grove!=='available'?p:{...p,quests:{...p.quests,grove:p.world.completedEncounters.includes('wilds_grove_01')?'complete':'active'}};}
export function claimGroveQuest(p){return p.quests.grove!=='complete'?p:{...p,quests:{...p.quests,grove:'claimed'}};}

export function collectLoot(p,id) {
  const treasure=treasureFor(id);
  if(!treasure||!p?.world?.discoveries.includes(id)||p.rewardedDiscoveries.includes(id))return {profile:p,loot:[]};
  const {inventory,loot}=grantLoot(p,treasure.loot);
  return {profile:{...p,rewardedDiscoveries:[...p.rewardedDiscoveries,id],inventory},loot};
}
export function equipItem(p,id) {
  if(!Object.hasOwn(WEAPONS,id)||!p.inventory[id])throw Error('You do not own that weapon.');
  if(!weaponEligible(p,id))throw Error('Requires party level '+WEAPONS[id].requiredLevel+'.');
  return {...p,equipped:id};
}
export function equipGear(p,wearer,slot,id){if(!isProfile(p))throw Error('Invalid profile.');const next=setGear(p,wearer,slot,id,k=>memberFor(p,k).recruited);if(!isProfile(next))throw Error('Invalid equipment allocation.');return next;}
export function memberStats(p,id){if(id==='hero')return heroStats(p);const m=ROSTER.find(x=>x.id===id);if(!m)throw Error('Unknown party member.');return addGearStats({maxHp:m.maxHp,atk:m.atk,def:m.def,spd:m.spd},p,id);}
export function gearComparison(p,wearer,id){if(!Object.hasOwn(GEAR,id))return null;try{return {current:memberStats(p,wearer),candidate:memberStats(equipGear(p,wearer,GEAR[id].slot,id),wearer)};}catch{return null;}}
// Shared quote/transaction rules; browser-local progression, not server authority.
export const MAX_TRADE_QUANTITY=99;
export function tradeQuote(p,mode,id,quantity=1){
 const item=Object.hasOwn(ITEMS,id)?ITEMS[id]:null;
 const fail=reason=>({ok:false,reason,total:0});
 if(!p||!item||!['buy','sell'].includes(mode)||!integer(quantity,1,MAX_TRADE_QUANTITY)||!item[mode])return fail('Unavailable trade.');
 const owned=p.inventory[id]??0,total=item[mode]*quantity;
 const equipped=item.kind==='gear'?gearCount(p,id):p.equipped===id?1:0;
 const reason=mode==='buy'?(p.gold<total?'Insufficient gold.':owned+quantity>100000?'Inventory limit reached.':null):(owned-equipped<quantity?'Not enough unequipped copies.':p.gold+total>10000000?'Gold limit reached.':null);
 return {ok:!reason,reason,total,owned,equipped,quantity};
}
function tradeItem(p,mode,id,quantity){
 const quote=tradeQuote(p,mode,id,quantity);
 if(!quote.ok)throw Error(quote.reason);
 const sign=mode==='buy'?1:-1;
 return {...p,gold:p.gold-sign*quote.total,inventory:{...p.inventory,[id]:quote.owned+sign*quantity}};
}
export const buyItem=(p,id,quantity=1)=>tradeItem(p,'buy',id,quantity);
export const sellItem=(p,id,quantity=1)=>tradeItem(p,'sell',id,quantity);
export function enhanceWeapon(p) {
  const id=p.equipped,lv=enhancementLevel(p,id),cost=15+lv*10;
  if(!weaponEligible(p,id)||!p.inventory[id]||lv>=5||p.gold<cost||p.inventory.sapphireOre<1)throw Error('Enhancement requires gold, ore and a weapon below +5.');
  return {...p,gold:p.gold-cost,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-1},enhancements:{...p.enhancements,[id]:lv+1}};
}
// Combine is an alternative to ore enhancement, consuming a spare copy of the equipped bow.
export function combineQuote(p){
 const id=p?.equipped,level=enhancementLevel(p,id),cost=5+level*5,owned=p?.inventory?.[id]??0;
 const reason=!p||!weaponEligible(p,id)||!owned?'Equip an eligible bow first.':id==='starterBow'?'Starter bow cannot be combined.':level>=5?'Maximum enhancement reached.':owned<2?'Requires one spare copy of the equipped bow.':p.gold<cost?'Insufficient gold.':null;
 return {ok:!reason,reason,id,level,cost,owned};
}
export function combineWeapon(p){
 if(!isProfile(p))throw Error('Invalid profile.');
 const q=combineQuote(p);if(!q.ok)throw Error(q.reason);
 return {...p,gold:p.gold-q.cost,inventory:{...p.inventory,[q.id]:q.owned-1},enhancements:{...p.enhancements,[q.id]:q.level+1}};
}
// Ascension is a permanent wearer/set unlock; it applies only while that complete set is equipped.
export function ascendQuote(p,wearer='hero'){
 const setId=activeGearSetId(p,wearer),level=ascensionLevel(p,wearer,setId),cost=30+level*20,ore=2+level;
 const eligible=wearer==='hero'||ROSTER.some(m=>m.id===wearer&&memberFor(p,wearer).recruited);
 const reason=!p||!eligible?'Select a recruited party member.':!setId?'Equip a matching armor and mantle set.':level>=MAX_ASCENSION?'Maximum ascension reached.':p.gold<cost?'Insufficient gold.':(p.inventory.sapphireOre??0)<ore?'Insufficient Sapphire Ore.':null;
 return {ok:!reason,reason,wearer,setId,level,cost,ore,current:scaledSet(setId,level),next:scaledSet(setId,Math.min(MAX_ASCENSION,level+1))};
}
export function ascendSet(p,wearer='hero'){
 if(!isProfile(p))throw Error('Invalid profile.');
 const q=ascendQuote(p,wearer);if(!q.ok)throw Error(q.reason);
 return {...p,gold:p.gold-q.cost,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-q.ore},ascensions:{...p.ascensions,[wearer]:{...p.ascensions?.[wearer],[q.setId]:q.level+1}}};
}
// Gems are formed in place from ore. One permanent socket record per wearer and item type.
export function socketQuote(p,wearer,key,gem){
 const existing=socketFor(p,wearer,key),same=Boolean(existing&&existing.gem===gem),rank=same?existing.rank:0;
 const cost=20+rank*20,ore=2+rank;
 const eligible=wearer==='hero'||ROSTER.some(m=>m.id===wearer&&memberFor(p,wearer).recruited);
 const reason=!p||!eligible?'Select a recruited party member.':!equippedSocketItems(p,wearer).includes(key)?'Equip an eligible item first.':!Object.hasOwn(SOCKET_GEMS,gem)?'Choose a valid gem.':rank>=MAX_SOCKET_RANK?'Maximum gem rank reached.':p.gold<cost?'Insufficient gold.':(p.inventory.sapphireOre??0)<ore?'Insufficient Sapphire Ore.':null;
 return {ok:!reason,reason,wearer,key,gem,existing,rank,nextRank:Math.min(MAX_SOCKET_RANK,rank+1),cost,ore,replacing:Boolean(existing&&!same)};
}
export function socketEquipment(p,wearer,key,gem){
 if(!isProfile(p))throw Error('Invalid profile.');
 const q=socketQuote(p,wearer,key,gem);if(!q.ok)throw Error(q.reason);
 return {...p,gold:p.gold-q.cost,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-q.ore},sockets:{...p.sockets,[wearer]:{...p.sockets?.[wearer],[key]:{gem,rank:q.nextRank}}}};
}
// Deterministic enchantments scale original equipment stats only, independent of sockets and sets.
export function enchantQuote(p,wearer,key){
 const rank=enchantRank(p,wearer,key),cost=40+rank*25,ore=3+rank;
 const eligible=wearer==='hero'||ROSTER.some(m=>m.id===wearer&&memberFor(p,wearer).recruited);
 const reason=!p||!eligible?'Select a recruited party member.':!equippedSocketItems(p,wearer).includes(key)?'Equip an eligible item first.':rank>=MAX_ENCHANT_RANK?'Maximum enchantment reached.':p.gold<cost?'Insufficient gold.':(p.inventory.sapphireOre??0)<ore?'Insufficient Sapphire Ore.':null;
 const nextRank=Math.min(MAX_ENCHANT_RANK,rank+1);
 return {ok:!reason,reason,wearer,key,rank,nextRank,cost,ore,current:enchantBonus(key,rank),next:enchantBonus(key,nextRank)};
}
export function enchantEquipment(p,wearer,key){
 if(!isProfile(p))throw Error('Invalid profile.');
 const q=enchantQuote(p,wearer,key);if(!q.ok)throw Error(q.reason);
 return {...p,gold:p.gold-q.cost,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-q.ore},enchants:{...p.enchants,[wearer]:{...p.enchants?.[wearer],[key]:q.nextRank}}};
}
// Each recipe creates an existing catalog item; no new inventory keys or save migration.
const recipe=(id,category,ore,gold,level)=>Object.freeze({id,category,ore,gold,level});
export const RECIPES=Object.freeze({
 recoveryTonic:recipe('recoveryTonic','Consumables',2,0,1),
 groveVest:recipe('groveVest','Armor',3,22,1),
 sapphireBow:recipe('sapphireBow','Weapons',4,50,1),
 pilgrimPendant:recipe('pilgrimPendant','Accessories',4,30,2),
 moonveilRing:recipe('moonveilRing','Accessories',5,45,3),
 astralPendant:recipe('astralPendant','Accessories',7,65,4)
});
export function craftQuote(p,id,quantity=1){
 const r=Object.hasOwn(RECIPES,id)?RECIPES[id]:null;
 if(!p||!r||!integer(quantity,1,MAX_TRADE_QUANTITY))return {ok:false,reason:'Unavailable recipe.'};
 const ore=r.ore*quantity,gold=r.gold*quantity,owned=p.inventory[id]??0;
 const reason=levelFor(p.xp)<r.level?'Requires party level '+r.level+'.':p.inventory.sapphireOre<ore?'Not enough Sapphire Ore.':p.gold<gold?'Insufficient gold.':owned+quantity>100000?'Inventory limit reached.':null;
 return {ok:!reason,reason,ore,gold,owned,quantity};
}
export function craftItem(p,id,quantity=1){
 const q=craftQuote(p,id,quantity);
 if(!q.ok)throw Error(q.reason);
 return {...p,gold:p.gold-q.gold,inventory:{...p.inventory,sapphireOre:p.inventory.sapphireOre-q.ore,[id]:q.owned+quantity}};
}
export const craftTonic=p=>craftItem(p,'recoveryTonic');
export function recoveryQuote(p,recipient='hero'){
 const m=ROSTER.find(x=>x.id===recipient),state=m&&p?memberFor(p,recipient):null;
 const eligible=Boolean(p&&(recipient==='hero'||state?.recruited));
 const max=eligible?(recipient==='hero'?heroStats(p).maxHp:m.maxHp):0;
 const hp=eligible?(recipient==='hero'?p.hp:state.hp):0,owned=p?.inventory?.recoveryTonic??0;
 const amount=Math.max(0,Math.min(max-hp,ITEMS.recoveryTonic.heal));
 const reason=!eligible?'Select a recruited party member.':!owned?'No Recovery Tonics available.':!amount?'Health is already full.':null;
 return {ok:!reason,reason,recipient,max,hp,owned,amount,next:hp+amount};
}
export function heal(p,{sanctuary=false,recipient='hero'}={}) {
  const max=heroStats(p).maxHp;if(sanctuary){if(p.hp>=max&&!partyNeedsRest(p))throw Error('Health is already full.');return recoverParty({...p,hp:max});}
  if(!isProfile(p))throw Error('Invalid profile.');
  const q=recoveryQuote(p,recipient);if(!q.ok)throw Error(q.reason);
  const next={...p,inventory:{...p.inventory,recoveryTonic:q.owned-1}};
  return recipient==='hero'?{...next,hp:q.next}:withMember(next,recipient,{...memberFor(p,recipient),hp:q.next});
}
export function travelTo(p,region) {
  if(!region||!p.world.visitedRegions.includes(region.id)||!Number.isFinite(region.minX)||!Number.isFinite(region.maxX))throw Error('Discover this region before travelling.');
  const x=Math.min(WORLD_MAX_X,Math.max(1.5,Math.min(region.minX+6,region.maxX-1)));
  return {...p,world:{...p.world,position:[x,0,0]}};
}
export function comparison(p,id) {
  if(!p.inventory[id]||!weaponEligible(p,id))return null;
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
    enhancements:cleanEnhancements(p),
    ...(p.ascensions===undefined?{}:{ascensions:cleanAscensions(p)}),
    ...(p.sockets===undefined?{}:{sockets:cleanSockets(p)}),
    ...(p.enchants===undefined?{}:{enchants:cleanEnchants(p)}),
    rewardedDiscoveries:[...p.rewardedDiscoveries],attributes:Object.fromEntries(STAT_KEYS.map(k=>[k,p.attributes[k]])),
    world:{position:[...w.position],discoveries:[...w.discoveries],completedEncounters:[...w.completedEncounters],visitedRegions:[...w.visitedRegions]},
    quests:{grove:p.quests.grove,...cleanCampaign(p)},createdAt:p.createdAt};
}
