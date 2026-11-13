import { SHAPE_CONTROLS } from '@/components/onboarding/avatarCustomization';
import { applyCreatorSurfaces } from '@/components/onboarding/creatorSurfaceRuntime';
import { CreatorLayerRuntime } from '@/components/onboarding/creatorLayerRuntime';
const HEX=/^#[0-9a-f]{6}$/i;
export function applyCustomizationAppearance(model,appearance={}) {
 if(!model)return;
 const shapes=new Map(SHAPE_CONTROLS.map(c=>[c.morph,c.id]));
 model.traverse(node=>{
  if(node.morphTargetDictionary)for(const[name,index]of Object.entries(node.morphTargetDictionary))if(name.startsWith('CC_'))node.morphTargetInfluences[index]=Number(appearance.morph_targets?.[`${node.name}:${name}`]??appearance.shape_controls?.[shapes.get(name)]??0);
  if(!node.isMesh)return;
  (Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach((material,index)=>{
   const color=appearance.material_colors?.[`${node.name}:${index}`];if(HEX.test(color||''))material.color?.set(color);
  });
 });
 applyCreatorSurfaces(model,appearance);
}
export class AvatarCustomizationRuntime {
 constructor(model,options={}){this.model=model;this.options=options;this.layers=new CreatorLayerRuntime(model);}
 async update(appearance={}){if(!this.model)return;applyCustomizationAppearance(this.model,appearance);await this.layers.update(appearance);if(this.model)applyCustomizationAppearance(this.model,appearance);}
 dispose(){this.layers.dispose();this.model=null;}
}
export default AvatarCustomizationRuntime;