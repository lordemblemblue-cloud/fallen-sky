import CreatorColors from '@/components/onboarding/CreatorColors';
import CreatorRange from '@/components/onboarding/CreatorRange';
import CreatorLayerPanel from '@/components/onboarding/CreatorLayerPanel';
import { SKIN_COLORS, HAIR_COLORS, EYE_COLORS } from '@/components/onboarding/creatorOptions';
export default function CreatorSurfacePanel({config,setConfig,section,capabilities}) {
 const set=patch=>setConfig(current=>({...current,...patch}));
 const color=(label,field,enabled,choices)=><CreatorColors label={label} choices={choices} value={config[enabled]?config[field]:''} disabled={field==='eye_color'&&!capabilities.customization?.iris} onChange={value=>set({[field]:value,[enabled]:true})} onReset={()=>set({[enabled]:false})}/>;
 if(section==='face')return color('Eye color','eye_color','eye_tint_enabled',EYE_COLORS);
 if(section==='skin')return <section className="creator-group">{color('Complexion','skin_tone','skin_tint_enabled',SKIN_COLORS)}{config.skin_tint_enabled&&<CreatorRange label="Tint" value={config.skin_tint_strength??1} onChange={value=>set({skin_tint_strength:value})}/>}</section>;
 if(section==='hair')return <><CreatorLayerPanel config={config} setConfig={setConfig} slot="hair"/>{color('Hair color','hair_color','hair_tint_enabled',HAIR_COLORS)}</>;
 if(section==='tattoos')return <><CreatorLayerPanel config={config} setConfig={setConfig} slot="tattoo"/><CreatorColors label="Ink colour" choices={['#17232d','#2b4f62','#7e4e34','#9b6e43','#a43f58','#77508c']} value={config.layer_colors?.tattoo} onChange={value=>set({layer_colors:{...config.layer_colors,tattoo:value}})}/></>;
 if(section==='makeup')return <section className="creator-group"><label className="creator-switch"><span>Apply makeup</span><input type="checkbox" checked={config.makeup_enabled===true} onChange={e=>set({makeup_enabled:e.target.checked})}/></label>
  {['lip','blush','eye'].map((part,index)=><CreatorColors key={part} label={['Lip colour','Cheek blush','Eye shadow'][index]} value={config['makeup_'+part+'_color']} choices={['#a4495c','#c47776','#66516b','#976441','#d79aa4']} onChange={value=>set({makeup_enabled:true,['makeup_'+part+'_color']:value})}/>)}
  <CreatorRange label="Pigment strength" value={config.makeup_strength??.55} onChange={value=>set({makeup_strength:value})}/>
  <CreatorRange label="Gloss" value={config.skin_finish??.35} onChange={value=>set({skin_finish_enabled:true,skin_finish:value})}/>
  {color('Sheen','skin_highlight_color','skin_highlight_enabled',['#ffffff','#fff3e5','#ffe0bd','#f2d6cd','#dcecff'])}
 </section>;
 const garments=capabilities.customization?.garments||[];
 return <section className="creator-group">{garments.map(g=><CreatorColors key={g.id} label={g.label} choices={HAIR_COLORS} value={config.material_colors?.[g.id]} onChange={value=>set({material_colors:{...config.material_colors,[g.id]:value}})}/>)}{!garments.length&&<p className="creator-hint">This body has no separate outfit materials.</p>}{['weapon','hood'].filter(key=>capabilities[key]).map(key=><label className="creator-switch" key={key}><span>{key==='weapon'?'Weapon':'Hood'}</span><input type="checkbox" checked={config[key+'_visible']!==false&&config[key+'_enabled']!==false} onChange={e=>set({[key==='weapon'?'weapon_visible':'hood_enabled']:e.target.checked})}/></label>)}</section>;
}