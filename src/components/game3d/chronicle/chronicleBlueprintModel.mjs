/**
 * Private Game 3D creator blueprint catalog. This is NOT the player's inventory:
 * declaring a design never mints loot, skill unlocks, currency or equipment.
 * Sparse 500-slot boxes keep the initial 10,000-slot map lightweight.
 */
export const CHRONICLE_BOX_SIZE = 500;
export const CHRONICLE_STARTER_BOXES = 20;
export const CHRONICLE_KINDS = Object.freeze(['equipment', 'material', 'skill']);
export const CHRONICLE_RARITIES = Object.freeze([
  'Common', 'Unique', 'Rare', 'Epic', 'Legendary', 'Mystical', 'Ascendant',
]);
export const CHRONICLE_EQUIPMENT_SLOTS = Object.freeze([
  'weapon','helm','chest','gloves','legs','boots','ring','necklace','cape',
  'wings','costume','vanity_head','vanity_torso','vanity_pelvis',
  'vanity_leggings','accessory','trinket','auxiliary',
]);
export const CHRONICLE_STATS = Object.freeze([
  'strength','vitals','dexterity','spirit','hp','max_hp','attack','defense',
  'critical_chance','critical_resistance','dodge','attack_speed','will',
  'cooldown_reduction','movement_speed',
]);
const text = (v,max=120)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const isInt=n=>Number.isSafeInteger(n);
const bounded=(n,min,max,fallback)=>isInt(Number(n))&&Number(n)>=min&&Number(n)<=max?Number(n):fallback;
const id=()=>globalThis.crypto?.randomUUID?.() || 'blueprint-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export const newChronicleBox=(number,overrides={})=>({
  id:id(), name:'Collection '+String(number).padStart(2,'0'),
  kind:'mixed', label:'', x:(number-1)%5,y:Math.floor((number-1)/5),
  locked:false,slots:{},slotLocks:{},slotLabels:{},...overrides,
});
export function initialChronicleLibrary(){
  const boxes=Array.from({length:CHRONICLE_STARTER_BOXES},(_,i)=>newChronicleBox(i+1));
  boxes[0].name='Equipment · Levels 1–50';boxes[0].kind='equipment';
  boxes[1].name='Crafting Materials';boxes[1].kind='material';
  boxes[2].name='Skill Drops';boxes[2].kind='skill';
  return {version:1,updatedAt:'',boxes};
}
export function cleanBlueprint(input={}){
  if(!CHRONICLE_KINDS.includes(input.kind))throw Error('Choose equipment, material, or skill');
  const name=text(input.name,100);
  if(!name)throw Error('An item name is required');
  const levelMin=bounded(input.levelMin,1,9999,1);
  const levelMax=bounded(input.levelMax,levelMin,9999,levelMin);
  const stats={};
  for(const [key,value] of Object.entries(input.stats||{})){
    if(!CHRONICLE_STATS.includes(key)||!Number.isFinite(Number(value))||
       Math.abs(Number(value))>1000000)throw Error('Invalid core stat '+key);
    stats[key]=Number(value);
  }
  const slot=text(input.slot,40);
  if(input.kind==='equipment'&&!CHRONICLE_EQUIPMENT_SLOTS.includes(slot))
    throw Error('Choose an equipment slot');
  return {
    id:text(input.id,100)||id(),kind:input.kind,name,
    description:text(input.description,1200),
    icon:text(input.icon,80)||'', // placeholder metadata, never executable media
    rarity:CHRONICLE_RARITIES.includes(input.rarity)?input.rarity:'Common',
    slot:input.kind==='equipment'?slot:'',
    levelMin,levelMax,stats,
    setId:text(input.setId,80),skillId:text(input.skillId,80),
    materialType:text(input.materialType,80),tags:text(input.tags,200),
    dropSource:text(input.dropSource,180),
    dropChance:Math.max(0,Math.min(100,Number(input.dropChance)||0)),
    notes:text(input.notes,800),
  };
}
export function slotIndex(raw){
  const n=Number(raw);
  if(!isInt(n)||n<0||n>=CHRONICLE_BOX_SIZE||
     typeof raw==='string'&&String(n)!==raw)
    throw Error('Slot must be between 1 and 500');
  return n;
}
export function findChronicleBox(doc,boxId){
  const box=doc?.boxes?.find(item=>item.id===boxId);
  if(!box)throw Error('Collection not found');
  return box;
}
const updateBox=(doc,boxId,transform)=>{
  const before=findChronicleBox(doc,boxId);
  return {...doc,updatedAt:new Date().toISOString(),
    boxes:doc.boxes.map(box=>box.id===boxId?transform(before):box)};
};
export function createChronicleBox(doc,name=''){
  const number=doc.boxes.length+1;
  const positions=new Set(doc.boxes.map(box=>box.x+':'+box.y));
  let y=0,x=0;
  while(positions.has(x+':'+y)){x++;if(x===5){x=0;y++}}
  const box=newChronicleBox(number,{name:text(name,100)||'Collection '+number,x,y});
  return {...doc,updatedAt:new Date().toISOString(),boxes:[...doc.boxes,box]};
}
export function duplicateChronicleBox(doc,boxId){
  const original=findChronicleBox(doc,boxId);
  const next=createChronicleBox(doc,text(original.name+' Copy',100));
  const inserted=next.boxes.at(-1);
  return updateBox(next,inserted.id,()=>({
    ...original,id:inserted.id,name:inserted.name,x:inserted.x,y:inserted.y,
    locked:false,
    slots:Object.fromEntries(Object.entries(original.slots).map(([k,v])=>[k,{...v,id:id()}])),
    slotLocks:{},slotLabels:{...original.slotLabels},
  }));
}
export function removeChronicleBox(doc,boxId){
  const box=findChronicleBox(doc,boxId);
  if(box.locked)throw Error('Unlock this collection before removing it');
  if(doc.boxes.length<=1)throw Error('Keep at least one collection');
  return {...doc,updatedAt:new Date().toISOString(),
    boxes:doc.boxes.filter(item=>item.id!==boxId)};
}
export function editChronicleBox(doc,boxId,patch){
  return updateBox(doc,boxId,box=>({
    ...box,
    name:patch.name===undefined?box.name:text(patch.name,100)||box.name,
    label:patch.label===undefined?box.label:text(patch.label,90),
    kind:patch.kind===undefined?box.kind:
      (['mixed',...CHRONICLE_KINDS].includes(patch.kind)?patch.kind:box.kind),
    locked:patch.locked===undefined?box.locked:Boolean(patch.locked),
  }));
}
export function repositionChronicleBox(doc,boxId,x,y){
  const a=findChronicleBox(doc,boxId);
  if(a.locked)throw Error('Unlock this collection before moving it');
  if(!isInt(x)||!isInt(y)||x<0||x>=5||y<0)throw Error('Invalid board position');
  const other=doc.boxes.find(box=>box.id!==boxId&&box.x===x&&box.y===y);
  if(other?.locked)throw Error('Target collection is locked');
  return {...doc,updatedAt:new Date().toISOString(),boxes:doc.boxes.map(box=>{
    if(box.id===boxId)return {...box,x,y};
    if(other&&box.id===other.id)return {...other,x:a.x,y:a.y};
    return box;
  })};
}
export function editChronicleSlot(doc,boxId,index,{blueprint,locked,label,remove=false}={}){
  const pos=slotIndex(index);
  return updateBox(doc,boxId,box=>{
    const key=String(pos);
    // Grid locks pin positions, not content: creators must still be able
    // to edit descriptions, stats and labels while a map is arranged.
    const slots={...box.slots},slotLocks={...box.slotLocks},slotLabels={...box.slotLabels};
    if(remove)delete slots[key];
    else if(blueprint!==undefined)slots[key]=cleanBlueprint(blueprint);
    if(locked!==undefined){
      if(locked)slotLocks[key]=true;
      else delete slotLocks[key];
    }
    if(label!==undefined){
      const value=text(label,65);
      if(value)slotLabels[key]=value;
      else delete slotLabels[key];
    }
    return {...box,slots,slotLocks,slotLabels};
  });
}
export function moveChronicleSlot(doc,boxId,from,to){
  const a=slotIndex(from),b=slotIndex(to);
  if(a===b)return doc;
  return updateBox(doc,boxId,box=>{
    if(box.slotLocks[String(a)]||box.slotLocks[String(b)])
      throw Error('The source or destination is locked');
    const slots={...box.slots};
    const source=slots[String(a)],target=slots[String(b)];
    if(!source)throw Error('Nothing to move');
    if(target)slots[String(a)]=target;else delete slots[String(a)];
    slots[String(b)]=source;
    return {...box,slots};
  });
}
export function searchChronicle(doc,query){
  const term=text(query,140).toLowerCase();
  if(!term)return [];
  const hits=[];
  for(const box of doc.boxes){
    const matchingBox=[box.name,box.label,box.kind].some(v=>String(v).toLowerCase().includes(term));
    if(matchingBox)hits.push({boxId:box.id,boxName:box.name,slot:null,title:box.name,kind:'collection'});
    for(const [key,item] of Object.entries(box.slots)){
      if([item.name,item.description,item.kind,item.slot,item.rarity,item.tags,item.dropSource,
          item.skillId,item.materialType,item.setId,...Object.keys(item.stats||{})]
        .some(v=>String(v||'').toLowerCase().includes(term))){
        hits.push({boxId:box.id,boxName:box.name,slot:Number(key),title:item.name,kind:item.kind});
      }
    }
  }
  return hits;
}
export function countChronicleBlueprints(doc){
  return doc.boxes.reduce((n,box)=>n+Object.keys(box.slots).length,0);
}
export function validateChronicleLibrary(value){
  if(!value||value.version!==1||!Array.isArray(value.boxes)||value.boxes.length===0)
    throw Error('Not a Chronicle Blueprint Library backup');
  const seen=new Set(),positions=new Set();
  const boxes=value.boxes.map(b=>{
    const normalizedId=text(b?.id,100);
    if(!b||typeof b!=='object'||!normalizedId||seen.has(normalizedId))
      throw Error('Invalid or duplicate collection');
    seen.add(normalizedId);
    // Bound empty gaps relative to the actual collection count, not to a fixed
    // number of boxes. This rejects a malicious import requesting billions of rows.
    if(!isInt(b.x)||!isInt(b.y)||b.x<0||b.x>=5||b.y<0||
       b.y>Math.max(64,value.boxes.length*2))
      throw Error('Invalid collection placement');
    const key=b.x+':'+b.y;
    if(positions.has(key))throw Error('Overlapping collection placement');
    positions.add(key);
    const slots={},slotLocks={},slotLabels={};
    for(const [i,item] of Object.entries(b.slots||{}))
      slots[String(slotIndex(i))]=cleanBlueprint(item);
    for(const [i,locked] of Object.entries(b.slotLocks||{}))
      if(locked===true)slotLocks[String(slotIndex(i))]=true;
    for(const [i,label] of Object.entries(b.slotLabels||{})){
      const v=text(label,65);if(v)slotLabels[String(slotIndex(i))]=v;
    }
    return {id:normalizedId,name:text(b.name,100)||'Collection',
      label:text(b.label,90),kind:['mixed',...CHRONICLE_KINDS].includes(b.kind)?b.kind:'mixed',
      x:b.x,y:b.y,locked:b.locked===true,slots,slotLocks,slotLabels};
  });
  return {version:1,updatedAt:text(value.updatedAt,80),boxes};
}
