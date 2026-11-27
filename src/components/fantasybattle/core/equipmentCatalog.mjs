// Shared local inventory, two slots per recruited party member.
export const GEAR_SLOTS=Object.freeze(['armor','mantle']);
const item=(name,slot,buy,sell,atk,def,spd,color,trim,style)=>Object.freeze({name,kind:'gear',slot,buy,sell,atk,def,spd,color,trim,style});
export const GEAR=Object.freeze({
 groveVest:item('Groveweave Vest','armor',45,18,1,2,1,0x39776b,0xc1e4c1,'vest'),
 sapphirePlate:item('Sapphire Plate','armor',100,42,0,6,0,0x375a91,0xd8e8fc,'plate'),
 mistJacket:item('Mistveil Jacket','armor',75,30,2,1,3,0x6b518c,0xd5c7fa,'jacket'),
 silverMantle:item('Silverleaf Mantle','mantle',30,12,0,1,1,0x718b9e,0xe3eddc,'leaf'),
 wardMantle:item('Sanctuary Mantle','mantle',65,26,0,3,0,0x284d78,0xe6cb8b,'ward'),
 duskMantle:item('Duskweaver Mantle','mantle',55,22,1,0,2,0x4d386e,0xcdb5ec,'dusk')
});
export const GEAR_IDS=Object.freeze(Object.keys(GEAR));
export const WEARERS=Object.freeze(['hero','groveArcher','pilgrimWarden','mistScout']);
export const gearFor=(p,id)=>WEARERS.includes(id)?p?.gear?.[id]||{}:{};
export const gearCount=(p,key)=>WEARERS.reduce((n,id)=>n+GEAR_SLOTS.filter(slot=>gearFor(p,id)[slot]===key).length,0);
export function addGearStats(stats,p,id){const out={...stats};for(const slot of GEAR_SLOTS){const key=gearFor(p,id)[slot];if(Object.hasOwn(GEAR,key)&&GEAR[key].slot===slot)for(const k of ['atk','def','spd'])out[k]+=GEAR[key][k];}return out;}
export const equippedVisuals=(p,id)=>GEAR_SLOTS.map(slot=>gearFor(p,id)[slot]).filter(key=>Object.hasOwn(GEAR,key));
export function validGear(p,recruited){
 if(p.gear===undefined)return true;
 if(!p.gear||typeof p.gear!=='object'||Array.isArray(p.gear))return false;
 for(const [id,slots] of Object.entries(p.gear)){
  if(!WEARERS.includes(id)||(id!=='hero'&&!recruited(id))||!slots||typeof slots!=='object'||Array.isArray(slots))return false;
  for(const [slot,key] of Object.entries(slots))if(!GEAR_SLOTS.includes(slot)||!Object.hasOwn(GEAR,key)||GEAR[key].slot!==slot)return false;
 }
 return GEAR_IDS.every(key=>gearCount(p,key)<=(p.inventory?.[key]??0));
}
export function setGear(p,wearer,slot,key,recruited){
 if(!WEARERS.includes(wearer)||(wearer!=='hero'&&!recruited(wearer))||!GEAR_SLOTS.includes(slot))throw Error('Invalid wearer or slot.');
 const slots={...gearFor(p,wearer)};
 if(key===null)delete slots[slot];
 else{if(!Object.hasOwn(GEAR,key)||GEAR[key].slot!==slot)throw Error('Item does not fit this slot.');if(slots[slot]!==key&&(p.inventory?.[key]??0)<=gearCount(p,key))throw Error('No unequipped copy available.');slots[slot]=key;}
 const gear={...p.gear};if(Object.keys(slots).length)gear[wearer]=slots;else delete gear[wearer];return {...p,gear};
}
