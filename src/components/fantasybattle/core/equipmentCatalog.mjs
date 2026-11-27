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
export function activeGearSet(p,id){const slots=gearFor(p,id);const a=GEAR[slots.armor],m=GEAR[slots.mantle];return a?.setId&&a.setId===m?.setId&&Object.hasOwn(GEAR_SETS,a.setId)&&gearEligible(p,slots.armor)&&gearEligible(p,slots.mantle)?GEAR_SETS[a.setId]:null;}
export const gearMetadata=key=>Object.hasOwn(GEAR,key)?GEAR[key].rarity+' · Level '+GEAR[key].requiredLevel+(GEAR[key].setId?' · '+GEAR_SETS[GEAR[key].setId].name:''):null;
export const WEARERS=Object.freeze(['hero','groveArcher','pilgrimWarden','mistScout']);
export const gearFor=(p,id)=>WEARERS.includes(id)?p?.gear?.[id]||{}:{};
export const gearCount=(p,key)=>WEARERS.reduce((n,id)=>n+GEAR_SLOTS.filter(slot=>gearFor(p,id)[slot]===key).length,0);
export function addGearStats(stats,p,id){const out={...stats};for(const slot of GEAR_SLOTS){const key=gearFor(p,id)[slot];if(gearEligible(p,key)&&GEAR[key].slot===slot)for(const k of ['atk','def','spd'])out[k]+=GEAR[key][k];}const set=activeGearSet(p,id);if(set)for(const k of ['atk','def','spd'])out[k]+=set[k];return out;}
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
