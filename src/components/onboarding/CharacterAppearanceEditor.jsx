import { SHAPE_CONTROLS } from '@/components/onboarding/avatarCustomization';
import { DEFAULT_AVATAR_APPEARANCE } from '@/components/onboarding/genesisAssets';
import { CREATOR_SECTIONS, SKIN_COLORS, HAIR_COLORS, EYE_COLORS } from '@/components/onboarding/creatorOptions';
import CreatorShapePanel from '@/components/onboarding/CreatorShapePanel';
import CreatorSurfacePanel from '@/components/onboarding/CreatorSurfacePanel';
import CreatorExpressionPanel from '@/components/onboarding/CreatorExpressionPanel';
import CreatorArtPanel from '@/components/onboarding/CreatorArtPanel';
export { CREATOR_SECTIONS };
export const creatorShot=section=>(CREATOR_SECTIONS.find(item=>item.id===section)||CREATOR_SECTIONS[0]).shot;
const pick=list=>list[Math.floor(Math.random()*list.length)];
export function randomizeAppearance(config,{shapes=[]}={}) {
 const supported=new Set(shapes);
 return {...config,skin_tint_enabled:true,skin_tone:pick(SKIN_COLORS),hair_tint_enabled:true,hair_color:pick(HAIR_COLORS),eye_tint_enabled:true,eye_color:pick(EYE_COLORS),shape_controls:Object.fromEntries(SHAPE_CONTROLS.filter(c=>supported.has(c.id)).map(c=>[c.id,Math.round((c.min<0?(Math.random()-.5)*.8:Math.random()*.35)*100)/100]))};
}
export default function CharacterAppearanceEditor(props) {
 const {config,setConfig,section='body'}=props,capabilities=props.capabilities||{};
 return <div className="character-appearance-editor" data-section={section}>
  {['body','face','skin','height','chest','glutes'].includes(section)&&<CreatorShapePanel {...props} capabilities={capabilities}/>}
  {['face','skin','hair','tattoos','makeup','wardrobe'].includes(section)&&<CreatorSurfacePanel {...props} capabilities={capabilities}/>}
  {section==='expression'&&<CreatorExpressionPanel {...props} capabilities={capabilities}/>}
  {['style','inspiration'].includes(section)&&<CreatorArtPanel {...props}/>}
  <button type="button" className="creator-reset" onClick={()=>setConfig(current=>({...current,...DEFAULT_AVATAR_APPEARANCE,gender:current.gender,creator_body:current.creator_body,selected_assets:{},customization_assets:[]}))}>Restore original</button>
 </div>;
}