import { SHAPE_CONTROLS } from '@/components/onboarding/avatarCustomization';
export function readCreatorCapabilities(model) {
 const morphs=new Set(),materials=[],garments=[];let weapon=false,hood=false;
 model.traverse(node=>{
  Object.keys(node.morphTargetDictionary||{}).forEach(name=>morphs.add(name));
  if(/bow|weapon|quiver/i.test(node.name))weapon=true;if(/hood|cowl/i.test(node.name))hood=true;
  if(!node.isMesh)return;
  (Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach((material,index)=>{
   materials.push(material.name||'');if(/cloth|outfit|shirt|pants|armor/i.test(material.name||''))garments.push({id:`${node.name}:${index}`,label:material.name});
  });
 });
 return {weapon,hood,expressions:[...morphs].filter(name=>name.startsWith('FX_')),customization:{shapes:SHAPE_CONTROLS.filter(c=>morphs.has(c.morph)).map(c=>c.id),skin:materials.some(n=>/skin|body|head|character|artemis/i.test(n)),hair:materials.some(n=>/hair/i.test(n)),iris:materials.some(n=>/iris/i.test(n)),garments}};
}