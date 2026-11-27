// Enemy visuals are independent of gameplay stats and use the existing ranged skill protocol.
// Each custom layer retains its source sheet coordinate system, so bow and nock sockets stay valid.
export const ENEMY_VISUALS=Object.freeze({"grove":{"name":"Whispering Grove Spirit","width":0.96,"height":1.01,"style":"leaf"},"sentinel":{"name":"Pilgrimage Sentinel","width":1.08,"height":1.01,"style":"stone"},"archwarden":{"name":"Ruined Arch Warden","width":1.17,"height":1.08,"style":"plate"},"mist":{"name":"Waterfall Mist Spirit","width":0.92,"height":1.03,"style":"wave"},"wraith":{"name":"Forgotten Cavern Wraith","width":0.91,"height":1.07,"style":"rag"},"scout":{"name":"Blossom Terrace Scout","width":0.91,"height":0.94,"style":"petal"},"canopy":{"name":"Sapphire Canopy Guard","width":1.09,"height":1.03,"style":"leaf"},"heights":{"name":"Blossom Heights Warden","width":1.19,"height":1.09,"style":"plate"},"vanguard":{"name":"Sanctuary Vanguard","width":1.22,"height":1.13,"style":"stone"},"gatekeeper":{"name":"Celestial Gatekeeper","width":1.32,"height":1.22,"style":"crown"}});
const BY_ENCOUNTER=Object.freeze({wilds_grove_01:'grove',wilds_pilgrimage_01:'sentinel',wilds_pilgrimage_02:'archwarden',wilds_waterfall_01:'mist',wilds_cave_01:'wraith',wilds_heights_01:'scout',wilds_heights_02:'canopy',wilds_heights_elite:'heights',wilds_sanctuary_guard:'vanguard',wilds_sanctuary_boss:'gatekeeper'});
const PARTS=Object.freeze({"hairBack":"hair_back","torso":"torso_front","skirt":"skirt_slit","sandalBack":"sandal_b","sandalFront":"sandal_a","drawUpperArm":"upperarm_wrap","bowUpperArm":"upperarm_band","neck":"neck","bowForearm":"bracer_curl","drawForearm":"bracer_pinch","face":"face_smile","eyesClosed":"face_eyes_closed"});
export function enemyVisualId(encounter){const key=encounter?.id;if(Object.hasOwn(BY_ENCOUNTER,key))return BY_ENCOUNTER[key];return encounter?.category==='Boss'?'gatekeeper':encounter?.category==='Elite'?'vanguard':'sentinel';}
export const enemyPortrait=id=>Object.hasOwn(ENEMY_VISUALS,id)?'/fantasybattle/enemies/'+id+'/portrait.svg':null;
const key=(id,part)=>'enemy:'+id+':'+part;
export function requiredEnemyParts(ids){return [...new Set(ids)].filter(id=>Object.hasOwn(ENEMY_VISUALS,id)).flatMap(id=>[...Object.keys(PARTS),'face_focused','face_shout','face_hurt'].map(part=>({key:key(id,part),url:'/fantasybattle/enemies/'+id+'/'+part+'.svg'})));}
export function makeEnemyRig(id,base,manifest){
 if(!Object.hasOwn(ENEMY_VISUALS,id))return null;
 const visual=ENEMY_VISUALS[id],data=JSON.parse(JSON.stringify(base)),parts={...manifest.parts};data.id='enemy:'+id;data.name=visual.name;
 const p=([x,y])=>[x*visual.width,y*visual.height];
 data.bones=data.bones.map(b=>({...b,pos:p(b.pos)}));
 data.layers=data.layers.filter(l=>!['lockLeft','lockRight'].includes(l.id)).map(l=>{
  const layer={...l};if(l.pos)layer.pos=p(l.pos);
  const part=l.id==='faceFade'?'face':l.id;
  if(Object.hasOwn(PARTS,part)){const k=key(id,part);parts[k]={...manifest.parts[PARTS[part]]};layer.part=k;}
  if(l.id==='torso'){layer.scale=[visual.width,visual.height];}
  if(l.id==='skirt'){layer.scale=[1.25*visual.width,1.25*visual.height];layer.spring={...layer.spring,stiffness:visual.style==='plate'||visual.style==='stone'?115:60,damping:12};}
  return layer;
 });
 for(const exp of ['focused','shout','hurt'])parts[key(id,'face_'+exp)]={...manifest.parts[PARTS.face]};
 data.expressions={neutral:key(id,'face'),focused:key(id,'face_focused'),attackShout:key(id,'face_shout'),hurt:key(id,'face_hurt'),wink:key(id,'eyesClosed'),pout:key(id,'face_hurt')};
 for(const name of ['chest','headTop'])data.sockets[name]={...data.sockets[name],pos:p(data.sockets[name].pos)};
 data.hurtbox={...data.hurtbox,radius:base.hurtbox.radius*visual.width};
 return {data,manifest:{...manifest,parts}};
}
