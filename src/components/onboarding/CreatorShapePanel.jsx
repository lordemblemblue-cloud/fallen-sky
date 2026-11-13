import { SHAPE_CONTROLS } from '@/components/onboarding/avatarCustomization';
import { BASE_CHOICES, SHAPE_GROUPS, changeBody } from '@/components/onboarding/creatorOptions';
import CreatorRange from '@/components/onboarding/CreatorRange';
export default function CreatorShapePanel({config,setConfig,capabilities,section}) {
 const supported=new Set(capabilities.customization?.shapes||[]);
 const shapes=SHAPE_CONTROLS.filter(c=>(SHAPE_GROUPS[section]||[]).includes(c.id)&&supported.has(c.id));
 const set=patch=>setConfig(current=>({...current,...patch}));
 return <>
  {section==='body'&&<section className="creator-group"><h3>Base</h3><div className="creator-base-grid">{BASE_CHOICES.map(choice=><button type="button" key={choice.key} aria-pressed={config.gender===choice.gender&&(config.creator_body||'')===choice.creator_body} onClick={()=>setConfig(current=>changeBody(current,choice))}><strong>{choice.label}</strong><small>{choice.detail}</small></button>)}</div></section>}
  {section==='height'?<section className="creator-group">
   <CreatorRange label="Height" min={.84} max={1.18} value={config.height_scale||1} format={v=>Math.round(v*172)+' cm'} onChange={height_scale=>set({height_scale})}/>
   {['width','depth'].map(key=><CreatorRange key={key} label={key==='width'?'Frame':'Depth'} min={key==='width'?.88:.9} max={key==='width'?1.12:1.1} value={config.body_proportions?.[key]||1} onChange={value=>set({body_proportions:{...config.body_proportions,[key]:value}})}/>)}
  </section>:<section className="creator-group">{shapes.map(shape=><CreatorRange key={shape.id} label={shape.label} min={shape.min??0} value={config.shape_controls?.[shape.id]||0} onChange={value=>set({shape_controls:{...config.shape_controls,[shape.id]:value}})}/>)}{!shapes.length&&<p className="creator-hint">This body has no {section==='skin'?'age':section} shape keys. Choose Eve or Adam under Body to sculpt it.</p>}</section>}
 </>;
}