import {WEAPONS,weaponEligible} from './weaponCatalog.mjs';
// Shared local inventory, four slots per recruited party member.
export const GEAR_SLOTS=Object.freeze(['armor','mantle','ring','necklace']);
const item=(name,slot,buy,sell,atk,def,spd,color,trim,style,rarity='Common',requiredLevel=1,setId=null)=>Object.freeze({name,kind:'gear',slot,buy,sell,atk,def,spd,color,trim,style,rarity,requiredLevel,setId});
export const GEAR=Object.freeze({
 groveVest:item('Groveweave Vest','armor',45,18,1,2,1,0x39776b,0xc1e4c1,'vest'),
 sapphirePlate:item('Sapphire Plate','armor',100,42,0,6,0,0x375a91,0xd8e8fc,'plate'),
 mistJacket:item('Mistveil Jacket','armor',75,30,2,1,3,0x6b518c,0xd5c7fa,'jacket'),
 silverMantle:item('Silverleaf Mantle','mantle',30,12,0,1,1,0x718b9e,0xe3eddc,'leaf'),
 wardMantle:item('Sanctuary Mantle','mantle',65,26,0,3,0,0x284d78,0xe6cb8b,'ward'),
 duskMantle:item('Duskweaver Mantle','mantle',55,22,1,0,2,0x4d386e,0xcdb5ec,'dusk'),
 pilgrimCuirass:item('Pilgrim Cuirass','armor',75,30,1,4,0,0x64744b,0xd5c79c,'plate','Rare',2,'pilgrim'),
 pilgrimCloak:item('Pilgrim Cloak','mantle',50,20,0,2,1,0x64744b,0xd5c79c,'ward','Rare',2,'pilgrim'),
 moonveilRaiment:item('Moonveil Raiment','armor',110,44,3,2,3,0x427c89,0xd7f5ef,'jacket','Elite',3,'moonveil'),
 moonveilVeil:item('Moonveil Veil','mantle',75,30,2,1,2,0x427c89,0xd7f5ef,'leaf','Elite',3,'moonveil'),
 astralCarapace:item('Astral Carapace','armor',155,62,2,7,1,0x443775,0xe2caff,'plate','Legendary',4,'astral'),
 astralMantle:item('Astral Mantle','mantle',105,42,1,4,1,0x443775,0xe2caff,'dusk','Legendary',4,'astral'),
 groveRing:item('Grove Amber Ring','ring',30,12,1,0,1,0x39776b,0xe4c68b,'ring','Common',1),
 pilgrimPendant:item('Pilgrim Ward Pendant','necklace',55,22,0,3,0,0x64744b,0xd5c79c,'pendant','Rare',2),
 moonveilRing:item('Moonveil Silver Ring','ring',75,30,2,0,2,0x427c89,0xd7f5ef,'ring','Elite',3),
 moonveilPendant:item('Moonveil Echo Pendant','necklace',80,32,1,1,2,0x427c89,0xd7f5ef,'pendant','Elite',3),
 astralRing:item('Astral Star Ring','ring',120,48,3,1,1,0x443775,0xe2caff,'ring','Legendary',4),
 astralPendant:item('Astral Signal Pendant','necklace',125,50,2,3,1,0x443775,0xe2caff,'pendant','Legendary',4)
});
export const GEAR_IDS=Object.freeze(Object.keys(GEAR));
export const GEAR_SETS=Object.freeze({pilgrim:Object.freeze({name:'Pilgrim Watch',atk:0,def:2,spd:0}),moonveil:Object.freeze({name:'Moonveil Rites',atk:2,def:0,spd:1}),astral:Object.freeze({name:'Astral Observatory',atk:2,def:2,spd:0})});
// Requirements use the shared party leader's progression; all legacy gear remains level 1.
export const gearLevel=p=>1+Math.floor((Number.isFinite(p?.xp)?Math.max(0,p.xp):0)/100);
export function gearEligible(p,key){return Object.hasOwn(GEAR,key)&&gearLevel(p)>=GEAR[key].requiredLevel;}
export const MAX_ASCENSION=4;
export const ascensionLevel=(p,wearer,setId)=>WEARERS.includes(wearer)&&Object.hasOwn(GEAR_SETS,setId)&&Number.isInteger(p?.ascensions?.[wearer]?.[setId])?Math.max(0,Math.min(MAX_ASCENSION,p.ascensions[wearer][setId])):0;
export function activeGearSetId(p,id){const slots=gearFor(p,id);const a=GEAR[slots.armor],m=GEAR[slots.mantle];return a?.setId&&a.setId===m?.setId&&Object.hasOwn(GEAR_SETS,a.setId)&&gearEligible(p,slots.armor)&&gearEligible(p,slots.mantle)?a.setId:null;}
export function scaledSet(setId,rank=0){
 if(!Object.hasOwn(GEAR_SETS,setId))return null;
 const base=GEAR_SETS[setId],factor=1+Math.max(0,Math.min(MAX_ASCENSION,rank))*.25;
 return {name:base.name,atk:base.atk*factor,def:base.def*factor,spd:base.spd*factor};
}
export function activeGearSet(p,id){const setId=activeGearSetId(p,id);return setId?scaledSet(setId,ascensionLevel(p,id,setId)):null;}
export function validAscensions(p,recruited){
 if(p.ascensions===undefined)return true;
 if(!p.ascensions||typeof p.ascensions!=='object'||Array.isArray(p.ascensions))return false;
 return Object.entries(p.ascensions).every(([wearer,sets])=>WEARERS.includes(wearer)&&(wearer==='hero'||recruited(wearer))&&sets&&typeof sets==='object'&&!Array.isArray(sets)&&Object.entries(sets).every(([id,n])=>Object.hasOwn(GEAR_SETS,id)&&Number.isInteger(n)&&n>=0&&n<=MAX_ASCENSION));
}
export function cleanAscensions(p){return Object.fromEntries(WEARERS.filter(w=>Object.hasOwn(p.ascensions||{},w)).map(w=>[w,Object.fromEntries(Object.keys(GEAR_SETS).filter(id=>Object.hasOwn(p.ascensions[w],id)).map(id=>[id,ascensionLevel(p,w,id)]))]));}
export const gearMetadata=key=>Object.hasOwn(GEAR,key)?GEAR[key].rarity+' · Level '+GEAR[key].requiredLevel+(GEAR[key].setId?' · '+GEAR_SETS[GEAR[key].setId].name:''):null;
export const WEARERS=Object.freeze(['hero','groveArcher','pilgrimWarden','mistScout']);
export const gearFor=(p,id)=>WEARERS.includes(id)?p?.gear?.[id]||{}:{};
export const gearCount=(p,key)=>WEARERS.reduce((n,id)=>n+GEAR_SLOTS.filter(slot=>gearFor(p,id)[slot]===key).length,0);
export const SOCKET_GEMS=Object.freeze({ruby:Object.freeze({name:'Crimson Ruby',stat:'atk',label:'Attack'}),sapphire:Object.freeze({name:'Azure Sapphire',stat:'def',label:'Defense'}),emerald:Object.freeze({name:'Verdant Emerald',stat:'spd',label:'Speed'})});
export const MAX_SOCKET_RANK=3;
export function socketEligible(p,wearer,key){
 return WEARERS.includes(wearer)&&(Object.hasOwn(GEAR,key)?gearEligible(p,key):wearer==='hero'&&key!=='starterBow'&&Object.hasOwn(WEAPONS,key)&&weaponEligible(p,key));
}
export function equippedSocketItems(p,wearer){
 if(!WEARERS.includes(wearer))return [];
 const slots=gearFor(p,wearer);
 return [...(wearer==='hero'?[p?.equipped]:[]),...GEAR_SLOTS.map(slot=>slots[slot])].filter(key=>socketEligible(p,wearer,key));
}
const validSocket=s=>Boolean(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===2&&Object.hasOwn(SOCKET_GEMS,s.gem)&&Number.isInteger(s.rank)&&s.rank>=1&&s.rank<=MAX_SOCKET_RANK);
export function socketFor(p,wearer,key){
 const socket=p?.sockets?.[wearer]?.[key];
 return socketEligible(p,wearer,key)&&validSocket(socket)?socket:null;
}
export function validSockets(p,recruited){
 if(p.sockets===undefined)return true;
 if(!p.sockets||typeof p.sockets!=='object'||Array.isArray(p.sockets))return false;
 return Object.entries(p.sockets).every(([wearer,items])=>WEARERS.includes(wearer)&&(wearer==='hero'||recruited(wearer))&&items&&typeof items==='object'&&!Array.isArray(items)&&Object.entries(items).every(([key,socket])=>socketEligible(p,wearer,key)&&validSocket(socket)));
}
export function cleanSockets(p){
 return Object.fromEntries(Object.entries(p.sockets).map(([wearer,items])=>[wearer,Object.fromEntries(Object.entries(items).map(([key,socket])=>[key,{gem:socket.gem,rank:socket.rank}]))]));
}
export const MAX_ENCHANT_RANK=3;
export const enchantRank=(p,wearer,key)=>socketEligible(p,wearer,key)&&Number.isInteger(p?.enchants?.[wearer]?.[key])?Math.max(0,Math.min(MAX_ENCHANT_RANK,p.enchants[wearer][key])):0;
export function enchantBonus(key,rank){
 const item=Object.hasOwn(GEAR,key)?GEAR[key]:Object.hasOwn(WEAPONS,key)?WEAPONS[key]:null;
 const n=Number.isInteger(rank)?Math.max(0,Math.min(MAX_ENCHANT_RANK,rank)):0;
 return Object.fromEntries(['atk','def','spd'].map(stat=>[stat,(item?.[stat]||0)*n/10]));
}
export function validEnchants(p,recruited){
 if(p.enchants===undefined)return true;
 if(!p.enchants||typeof p.enchants!=='object'||Array.isArray(p.enchants))return false;
 return Object.entries(p.enchants).every(([wearer,items])=>WEARERS.includes(wearer)&&(wearer==='hero'||recruited(wearer))&&items&&typeof items==='object'&&!Array.isArray(items)&&Object.entries(items).every(([key,rank])=>socketEligible(p,wearer,key)&&Number.isInteger(rank)&&rank>=1&&rank<=MAX_ENCHANT_RANK));
}
export function cleanEnchants(p){return Object.fromEntries(Object.entries(p.enchants).map(([wearer,items])=>[wearer,{...items}]));}
export function addGearStats(stats,p,id){const out={...stats};for(const slot of GEAR_SLOTS){const key=gearFor(p,id)[slot];if(gearEligible(p,key)&&GEAR[key].slot===slot)for(const k of ['atk','def','spd'])out[k]+=GEAR[key][k];}const set=activeGearSet(p,id);if(set)for(const k of ['atk','def','spd'])out[k]+=set[k];for(const key of equippedSocketItems(p,id)){const socket=socketFor(p,id,key);if(socket)out[SOCKET_GEMS[socket.gem].stat]+=socket.rank;const rank=enchantRank(p,id,key);if(rank){const bonus=enchantBonus(key,rank);for(const stat of ['atk','def','spd'])out[stat]+=bonus[stat];}}return out;}
// Accessories contribute stats but must not be passed to the armor/mantle mesh renderer.
export const equippedVisuals=(p,id)=>['armor','mantle'].map(slot=>gearFor(p,id)[slot]).filter(key=>Object.hasOwn(GEAR,key));
export const gearSlotLabel=slot=>({armor:'Armor',mantle:'Mantle',ring:'Ring',necklace:'Necklace'})[slot]||'Equipment';
export function validGear(p,recruited){
 if(p.gear===undefined)return true;
 if(!p.gear||typeof p.gear!=='object'||Array.isArray(p.gear))return false;
 for(const [id,slots] of Object.entries(p.gear)){
  if(!WEARERS.includes(id)||(id!=='hero'&&!recruited(id))||!slots||typeof slots!=='object'||Array.isArray(slots))return false;
  for(const [slot,key] of Object.entries(slots))if(!GEAR_SLOTS.includes(slot)||!gearEligible(p,key)||GEAR[key].slot!==slot)return false;
 }
 return GEAR_IDS.every(key=>gearCount(p,key)<=(p.inventory?.[key]??0));
}
export function setGear(p,wearer,slot,key,recruited){
 if(!WEARERS.includes(wearer)||(wearer!=='hero'&&!recruited(wearer))||!GEAR_SLOTS.includes(slot))throw Error('Invalid wearer or slot.');
 const slots={...gearFor(p,wearer)};
 if(key===null)delete slots[slot];
 else{if(!Object.hasOwn(GEAR,key)||GEAR[key].slot!==slot)throw Error('Item does not fit this slot.');if(!gearEligible(p,key))throw Error('Requires party level '+GEAR[key].requiredLevel+'.');if(slots[slot]!==key&&(p.inventory?.[key]??0)<=gearCount(p,key))throw Error('No unequipped copy available.');slots[slot]=key;}
 const gear={...p.gear};if(Object.keys(slots).length)gear[wearer]=slots;else delete gear[wearer];return {...p,gear};
}
