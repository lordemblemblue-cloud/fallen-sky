import { UserRound, ScanFace, Droplets, Scissors, Ruler, Shirt, Smile, PenTool, Paintbrush, Sparkles, Globe2, Palette, Accessibility } from 'lucide-react';
import { CREATOR_BODIES, SHAPE_CONTROLS } from '@/components/onboarding/avatarCustomization';
export const CREATOR_SECTIONS = [
 {id:'body',label:'Body',icon:UserRound,shot:'body'}, {id:'face',label:'Face',icon:ScanFace,shot:'face'},
 {id:'skin',label:'Complexion & Skin',icon:Droplets,shot:'head'}, {id:'hair',label:'Hair',icon:Scissors,shot:'head'},
 {id:'height',label:'Height',icon:Ruler,shot:'body'}, {id:'chest',label:'Chest',icon:Shirt,shot:'upper'},
 {id:'glutes',label:'Glutes',icon:Accessibility,shot:'hips'}, {id:'expression',label:'Expression',icon:Smile,shot:'face'},
 {id:'tattoos',label:'Tattoos',icon:PenTool,shot:'back'}, {id:'makeup',label:'Makeup & Gloss',icon:Paintbrush,shot:'face'},
 {id:'wardrobe',label:'Outfit',icon:Shirt,shot:'body'}, {id:'inspiration',label:'Influences',icon:Globe2,shot:'body'},
 {id:'style',label:'Art style',icon:Palette,shot:'body'},
];
export const BASE_CHOICES = [{key:'male',gender:'male',creator_body:'',label:'Getsuga',detail:'Male · animated'}, {key:'female',gender:'female',creator_body:'',label:'Artemis',detail:'Female · animated'}, ...Object.values(CREATOR_BODIES).map(b=>({key:b.id,gender:b.gender,creator_body:b.id,label:b.label,detail:b.detail+' · full sculpt'}))];
export const SKIN_COLORS=['#f5dccb','#e7c3a3','#d2a080','#b97855','#976441','#714b35','#503326','#32211b'];
export const HAIR_COLORS=['#17191d','#3a281e','#704630','#a36a3b','#d4b278','#e9dfcd','#b64039','#d79aa4','#8670bc','#3e8791','#ececf0','#747d87'];
export const EYE_COLORS=['#4b3527','#98663b','#627342','#41937c','#7aa2c2','#697083','#ac83bf','#dda847'];
export const SHAPE_GROUPS={body:['body_weight','waist','belly','shoulder_width','muscle_definition','arm_size','thigh_size','calf_size','neck_width'],face:SHAPE_CONTROLS.filter(c=>c.section==='face').map(c=>c.id),skin:['age'],chest:['chest_size','chest_height','chest_spacing'],glutes:['glute_size','glute_lift','hip_width']};
export function changeBody(config,choice){return {...config,gender:choice.gender,creator_body:choice.creator_body,female_model_variant:choice.gender==='female'?'artemis_archer':'',selected_assets:{},customization_assets:[],morph_targets:{},shape_controls:{},material_colors:{}};}
export function selectLayer(config,slot,asset){const selected={...config.selected_assets};if(asset)selected[slot]=asset.id;else delete selected[slot];const assets=(config.customization_assets||[]).filter(a=>a.slot!==slot);return {...config,selected_assets:selected,customization_assets:asset?[...assets,asset]:assets};}